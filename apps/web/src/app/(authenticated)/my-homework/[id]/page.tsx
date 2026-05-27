"use client";

import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Flag,
  Loader2,
  Paperclip,
} from "lucide-react";
import Link from "next/link";
import { notFound, useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { RenderedContent } from "@/features/question-bank/components/rendered-content";
import { useQuestionsStore } from "@/features/question-bank/state/questions-store";
import { QuestionRenderer } from "@/features/shift-exam/components/question-renderer";
import { useMaterialsStore } from "@/features/learning-materials/state/materials-store";
import type { LearningMaterial } from "@/features/learning-materials/data/types";

import {
  effectiveHomeworkState,
  isHomeworkOpen,
} from "@/features/homework/data/types";
import { useHomeworkStore } from "@/features/homework/state/homework-store";
import { useHomeworkAttemptsStore } from "@/features/homework/state/homework-attempts-store";

const MaterialViewerDialog = dynamic(
  () =>
    import(
      "@/features/learning-materials/dialogs/material-viewer-dialog"
    ).then((m) => m.MaterialViewerDialog),
  { ssr: false, loading: () => null },
);

export default function HomeworkRuntimePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const session = useAuthStore((s) => s.session);
  const homework = useHomeworkStore((s) => s.findById(id));
  const homeworkHydrated = useHomeworkStore((s) => s.hydrated);
  const allQuestions = useQuestionsStore((s) => s.questions);
  const allMaterials = useMaterialsStore((s) => s.materials);
  const startOrResume = useHomeworkAttemptsStore((s) => s.startOrResume);
  const saveAnswer = useHomeworkAttemptsStore((s) => s.saveAnswer);
  const toggleMark = useHomeworkAttemptsStore((s) => s.toggleMark);
  const submit = useHomeworkAttemptsStore((s) => s.submit);

  const myAttempt = useHomeworkAttemptsStore((s) =>
    session
      ? s.attempts.find(
          (a) => a.homeworkId === id && a.studentId === session.userId,
        )
      : undefined,
  );

  const [currentIdx, setCurrentIdx] = useState(0);
  const [viewingMaterial, setViewingMaterial] =
    useState<LearningMaterial | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Bootstrap attempt on first render when session is ready.
  if (
    homework &&
    session &&
    session.role === "student" &&
    !myAttempt &&
    isHomeworkOpen(homework)
  ) {
    startOrResume({
      homeworkId: id,
      studentId: session.userId,
      campusId: session.campusId,
    });
  }

  const questions = useMemo(() => {
    if (!homework) return [];
    return homework.questionIds
      .map((qid) => allQuestions.find((q) => q.id === qid))
      .filter((q): q is NonNullable<typeof q> => !!q);
  }, [homework, allQuestions]);

  const materials = useMemo(() => {
    if (!homework) return [];
    return homework.materialIds
      .map((mid) => allMaterials.find((m) => m.id === mid))
      .filter((m): m is LearningMaterial => !!m);
  }, [homework, allMaterials]);

  if (!homework) {
    if (!homeworkHydrated) {
      return (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          Đang tải BTVN…
        </div>
      );
    }
    return notFound();
  }
  if (!session) {
    return (
      <Gate title="Bạn chưa đăng nhập" backHref="/" />
    );
  }
  if (session.role !== "student") {
    return (
      <Gate
        title="Trang này chỉ dành cho học sinh"
        hint="Đăng nhập bằng tài khoản học sinh để làm BTVN."
        backHref="/dashboard"
      />
    );
  }
  const eff = effectiveHomeworkState(homework);
  if (eff === "scheduled") {
    return (
      <Gate
        title="BTVN chưa mở"
        hint={`Ngày giao: ${homework.assignedAt}`}
        backHref="/my-homework"
      />
    );
  }
  if (myAttempt?.submittedAt) {
    return (
      <ResultPanel
        homework={homework}
        questions={questions}
        correctCount={myAttempt.correctCount ?? 0}
        totalQuestions={myAttempt.totalQuestions ?? questions.length}
      />
    );
  }
  if (eff === "closed") {
    return (
      <Gate
        title="BTVN đã quá hạn"
        hint={`Đã hết hạn ngày ${homework.dueAt}.`}
        backHref="/my-homework"
      />
    );
  }
  if (questions.length === 0) {
    return (
      <Gate
        title="BTVN này chưa có câu hỏi nào"
        hint="Liên hệ giáo viên."
        backHref="/my-homework"
      />
    );
  }
  if (!myAttempt) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Đang tải bài làm…
      </div>
    );
  }

  const currentQ = questions[currentIdx]!;
  const answeredCount = Object.keys(myAttempt.answers).length;

  function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    const result = submit(myAttempt!.id, questions);
    setSubmitting(false);
    if (result?.submittedAt) {
      toast.success(
        `Đã nộp bài — đúng ${result.correctCount}/${result.totalQuestions} câu`,
      );
    }
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link
            href="/my-homework"
            className="inline-flex h-8 items-center gap-1 rounded-md border bg-card px-2 text-[12px] font-medium hover:bg-accent/30"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Danh sách BTVN
          </Link>
          <div>
            <p className="text-[14px] font-semibold">{homework.title}</p>
            <p className="text-meta">
              Hết hạn {homework.dueAt} · {questions.length} câu · Đã trả lời{" "}
              {answeredCount}/{questions.length}
            </p>
          </div>
        </div>
        <Button onClick={() => setConfirmSubmit(true)}>
          <ClipboardCheck className="h-4 w-4" />
          Nộp bài
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        {/* Main answer area */}
        <section className="rounded-xl border bg-card">
          <header className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <p className="text-[13px] font-semibold">
                Câu {currentIdx + 1} / {questions.length}
              </p>
              <p className="text-meta">
                {currentQ.type} · {currentQ.difficulty}
              </p>
            </div>
            <button
              type="button"
              onClick={() => toggleMark(myAttempt.id, currentQ.id)}
              className={`inline-flex h-8 items-center gap-1 rounded-md border px-2 text-[11.5px] font-medium ${
                myAttempt.markedForReview.includes(currentQ.id)
                  ? "border-amber-400 bg-amber-50 text-amber-700"
                  : "border-border bg-card text-foreground/70 hover:bg-accent/30"
              }`}
            >
              <Flag className="h-3.5 w-3.5" />
              {myAttempt.markedForReview.includes(currentQ.id)
                ? "Đã đánh dấu"
                : "Đánh dấu để xem lại"}
            </button>
          </header>
          <div className="space-y-4 px-5 py-4">
            {/* drag-drop + underline render the passage inline inside
                QuestionRenderer (with interactive zones / clickable
                words). Showing raw content here would (a) duplicate
                the prompt, (b) leak the [u:...] / [zone:N] markers as
                green-underlined answers. fill-blank strips its
                [blank:N] markers. */}
            {currentQ.type !== "drag-drop" &&
              currentQ.type !== "underline" && (
                <RenderedContent
                  content={
                    currentQ.type === "fill-blank"
                      ? currentQ.content.replace(/\[blank:\d+\]/g, "_____")
                      : currentQ.content
                  }
                />
              )}
            <QuestionRenderer
              question={currentQ}
              answer={myAttempt.answers[currentQ.id]}
              onChange={(a) => saveAnswer(myAttempt.id, currentQ.id, a)}
              seed={`${myAttempt.id}-${currentQ.id}`}
            />
          </div>
          <footer className="flex items-center justify-between border-t bg-muted/20 px-4 py-3">
            <Button
              variant="outline"
              onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
              disabled={currentIdx === 0}
            >
              <ChevronLeft className="h-4 w-4" />
              Câu trước
            </Button>
            <span className="text-meta">{currentIdx + 1} / {questions.length}</span>
            <Button
              variant="outline"
              onClick={() =>
                setCurrentIdx((i) => Math.min(questions.length - 1, i + 1))
              }
              disabled={currentIdx === questions.length - 1}
            >
              Câu sau
              <ChevronRight className="h-4 w-4" />
            </Button>
          </footer>
        </section>

        {/* Sidebar: question nav + attached materials */}
        <aside className="space-y-3">
          <div className="rounded-xl border bg-card p-3">
            <p className="mb-2 text-[12px] font-semibold text-foreground/70">
              Lưới câu hỏi
            </p>
            <div className="grid grid-cols-5 gap-1.5">
              {questions.map((q, i) => {
                const answered = Boolean(myAttempt.answers[q.id]);
                const marked = myAttempt.markedForReview.includes(q.id);
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrentIdx(i)}
                    className={`relative h-8 rounded-md border text-[11.5px] font-semibold transition-colors ${
                      i === currentIdx
                        ? "border-primary bg-primary text-primary-foreground"
                        : answered
                          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                          : "border-border bg-card text-foreground/70 hover:bg-accent/30"
                    }`}
                  >
                    {i + 1}
                    {marked && (
                      <Flag className="absolute right-0.5 top-0.5 h-2.5 w-2.5 text-amber-500" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {materials.length > 0 && (
            <div className="rounded-xl border bg-card p-3">
              <p className="mb-2 inline-flex items-center gap-1 text-[12px] font-semibold text-foreground/70">
                <Paperclip className="h-3.5 w-3.5" />
                Học liệu đính kèm
              </p>
              <ul className="space-y-1.5">
                {materials.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => setViewingMaterial(m)}
                      className="flex w-full items-start gap-2 rounded-md border bg-card p-2 text-left hover:bg-accent/30"
                    >
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="line-clamp-1 text-[12.5px] font-medium">
                          {m.title}
                        </p>
                        <p className="text-[10.5px] text-muted-foreground">
                          {m.fileType}
                          {m.sourceType === "link" ? " · liên kết" : ""}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      {/* Submit confirm */}
      {confirmSubmit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setConfirmSubmit(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border bg-card p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-section-title">Nộp bài làm?</h3>
            <p className="mt-1 text-[13px] text-foreground/80">
              Đã trả lời <b>{answeredCount}/{questions.length}</b> câu. Sau khi
              nộp không thể chỉnh sửa lại. Kết quả đúng/sai sẽ được hiển thị
              ngay.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setConfirmSubmit(false)}
                disabled={submitting}
              >
                Quay lại làm tiếp
              </Button>
              <Button
                onClick={() => {
                  setConfirmSubmit(false);
                  handleSubmit();
                }}
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Đang nộp…
                  </>
                ) : (
                  "Xác nhận nộp"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      <MaterialViewerDialog
        material={viewingMaterial}
        onClose={() => setViewingMaterial(null)}
      />
    </>
  );
}

function ResultPanel({
  homework,
  questions,
  correctCount,
  totalQuestions,
}: {
  homework: { id: string; title: string };
  questions: { id: string }[];
  correctCount: number;
  totalQuestions: number;
}) {
  const percent =
    totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
  return (
    <div className="mx-auto max-w-xl">
      <div className="rounded-xl border bg-card p-6 text-center">
        <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-500" />
        <p className="text-section-title">Đã nộp bài!</p>
        <p className="mt-1 text-[13px] text-foreground/80">{homework.title}</p>
        <div className="mt-4 rounded-lg bg-muted/30 px-4 py-3">
          <p className="text-[34px] font-bold text-foreground">
            {correctCount}
            <span className="text-foreground/40">/{totalQuestions}</span>
          </p>
          <p className="text-meta">Đúng {percent}%</p>
        </div>
        <Link
          href="/my-homework"
          className="mt-4 inline-flex h-9 items-center gap-1 rounded-md border bg-card px-3 text-[12.5px] font-medium hover:bg-accent/30"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Quay lại danh sách BTVN
        </Link>
      </div>
    </div>
  );
}

function Gate({
  title,
  hint,
  backHref,
}: {
  title: string;
  hint?: string;
  backHref: string;
}) {
  return (
    <div className="mx-auto max-w-md rounded-xl border bg-card p-6 text-center">
      <p className="text-section-title">{title}</p>
      {hint && <p className="text-meta mt-1">{hint}</p>}
      <Link
        href={backHref}
        className="mt-3 inline-flex h-9 items-center gap-1 rounded-md border bg-card px-3 text-[12.5px] font-medium hover:bg-accent/30"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Quay lại
      </Link>
    </div>
  );
}
