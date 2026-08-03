"use client";

import {
  AlertTriangle,
  Check,
  FileText,
  Loader2,
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
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { authHeaders } from "@/lib/api-client";

import type { Question, QuestionStatus } from "../data/seed-questions";
import type { ParsedBankQuestion } from "../lib/parse-exam-bank";
import { useQuestionsStore } from "../state/questions-store";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** A parsed question enriched with its TOC match + all blocking issues. */
interface ReviewItem extends ParsedBankQuestion {
  matchedNodeId: string | null;
  matchedNodeName: string | null;
  matchedGradeId: string | null;
  issues: string[]; // parser warnings + "chuyên đề chưa có trong mục lục"
}

type State =
  | { kind: "idle" }
  | { kind: "loading"; fileName: string }
  | { kind: "review"; questions: ParsedBankQuestion[]; fileWarnings: string[] }
  | { kind: "error"; message: string };

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

export function ExamBankImportDialog({ open, onOpenChange }: Props) {
  const session = useAuthStore((s) => s.session);
  const subjects = useSubjectsStore((s) => s.subjects);
  const tocNodes = useSubjectsStore((s) => s.tocNodes);
  const createQuestion = useQuestionsStore((s) => s.create);
  const activeCampusId = useCampusStore((s) => s.activeCampusId);

  const [subjectId, setSubjectId] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setState({ kind: "idle" });
      setSaveError(null);
    }
  }, [open]);

  // code → node for the chosen SUBJECT (any grade). The code already
  // encodes the grade (SI10 = Sinh Khối 10), so we match subject-wide and
  // take the grade from the matched mục lục node — the teacher only has to
  // pick the right môn, not guess the khối.
  const codeIndex = useMemo(() => {
    const m = new Map<string, { id: string; name: string; gradeId: string | null }>();
    for (const n of tocNodes) {
      if (n.subjectId === subjectId && n.code) {
        m.set(n.code, { id: n.id, name: n.name, gradeId: n.gradeId });
      }
    }
    return m;
  }, [tocNodes, subjectId]);

  const review: ReviewItem[] = useMemo(() => {
    if (state.kind !== "review") return [];
    return state.questions.map((q) => {
      const match = codeIndex.get(q.chuyenDeCode) ?? null;
      const issues = [...q.warnings];
      if (!match) {
        issues.push(
          `Mã chuyên đề "${q.chuyenDeCode}" chưa có trong mục lục môn đã chọn (import khung kiến thức trước).`,
        );
      }
      return {
        ...q,
        matchedNodeId: match?.id ?? null,
        matchedNodeName: match?.name ?? null,
        matchedGradeId: match?.gradeId ?? null,
        issues,
      };
    });
  }, [state, codeIndex]);

  const validItems = review.filter((r) => r.issues.length === 0);
  const flaggedItems = review.filter((r) => r.issues.length > 0);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!/\.docx$/i.test(file.name)) {
      setState({ kind: "error", message: "Chỉ hỗ trợ file Word .docx." });
      return;
    }
    if (!subjectId) {
      setState({ kind: "error", message: "Chọn Môn học trước khi tải đề." });
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
      const data = await res.json();
      if (!res.ok) {
        setState({ kind: "error", message: data.message ?? "Lỗi không xác định" });
        return;
      }
      setState({
        kind: "review",
        questions: data.questions as ParsedBankQuestion[],
        fileWarnings: (data.warnings as string[]) ?? [],
      });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Không kết nối được tới server",
      });
    }
  }

  function importValid(target: "personal" | "campus") {
    if (!session) {
      setSaveError("Không tìm thấy thông tin tài khoản.");
      return;
    }
    const resolvedCampusId =
      target === "personal" ? null : session.campusId ?? activeCampusId ?? null;
    const status: QuestionStatus = target === "personal" ? "approved" : "pending";

    for (const q of validItems) {
      const base = {
        content: q.content,
        subjectId,
        // Khối lấy theo ĐÚNG node mục lục của trường (không suy từ mã).
        // Chỉ câu đã khớp mục lục mới được import nên luôn có giá trị.
        gradeId: q.matchedGradeId ?? null,
        tocNodeId: q.matchedNodeId,
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
      let toCreate: Omit<Question, "id" | "createdAt" | "updatedAt"> | null = null;
      const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
      if (q.qType === "mcq-single" || q.qType === "mcq-multi") {
        toCreate = {
          ...base,
          type: q.qType,
          options: q.options.map((o, i) => ({
            id: `opt-${stamp}-${i}`,
            content: o.content,
            isCorrect: o.isCorrect,
          })),
        } as Omit<Question, "id" | "createdAt" | "updatedAt">;
      } else if (q.qType === "multi-tf") {
        toCreate = {
          ...base,
          type: "multi-tf",
          subQuestions: q.subQuestions.map((s, i) => ({
            id: `sub-${stamp}-${i}`,
            statement: s.statement,
            correctAnswer: s.correctAnswer,
          })),
        } as Omit<Question, "id" | "createdAt" | "updatedAt">;
      } else if (q.qType === "short-answer") {
        toCreate = {
          ...base,
          type: "short-answer",
          acceptedAnswers: q.acceptedAnswers,
          caseSensitive: false,
        } as Omit<Question, "id" | "createdAt" | "updatedAt">;
      } else if (q.qType === "essay") {
        toCreate = {
          ...base,
          type: "essay",
          rubric: [],
          aiAssist: false,
        } as Omit<Question, "id" | "createdAt" | "updatedAt">;
      }
      if (toCreate) createQuestion(toCreate);
    }
    onOpenChange(false);
  }

  const review_ = state.kind === "review";

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
              Tải file .docx theo mẫu (mã dạng [SI10.02.2.D05.a]). Hệ tự nhận
              chuyên đề, dạng câu, độ khó, đáp án (gạch chân) → xem lại & duyệt
              để lưu vào kho theo từng chuyên đề.
            </p>
          </div>
        </header>

        <div className="space-y-4 px-6 py-5">
          {/* Subject context — khối tự lấy theo mục lục đã tạo (mã chuyên
              đề đã gắn khối của trường), không cần chọn thủ công. */}
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
            <p className="text-[11.5px] text-muted-foreground">
              Khối được lấy tự động theo mục lục môn học (khối trường đang lưu),
              không cần chọn.
            </p>
          </div>

          {!review_ && (
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
              </div>
            </div>
          )}

          {review_ && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-[12px]">
                <span className="rounded-md bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">
                  {validItems.length} câu hợp lệ
                </span>
                {flaggedItems.length > 0 && (
                  <span className="rounded-md bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">
                    {flaggedItems.length} câu cần sửa (bỏ qua khi import)
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
                {review.map((q, i) => (
                  <ReviewRow key={`${q.rawCode}-${i}`} q={q} index={i + 1} />
                ))}
              </ul>

              {saveError && (
                <p className="text-[12px] text-destructive-text">{saveError}</p>
              )}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t bg-[var(--color-surface-2)] px-6 py-3.5">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          {review_ ? (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => importValid("personal")}
                disabled={validItems.length === 0}
              >
                Lưu {validItems.length} câu vào kho cá nhân
              </Button>
              <Button
                onClick={() => importValid("campus")}
                disabled={validItems.length === 0}
              >
                <Check className="h-4 w-4" />
                Gửi duyệt kho campus ({validItems.length})
              </Button>
            </div>
          ) : (
            <span className="text-meta">Chọn Môn + Khối rồi tải file để xem trước</span>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function ReviewRow({ q, index }: { q: ReviewItem; index: number }) {
  const ok = q.issues.length === 0;
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
          {q.rawCode}
        </span>
        <span className="rounded bg-indigo-100 px-1.5 py-0.5 font-semibold text-indigo-700">
          {TYPE_LABEL[q.qType] ?? q.qType}
        </span>
        <span className="rounded bg-sky-100 px-1.5 py-0.5 font-semibold text-sky-700">
          {DIFF_LABEL[q.difficulty]}
        </span>
        {q.matchedNodeName ? (
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-700">
            {q.chuyenDeCode} · {q.matchedNodeName}
          </span>
        ) : (
          <span className="rounded bg-rose-100 px-1.5 py-0.5 font-semibold text-rose-700">
            {q.chuyenDeCode} · không khớp mục lục
          </span>
        )}
      </div>

      <p className="mt-1.5 line-clamp-2 text-[13px] text-foreground/90">{q.content}</p>

      {/* Answer preview */}
      {(q.qType === "mcq-single" || q.qType === "mcq-multi") && (
        <p className="mt-1 text-[12px] text-foreground/70">
          Đáp án:{" "}
          <span className="font-medium text-emerald-700">
            {q.options
              .filter((o) => o.isCorrect)
              .map((o) => o.content)
              .join(" | ") || "—"}
          </span>{" "}
          <span className="text-muted-foreground">({q.options.length} phương án)</span>
        </p>
      )}
      {q.qType === "multi-tf" && (
        <p className="mt-1 text-[12px] text-foreground/70">
          Đúng/Sai:{" "}
          {q.subQuestions
            .map((s, i) => `${String.fromCharCode(97 + i)})${s.correctAnswer ? "Đ" : "S"}`)
            .join(" ")}
        </p>
      )}
      {q.qType === "short-answer" && (
        <p className="mt-1 text-[12px] text-foreground/70">
          Đáp án: <span className="font-medium text-emerald-700">{q.acceptedAnswers.join(", ") || "—"}</span>
        </p>
      )}

      {q.issues.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {q.issues.map((iss, i) => (
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

function FormatGuide() {
  return (
    <div className="rounded-lg border bg-surface-2/60 px-4 py-3 text-[12.5px] leading-relaxed">
      <p className="mb-1 font-semibold text-foreground/85">Quy ước file mẫu</p>
      <ul className="space-y-0.5 text-foreground/75">
        <li>
          • Mỗi câu bắt đầu bằng mã <code className="rounded bg-muted px-1">[SI10.02.2.D05.a]</code> ={" "}
          <b>[mã chuyên đề].[Loại+số].[độ khó]</b>.
        </li>
        <li>
          • Loại: <b>D</b>=Trắc nghiệm, <b>F</b>=Đúng/Sai, <b>S</b>=Trả lời ngắn, <b>E</b>=Tự luận.
        </li>
        <li>
          • Độ khó: <b>a</b>=Nhận biết, <b>b</b>=Thông hiểu, <b>c</b>=Vận dụng.
        </li>
        <li>
          • Đáp án đúng: <b>gạch chân</b> (D nhiều gạch chân → chọn nhiều đáp án; F gạch
          chân = Đúng). Trả lời ngắn dùng <code className="rounded bg-muted px-1">&lt;Key=…&gt;</code>.
        </li>
        <li>
          • Mã chuyên đề phải khớp mục lục đã tạo (tab “Mục lục môn học”). Sai/thiếu sẽ bị cảnh báo.
        </li>
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
