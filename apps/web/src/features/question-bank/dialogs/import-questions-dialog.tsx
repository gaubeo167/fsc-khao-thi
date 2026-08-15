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

import { AlertTriangle, CheckCircle2, FileText, Loader2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useCampusStore } from "@/features/campus/state/campus-store";
import { useCompetenciesStore } from "@/features/competencies/state/competencies-store";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { authHeaders } from "@/lib/api-client";
import { cn } from "@/lib/utils";

import { QUESTION_TYPES } from "../data/question-types";
import type { QuestionType } from "../data/question-types";
import { draftToQuestion } from "../lib/draft-to-question";
import {
  validateDraft,
  type DraftIssue,
  type DraftQuestion,
} from "../lib/import-draft";
import { useQuestionsStore } from "../state/questions-store";

/** Nhãn tiếng Việt của dạng câu, tra từ bảng dùng chung của kho câu hỏi. */
const typeLabel = (t: QuestionType): string =>
  QUESTION_TYPES.find((x) => x.id === t)?.name ?? t;

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: "Nhận biết",
  medium: "Thông hiểu",
  hard: "Vận dụng",
};

/** Dạng câu mà luồng nhập ghi được vào kho (xem draftToQuestion). */
const SUPPORTED_TYPES: QuestionType[] = [
  "mcq-single",
  "mcq-multi",
  "multi-tf",
  "short-answer",
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
    };

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
  const grades = useGradesStore((s) => s.grades);
  const competencies = useCompetenciesStore((s) => s.competencies);
  const createQuestion = useQuestionsStore((s) => s.create);

  const [subjectId, setSubjectId] = useState("");
  const [gradeId, setGradeId] = useState("");
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
    if (fileRef.current) fileRef.current.value = "";
  }, [open]);

  const drafts = phase.kind === "review" ? phase.drafts : [];

  /**
   * Mã chuyên đề trong file → id trong khung năng lực. Khớp ở CLIENT vì mục
   * lục nằm trong store trình duyệt, server không có.
   */
  const compByCode = useMemo(() => {
    const m = new Map<
      string,
      { id: string; bloomLevel?: number | null; title: string }
    >();
    for (const c of competencies) {
      if (c.subjectId === subjectId && c.gradeId === gradeId && c.code) {
        m.set(c.code.toUpperCase(), {
          id: c.id,
          bloomLevel: c.bloomLevel ?? null,
          title: c.title,
        });
      }
    }
    return m;
  }, [competencies, subjectId, gradeId]);

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

  async function downloadTemplate() {
    // Route đòi xác thực nên không dùng thẻ <a href> được — phải kèm token.
    const res = await fetch("/api/import/yccd-template", {
      headers: { ...(await authHeaders()) },
    });
    if (!res.ok) {
      setPhase({ kind: "error", message: "Không tải được file mẫu." });
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "FSC-mau-soan-de-theo-YCCD.docx";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!subjectId || !gradeId) {
      setPhase({ kind: "error", message: "Chọn Môn học và Khối trước khi tải đề." });
      return;
    }
    setPhase({ kind: "loading", fileName: file.name });
    try {
      const fd = new FormData();
      fd.append("file", file);
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
      // lực. Node đó đã mang sẵn mức Bloom, nên ĐỘ KHÓ suy ra được từ mã —
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
          if (!d.chuyenDeCode) return d;
          // Thử cả mã đầy đủ lẫn mã đã cắt phần loại câu + số thứ tự, vì
          // khung năng lực đánh mã tới cấp YCCĐ còn đề đánh tới cấp câu.
          const hit =
            compByCode.get(d.chuyenDeCode.toUpperCase()) ??
            (d.rawCode
              ? compByCode.get(
                  d.rawCode.replace(/\.[a-c]$/i, "").toUpperCase(),
                )
              : undefined);
          if (!hit) return d;
          return {
            ...d,
            chuyenDeId: hit.id,
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
          tocNodeId: null,
          ownerId: session.userId,
          ownerName: session.name ?? "—",
          campusId,
          kho: target === "submit" ? "campus" : "personal",
          status: target === "submit" ? "pending" : "draft",
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
        srDescription="Thả file Word, hệ thống tự nhận dạng rồi tách câu hỏi để bạn kiểm tra và bổ sung."
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
          accept=".docx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            // Xoá value ngay: <input type=file> KHÔNG bắn `change` khi chọn
            // lại đúng file vừa chọn, nên sửa file trong Word rồi tải lại
            // cùng tên là không có gì xảy ra.
            e.target.value = "";
            void handleFile(f);
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
                : "Một cửa cho mọi file .docx — hệ thống tự nhận dạng khuôn đề."}
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
              ) : (
                <>
                  <Upload className="h-6 w-6 text-muted-foreground" />
                  <span className="text-small font-semibold">
                    Chọn file Word (.docx)
                  </span>
                  <span className="text-hint text-muted-foreground">
                    Đề theo mẫu FSC, đề theo mã chuyên đề, hay đề tự soạn — không
                    cần chọn loại, hệ thống tự nhận.
                  </span>
                </>
              )}
            </button>

            {/* Tải mẫu: đặt ngay dưới ô thả file vì đây là lúc người dùng
                nhận ra mình chưa biết viết đề thế nào cho hệ thống đọc được. */}
            <p className="text-hint text-muted-foreground">
              Chưa biết bắt đầu từ đâu?{" "}
              <button
                type="button"
                onClick={() => void downloadTemplate()}
                className="font-semibold text-blue-700 underline-offset-2 hover:underline"
              >
                Tải file mẫu soạn đề theo mã YCCĐ
              </button>{" "}
              — có sẵn hướng dẫn viết ngay trong file.
            </p>

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
        {phase.kind === "review" && withCode > 0 && matched === 0 && (
          <div className="shrink-0 border-b border-amber-300 bg-amber-50 px-5 py-2.5">
            <p className="text-small font-semibold text-amber-900">
              {withCode} câu có mã YCCĐ nhưng không khớp khung năng lực của{" "}
              {subjects.find((x) => x.id === subjectId)?.name ?? "môn đã chọn"} ·{" "}
              {grades.find((x) => x.id === gradeId)?.name ?? "khối đã chọn"}
            </p>
            <p className="text-meta mt-0.5 text-amber-800">
              Mã dạng <code>{drafts.find((d) => d.rawCode)?.rawCode}</code> đã
              mang sẵn môn và lớp. Nhiều khả năng bạn chọn nhầm Môn/Khối ở bước
              trước — đóng lại và chọn đúng thì độ khó sẽ tự điền theo khung.
              Cũng có thể khung năng lực của môn này chưa được nhập.
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
                            {d.content.replace(/!\[[^\]]*\]\([^)]*\)/g, "🖼 ").trim() ||
                              "(đề bài trống)"}
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
                  q={cur}
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
                Lưu và Gửi duyệt ({validCount})
              </Button>
            </div>
          </footer>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Ô sửa đề bài, TÁCH ảnh ra khỏi ô chữ.
 *
 * Ảnh trong file Word được nhúng thành data URI base64. Đổ nguyên vào
 * textarea thì một câu có ảnh ra 183KB chuỗi rác che kín đề bài, không đọc
 * nổi mà cũng không sửa nổi — đúng cái người dùng gặp.
 *
 * Ở đây: chữ vào ô chữ, ảnh hiện thành ảnh thật kèm nút xoá. Lúc ghi lại thì
 * ghép ảnh xuống cuối phần chữ, giữ nguyên cú pháp markdown mà phần hiển thị
 * câu hỏi vẫn đọc được.
 */
const IMG_RE = /!\[[^\]]*\]\((data:[^)]+)\)/g;

function ContentEditor({
  value,
  onChange,
}: {
  value: string;
  onChange(v: string): void;
}) {
  const images = [...value.matchAll(IMG_RE)].map((m) => m[1]);
  const text = value.replace(IMG_RE, "").replace(/\n{3,}/g, "\n\n").trim();
  const rebuild = (nextText: string, nextImages: string[]) =>
    [nextText, ...nextImages.map((src) => `![](${src})`)]
      .filter(Boolean)
      .join("\n\n");

  return (
    <div>
      <span className="text-meta font-semibold text-foreground/70">
        Đề bài câu hỏi *
      </span>
      <textarea
        value={text}
        onChange={(e) => onChange(rebuild(e.target.value, images))}
        rows={5}
        className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-small leading-relaxed"
      />
      {images.length > 0 && (
        <div className="mt-2">
          <span className="text-hint text-muted-foreground">
            {images.length} ảnh đính kèm từ file Word
          </span>
          <ul className="mt-1 flex flex-wrap gap-2">
            {images.map((src, i) => (
              <li key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`Ảnh ${i + 1}`}
                  className="h-24 w-auto rounded border bg-card object-contain"
                />
                <button
                  type="button"
                  onClick={() =>
                    onChange(rebuild(text, images.filter((_, x) => x !== i)))
                  }
                  className="absolute -right-1.5 -top-1.5 rounded-full border bg-card p-0.5 text-muted-foreground shadow-sm hover:bg-accent/30"
                  title="Xoá ảnh này"
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── ô chỉnh chi tiết ───────────────────────── */

function QuestionEditor({
  q,
  index,
  total,
  issues,
  onPatch,
}: {
  q: DraftQuestion;
  index: number;
  total: number;
  issues: DraftIssue[];
  onPatch(edit: Partial<DraftQuestion>): void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-2">
        <span className="text-section-title">Câu {index + 1}</span>
        <span className="text-meta text-muted-foreground">/ {total}</span>
        {q.rawCode && (
          <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-hint font-semibold text-foreground/70">
            {q.rawCode}
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-meta font-semibold text-foreground/70">
            Loại câu hỏi *
          </span>
          <select
            value={q.type ?? ""}
            onChange={(e) =>
              onPatch({ type: (e.target.value || null) as QuestionType | null })
            }
            className="mt-1 h-9 w-full rounded-md border bg-card px-2 text-small"
          >
            <option value="">— Chưa nhận ra dạng —</option>
            {SUPPORTED_TYPES.map((t) => (
              <option key={t} value={t}>
                {typeLabel(t)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-meta font-semibold text-foreground/70">
            Mức độ nhận biết *
          </span>
          <select
            value={q.difficulty ?? ""}
            onChange={(e) =>
              onPatch({
                difficulty: (e.target.value || null) as DraftQuestion["difficulty"],
              })
            }
            className="mt-1 h-9 w-full rounded-md border bg-card px-2 text-small"
          >
            <option value="">— Chưa chọn mức độ —</option>
            {Object.entries(DIFFICULTY_LABEL).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

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

      <ContentEditor
        value={q.content}
        onChange={(content) => onPatch({ content })}
      />

      {(q.type === "mcq-single" || q.type === "mcq-multi") && (
        <div>
          <span className="text-meta font-semibold text-foreground/70">
            Đáp án * — tick vào phương án đúng
          </span>
          <ul className="mt-1 space-y-1.5">
            {q.options.map((o, oi) => (
              <li key={oi} className="flex items-start gap-2">
                <input
                  type={q.type === "mcq-single" ? "radio" : "checkbox"}
                  name={`opt-${q.id}`}
                  checked={o.isCorrect}
                  onChange={(e) =>
                    onPatch({
                      options: q.options.map((x, xi) =>
                        xi === oi
                          ? { ...x, isCorrect: e.target.checked }
                          : q.type === "mcq-single"
                            ? { ...x, isCorrect: false }
                            : x,
                      ),
                    })
                  }
                  className="mt-2 h-4 w-4 shrink-0 accent-[var(--color-primary)]"
                />
                <input
                  value={o.content}
                  onChange={(e) =>
                    onPatch({
                      options: q.options.map((x, xi) =>
                        xi === oi ? { ...x, content: e.target.value } : x,
                      ),
                    })
                  }
                  placeholder={`Phương án ${String.fromCharCode(65 + oi)}`}
                  className="h-9 w-full rounded-md border bg-card px-2 text-small"
                />
                <button
                  type="button"
                  onClick={() =>
                    onPatch({ options: q.options.filter((_, xi) => xi !== oi) })
                  }
                  className="mt-1 rounded p-1 text-muted-foreground hover:bg-accent/30"
                  title="Xoá phương án"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() =>
              onPatch({
                options: [...q.options, { content: "", isCorrect: false }],
              })
            }
          >
            Thêm phương án
          </Button>
        </div>
      )}

      {/* Ý con Đúng/Sai — mỗi ý một dòng, chọn Đúng hoặc Sai. */}
      {q.type === "multi-tf" && (
        <div>
          <span className="text-meta font-semibold text-foreground/70">
            Các ý Đúng/Sai * — chọn đáp án cho từng ý
          </span>
          <ul className="mt-1 space-y-1.5">
            {q.subQuestions.map((sq, si) => (
              <li key={si} className="flex items-start gap-2">
                <span className="mt-2 w-4 shrink-0 text-meta font-semibold text-muted-foreground">
                  {String.fromCharCode(97 + si)})
                </span>
                <input
                  value={sq.statement}
                  onChange={(e) =>
                    onPatch({
                      subQuestions: q.subQuestions.map((x, xi) =>
                        xi === si ? { ...x, statement: e.target.value } : x,
                      ),
                    })
                  }
                  placeholder="Nội dung ý"
                  className="h-9 w-full rounded-md border bg-card px-2 text-small"
                />
                <div className="mt-1 flex shrink-0 gap-1">
                  {[true, false].map((v) => (
                    <button
                      key={String(v)}
                      type="button"
                      onClick={() =>
                        onPatch({
                          subQuestions: q.subQuestions.map((x, xi) =>
                            xi === si ? { ...x, correctAnswer: v } : x,
                          ),
                        })
                      }
                      className={cn(
                        "rounded-md border-2 px-2 py-1 text-meta font-semibold transition",
                        sq.correctAnswer === v
                          ? v
                            ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                            : "border-rose-300 bg-rose-50 text-rose-900"
                          : "border-border bg-card text-muted-foreground hover:bg-accent/20",
                      )}
                    >
                      {v ? "Đúng" : "Sai"}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onPatch({
                      subQuestions: q.subQuestions.filter((_, xi) => xi !== si),
                    })
                  }
                  className="mt-1 rounded p-1 text-muted-foreground hover:bg-accent/30"
                  title="Xoá ý này"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() =>
              onPatch({
                subQuestions: [
                  ...q.subQuestions,
                  { statement: "", correctAnswer: false },
                ],
              })
            }
          >
            Thêm ý
          </Button>
        </div>
      )}

      {/* Đáp án chấm máy của câu trả lời ngắn. Đọc từ <Key=…> trong file; mỗi
          đáp án một dòng vì một câu có thể chấp nhận nhiều cách viết. */}
      {q.type === "short-answer" && (
        <div>
          <span className="text-meta font-semibold text-foreground/70">
            Đáp án chấp nhận * — mỗi dòng một cách viết được tính đúng
          </span>
          <ul className="mt-1 space-y-1.5">
            {q.acceptedAnswers.map((a, ai) => (
              <li key={ai} className="flex items-center gap-2">
                <input
                  value={typeof a === "string" ? a : (a.text ?? "")}
                  onChange={(e) =>
                    onPatch({
                      acceptedAnswers: q.acceptedAnswers.map((x, xi) =>
                        xi === ai ? e.target.value : x,
                      ),
                    })
                  }
                  placeholder="vd: 42"
                  className="h-9 w-full rounded-md border bg-card px-2 text-small"
                />
                <button
                  type="button"
                  onClick={() =>
                    onPatch({
                      acceptedAnswers: q.acceptedAnswers.filter(
                        (_, xi) => xi !== ai,
                      ),
                    })
                  }
                  className="rounded p-1 text-muted-foreground hover:bg-accent/30"
                  title="Xoá đáp án này"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() =>
              onPatch({ acceptedAnswers: [...q.acceptedAnswers, ""] })
            }
          >
            Thêm đáp án
          </Button>
        </div>
      )}

      <label className="block">
        <span className="text-meta font-semibold text-foreground/70">
          Lời giải / giải thích
        </span>
        <textarea
          value={q.explanation}
          onChange={(e) => onPatch({ explanation: e.target.value })}
          rows={3}
          className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-small leading-relaxed"
        />
      </label>

      {q.parserWarnings.length > 0 && (
        <p className="text-hint text-muted-foreground">
          Ghi chú khi đọc file: {q.parserWarnings.join(" · ")}
        </p>
      )}
    </div>
  );
}
