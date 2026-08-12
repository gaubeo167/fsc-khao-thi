"use client";

import {
  AlertTriangle,
  Check,
  FileText,
  Loader2,
  PencilLine,
  Trash2,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useCampusStore } from "@/features/campus/state/campus-store";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { authHeaders } from "@/lib/api-client";

import { RenderedContent } from "../components/rendered-content";
import type { Question, QuestionStatus } from "../data/seed-questions";
import type { ParsedBankQuestion } from "../lib/parse-exam-bank";
import { useQuestionsStore } from "../state/questions-store";

import {
  AiQuestionEditDialog,
  type AiEditValues,
} from "./ai-question-edit-dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** One reviewable question: the editable values + its chuyên-đề code. */
interface ReviewEntry {
  edit: AiEditValues;
  chuyenDeCode: string;
  rawCode: string;
}

type State =
  | { kind: "idle" }
  | { kind: "loading"; fileName: string }
  | { kind: "review"; entries: ReviewEntry[] }
  | { kind: "error"; message: string; warnings?: string[]; preview?: string[] };

const TYPE_LABEL: Record<string, string> = {
  "mcq-single": "Trắc nghiệm (1 đáp án)",
  "mcq-multi": "Trắc nghiệm (nhiều đáp án)",
  "multi-tf": "Đúng / Sai",
  "short-answer": "Trả lời ngắn",
  essay: "Tự luận",
};
const DIFF_LABEL: Record<string, string> = {
  easy: "Nhận biết",
  medium: "Thông hiểu",
  hard: "Vận dụng",
};

let idSeq = 0;
const nid = (p: string) => `${p}-${(idSeq++).toString(36)}-${Date.now().toString(36)}`;

/** ParsedBankQuestion → editable AiEditValues (same shape as direct entry). */
/**
 * Mã câu KHÔNG bắt buộc ghi độ khó. Khi thiếu, lấy từ node mục lục khớp mã:
 * khung YCCĐ upload lên đã đặt tên node bắt đầu bằng "a. / b. / c." (nhận
 * biết / thông hiểu / vận dụng), nên độ khó nằm sẵn ở đó — người soạn câu
 * hỏi không phải gõ lại. Không suy được thì giữ mặc định của parser.
 */
function withInferredDifficulty(
  q: ParsedBankQuestion,
  codeIndex: Map<string, { id: string; name: string; code: string }>,
): ParsedBankQuestion {
  if (q.difficultyFromCode) return q;
  const cpCode = q.rawCode.replace(/\.[a-c]$/i, "").toUpperCase();
  const node =
    codeIndex.get(cpCode) ?? codeIndex.get(q.chuyenDeCode.toUpperCase());
  const m = /^\s*([abc])\s*[.)]/i.exec(node?.name ?? "");
  if (!m) return q;
  const byLetter: Record<string, ParsedBankQuestion["difficulty"]> = {
    a: "easy",
    b: "medium",
    c: "hard",
  };
  return { ...q, difficulty: byLetter[m[1]!.toLowerCase()] ?? q.difficulty };
}

function parsedToEditValues(q: ParsedBankQuestion): AiEditValues {
  const base: AiEditValues = {
    type: q.qType,
    content: q.content,
    difficulty: q.difficulty,
    // Lời giải / hướng dẫn chấm viết dưới câu hỏi. Với câu tự luận đây là
    // đáp án mẫu — giữ lại làm cơ sở cho chấm AI theo rubric sau này.
    explanation: q.explanation || undefined,
  };
  if (q.qType === "mcq-single" || q.qType === "mcq-multi") {
    base.options = q.options.map((o) => ({
      id: nid("opt"),
      content: o.content,
      isCorrect: o.isCorrect,
    }));
  } else if (q.qType === "multi-tf") {
    base.subQuestions = q.subQuestions.map((s) => ({
      id: nid("sub"),
      statement: s.statement,
      correctAnswer: s.correctAnswer,
    }));
  } else if (q.qType === "short-answer") {
    base.acceptedAnswers = [...q.acceptedAnswers];
    base.caseSensitive = false;
  } else if (q.qType === "essay") {
    base.rubric = [];
    base.aiAssist = false;
  }
  return base;
}

/** Recompute blocking issues from the CURRENT (possibly edited) values, so
 *  editing to add a missing answer clears the warning. */
function computeIssues(v: AiEditValues, matched: boolean): string[] {
  const out: string[] = [];
  if (!matched) out.push("Mã chuyên đề chưa có trong mục lục Môn + Khối đã chọn.");
  if (!v.content?.trim()) out.push("Thiếu nội dung câu hỏi.");
  if (v.type === "mcq-single" || v.type === "mcq-multi") {
    if (!v.options || v.options.length < 2) out.push("Cần ít nhất 2 phương án.");
    else if (!v.options.some((o) => o.isCorrect)) out.push("Chưa chọn đáp án đúng.");
  } else if (v.type === "multi-tf") {
    if (!v.subQuestions || v.subQuestions.length === 0) out.push("Thiếu các ý Đúng/Sai.");
  } else if (v.type === "short-answer") {
    if (!v.acceptedAnswers || v.acceptedAnswers.length === 0) out.push("Thiếu đáp án (<Key=…>).");
  }
  return out;
}

export function ExamBankImportDialog({ open, onOpenChange }: Props) {
  const session = useAuthStore((s) => s.session);
  const subjects = useSubjectsStore((s) => s.subjects);
  const tocNodes = useSubjectsStore((s) => s.tocNodes);
  const grades = useGradesStore((s) => s.grades);
  const createQuestion = useQuestionsStore((s) => s.create);
  const activeCampusId = useCampusStore((s) => s.activeCampusId);

  const [subjectId, setSubjectId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setState({ kind: "idle" });
      setEditingIdx(null);
      setSaveError(null);
    }
  }, [open]);

  // code → { id, name } for the chosen Môn + Khối (mỗi khối có khung riêng).
  // Khoá theo mã VIẾT HOA: người soạn gõ "si10.02.13" hay "SI10.02.13" đều
  // là một mã, không có lý do bắt họ khớp hoa/thường.
  const codeIndex = useMemo(() => {
    const m = new Map<string, { id: string; name: string; code: string }>();
    for (const n of tocNodes) {
      if (n.subjectId === subjectId && n.gradeId === gradeId && n.code) {
        m.set(n.code.toUpperCase(), { id: n.id, name: n.name, code: n.code });
      }
    }
    return m;
  }, [tocNodes, subjectId, gradeId]);

  const entries = state.kind === "review" ? state.entries : [];
  const enriched = useMemo(
    () =>
      entries.map((e) => {
        // Gắn vào node SÂU NHẤT khớp mã: thử CP (mã gồm cả .D05, bỏ độ khó)
        // trước, không có thì lùi về CĐ. Nhờ vậy câu hỏi nằm ở CP nếu khung
        // có chỉ báo tương ứng → thống kê & bốc theo CP.
        const cpCode = e.rawCode.replace(/\.[a-c]$/i, "").toUpperCase();
        const match =
          codeIndex.get(cpCode) ??
          codeIndex.get(e.chuyenDeCode.toUpperCase()) ??
          null;
        return {
          ...e,
          matchedNodeId: match?.id ?? null,
          matchedNodeName: match?.name ?? null,
          matchedCode: match?.code ?? null,
          issues: computeIssues(e.edit, !!match),
        };
      }),
    [entries, codeIndex],
  );
  const validCount = enriched.filter((e) => e.issues.length === 0).length;
  const flaggedCount = enriched.length - validCount;

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!/\.docx$/i.test(file.name)) {
      setState({ kind: "error", message: "Chỉ hỗ trợ file Word .docx." });
      return;
    }
    if (!subjectId || !gradeId) {
      setState({ kind: "error", message: "Chọn Môn học và Khối trước khi tải đề." });
      return;
    }
    setState({ kind: "loading", fileName: file.name });
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/import/parse-exam-bank", {
        method: "POST",
        headers: { ...(await authHeaders()) },
        body: fd,
      });
      // Read defensively: a crashed/oversized function can return an empty
      // or non-JSON body, which res.json() turns into the unhelpful
      // "Unexpected end of JSON input".
      const raw = await res.text();
      let data: {
        questions?: ParsedBankQuestion[];
        message?: string;
        detail?: string;
        warnings?: string[];
        preview?: string[];
      } = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        setState({
          kind: "error",
          message: `Server trả về dữ liệu không hợp lệ (mã ${res.status}). ${
            raw ? raw.slice(0, 200) : "Body rỗng — có thể file quá lớn/nhiều ảnh."
          }`,
        });
        return;
      }
      if (!res.ok) {
        setState({
          kind: "error",
          message: `${data.message ?? `Lỗi máy chủ (mã ${res.status}).`}${
            data.detail ? ` — Chi tiết: ${data.detail}` : ""
          }`,
          warnings: data.warnings,
          preview: data.preview,
        });
        return;
      }
      const parsed = (data.questions ?? []) as ParsedBankQuestion[];
      setState({
        kind: "review",
        entries: parsed.map((q) => ({
          edit: parsedToEditValues(withInferredDifficulty(q, codeIndex)),
          chuyenDeCode: q.chuyenDeCode,
          rawCode: q.rawCode,
        })),
      });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Không kết nối được tới server",
      });
    }
  }

  function updateEntry(idx: number, edit: AiEditValues) {
    setState((s) =>
      s.kind === "review"
        ? {
            ...s,
            entries: s.entries.map((e, i) => (i === idx ? { ...e, edit } : e)),
          }
        : s,
    );
  }
  function removeEntry(idx: number) {
    setState((s) =>
      s.kind === "review"
        ? { ...s, entries: s.entries.filter((_, i) => i !== idx) }
        : s,
    );
  }

  function importValid(target: "personal" | "campus") {
    if (!session) {
      setSaveError("Không tìm thấy thông tin tài khoản.");
      return;
    }
    const resolvedCampusId =
      target === "personal" ? null : session.campusId ?? activeCampusId ?? null;
    const status: QuestionStatus = target === "personal" ? "approved" : "pending";

    for (const e of enriched) {
      if (e.issues.length > 0) continue;
      const v = e.edit;
      const base = {
        content: v.content,
        explanation: v.explanation && v.explanation.trim() ? v.explanation : undefined,
        subjectId,
        gradeId,
        tocNodeId: e.matchedNodeId,
        difficulty: v.difficulty,
        tags: [] as string[],
        kho: target,
        campusId: resolvedCampusId,
        ownerId: session.userId,
        ownerName: session.name ?? "—",
        status,
        approvedBy: status === "approved" ? session.userId : null,
        rejectionNote: null,
      };
      let toCreate: Omit<Question, "id" | "createdAt" | "updatedAt"> | null = null;
      if (v.type === "mcq-single" || v.type === "mcq-multi") {
        toCreate = {
          ...base,
          type: v.type,
          options: (v.options ?? []).map((o) => ({
            id: o.id,
            content: o.content,
            isCorrect: o.isCorrect,
          })),
        } as Omit<Question, "id" | "createdAt" | "updatedAt">;
      } else if (v.type === "multi-tf") {
        toCreate = {
          ...base,
          type: "multi-tf",
          subQuestions: (v.subQuestions ?? []).map((s) => ({
            id: s.id,
            statement: s.statement,
            correctAnswer: s.correctAnswer,
          })),
        } as Omit<Question, "id" | "createdAt" | "updatedAt">;
      } else if (v.type === "short-answer") {
        toCreate = {
          ...base,
          type: "short-answer",
          acceptedAnswers: v.acceptedAnswers ?? [],
          caseSensitive: v.caseSensitive ?? false,
        } as Omit<Question, "id" | "createdAt" | "updatedAt">;
      } else if (v.type === "essay") {
        toCreate = {
          ...base,
          type: "essay",
          rubric: (v.rubric ?? []).map((r) => ({
            id: r.id,
            label: r.label,
            points: r.points,
          })),
          wordMin: v.wordMin,
          wordMax: v.wordMax,
          aiAssist: v.aiAssist ?? false,
        } as Omit<Question, "id" | "createdAt" | "updatedAt">;
      }
      if (toCreate) createQuestion(toCreate);
    }
    onOpenChange(false);
  }

  const reviewing = state.kind === "review";
  const editing = editingIdx !== null ? enriched[editingIdx] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl p-0 max-h-[92vh] overflow-y-auto"
        srTitle="Upload đề vào ngân hàng câu hỏi"
      >
        <header className="flex items-start gap-3 border-b px-6 py-4 pr-12">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200">
            <FileText className="h-5 w-5" strokeWidth={1.85} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-section-title">Upload đề vào ngân hàng câu hỏi</h2>
            <p className="text-meta mt-0.5">
              Tải file .docx theo mẫu (mã [SI10.02.2.D05.a]). Hệ tự nhận chuyên
              đề, dạng câu, độ khó, đáp án (gạch chân) → xem lại, chỉnh sửa rồi
              duyệt để lưu vào kho theo từng chuyên đề.
            </p>
          </div>
        </header>

        <div className="space-y-4 px-6 py-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-[13px] font-medium text-foreground/80">Môn học</Label>
              <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                <option value="">— Chọn môn —</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-medium text-foreground/80">Khối</Label>
              <Select value={gradeId} onChange={(e) => setGradeId(e.target.value)}>
                <option value="">— Chọn khối —</option>
                {grades.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Chọn đúng khối đã tạo mục lục cho đề này.
              </p>
            </div>
          </div>

          {!reviewing && state.kind !== "loading" && (
            <>
              <FormatGuide />
              <label
                htmlFor="exam-bank-file"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  void handleFile(e.dataTransfer.files?.[0]);
                }}
                className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#CBD5E1] bg-surface-2 px-4 py-8 text-center transition-colors hover:border-primary/50 hover:bg-primary/5"
              >
                <Upload className="h-6 w-6 text-muted-foreground" strokeWidth={1.85} />
                <div>
                  <p className="text-[13px] font-medium text-foreground">
                    Chọn file .docx hoặc kéo thả vào đây
                  </p>
                  <p className="text-meta mt-0.5">
                    Đề soạn theo mẫu — tối đa 12MB. Chọn Môn + Khối trước.
                  </p>
                </div>
              </label>
              <input
                id="exam-bank-file"
                type="file"
                accept=".docx"
                className="hidden"
                onChange={(e) => void handleFile(e.target.files?.[0])}
              />
            </>
          )}

          {state.kind === "loading" && (
            <div className="flex items-center gap-2 rounded-lg border bg-surface-2 px-3 py-2.5 text-[13px] text-foreground/75">
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.85} />
              Đang đọc & phân tích “{state.fileName}”…
            </div>
          )}

          {state.kind === "error" && (
            <div className="flex items-start gap-2.5 rounded-lg border border-destructive-border bg-destructive-soft px-3 py-2.5 text-[13px] text-destructive-text">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.85} aria-hidden />
              <div className="min-w-0">
                <p className="font-semibold">Không đọc được đề</p>
                <p className="text-meta mt-0.5 leading-relaxed text-destructive-text/80">
                  {state.message}
                </p>
                {state.warnings && state.warnings.length > 0 && (
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[12px] text-destructive-text/80">
                    {state.warnings.slice(0, 5).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}
                {/* Đối chiếu file Word với đúng thứ server đọc được — mã câu
                    nằm trong bảng / hộp văn bản / ảnh chụp sẽ lộ ra ngay. */}
                {state.preview && state.preview.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[12px] font-semibold">
                      Xem nội dung server đọc được ({state.preview.length} dòng đầu)
                    </summary>
                    <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-card/70 p-2 text-[11.5px] leading-relaxed text-foreground/80">
                      {state.preview.join("\n")}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          )}

          {reviewing && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-[12px]">
                <span className="rounded-md bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">
                  {validCount} câu hợp lệ
                </span>
                {flaggedCount > 0 && (
                  <span className="rounded-md bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">
                    {flaggedCount} câu cần sửa (bỏ qua khi import)
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  onClick={() => setState({ kind: "idle" })}
                >
                  Chọn file khác
                </Button>
              </div>

              <ul className="space-y-2">
                {enriched.map((e, i) => (
                  <ReviewCard
                    key={`${e.rawCode}-${i}`}
                    index={i + 1}
                    entry={e}
                    onEdit={() => setEditingIdx(i)}
                    onRemove={() => removeEntry(i)}
                  />
                ))}
              </ul>

              {saveError && <p className="text-[12px] text-destructive-text">{saveError}</p>}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t bg-[var(--color-surface-2)] px-6 py-3.5">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          {reviewing ? (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => importValid("personal")}
                disabled={validCount === 0}
              >
                Lưu {validCount} câu vào kho cá nhân
              </Button>
              <Button onClick={() => importValid("campus")} disabled={validCount === 0}>
                <Check className="h-4 w-4" />
                Gửi duyệt kho campus ({validCount})
              </Button>
            </div>
          ) : (
            <span className="text-meta">Chọn Môn + Khối rồi tải file để xem trước</span>
          )}
        </footer>
      </DialogContent>

      {editing && editingIdx !== null && (
        <AiQuestionEditDialog
          open
          onOpenChange={(o) => {
            if (!o) setEditingIdx(null);
          }}
          initial={editing.edit}
          onSave={(values) => {
            updateEntry(editingIdx, values);
            setEditingIdx(null);
          }}
        />
      )}
    </Dialog>
  );
}

function ReviewCard({
  index,
  entry,
  onEdit,
  onRemove,
}: {
  index: number;
  entry: ReviewEntry & {
    matchedNodeId: string | null;
    matchedNodeName: string | null;
    matchedCode?: string | null;
    issues: string[];
  };
  onEdit: () => void;
  onRemove: () => void;
}) {
  const v = entry.edit;
  const ok = entry.issues.length === 0;
  return (
    <li
      className={
        "rounded-lg border p-3 " +
        (ok ? "border-border bg-card" : "border-amber-300 bg-amber-50/40")
      }
    >
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="font-mono text-[10px] text-slate-500">#{index}</span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
          {entry.rawCode}
        </span>
        <span className="rounded bg-indigo-100 px-1.5 py-0.5 font-semibold text-indigo-700">
          {TYPE_LABEL[v.type] ?? v.type}
        </span>
        <span className="rounded bg-sky-100 px-1.5 py-0.5 font-semibold text-sky-700">
          {DIFF_LABEL[v.difficulty]}
        </span>
        {entry.matchedNodeName ? (
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-700">
            {entry.matchedCode ?? entry.chuyenDeCode} · {entry.matchedNodeName}
          </span>
        ) : (
          <span className="rounded bg-rose-100 px-1.5 py-0.5 font-semibold text-rose-700">
            {entry.chuyenDeCode} · không khớp mục lục
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md border bg-card px-2 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/5"
          >
            <PencilLine className="inline h-3 w-3" /> Sửa
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-md border bg-card px-2 py-0.5 text-[11px] font-semibold text-destructive hover:bg-destructive/5"
          >
            <Trash2 className="inline h-3 w-3" /> Bỏ qua
          </button>
        </div>
      </div>

      <div className="mt-2 rounded-md border bg-surface p-2 text-[13px]">
        <RenderedContent content={v.content} />
      </div>

      <AnswerPreview v={v} />

      {entry.issues.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {entry.issues.map((iss, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11.5px] text-amber-800">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {iss}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function AnswerPreview({ v }: { v: AiEditValues }) {
  if (v.type === "mcq-single" || v.type === "mcq-multi") {
    return (
      <ul className="mt-2 space-y-1 text-[12px]">
        {(v.options ?? []).map((o, i) => (
          <li
            key={o.id}
            className={
              "flex items-center gap-2 rounded border bg-surface px-2 py-1 " +
              (o.isCorrect ? "border-emerald-300 bg-emerald-50" : "")
            }
          >
            <span
              className={
                "inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold " +
                (o.isCorrect ? "bg-emerald-500 text-white" : "bg-muted text-foreground/70")
              }
            >
              {String.fromCharCode(65 + i)}
            </span>
            <span className="min-w-0 flex-1">
              <RenderedContent content={o.content} />
            </span>
            {o.isCorrect && (
              <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                Đúng
              </span>
            )}
          </li>
        ))}
      </ul>
    );
  }
  if (v.type === "multi-tf") {
    return (
      <ul className="mt-2 space-y-1 text-[12px]">
        {(v.subQuestions ?? []).map((s, i) => (
          <li key={s.id} className="flex items-start gap-2">
            <span
              className={
                "mt-0.5 inline-flex h-5 min-w-[2.4rem] items-center justify-center rounded text-[10px] font-bold " +
                (s.correctAnswer
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-rose-100 text-rose-700")
              }
            >
              {String.fromCharCode(97 + i)}) {s.correctAnswer ? "Đúng" : "Sai"}
            </span>
            <span className="min-w-0 flex-1">
              <RenderedContent content={s.statement} />
            </span>
          </li>
        ))}
      </ul>
    );
  }
  if (v.type === "short-answer") {
    return (
      <p className="mt-2 text-[12px]">
        Đáp án:{" "}
        <span className="font-medium text-emerald-700">
          {(v.acceptedAnswers ?? []).join(", ") || "—"}
        </span>
      </p>
    );
  }
  return null;
}

function FormatGuide() {
  return (
    <div className="rounded-lg border bg-surface-2/60 px-4 py-3 text-[12.5px] leading-relaxed">
      <p className="mb-1 font-semibold text-foreground/85">Quy ước file mẫu</p>
      <ul className="space-y-0.5 text-foreground/75">
        <li>
          • Mỗi câu bắt đầu bằng mã <code className="rounded bg-muted px-1">[SI10.02.2.D05]</code> ={" "}
          <b>[mã chuyên đề].[Loại+số]</b>.
        </li>
        <li>
          • Loại: <b>D</b>=Trắc nghiệm, <b>F</b>=Đúng/Sai, <b>S</b>=Trả lời ngắn, <b>E</b>=Tự luận.
        </li>
        <li>
          • Độ khó: <b>không cần ghi</b> — hệ lấy theo mã trong khung YCCĐ (tên
          YCCĐ mở đầu bằng <b>a</b>=Nhận biết, <b>b</b>=Thông hiểu, <b>c</b>=Vận dụng).
          Muốn đè thì ghi thêm ở cuối mã:{" "}
          <code className="rounded bg-muted px-1">[SI10.02.2.D05.a]</code>.
        </li>
        <li>
          • Đáp án đúng: <b>gạch chân</b> (D nhiều gạch chân → chọn nhiều đáp án; F gạch
          chân = Đúng). Trả lời ngắn dùng <code className="rounded bg-muted px-1">&lt;Key=…&gt;</code>.
        </li>
        <li>
          • Lời giải / đáp án tự luận: mở đầu bằng{" "}
          <b>Lời giải:</b> · <b>Hướng dẫn giải:</b> · <b>Đáp án:</b> · <b>Giải thích:</b> —
          mọi dòng sau đó tới câu kế tiếp được lưu làm lời giải (cơ sở cho chấm AI
          theo rubric).
        </li>
        <li>• Câu có ảnh: chèn ảnh trong Word như bình thường, hệ giữ nguyên ảnh.</li>
      </ul>
      <a
        href="/api/import/exam-bank-template"
        className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-semibold text-primary underline"
      >
        <Upload className="h-3.5 w-3.5 rotate-180" />
        Tải file mẫu (.docx)
      </a>
    </div>
  );
}
