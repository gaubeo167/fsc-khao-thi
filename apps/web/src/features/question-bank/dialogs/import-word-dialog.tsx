"use client";

import {
  Check,
  Download,
  FileText,
  Loader2,
  PencilLine,
  Save,
  Send,
  Trash2,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useCampusStore } from "@/features/campus/state/campus-store";
import { useCampusesStore } from "@/features/campus/state/campuses-store";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";

import { findQuestionType } from "../data/question-types";
import type { Question, QuestionStatus } from "../data/seed-questions";
import type { ImportedQuestion } from "../lib/parse-import";
import { useQuestionsStore } from "../state/questions-store";
import { RenderedContent } from "../components/rendered-content";
import { authHeaders } from "@/lib/api-client";
import { cn } from "@/lib/utils";

import {
  AiQuestionEditDialog,
  type AiEditValues,
} from "./ai-question-edit-dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Convert an `ImportedQuestion` (light shape from the parser) into the
 * `AiEditValues` shape (with stable ids on arrays) consumed by
 * `AiQuestionEditDialog`. The reverse happens in `editValuesToImported`.
 */
function importedToEditValues(q: ImportedQuestion): AiEditValues {
  const base = {
    type: q.type,
    content: q.content,
    explanation: q.explanation ?? "",
    difficulty: q.difficulty,
  };
  switch (q.type) {
    case "mcq-single":
    case "mcq-multi":
      return {
        ...base,
        options: q.options.map((o, i) => ({
          id: `opt-${i}-${Date.now()}`,
          content: o.content,
          isCorrect: o.isCorrect,
        })),
      };
    case "true-false":
      return { ...base, correctAnswer: q.correctAnswer };
    case "fill-blank":
      return { ...base, blanks: q.blanks };
    case "matching":
      return {
        ...base,
        pairs: q.pairs.map((p, i) => ({
          id: `p-${i}-${Date.now()}`,
          left: p.left,
          right: p.right,
        })),
      };
    case "ordering":
      return {
        ...base,
        items: q.items.map((c, i) => ({
          id: `i-${i}-${Date.now()}`,
          content: c,
        })),
      };
    case "essay":
      return {
        ...base,
        rubric: q.rubric.map((r, i) => ({
          id: `r-${i}-${Date.now()}`,
          label: r.label,
          points: r.points,
        })),
        wordMin: q.wordMin ?? 0,
        wordMax: q.wordMax ?? 0,
        aiAssist: false,
      };
    case "underline":
      return base;
  }
}

function editValuesToImported(
  original: ImportedQuestion,
  values: AiEditValues,
): ImportedQuestion {
  const sharedPatch = {
    difficulty: values.difficulty,
    content: values.content,
    explanation: values.explanation?.trim() || undefined,
  };
  switch (original.type) {
    case "mcq-single":
    case "mcq-multi":
      return {
        ...original,
        ...sharedPatch,
        options: (values.options ?? []).map((o) => ({
          content: o.content,
          isCorrect: o.isCorrect,
        })),
      };
    case "true-false":
      return {
        ...original,
        ...sharedPatch,
        correctAnswer: Boolean(values.correctAnswer),
      };
    case "fill-blank":
      return {
        ...original,
        ...sharedPatch,
        blanks: values.blanks ?? original.blanks,
      };
    case "matching":
      return {
        ...original,
        ...sharedPatch,
        pairs: (values.pairs ?? []).map((p) => ({ left: p.left, right: p.right })),
      };
    case "ordering":
      return {
        ...original,
        ...sharedPatch,
        items: (values.items ?? []).map((i) => i.content),
      };
    case "essay":
      return {
        ...original,
        ...sharedPatch,
        rubric: (values.rubric ?? []).map((r) => ({
          label: r.label,
          points: r.points,
        })),
        wordMin: values.wordMin || undefined,
        wordMax: values.wordMax || undefined,
      };
    case "underline":
      return { ...original, ...sharedPatch };
  }
}

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "review";
      questions: ImportedQuestion[];
      warnings: string[];
    }
  | { kind: "error"; message: string };

export function ImportWordDialog({ open, onOpenChange }: Props) {
  const session = useAuthStore((s) => s.session);
  const activeCampusId = useCampusStore((s) => s.activeCampusId);
  const campuses = useCampusesStore((s) => s.campuses);
  const subjects = useSubjectsStore((s) => s.subjects);
  const allGrades = useGradesStore((s) => s.grades);
  const tocNodes = useSubjectsStore((s) => s.tocNodes);
  const createQuestion = useQuestionsStore((s) => s.create);

  const [subjectId, setSubjectId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [tocNodeId, setTocNodeId] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  // Scope grades to the operating campus's tier so import dialog doesn't
  // offer K10-K12 when the campus is primary-secondary (K1-K9).
  const operatingCampusId =
    session?.role === "superadmin"
      ? activeCampusId
      : session?.campusId ?? null;
  const operatingCampus = operatingCampusId
    ? campuses.find((c) => c.id === operatingCampusId) ?? null
    : null;
  const grades = operatingCampus
    ? allGrades.filter((g) => operatingCampus.gradeIds.includes(g.id))
    : allGrades;
  // Scope subjects to the operating campus too — without this, brand-new
  // campuses (e.g. one with only 2 subjects) saw every subject from
  // every other campus mixed into the dropdown. Mirrors the filter on
  // /admin/question-bank: subject is in scope iff it has no campus
  // restriction OR its campusIds includes the current campus, AND it
  // teaches at least one grade in the campus's grade list.
  const scopedSubjects = operatingCampus
    ? subjects.filter((s) => {
        const inCampus =
          !s.campusIds ||
          s.campusIds.length === 0 ||
          s.campusIds.includes(operatingCampus.id);
        if (!inCampus) return false;
        return s.gradeIds.some((gid) =>
          operatingCampus.gradeIds.includes(gid),
        );
      })
    : subjects;

  // TOC: prefer exact (subject, grade) match, fall back to subject-only
  // so admins who built a Mục lục under one grade don't have to rebuild
  // it for every other grade of the same subject.
  const exactToc = tocNodes.filter(
    (n) => n.subjectId === subjectId && n.gradeId === gradeId,
  );
  const subjectToc = tocNodes.filter((n) => n.subjectId === subjectId);
  const availableTocs = exactToc.length > 0 ? exactToc : subjectToc;
  const tocFallback = exactToc.length === 0 && subjectToc.length > 0;

  async function importFile(file: File) {
    setState({ kind: "loading" });
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/import/parse", {
        method: "POST",
        headers: { ...(await authHeaders()) },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        setState({ kind: "error", message: data.message ?? "Lỗi không xác định" });
        return;
      }
      handleParsed(data.questions, data.warnings);
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Không đọc được file",
      });
    }
  }

  async function importText() {
    if (!pasteText.trim()) {
      setState({ kind: "error", message: "Vui lòng dán nội dung trước." });
      return;
    }
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/import/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ text: pasteText }),
      });
      const data = await res.json();
      if (!res.ok) {
        setState({ kind: "error", message: data.message ?? "Lỗi không xác định" });
        return;
      }
      handleParsed(data.questions, data.warnings);
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Không kết nối server",
      });
    }
  }

  function handleParsed(questions: ImportedQuestion[], warnings: string[]) {
    if (!questions || questions.length === 0) {
      setState({
        kind: "error",
        message:
          warnings && warnings.length > 0
            ? warnings.join(" · ")
            : "Không trích xuất được câu hỏi nào — kiểm tra lại định dạng.",
      });
      return;
    }
    setState({ kind: "review", questions, warnings: warnings ?? [] });
  }

  function removeAt(idx: number) {
    if (state.kind !== "review") return;
    const next = state.questions.filter((_, i) => i !== idx);
    if (next.length === 0) {
      setState({ kind: "idle" });
      return;
    }
    setState({ ...state, questions: next });
  }

  function patchAt(idx: number, patched: ImportedQuestion) {
    if (state.kind !== "review") return;
    const next = state.questions.map((q, i) => (i === idx ? patched : q));
    setState({ ...state, questions: next });
  }

  const editing =
    state.kind === "review" && editingIdx !== null
      ? state.questions[editingIdx] ?? null
      : null;

  function saveAll(target: "personal" | "campus") {
    if (state.kind !== "review") return;
    setSaveError(null);
    if (!session) {
      setSaveError("Không tìm thấy thông tin tài khoản.");
      return;
    }
    if (!subjectId || !gradeId) {
      setSaveError("Vui lòng chọn môn học và khối ở phần trên.");
      return;
    }
    const resolvedCampusId =
      target === "personal" ? null : session.campusId ?? activeCampusId ?? null;
    const status: QuestionStatus = target === "personal" ? "approved" : "pending";

    for (const q of state.questions) {
      const sharedBase = {
        content: q.content,
        explanation: q.explanation ?? null,
        subjectId,
        gradeId,
        tocNodeId: tocNodeId || null,
        difficulty: q.difficulty,
        tags: [] as string[],
        kho: target,
        campusId: resolvedCampusId,
        ownerId: session.userId,
        ownerName: session.name ?? "—",
        status,
        approvedBy: status === "approved" ? session.userId : null,
        rejectionNote: null,
      };

      // Convert ImportedQuestion → store Question shape per type
      let toCreate: Omit<Question, "id" | "createdAt" | "updatedAt"> | null = null;
      switch (q.type) {
        case "mcq-single":
        case "mcq-multi":
          toCreate = {
            ...sharedBase,
            type: q.type,
            options: q.options.map((o, i) => ({
              id: `opt-${Date.now()}-${i}`,
              ...o,
            })),
          } as Omit<Question, "id" | "createdAt" | "updatedAt">;
          break;
        case "true-false":
          toCreate = {
            ...sharedBase,
            type: "true-false",
            correctAnswer: q.correctAnswer,
          } as Omit<Question, "id" | "createdAt" | "updatedAt">;
          break;
        case "fill-blank":
          toCreate = {
            ...sharedBase,
            type: "fill-blank",
            blanks: q.blanks,
          } as Omit<Question, "id" | "createdAt" | "updatedAt">;
          break;
        case "matching":
          toCreate = {
            ...sharedBase,
            type: "matching",
            pairs: q.pairs.map((p, i) => ({
              id: `p-${Date.now()}-${i}`,
              ...p,
            })),
          } as Omit<Question, "id" | "createdAt" | "updatedAt">;
          break;
        case "ordering":
          toCreate = {
            ...sharedBase,
            type: "ordering",
            items: q.items.map((c, i) => ({
              id: `i-${Date.now()}-${i}`,
              content: c,
            })),
          } as Omit<Question, "id" | "createdAt" | "updatedAt">;
          break;
        case "essay":
          toCreate = {
            ...sharedBase,
            type: "essay",
            rubric: q.rubric.map((r, i) => ({
              id: `r-${Date.now()}-${i}`,
              ...r,
            })),
            wordMin: q.wordMin,
            wordMax: q.wordMax,
            aiAssist: false,
          } as Omit<Question, "id" | "createdAt" | "updatedAt">;
          break;
        case "underline":
          toCreate = {
            ...sharedBase,
            type: "underline",
          } as Omit<Question, "id" | "createdAt" | "updatedAt">;
          break;
      }
      if (toCreate) createQuestion(toCreate);
    }

    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 max-h-[94vh] overflow-y-auto">
        <header className="flex items-start gap-3 border-b px-6 py-4 pr-12">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
            <FileText className="h-5 w-5" strokeWidth={1.85} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-section-title">
              Import câu hỏi từ Word
            </DialogTitle>
            <p className="text-meta mt-0.5">
              Soạn câu hỏi theo định dạng FSC trong Word (.docx) hoặc dán văn
              bản trực tiếp.
            </p>
          </div>
        </header>

        <div className="space-y-5 px-6 py-5">
          {/* Template download */}
          <a
            href="/api/import/template"
            download="FSC-mau-cau-hoi.docx"
            className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-800 transition-colors hover:bg-amber-100"
          >
            <Download className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.85} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Tải file mẫu Word (.docx)</p>
              <p className="text-meta leading-relaxed text-amber-700">
                File Word với 14 câu hỏi ví dụ ở tất cả 8 dạng (MCQ-single,
                MCQ-multi, True-False, Fill-blank, Matching, Ordering,
                Underline, Essay) + công thức toán soạn sẵn bằng MathType/
                Equation Editor (click để sửa, không cần gõ LaTeX). Mở trong
                Word → sửa nội dung → lưu .docx → upload bên dưới.
              </p>
            </div>
          </a>

          {/* Meta — apply to ALL imported questions */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Môn học" required>
              <Select
                value={subjectId}
                onChange={(e) => {
                  setSubjectId(e.target.value);
                  setTocNodeId("");
                }}
              >
                <option value="">— Chọn môn —</option>
                {scopedSubjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Khối" required>
              <Select
                value={gradeId}
                onChange={(e) => {
                  setGradeId(e.target.value);
                  setTocNodeId("");
                }}
              >
                <option value="">— Chọn khối —</option>
                {grades.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Mục lục (tuỳ chọn)">
              <Select
                value={tocNodeId}
                onChange={(e) => setTocNodeId(e.target.value)}
                disabled={!subjectId || availableTocs.length === 0}
              >
                <option value="">— Không chọn —</option>
                {availableTocs.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </Select>
              {tocFallback && (
                <p className="mt-1 text-[11px] text-amber-700">
                  Đang dùng mục lục đã tạo cho khối khác của môn này.
                </p>
              )}
            </Field>
          </div>

          {/* Two import modes side-by-side */}
          <div className="grid gap-3 sm:grid-cols-2">
            {/* File upload */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
                Cách 1 · Upload .docx
              </Label>
              <label
                htmlFor="import-file-input"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) importFile(f);
                }}
                className="flex h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#CBD5E1] bg-surface-2 px-4 py-4 text-center transition-colors hover:border-primary/50 hover:bg-primary/5"
              >
                <Upload className="h-6 w-6 text-muted-foreground" strokeWidth={1.85} />
                <div>
                  <p className="text-[13px] font-medium text-foreground">
                    Chọn file Word hoặc kéo thả
                  </p>
                  <p className="text-meta mt-0.5">.docx · tối đa 10MB</p>
                </div>
              </label>
              <input
                id="import-file-input"
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importFile(f);
                }}
              />
            </div>

            {/* Paste text */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
                Cách 2 · Dán văn bản
              </Label>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={6}
                placeholder={"# Câu 1\nDạng: MCQ-SINGLE\nĐề bài: ...\n\nA. ...\nB. ... [đúng]\n..."}
                className="block h-32 w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-[12px] focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={importText}
                className="w-full"
              >
                Phân tích văn bản đã dán
              </Button>
            </div>
          </div>

          {state.kind === "loading" && (
            <div className="flex items-center gap-2 rounded-lg border bg-surface-2 px-3 py-2.5 text-[13px] text-foreground/75">
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.85} />
              Đang đọc file & phân tích…
            </div>
          )}

          {state.kind === "error" && (
            <div className="flex items-start gap-2.5 rounded-lg border border-destructive-border bg-destructive-soft px-3 py-2.5 text-[13px] text-destructive-text">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">Lỗi import</p>
                <p className="text-meta mt-0.5 leading-relaxed text-destructive-text/80">
                  {state.message}
                </p>
              </div>
            </div>
          )}

          {state.kind === "review" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[13px] text-emerald-800">
                <Check className="h-4 w-4 shrink-0" strokeWidth={2.5} />
                <span>
                  Đã phân tích{" "}
                  <span className="font-bold">{state.questions.length}</span>{" "}
                  câu hỏi.
                </span>
              </div>
              {state.warnings.length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                  <p className="font-semibold">Cảnh báo:</p>
                  <ul className="list-inside list-disc">
                    {state.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
              <ul className="space-y-2">
                {state.questions.map((q, i) => (
                  <ReviewCard
                    key={i}
                    idx={i}
                    question={q}
                    onEdit={() => setEditingIdx(i)}
                    onRemove={() => removeAt(i)}
                  />
                ))}
              </ul>
            </div>
          )}

          {saveError && (
            <div className="flex items-start gap-2.5 rounded-lg border border-destructive-border bg-destructive-soft px-3 py-2.5 text-[13px] text-destructive-text">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t bg-[var(--color-surface-2)] px-6 py-3.5">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            {state.kind === "review" && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => saveAll("personal")}
                >
                  <Save className="h-4 w-4" />
                  Lưu {state.questions.length} câu vào kho cá nhân
                </Button>
                <Button type="button" onClick={() => saveAll("campus")}>
                  <Send className="h-4 w-4" />
                  Gửi {state.questions.length} câu duyệt vào Kho trường
                </Button>
              </>
            )}
          </div>
        </footer>
      </DialogContent>

      {editing && editingIdx !== null && (
        <AiQuestionEditDialog
          open
          onOpenChange={(o) => {
            if (!o) setEditingIdx(null);
          }}
          initial={importedToEditValues(editing)}
          onSave={(values) => {
            patchAt(editingIdx, editValuesToImported(editing, values));
            setEditingIdx(null);
          }}
        />
      )}
    </Dialog>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}

function ReviewCard({
  idx,
  question,
  onEdit,
  onRemove,
}: {
  idx: number;
  question: ImportedQuestion;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const meta = findQuestionType(question.type);
  const diffLabel =
    question.difficulty === "easy"
      ? "Dễ"
      : question.difficulty === "medium"
        ? "TB"
        : "Khó";

  return (
    <li className="rounded-xl border bg-card p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary-soft text-[11px] font-bold tabular-nums text-primary-text">
          {idx + 1}
        </span>
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
          style={{
            backgroundColor: `${meta.color}1A`,
            color: meta.color,
          }}
        >
          {meta.shortName}
        </span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-foreground/70">
          {diffLabel}
        </span>
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

      <div className="rounded-md border bg-surface p-2 text-[13px]">
        <RenderedContent content={question.content} />
      </div>

      <AnswerSummary q={question} />

      {question.explanation && (
        <div className="mt-2 flex items-start gap-1 text-[12px] italic text-muted-foreground">
          <span aria-hidden>📝</span>
          <RenderedContent content={question.explanation} />
        </div>
      )}
    </li>
  );
}

function AnswerSummary({ q }: { q: ImportedQuestion }) {
  switch (q.type) {
    case "mcq-single":
    case "mcq-multi":
      return (
        <ul className="mt-2 space-y-1 text-[12px]">
          {q.options.map((o, i) => (
            <li
              key={i}
              className={cn(
                "flex items-center gap-2 rounded border bg-surface px-2 py-1",
                o.isCorrect && "border-emerald-300 bg-emerald-50",
              )}
            >
              <span
                className={cn(
                  "inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold",
                  o.isCorrect ? "bg-emerald-500 text-white" : "bg-muted text-foreground/70",
                )}
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
    case "true-false":
      return (
        <p className="mt-2 text-[12px]">
          Đáp án đúng:{" "}
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[11px] font-semibold",
              q.correctAnswer
                ? "bg-emerald-100 text-emerald-700"
                : "bg-rose-100 text-rose-700",
            )}
          >
            {q.correctAnswer ? "Đúng" : "Sai"}
          </span>
        </p>
      );
    case "fill-blank":
      return (
        <ul className="mt-2 space-y-1 text-[12px]">
          {q.blanks.map((b, i) => (
            <li key={i} className="flex flex-wrap items-center gap-1.5">
              <span className="text-meta">Ô #{i + 1}:</span>
              {b.acceptedAnswers.map((a) => (
                <span
                  key={a}
                  className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700 ring-1 ring-emerald-200"
                >
                  <RenderedContent content={a} />
                </span>
              ))}
            </li>
          ))}
        </ul>
      );
    case "matching":
      return (
        <ul className="mt-2 space-y-1 text-[12px]">
          {q.pairs.map((p, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="text-meta">{i + 1}.</span>
              <RenderedContent content={p.left} />
              <span className="text-muted-foreground">→</span>
              <span className="text-emerald-700">
                <RenderedContent content={p.right} />
              </span>
            </li>
          ))}
        </ul>
      );
    case "ordering":
      return (
        <ol className="mt-2 space-y-1 text-[12px]">
          {q.items.map((it, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-soft text-[10px] font-bold text-primary-text">
                {i + 1}
              </span>
              <RenderedContent content={it} />
            </li>
          ))}
        </ol>
      );
    case "essay": {
      const total = q.rubric.reduce((s, c) => s + c.points, 0);
      return (
        <ul className="mt-2 space-y-0.5 text-[12px]">
          {q.rubric.map((r, i) => (
            <li key={i} className="flex justify-between">
              <span>• {r.label}</span>
              <span className="font-semibold tabular-nums">{r.points}đ</span>
            </li>
          ))}
          <li className="flex justify-between border-t pt-1 font-bold">
            <span>Tổng</span>
            <span className="tabular-nums">{total}đ</span>
          </li>
          {(q.wordMin || q.wordMax) && (
            <li className="text-meta">
              Số từ: {q.wordMin ?? 0} – {q.wordMax ?? "—"}
            </li>
          )}
        </ul>
      );
    }
    case "underline": {
      const phrases = (q.content.match(/\[u:([^\]]+)\]/g) ?? []).map((m) =>
        m.slice(3, -1),
      );
      return (
        <p className="mt-2 text-[12px]">
          {phrases.length} cụm gạch chân:{" "}
          {phrases.map((p, i) => (
            <span
              key={i}
              className="mr-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-800 underline decoration-emerald-600 decoration-2 underline-offset-2"
            >
              {p}
            </span>
          ))}
        </p>
      );
    }
  }
}
