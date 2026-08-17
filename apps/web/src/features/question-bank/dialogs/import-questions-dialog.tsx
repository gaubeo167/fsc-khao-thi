"use client";

/**
 * MỘT cửa nhập câu hỏi, thay cho hai dialog cũ ("Import từ Word" 911 dòng +
 * "Upload đề theo mã" 888 dòng).
 *
 * Hai thay đổi về nguyên tắc so với bản cũ:
 *
 * 1. KHÔNG bắt chọn khuôn trước. Người dùng thả file, server tự nhận dạng.
 *    Bản cũ bắt đoán đúng nút TRƯỚC khi biết hệ thống đọc được file hay
 *    không, đoán sai thì được báo "sai mẫu, bấm nút kia".
 *
 * 2. KHÔNG bỏ qua câu lỗi. Bản cũ ghi thẳng câu hợp lệ vào kho và lặng lẽ bỏ
 *    câu lỗi ("N câu cần sửa (bỏ qua khi import)") — giáo viên tưởng nhập 20
 *    câu mà thực tế vào kho 12. Nay câu lỗi hiện rõ trong danh sách, lưu nháp
 *    lúc nào cũng được, còn Gửi duyệt thì bị chặn tới khi đủ.
 */

import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  ListChecks,
  Loader2,
  Settings2,
  Target,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useCampusStore } from "@/features/campus/state/campus-store";
import { useCompetenciesStore } from "@/features/competencies/state/competencies-store";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { authHeaders } from "@/lib/api-client";
import { cn } from "@/lib/utils";

import { QuestionCompetencyField } from "@/features/competencies/components/question-competency-field";
import { BLOOM_LEVELS } from "@/features/competencies/data/types";

import { ContentEditor } from "../components/content-editor";
import { SectionCard } from "../components/section-card";
import { TypeSpecificFields } from "../components/forms/type-specific-fields";
import { QUESTION_TYPES } from "../data/question-types";
import type { QuestionType } from "../data/question-types";
import { draftToQuestion } from "../lib/draft-to-question";
import {
  validateDraft,
  type DraftIssue,
  type DraftQuestion,
} from "../lib/import-draft";
import {
  buildOutcomeIndex,
  matchOutcome,
  topicOfCode,
} from "../lib/match-competency";
import { previewText } from "../lib/preview-text";
import { useQuestionsStore } from "../state/questions-store";

/** Nhãn tiếng Việt của dạng câu, tra từ bảng dùng chung của kho câu hỏi. */
const typeLabel = (t: QuestionType): string =>
  QUESTION_TYPES.find((x) => x.id === t)?.name ?? t;

/**
 * Thang mức độ = thang Bloom, dùng chung MỘT nguồn màu với khung năng lực
 * (`BLOOM_LEVELS`): NB xanh · TH cam · VD đỏ.
 *
 * Không tự đặt lại nhãn "Dễ / Trung bình / Khó": gọi khác tên cùng một thứ ở
 * hai màn là cách chắc chắn để giáo viên hiểu nhầm, và màu thì mỗi nơi một
 * kiểu.
 */
const DIFFICULTY_SCALE = [
  { value: "easy" as const, bloom: 1 },
  { value: "medium" as const, bloom: 2 },
  { value: "hard" as const, bloom: 3 },
].map((d) => {
  const meta = BLOOM_LEVELS.find((b) => b.level === d.bloom)!;
  return { ...d, ...meta };
});

/** Dạng câu mà luồng nhập ghi được vào kho (xem draftToQuestion). */
/**
 * Dạng câu chọn được ở màn sửa — mọi dạng kho câu hỏi ghi được.
 *
 * Cố ý KHÔNG lấy thẳng `QUESTION_TYPES`: mục `ai-generated` trong đó là một
 * luồng khác (mô tả chủ đề cho AI sinh câu), không phải một dạng câu để
 * người dùng đổi sang.
 */
const SUPPORTED_TYPES: QuestionType[] = [
  "mcq-single",
  "mcq-multi",
  "true-false",
  "multi-tf",
  "short-answer",
  "fill-blank",
  "matching",
  "ordering",
  "drag-drop",
  "underline",
  "essay",
];

type Phase =
  | { kind: "pick" }
  | { kind: "loading"; fileName: string }
  | { kind: "error"; message: string; preview?: string[] }
  | {
      kind: "review";
      fileName: string;
      formatLabel: string;
      drafts: DraftQuestion[];
      /** Kết quả lượt AI dọn công thức, `null` khi không bật. */
      ai: AiInfo | null;
    };

interface AiInfo {
  used: boolean;
  provider: string | null;
  repaired: number;
  skipped: number;
}

export function ImportQuestionsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange(v: boolean): void;
}) {
  const session = useAuthStore((s) => s.session);
  const activeCampusId = useCampusStore((s) => s.activeCampusId);
  const subjects = useSubjectsStore((s) => s.subjects);
  const tocNodes = useSubjectsStore((s) => s.tocNodes);
  const grades = useGradesStore((s) => s.grades);
  const competencies = useCompetenciesStore((s) => s.competencies);
  const createQuestion = useQuestionsStore((s) => s.create);

  const [subjectId, setSubjectId] = useState("");
  const [gradeId, setGradeId] = useState("");
  /** Mục lục = CHỖ CẤT câu hỏi trong kho, khác với chuyên đề YCCĐ. */
  const [tocNodeId, setTocNodeId] = useState("");
  /** Kho cá nhân (chỉ mình thấy) hay kho campus (cả trường dùng chung). */
  const [kho, setKho] = useState<"personal" | "campus">("campus");
  /** Nhờ AI dựng lại công thức bị vỡ khi rút chữ từ PDF. Mặc định TẮT. */
  const [useAi, setUseAi] = useState(false);
  /**
   * File đã chọn nhưng CHƯA đọc.
   *
   * Trước đây chọn file xong là đọc luôn, thiếu Môn/Khối thì báo lỗi và bỏ
   * luôn file — người dùng phải mở lại hộp chọn file và tìm lại đúng file đó
   * từ đầu, chỉ vì quên một ô select. Giữ file lại ở đây thì họ bổ sung ô
   * thiếu rồi bấm nút là xong.
   */
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "pick" });
  const [selected, setSelected] = useState(0);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Mở lại hộp thoại là bắt đầu lại từ đầu.
  //
  // Hộp thoại được nạp động và KHÔNG bị gỡ khi đóng, nên `phase` sống sót qua
  // lần đóng — bấm Hủy rồi mở lại vẫn thấy nguyên bản chỉnh sửa của đề cũ, và
  // không có đường nào tải đề khác. Đặt lại lúc MỞ chứ không lúc đóng để
  // không thấy nội dung nháy đổi giữa lúc hộp thoại đang biến mất.
  useEffect(() => {
    if (!open) return;
    setPhase({ kind: "pick" });
    setSelected(0);
    setTocNodeId("");
    setPendingFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }, [open]);

  const drafts = phase.kind === "review" ? phase.drafts : [];

  /**
   * Mã trong file → YCCĐ trong khung năng lực. Khớp ở CLIENT vì khung nằm
   * trong store trình duyệt, server không có.
   *
   * CHỈ lấy node LÁ (`kind === "outcome"`). Node chương/chủ điểm cũng có mã
   * và cũng khớp được, nhưng chúng không mang mức Bloom — nhận chúng là mất
   * mức độ của cả đề mà giao diện vẫn báo "đã khớp".
   *
   * Khối lấy rộng hơn một bậc so với ô chọn YCCĐ: nhận cả node không gắn
   * khối, và nếu khối đang chọn rỗng thì lấy toàn môn — cùng cách xử lý với
   * `CompetencyPicker`, để mã khớp được thì ô chọn cũng hiện được node đó.
   */
  const outcomeIndex = useMemo(() => {
    if (!subjectId) return buildOutcomeIndex([]);
    const leaves = competencies.filter((c) => c.kind === "outcome" && c.code);
    // KHÔNG lùi về khung của khối khác. Gắn câu lớp 1 vào chuẩn đầu ra lớp
    // 10 là hỏng dữ liệu lặng lẽ — cùng lỗi mà mục lục vừa mắc phải (xem
    // `toc-scope.ts`). Khối chưa có khung thì banner ở màn kiểm tra nói rõ.
    const scope = leaves.filter(
      (c) =>
        c.subjectId === subjectId && (c.gradeId === gradeId || c.gradeId == null),
    );
    return buildOutcomeIndex(scope);
  }, [competencies, subjectId, gradeId]);

  /**
   * Mục lục của môn đang chọn. Chỉ lấy nhánh khớp khối (hoặc dùng chung cho
   * mọi khối), sắp theo thứ tự người soạn đặt.
   */
  const tocOptions = useMemo(
    () =>
      tocNodes
        .filter(
          (n) =>
            n.subjectId === subjectId &&
            (n.gradeId == null || n.gradeId === gradeId),
        )
        .sort((a, b) => a.order - b.order),
    [tocNodes, subjectId, gradeId],
  );
  /** Môn có mục lục thì BẮT chọn chỗ cất trước khi tải file. */
  const needToc = tocOptions.length > 0;

  /**
   * Những ô bắt buộc còn trống. Nêu TÊN từng ô chứ không chỉ chặn nút: người
   * dùng nhìn nút xám mà không biết còn thiếu gì thì cũng bế tắc như cũ.
   */
  const missingScope = [
    !subjectId ? "Môn học" : null,
    !gradeId ? "Khối" : null,
    needToc && !tocNodeId ? "Chỗ cất trong mục lục" : null,
  ].filter(Boolean) as string[];
  const scopeReady = missingScope.length === 0;

  // Có mã chuyên đề trong file thì mới đòi khớp. Đề Word thường không có mã,
  // đòi khớp là chặn oan cả file.
  const withCode = drafts.filter((d) => d.chuyenDeCode != null).length;
  const matched = drafts.filter((d) => d.chuyenDeId != null).length;
  const requireChuyenDe = withCode > 0;

  const issuesByIdx = useMemo(
    () => drafts.map((d) => validateDraft(d, { requireChuyenDe })),
    [drafts, requireChuyenDe],
  );
  const validCount = issuesByIdx.filter((i) => i.length === 0).length;

  function patch(idx: number, edit: Partial<DraftQuestion>) {
    setPhase((p) =>
      p.kind === "review"
        ? {
            ...p,
            drafts: p.drafts.map((d, i) => (i === idx ? { ...d, ...edit } : d)),
          }
        : p,
    );
  }

  /** Hai mẫu Word: một cho đề gắn mã YCCĐ, một cho đề chỉ ghi nhãn ngắn. */
  const TEMPLATES = {
    yccd: {
      route: "/api/import/yccd-template",
      file: "FSC-mau-soan-de-theo-YCCD.docx",
    },
    basic: {
      route: "/api/import/basic-template",
      file: "FSC-mau-soan-de-co-ban.docx",
    },
  } as const;

  async function downloadTemplate(which: keyof typeof TEMPLATES) {
    const { route, file } = TEMPLATES[which];
    // Route đòi xác thực nên không dùng thẻ <a href> được — phải kèm token.
    const res = await fetch(route, { headers: { ...(await authHeaders()) } });
    if (!res.ok) {
      setPhase({ kind: "error", message: "Không tải được file mẫu." });
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleFile(file: File | undefined) {
    if (!file || !scopeReady) return;
    setPhase({ kind: "loading", fileName: file.name });
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (useAi) fd.append("useAi", "1");
      const res = await fetch("/api/import/parse-questions", {
        method: "POST",
        headers: { ...(await authHeaders()) },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setPhase({
          kind: "error",
          message: data?.message ?? "Không đọc được file.",
          preview: data?.preview,
        });
        return;
      }
      // Khớp mã YCCĐ ngay khi nhận, để badge lỗi phản ánh đúng từ đầu.
      //
      // Mã trong đề (vd [SI10.02.15.D01]) trỏ tới một YCCĐ của khung năng
      // lực. Node LÁ đó mang sẵn mức Bloom, nên MỨC ĐỘ suy ra được từ mã —
      // đề chuẩn không cần ghi thêm. Đó là lý do đề SHOC có đủ ID nhưng
      // không ghi mức độ: mức độ nằm trong khung, không nằm trong đề.
      //
      // Bloom 1/2/3 → Nhận biết / Thông hiểu / Vận dụng.
      const byBloom: Record<number, DraftQuestion["difficulty"]> = {
        1: "easy",
        2: "medium",
        3: "hard",
      };
      const withComp: DraftQuestion[] = (data.questions as DraftQuestion[]).map(
        (d) => {
          const hit = matchOutcome(d.rawCode ?? d.chuyenDeCode, outcomeIndex);
          if (!hit) return d;
          return {
            ...d,
            chuyenDeId: hit.id,
            chuyenDeMatch: hit.via,
            bloomLevel: (hit.bloomLevel ?? null) as DraftQuestion["bloomLevel"],
            // Chỉ điền khi đề CHƯA ghi mức độ — đề ghi rõ thì tôn trọng đề.
            difficulty:
              d.difficulty ??
              (hit.bloomLevel ? byBloom[hit.bloomLevel] : null),
          };
        },
      );
      setSelected(0);
      setPhase({
        kind: "review",
        fileName: file.name,
        formatLabel: data.formatLabel ?? "",
        drafts: withComp,
        ai: (data.ai as AiInfo | null) ?? null,
      });
    } catch (e) {
      setPhase({
        kind: "error",
        message: e instanceof Error ? e.message : "Lỗi không xác định.",
      });
    }
  }

  function save(target: "draft" | "submit") {
    if (!session) return;
    setSaving(true);
    try {
      const campusId = session.campusId ?? activeCampusId ?? null;
      let written = 0;
      drafts.forEach((d, i) => {
        // Gửi duyệt: chỉ ghi câu đã đủ. Lưu nháp: ghi tất cả những câu ghi
        // được, câu chưa chọn dạng thì draftToQuestion trả null và bị bỏ —
        // đó là lý do số câu đã lưu được báo lại rõ ràng bên dưới.
        if (target === "submit" && issuesByIdx[i].length > 0) return;
        const q = draftToQuestion(d, {
          subjectId,
          gradeId,
          tocNodeId: tocNodeId || null,
          ownerId: session.userId,
          ownerName: session.name ?? "—",
          campusId,
          kho,
          // Kho cá nhân: câu vào thẳng, chỉ mình thấy nên không cần duyệt.
          // Kho campus: cả trường dùng chung nên phải qua duyệt.
          status:
            target === "draft" ? "draft" : kho === "personal" ? "approved" : "pending",
        });
        if (q) {
          createQuestion(q);
          written += 1;
        }
      });
      setPhase({
        kind: "error",
        message:
          written === drafts.length
            ? `Đã lưu ${written} câu.`
            : `Đã lưu ${written}/${drafts.length} câu. Số còn lại chưa chọn được dạng câu hỏi nên không ghi được.`,
      });
      if (written > 0) onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  const cur = drafts[selected];
  const curIssues = issuesByIdx[selected] ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        srTitle="Tải đề lên ngân hàng câu hỏi"
        srDescription="Thả file Word hoặc PDF, hệ thống tự nhận dạng rồi tách câu hỏi để bạn kiểm tra và bổ sung."
        // Khung cố định: DialogContent gốc không giới hạn chiều cao, nên
        // đề 21 câu làm hộp thoại dài quá khung nhìn và chân trang trôi đè
        // lên danh sách. Cột dọc + `min-h-0` ở phần giữa mới cho vùng cuộn
        // hoạt động đúng trong flexbox.
        className="flex max-h-[90vh] max-w-6xl flex-col overflow-hidden p-0"
      >
        {/* Ô chọn file để NGOÀI nhánh điều kiện: nút "Chọn file khác" ở màn
            sửa cũng bấm vào chính ô này, mà bước 2 thì khối bước 1 không
            render — để trong đó thì ref rỗng và nút bấm không ra gì. */}
        <input
          ref={fileRef}
          type="file"
          accept=".docx,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            // Xoá value ngay: <input type=file> KHÔNG bắn `change` khi chọn
            // lại đúng file vừa chọn, nên sửa file trong Word rồi tải lại
            // cùng tên là không có gì xảy ra.
            e.target.value = "";
            if (!f) return;
            setPendingFile(f);
            // Đủ dữ liệu thì đọc luôn — không bắt bấm thêm một nút nữa cho
            // trường hợp thường gặp nhất. Thiếu thì giữ file lại, chờ người
            // dùng bổ sung rồi bấm nút bên dưới.
            if (scopeReady) void handleFile(f);
            else setPhase({ kind: "pick" });
          }}
        />

        {/* ───── Đầu trang ───── */}
        <header className="flex shrink-0 items-start gap-3 border-b px-5 py-3 pr-12">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200">
            <FileText className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-section-title truncate">
              {phase.kind === "review" ? phase.fileName : "Tải đề lên ngân hàng câu hỏi"}
            </h2>
            <p className="text-meta mt-0.5 truncate">
              {phase.kind === "review"
                ? `${phase.formatLabel} · ${drafts.length} câu`
                : "Một cửa cho mọi file .docx và .pdf — hệ thống tự nhận dạng khuôn đề."}
            </p>
          </div>
          {phase.kind === "review" && drafts.length - validCount > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-meta font-semibold text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5" />
              {drafts.length - validCount} câu chưa hợp lệ
            </span>
          )}
        </header>

        {/* ───── Bước 1: chọn phạm vi + thả file ───── */}
        {phase.kind !== "review" && (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-meta font-semibold text-foreground/70">
                  Môn học *
                </span>
                <select
                  value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border bg-card px-2 text-small"
                >
                  <option value="">— Chọn môn —</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-meta font-semibold text-foreground/70">
                  Khối *
                </span>
                <select
                  value={gradeId}
                  onChange={(e) => setGradeId(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border bg-card px-2 text-small"
                >
                  <option value="">— Chọn khối —</option>
                  {grades.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {needToc && (
              <label className="block">
                <span className="text-meta font-semibold text-foreground/70">
                  Chỗ cất trong mục lục *
                </span>
                <select
                  value={tocNodeId}
                  onChange={(e) => setTocNodeId(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border bg-card px-2 text-small"
                >
                  <option value="">— Chọn chỗ cất —</option>
                  {tocOptions.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.code ? `${n.code} — ${n.name}` : n.name}
                    </option>
                  ))}
                </select>
                <span className="text-hint mt-0.5 block text-muted-foreground">
                  Mục lục là chỗ CẤT câu hỏi trong kho. Khác với mã YCCĐ trong
                  đề — mã đó dùng để gắn chuyên đề và suy mức độ.
                </span>
              </label>
            )}

            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={phase.kind === "loading"}
              className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed bg-surface-2/40 px-6 py-10 transition hover:bg-accent/20 disabled:opacity-60"
            >
              {phase.kind === "loading" ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <span className="text-small">Đang đọc {phase.fileName}…</span>
                </>
              ) : pendingFile ? (
                <>
                  <FileText className="h-6 w-6 text-blue-600" />
                  <span className="text-small font-semibold">
                    {pendingFile.name}
                  </span>
                  <span className="text-hint text-muted-foreground">
                    {Math.max(1, Math.round(pendingFile.size / 1024))} KB · bấm để
                    đổi file khác
                  </span>
                </>
              ) : (
                <>
                  <Upload className="h-6 w-6 text-muted-foreground" />
                  <span className="text-small font-semibold">
                    Chọn file Word (.docx) hoặc PDF
                  </span>
                  <span className="text-hint text-muted-foreground">
                    Đề theo mẫu FSC, đề theo mã chuyên đề, hay đề tự soạn — không
                    cần chọn loại, hệ thống tự nhận.
                  </span>
                  <span className="text-hint text-muted-foreground">
                    PDF đọc được chữ nhưng KHÔNG mang dấu gạch chân, nên đáp án
                    đúng phải chọn tay. PDF bản scan thì không đọc được.
                  </span>
                </>
              )}
            </button>

            {/* Nút đọc đề: chỉ hiện khi ĐANG GIỮ một file.
                Đây là chỗ cứu người dùng chọn file trước rồi mới nhớ ra chưa
                chọn Môn/Khối — bổ sung xong bấm nút, khỏi phải đi tìm lại
                đúng file đó trong máy lần nữa. */}
            {pendingFile && phase.kind !== "loading" && (
              <div className="rounded-lg border bg-surface-2/40 px-3 py-2.5">
                {!scopeReady && (
                  <p className="text-meta mb-2 text-amber-800">
                    Còn thiếu: <b>{missingScope.join(" · ")}</b>. Chọn xong thì
                    bấm nút bên dưới — file bạn vừa chọn vẫn được giữ.
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    disabled={!scopeReady}
                    onClick={() => void handleFile(pendingFile)}
                  >
                    <Upload className="h-4 w-4" />
                    Đọc đề từ {pendingFile.name.length > 28
                      ? `${pendingFile.name.slice(0, 25)}…`
                      : pendingFile.name}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setPendingFile(null);
                      setPhase({ kind: "pick" });
                    }}
                  >
                    Bỏ file
                  </Button>
                </div>
              </div>
            )}

            {/* Ô tích AI: đặt ngay dưới ô thả file vì nó chỉ có nghĩa cho lần
                tải sắp tới, và người dùng cần biết TRƯỚC khi chọn file.

                Mặc định TẮT: nó gọi ra ngoài, tốn hạn mức, và với file Word
                thì hoàn toàn thừa — Word lưu công thức thành khối OMath, hệ
                thống đọc thẳng được, không cần đoán. */}
            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border bg-surface-2/40 px-3 py-2.5">
              <input
                type="checkbox"
                checked={useAi}
                onChange={(e) => setUseAi(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
              />
              <span className="min-w-0">
                <span className="text-small font-semibold text-foreground/85">
                  Dùng AI đọc công thức trong PDF
                </span>
                <span className="text-hint mt-0.5 block text-muted-foreground">
                  PDF không lưu công thức thành khối — phân số là hai dòng chữ
                  chồng lên nhau, rút ra thì vỡ rời và không quy tắc nào ghép
                  lại được. Bật ô này thì AI gộp chúng lại thành công thức sửa
                  được. AI CHỈ gộp công thức, không soạn câu hỏi và không tự
                  điền đáp án.
                </span>
                <span className="text-hint mt-0.5 block text-muted-foreground">
                  File Word không cần bật — Word đã lưu công thức đàng hoàng.
                </span>
              </span>
            </label>

            {/* Tải mẫu: đặt ngay dưới ô thả file vì đây là lúc người dùng
                nhận ra mình chưa biết viết đề thế nào cho hệ thống đọc được.

                Hai mẫu chứ không một: mẫu YCCĐ đòi khung năng lực đã nhập và
                phải tra mã, dùng cho đề chuẩn hoá; mẫu cơ bản chỉ cần hai
                nhãn ngắn, dùng cho đề soạn nhanh. Ép mọi người vào mẫu YCCĐ
                là ép họ tra cứu để nhập một đề kiểm tra 15 phút. */}
            <div className="rounded-lg border bg-surface-2/40 px-3 py-2.5">
              <p className="text-hint font-semibold text-foreground/70">
                Chưa biết bắt đầu từ đâu? Tải file mẫu — hướng dẫn nằm sẵn
                trong file.
              </p>
              <div className="mt-1.5 space-y-1">
                <p className="text-hint text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => void downloadTemplate("basic")}
                    className="font-semibold text-blue-700 underline-offset-2 hover:underline"
                  >
                    Mẫu cơ bản
                  </button>{" "}
                  — ghi mức độ và dạng câu bằng nhãn ngắn:{" "}
                  <code className="rounded bg-muted px-1">Câu 1. [NB][TN]</code>
                </p>
                <p className="text-hint text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => void downloadTemplate("yccd")}
                    className="font-semibold text-blue-700 underline-offset-2 hover:underline"
                  >
                    Mẫu theo mã YCCĐ
                  </button>{" "}
                  — gắn câu vào khung năng lực, mức độ tự suy từ khung.
                </p>
              </div>
            </div>

            {phase.kind === "error" && (
              <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2.5">
                <p className="text-small font-semibold text-rose-900">
                  {phase.message}
                </p>
                {phase.preview && phase.preview.length > 0 && (
                  <>
                    <p className="text-hint mt-2 font-semibold text-rose-800">
                      Vài dòng hệ thống đọc được từ file:
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {phase.preview.map((l, i) => (
                        <li key={i} className="text-hint text-rose-800">
                          {l}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* File CÓ mã YCCĐ mà không khớp node nào — gần như luôn là chọn sai
            Môn/Khối, vì mã đã mang sẵn môn và lớp (SI10 = Sinh, lớp 10).
            Không nói ra thì người dùng thấy cả 21 câu "Chưa chọn mức độ" mà
            không hiểu vì sao, rồi ngồi chọn tay từng câu — trong khi hệ thống
            đã có sẵn thông tin, chỉ là đang tra nhầm khung. */}
        {phase.kind === "review" && phase.ai?.used && (
          <div className="shrink-0 border-b border-sky-300 bg-sky-50 px-5 py-2">
            <p className="text-meta font-semibold text-sky-900">
              AI đã dựng lại công thức ở {phase.ai.repaired} đoạn
              {phase.ai.provider ? ` (${phase.ai.provider})` : ""}
              {phase.ai.skipped > 0
                ? ` · ${phase.ai.skipped} đoạn giữ nguyên vì kết quả không đáng tin`
                : ""}
              . Soát lại công thức trước khi lưu — đây là phần AI ĐOÁN từ chữ
              đã vỡ, không phải đọc được nguyên vẹn.
            </p>
          </div>
        )}
        {phase.kind === "review" && withCode > 0 && matched === 0 && (
          <div className="shrink-0 border-b border-amber-300 bg-amber-50 px-5 py-2.5">
            <p className="text-small font-semibold text-amber-900">
              {withCode} câu có mã YCCĐ nhưng không khớp khung năng lực của{" "}
              {subjects.find((x) => x.id === subjectId)?.name ?? "môn đã chọn"} ·{" "}
              {grades.find((x) => x.id === gradeId)?.name ?? "khối đã chọn"}
            </p>
            <p className="text-meta mt-0.5 text-amber-800">
              Mã dạng <code>{drafts.find((d) => d.rawCode)?.rawCode}</code> đã
              mang sẵn môn và lớp.{" "}
              {outcomeIndex.byCode.size === 0 ? (
                <>
                  Khung năng lực của môn này <b>chưa có YCCĐ nào</b> — nhập khung
                  ở mục “Chuẩn đầu ra (YCCĐ)” rồi tải lại đề, mức độ sẽ tự điền.
                </>
              ) : (
                <>
                  Khung đang có {outcomeIndex.byCode.size} YCCĐ nhưng không cái
                  nào mang mã này — nhiều khả năng bạn chọn nhầm Môn/Khối ở bước
                  trước, hoặc khung nhập vào thiếu chủ điểm tương ứng.
                </>
              )}
            </p>
          </div>
        )}
        {phase.kind === "review" && withCode > 0 && matched > 0 && matched < withCode && (
          <div className="shrink-0 border-b border-amber-300 bg-amber-50 px-5 py-2">
            <p className="text-meta font-semibold text-amber-900">
              Khớp khung năng lực {matched}/{withCode} câu — {withCode - matched}{" "}
              mã không có trong khung, cần chọn mức độ tay.
            </p>
          </div>
        )}

        {/* ───── Bước 2: trái danh sách, phải chi tiết ───── */}
        {phase.kind === "review" && (
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,320px)_minmax(0,1fr)] overflow-hidden">
            {/* Trái */}
            <aside className="min-h-0 overflow-y-auto border-r">
              <div className="sticky top-0 flex items-center justify-between border-b bg-card px-3 py-2">
                <span className="text-meta font-bold uppercase tracking-[0.06em] text-foreground/60">
                  Danh sách câu hỏi
                </span>
                <span className="text-meta text-muted-foreground">
                  {drafts.length}
                </span>
              </div>
              <ul>
                {drafts.map((d, i) => {
                  const iss = issuesByIdx[i] ?? [];
                  return (
                    <li key={d.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(i)}
                        className={cn(
                          "flex w-full gap-2 border-b px-3 py-2.5 text-left transition",
                          i === selected ? "bg-blue-50" : "hover:bg-accent/20",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded text-meta font-bold",
                            i === selected
                              ? "bg-blue-600 text-white"
                              : "bg-muted text-foreground/70",
                          )}
                        >
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="text-hint font-bold uppercase text-blue-700">
                              {d.type ? typeLabel(d.type) : "Chưa rõ dạng"}
                            </span>
                            {iss.length > 0 && (
                              <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500" />
                            )}
                          </span>
                          <span className="mt-0.5 line-clamp-2 block text-small text-foreground/80">
                            {previewText(d.content) || "(đề bài trống)"}
                          </span>
                          {iss.slice(0, 1).map((x) => (
                            <span
                              key={x.field}
                              className="text-hint mt-0.5 block text-rose-600"
                            >
                              • {x.message}
                            </span>
                          ))}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </aside>

            {/* Phải */}
            <section className="min-h-0 overflow-y-auto px-5 py-4">
              {cur && (
                <QuestionEditor
                  key={cur.id}
                  q={cur}
                  subjectId={subjectId}
                  gradeId={gradeId}
                  index={selected}
                  total={drafts.length}
                  issues={curIssues}
                  onPatch={(e) => patch(selected, e)}
                />
              )}
            </section>
          </div>
        )}

        {/* ───── Chân trang ───── */}
        {phase.kind === "review" && (
          <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t px-5 py-3">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 text-small font-semibold",
                validCount === drafts.length ? "text-emerald-700" : "text-foreground/70",
              )}
            >
              {validCount === drafts.length && <CheckCircle2 className="h-4 w-4" />}
              {validCount}/{drafts.length} câu hợp lệ
            </span>
            <label className="flex items-center gap-1.5">
              <span className="text-meta text-muted-foreground">Lưu vào</span>
              <select
                value={kho}
                onChange={(e) => setKho(e.target.value as "personal" | "campus")}
                className="h-8 rounded-md border bg-card px-2 text-meta font-semibold"
              >
                <option value="campus">Kho toàn trường (cần duyệt)</option>
                <option value="personal">Kho cá nhân của tôi</option>
              </select>
            </label>

            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                title="Bỏ kết quả hiện tại và đọc lại một file khác"
              >
                Chọn file khác
              </Button>
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Hủy
              </Button>
              {/* Lưu nháp KHÔNG bị chặn: giáo viên nhập nửa chừng phải cất được
                  việc đang làm, nếu không họ sẽ ngồi sửa 20 câu một mạch hoặc
                  bỏ cuộc. */}
              <Button
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => save("draft")}
              >
                Lưu bản nháp
              </Button>
              <Button
                size="sm"
                disabled={saving || validCount === 0}
                title={
                  validCount === 0
                    ? "Chưa câu nào đủ điều kiện gửi duyệt"
                    : undefined
                }
                onClick={() => save("submit")}
              >
                {kho === "personal"
                  ? `Lưu vào kho cá nhân (${validCount})`
                  : `Lưu và Gửi duyệt (${validCount})`}
              </Button>
            </div>
          </footer>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ────────────────────── ô chỉnh chi tiết từng câu ────────────────────── */

/**
 * Trình soạn thảo cho MỘT câu trong lúc nhập đề.
 *
 * Dùng ĐÚNG bộ component của màn "Tạo câu hỏi" thay vì tự viết lại:
 * `ContentEditor` (có công thức toán, ảnh), `TypeSpecificFields` (phương án,
 * ý Đúng/Sai, đáp án trả lời ngắn kèm % và lời nhắc), `QuestionCompetencyField`
 * (chọn lại YCCĐ), `TocTagFields`, `KhoSelector`.
 *
 * Bản trước tôi tự dựng lại mấy ô này bằng input thuần. Kết quả: giáo viên
 * gặp hai giao diện khác nhau cho cùng một việc, và bản nhập đề thiếu hẳn
 * những thứ bản kia có — % điểm cho đáp án trả lời ngắn, chọn YCCĐ, công thức
 * toán. Dùng chung component là cách duy nhất để hai màn không lệch nhau nữa
 * sau mỗi lần sửa.
 *
 * Các component này ăn `react-hook-form`, nên ở đây dựng một form cho câu đang
 * chọn. Component được `key` theo id câu ở phía cha, nên đổi câu là dựng lại
 * form mới — khỏi phải reset thủ công và khỏi vòng lặp cập nhật.
 */
function QuestionEditor({
  q,
  index,
  total,
  issues,
  subjectId,
  gradeId,
  onPatch,
}: {
  q: DraftQuestion;
  index: number;
  total: number;
  issues: DraftIssue[];
  subjectId: string;
  gradeId: string;
  onPatch(edit: Partial<DraftQuestion>): void;
}) {
  const form = useForm<Record<string, unknown>>({
    defaultValues: {
      type: q.type ?? "mcq-single",
      // "" = chưa chọn. Khác với màn Tạo câu hỏi (mặc định "medium"): ở đây
      // "chưa chọn" là trạng thái CÓ THẬT và phải chặn gửi duyệt, không được
      // lặng lẽ nhận "trung bình" cho cả đề.
      difficulty: q.difficulty ?? "",
      content: q.content,
      explanation: q.explanation,
      options: q.options.map((o, i) => ({ id: `o${i + 1}`, ...o })),
      subQuestions: q.subQuestions.map((sq, i) => ({ id: `s${i + 1}`, ...sq })),
      acceptedAnswers: q.acceptedAnswers,
      caseSensitive: false,
      // Dữ liệu riêng của từng dạng. Tên trường phải khớp `QuestionSchema` vì
      // `TypeSpecificFields` đọc thẳng theo tên đó.
      correctAnswer: q.correctAnswer,
      blanks: q.blanks,
      pairs: q.pairs.map((p, i) => ({ id: `p${i + 1}`, ...p })),
      items: q.items.map((content, i) => ({ id: `i${i + 1}`, content })),
      zones: q.zones.map((correctContent, i) => ({ id: `z${i + 1}`, correctContent })),
      distractors: q.distractors.map((content, i) => ({
        id: `d${i + 1}`,
        content,
        // Ghép cặp gọi cột phải là `right`, kéo thả gọi là `content`. Đặt cả
        // hai để một mảng dùng được cho cả hai dạng.
        right: content,
      })),
      competencyIds: q.chuyenDeId ? [q.chuyenDeId] : [],
      bloomLevel: q.bloomLevel ?? null,
      tocNodeId: null,
      tags: [],
      kho: "campus",
      subjectId,
      gradeId,
    },
  });

  /** YCCĐ mà hệ thống tự khớp từ mã — mốc để biết người dùng đã đổi hay chưa. */
  const autoMatchedId = useRef(q.chuyenDeId);

  // Mọi thay đổi trong form chảy ngược về bản nháp để danh sách bên trái và
  // bộ đếm "n/N câu hợp lệ" cập nhật ngay.
  useEffect(() => {
    const sub = form.watch((v) => {
      const pickedId =
        ((v.competencyIds as string[] | undefined)?.[0] ?? null) || null;
      onPatch({
        type: (v.type as DraftQuestion["type"]) ?? null,
        difficulty: (v.difficulty || null) as DraftQuestion["difficulty"],
        content: (v.content as string) ?? "",
        explanation: (v.explanation as string) ?? "",
        options: ((v.options ?? []) as Array<{ content: string; isCorrect: boolean }>).map(
          (o) => ({ content: o?.content ?? "", isCorrect: !!o?.isCorrect }),
        ),
        subQuestions: (
          (v.subQuestions ?? []) as Array<{ statement: string; correctAnswer: boolean }>
        ).map((x) => ({
          statement: x?.statement ?? "",
          correctAnswer: !!x?.correctAnswer,
        })),
        acceptedAnswers: (v.acceptedAnswers ?? []) as DraftQuestion["acceptedAnswers"],
        correctAnswer: (v.correctAnswer ?? null) as boolean | null,
        blanks: ((v.blanks ?? []) as Array<{ acceptedAnswers?: string[] }>).map((b) => ({
          acceptedAnswers: (b?.acceptedAnswers ?? []).filter(Boolean),
        })),
        pairs: ((v.pairs ?? []) as Array<{ left?: string; right?: string }>).map((p) => ({
          left: p?.left ?? "",
          right: p?.right ?? "",
        })),
        items: ((v.items ?? []) as Array<{ content?: string }>).map(
          (i) => i?.content ?? "",
        ),
        zones: ((v.zones ?? []) as Array<{ correctContent?: string }>).map(
          (z) => z?.correctContent ?? "",
        ),
        distractors: (
          (v.distractors ?? []) as Array<{ content?: string; right?: string }>
        ).map((d) => d?.content ?? d?.right ?? ""),
        chuyenDeId: pickedId,
        // `QuestionCompetencyField` cập nhật `bloomLevel` theo YCCĐ vừa chọn,
        // nên chọn lại YCCĐ là mức nhận thức đi theo, không phải sửa hai chỗ.
        bloomLevel:
          ((v.bloomLevel as number | undefined) ?? null) as DraftQuestion["bloomLevel"],
        // Người dùng đổi sang YCCĐ khác thì ghi chú "khớp theo số chỉ báo"
        // của file không còn đúng nữa — bỏ đi thay vì để nó nói về lựa chọn cũ.
        chuyenDeMatch: pickedId === autoMatchedId.current ? q.chuyenDeMatch : null,
      });
    });
    return () => sub.unsubscribe();
    // `q.chuyenDeMatch` cố ý KHÔNG nằm trong deps: nó chỉ được đọc để giữ
    // nguyên giá trị ban đầu, thêm vào thì mỗi lần patch lại dựng lại
    // subscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, onPatch]);

  const type = form.watch("type") as QuestionType;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-2">
        <span className="text-section-title">Câu {index + 1}</span>
        <span className="text-meta text-muted-foreground">/ {total}</span>
        {q.rawCode && (
          <span
            className="ml-auto rounded bg-muted px-1.5 py-0.5 text-hint font-semibold text-foreground/70"
            title="Mã YCCĐ đọc được từ file"
          >
            {q.rawCode}
          </span>
        )}
      </div>

      <SectionCard icon={Settings2} tone="violet" title="Phân loại câu hỏi" required>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-meta font-semibold text-foreground/70">
            Loại câu hỏi *
          </span>
          <select
            {...form.register("type")}
            className="mt-1 h-9 w-full rounded-md border bg-card px-2 text-small"
          >
            {SUPPORTED_TYPES.map((t) => (
              <option key={t} value={t}>
                {typeLabel(t)}
              </option>
            ))}
          </select>
        </label>
        <div>
          <span className="text-meta font-semibold text-foreground/70">
            Mức độ (Bloom) *
          </span>
          <Controller
            control={form.control}
            name="difficulty"
            render={({ field }) => (
              <div className="mt-1 flex gap-1.5">
                {DIFFICULTY_SCALE.map((d) => {
                  const on = field.value === d.value;
                  return (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => field.onChange(on ? "" : d.value)}
                      title={d.full}
                      className={cn(
                        "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border-2 text-small font-semibold transition",
                        on
                          ? cn(d.border, d.chipBg, d.chipFg)
                          : "border-border bg-card text-muted-foreground hover:bg-accent/20",
                      )}
                    >
                      <span className="text-meta font-bold">{d.short}</span>
                      <span>{d.full}</span>
                    </button>
                  );
                })}
              </div>
            )}
          />
        </div>
      </div>
      </SectionCard>

      {issues.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
          <p className="inline-flex items-center gap-1.5 text-small font-semibold text-amber-900">
            <AlertTriangle className="h-3.5 w-3.5" /> Cần kiểm tra lại
          </p>
          <ul className="mt-1 space-y-0.5">
            {issues.map((i) => (
              <li key={i.field} className="text-meta text-amber-800">
                • {i.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* YCCĐ: đọc sẵn từ mã trong file, nhưng người dùng sửa và chọn lại
          được — cùng ô với màn Tạo câu hỏi nên có đủ ghi chú nội dung YCCĐ. */}
      <SectionCard
        icon={Target}
        tone="orange"
        title="Yêu cầu cần đạt (YCCĐ)"
        subtitle="Đọc sẵn từ mã trong file — chọn lại được nếu chưa đúng"
      >
        {/* Nói rõ mã trong file dẫn tới đâu. Im lặng ở đây chính là lỗi cũ:
            hệ thống dừng ở chủ điểm mà giao diện vẫn trông như đã khớp. */}
        {q.rawCode && !q.chuyenDeId && (
          <p className="mb-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-meta text-amber-900">
            File ghi mã <b>{q.rawCode}</b> nhưng khung năng lực của môn chưa có
            YCCĐ nào mang mã đó
            {topicOfCode(q.rawCode)
              ? ` (chủ điểm ${topicOfCode(q.rawCode)})`
              : ""}
            . Chọn tay bên dưới, hoặc bổ sung khung rồi tải lại đề.
          </p>
        )}
        {q.chuyenDeMatch === "so-chi-bao" && (
          <p className="mb-2 rounded-md border border-sky-300 bg-sky-50 px-2.5 py-1.5 text-meta text-sky-900">
            File ghi <b>{q.rawCode}</b>; khung đánh mã chỉ báo này bằng chữ
            khác nên hệ thống khớp theo số chỉ báo. Kiểm lại nội dung YCCĐ bên
            dưới cho chắc.
          </p>
        )}
        <QuestionCompetencyField
          control={form.control}
          watch={form.watch}
          setValue={form.setValue}
        />
      </SectionCard>

      <SectionCard icon={FileText} tone="blue" title="Đề bài câu hỏi" required>
        <Controller
          control={form.control}
          name="content"
          render={({ field }) => (
            <ContentEditor
              value={(field.value as string) ?? ""}
              onChange={field.onChange}
              // Ba nút này quyết định người soạn có THÊM được ô trống / vùng
              // thả / cụm gạch chân hay không. Thiếu chúng thì câu đọc từ
              // file có sẵn bao nhiêu ô là chịu bấy nhiêu, sửa lại không
              // được — đúng chỗ người dùng kêu "không thêm ô trống được".
              showBlankButton={type === "fill-blank"}
              showZoneButton={type === "drag-drop"}
              showUnderlineButton={type === "underline"}
              onBlankDeleted={
                type === "fill-blank"
                  ? (deletedIdx) => {
                      // Xoá đúng dòng đáp án của ô vừa bị xoá. Không làm thì
                      // phần đồng bộ theo SỐ LƯỢNG ở dưới cắt mất dòng CUỐI —
                      // xoá ô giữa lại mất đáp án của ô cuối.
                      const cur =
                        (form.getValues("blanks") as unknown[] | undefined) ?? [];
                      if (deletedIdx < 1 || deletedIdx > cur.length) return;
                      const next = cur.slice();
                      next.splice(deletedIdx - 1, 1);
                      form.setValue("blanks", next, {
                        shouldValidate: true,
                        shouldDirty: true,
                      });
                    }
                  : undefined
              }
            />
          )}
        />
      </SectionCard>

      <SectionCard icon={ListChecks} tone="emerald" title="Đáp án" required>
        <TypeSpecificFields
          type={type}
          control={form.control}
          setValue={form.setValue}
          errors={form.formState.errors}
        />
      </SectionCard>

      {q.parserWarnings.length > 0 && (
        <p className="text-hint text-muted-foreground">
          Ghi chú khi đọc file: {q.parserWarnings.join(" · ")}
        </p>
      )}
    </div>
  );
}
