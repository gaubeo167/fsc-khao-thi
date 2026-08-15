"use client";

import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardEdit,
  Clock,
  Lock,
  Save,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useShiftsStore } from "@/features/exam-shifts/state/shifts-store";
import { useBlueprintsStore } from "@/features/exams/state/blueprints-store";
import { usePackagesStore } from "@/features/exams/state/packages-store";
import { useGradingStore } from "@/features/grading/state/grading-store";
import { gradingCode, isManualGradingType } from "@/features/grading/lib/utils";
import { RenderedContent } from "@/features/question-bank/components/rendered-content";
import type {
  EssayQuestion,
  Question,
} from "@/features/question-bank/data/seed-questions";
import { useQuestionsStore } from "@/features/question-bank/state/questions-store";
import { useExamFormsStore } from "@/features/exam-forms/state/exam-forms-store";
import { resolveAttemptQuestions } from "@/features/exam-forms/lib/resolve-questions";
import { useAttemptsStore } from "@/features/shift-exam/state/attempts-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { cn } from "@/lib/utils";

export default function GradingWorkspacePage() {
  const params = useParams<{ attemptId: string }>();
  const attemptId = params.attemptId;
  const session = useAuthStore((s) => s.session);

  const attempts = useAttemptsStore((s) => s.attempts);
  const attemptsHydrated = useAttemptsStore((s) => s.hydrated);
  const shifts = useShiftsStore((s) => s.shifts);
  const shiftsHydrated = useShiftsStore((s) => s.hydrated);
  const allQuestions = useQuestionsStore((s) => s.questions);
  const subjects = useSubjectsStore((s) => s.subjects);
  const packages = usePackagesStore((s) => s.packages);
  const blueprints = useBlueprintsStore((s) => s.blueprints);
  const isAssigned = useGradingStore((s) => s.isAssigned);
  const allGrades = useGradingStore((s) => s.grades);
  const saveGrade = useGradingStore((s) => s.saveGrade);
  const deleteGrade = useGradingStore((s) => s.deleteGrade);

  const attempt = attempts.find((a) => a.id === attemptId);
  const shift = attempt
    ? shifts.find((s) => s.id === attempt.shiftId)
    : undefined;
  // Anonymous code instead of student lookup — graders shouldn't know
  // whose paper they're scoring. The real `studentId` lives on the
  // attempt + saved grade record for post-hoc audit / reveal.
  const examCode =
    attempt && shift
      ? gradingCode(shift.id, attempt.studentId)
      : "EX-????";
  const pkg = shift ? packages.find((p) => p.id === shift.packageId) : null;
  const bp = pkg ? blueprints.find((b) => b.id === pkg.blueprintId) : null;
  const subject = shift
    ? subjects.find((s) => s.id === shift.subjectId)
    : null;

  // Resolve essay questions the student actually had. Snapshot-first
  // so the teacher grades the EXACT text the student saw, not the
  // current bank version.
  const allForms = useExamFormsStore((s) => s.forms);
  const essayQuestions: Question[] = useMemo(() => {
    if (!attempt) return [];
    const { questions } = resolveAttemptQuestions({
      questionIds: attempt.questionIds,
      examFormId: attempt.examFormId,
      variantId: attempt.variantId,
      allForms,
      allLiveQuestions: allQuestions,
    });
    return questions.filter((q) => isManualGradingType(q.type));
  }, [attempt, allForms, allQuestions]);

  const [activeIdx, setActiveIdx] = useState(0);
  useEffect(() => {
    setActiveIdx(0);
  }, [attemptId]);

  // Auth guard.
  if (!session) return null;
  // Chờ hydrate rồi mới kết luận "không tìm thấy" — lần render đầu hai kho
  // này còn rỗng, ném 404 nhầm vào bài giáo viên đang định chấm.
  if (!attempt || !shift) {
    if (!shiftsHydrated || !attemptsHydrated) {
      return (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          Đang tải bài làm…
        </div>
      );
    }
    return notFound();
  }
  if (!isAssigned(shift.id, session.userId)) {
    return (
      <div className="mx-auto max-w-md rounded-xl border bg-card p-6 text-center">
        <p className="text-[14px] font-semibold">Không có quyền chấm bài này</p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Bạn chưa được phân công chấm ca thi này. Liên hệ admin / TBM nếu cần.
        </p>
        <Link
          href="/grading"
          className="mt-3 inline-block text-[12px] font-semibold text-blue-700 hover:underline"
        >
          ← Hàng đợi chấm
        </Link>
      </div>
    );
  }
  if (essayQuestions.length === 0) {
    return (
      <div className="mx-auto max-w-md rounded-xl border bg-card p-6 text-center">
        <p className="text-[14px] font-semibold">
          Bài làm này không có câu tự luận
        </p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Tất cả các câu đã được chấm tự động.
        </p>
        <Link
          href="/grading"
          className="mt-3 inline-block text-[12px] font-semibold text-blue-700 hover:underline"
        >
          ← Hàng đợi chấm
        </Link>
      </div>
    );
  }

  // Grading-deadline state — a per-shift cutoff (shift.gradingDeadlineMs),
  // clock-derived each render like effectiveShiftStatus. Once past, all
  // edit/delete controls lock. Server-enforced in firestore.rules too.
  const gradingDeadlineMs = shift.gradingDeadlineMs ?? null;
  const pastGradingDeadline =
    gradingDeadlineMs != null && gradingDeadlineMs < Date.now();

  const currentQ = essayQuestions[activeIdx]!;
  const currentAnswer = attempt.answers[currentQ.id];
  const studentText =
    currentAnswer?.kind === "essay"
      ? currentAnswer.text
      : currentAnswer?.kind === "ai-generated"
        ? currentAnswer.text
        : "";

  const myGrade = allGrades.find(
    (g) => g.attemptId === attempt.id && g.questionId === currentQ.id,
  );

  // Total progress strip.
  const gradedCount = essayQuestions.filter((q) =>
    allGrades.some(
      (g) => g.attemptId === attempt.id && g.questionId === q.id,
    ),
  ).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-3 rounded-2xl border bg-card px-5 py-4">
        <Link
          href="/grading"
          className="inline-flex h-8 items-center gap-1 rounded-md border bg-card px-2.5 text-[12px] font-semibold hover:bg-accent/30"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Hàng đợi chấm
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-[18px] font-bold leading-tight">
            <span className="rounded-md border-2 border-violet-300 bg-violet-50 px-2 py-0.5 font-mono text-[14px] tracking-wider text-violet-800">
              {examCode}
            </span>
            <span className="text-foreground/70">— {shift.name}</span>
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground">
            {subject && (
              <span className="rounded bg-blue-50 px-1.5 py-0.5 font-semibold text-blue-700">
                {subject.name}
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded bg-violet-50 px-1.5 py-0.5 text-violet-700">
              🛡 Chấm ẩn danh — tên HS đã được ẩn
            </span>
            <span>
              Nộp lúc:{" "}
              {new Date(attempt.submittedAt!).toLocaleString("vi-VN", {
                hour: "2-digit",
                minute: "2-digit",
                day: "2-digit",
                month: "2-digit",
              })}
            </span>
            <span>
              Điểm tự động:{" "}
              <span className="font-semibold">
                {attempt.correctCount}/{attempt.maxScore || "—"}
              </span>{" "}
              câu
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-md border bg-card px-2.5 py-1.5 text-[11.5px]">
            <span className="text-muted-foreground">Tiến độ:</span>{" "}
            <span className="font-semibold">
              {gradedCount}/{essayQuestions.length}
            </span>{" "}
            câu đã chấm
          </div>
        </div>
      </div>

      {/* Grading-deadline banner */}
      {gradingDeadlineMs != null &&
        (pastGradingDeadline ? (
          <div className="flex items-start gap-2 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-[12.5px] text-rose-800">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Đã quá hạn chấm — đã khoá</p>
              <p className="mt-0.5">
                Thời hạn chấm ({fmtDeadline(gradingDeadlineMs)}) đã kết thúc.
                Bạn không thể lưu, sửa hoặc xoá điểm nữa. Liên hệ admin / TBM
                nếu cần gia hạn.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-[12px] text-amber-800">
            <Clock className="h-4 w-4 shrink-0" />
            <span>
              Hạn chấm:{" "}
              <span className="font-semibold">
                {fmtDeadline(gradingDeadlineMs)}
              </span>{" "}
              — sau thời điểm này sẽ không thể sửa / xoá điểm.
            </span>
          </div>
        ))}

      {/* Question navigator (compact) */}
      <ul className="flex flex-wrap items-center gap-1.5 rounded-xl border bg-card px-3 py-2.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
          Câu tự luận:
        </span>
        {essayQuestions.map((q, i) => {
          const graded = allGrades.some(
            (g) => g.attemptId === attempt.id && g.questionId === q.id,
          );
          const active = i === activeIdx;
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => setActiveIdx(i)}
              className={cn(
                "flex h-7 min-w-[28px] items-center justify-center rounded-md border px-2 text-[11.5px] font-bold transition",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : graded
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100",
              )}
            >
              {i + 1}
              {graded && <CheckCircle2 className="ml-1 h-3 w-3" />}
            </button>
          );
        })}
      </ul>

      {/* Workspace 2-col */}
      <div className="grid gap-4 lg:grid-cols-[1.2fr_minmax(0,1fr)]">
        {/* LEFT: question + student's answer */}
        <section className="rounded-xl border bg-card">
          <header className="border-b px-5 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
              Câu {activeIdx + 1} / {essayQuestions.length} ·{" "}
              {currentQ.type === "essay" ? "Tự luận" : "AI"}
            </p>
            <h2 className="mt-1 text-[14px] font-semibold leading-snug">
              <RenderedContent content={currentQ.content} inline />
            </h2>
          </header>
          <div className="space-y-4 px-5 py-4">
            <div>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
                Bài làm của học sinh
              </p>
              {studentText.trim() ? (
                // Render the answer through `RenderedContent` so images,
                // drawings (saved as `![alt](data:image/...)`), formulas
                // and other rich content the student inserted via the
                // WYSIWYG editor display correctly during grading.
                <div className="rounded-md border bg-muted/30 px-3 py-2.5 text-[13.5px] leading-relaxed">
                  <RenderedContent content={studentText} />
                </div>
              ) : (
                <p className="rounded-md border border-dashed bg-muted/20 px-3 py-3 text-center text-[12px] italic text-muted-foreground">
                  Học sinh không trả lời câu này (bỏ trống).
                </p>
              )}
              {studentText.trim() && (
                <p className="mt-1 text-[10.5px] text-muted-foreground">
                  Số từ: {studentText.trim().split(/\s+/).length}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* RIGHT: rubric + comment */}
        <RubricEditor
          question={currentQ}
          existingScores={myGrade?.rubricScores ?? {}}
          existingComment={myGrade?.comment ?? ""}
          studentEmpty={!studentText.trim()}
          alreadyGraded={!!myGrade}
          locked={pastGradingDeadline}
          onSave={(rubricScores, comment) => {
            if (!session || pastGradingDeadline) return;
            const maxPoints = computeMaxPoints(currentQ);
            saveGrade({
              attemptId: attempt.id,
              shiftId: shift.id,
              studentId: attempt.studentId,
              questionId: currentQ.id,
              graderId: session.userId,
              graderName: session.name ?? "Giáo viên",
              rubricScores,
              maxPoints,
              comment,
            });
          }}
          onDelete={() => {
            if (pastGradingDeadline) return;
            deleteGrade(attempt.id, currentQ.id);
          }}
        />
      </div>

      {/* Footer nav */}
      <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3">
        <Button
          size="sm"
          variant="outline"
          disabled={activeIdx === 0}
          onClick={() => setActiveIdx((i) => Math.max(0, i - 1))}
          className="gap-1.5"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Câu trước
        </Button>
        <span className="text-[12px] text-muted-foreground">
          {gradedCount}/{essayQuestions.length} câu đã chấm
        </span>
        <Button
          size="sm"
          disabled={activeIdx === essayQuestions.length - 1}
          onClick={() =>
            setActiveIdx((i) => Math.min(essayQuestions.length - 1, i + 1))
          }
          className="gap-1.5"
        >
          Câu sau
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function fmtDeadline(ms: number): string {
  return new Date(ms).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function computeMaxPoints(q: Question): number {
  if (q.type === "essay") {
    return (q as EssayQuestion).rubric.reduce((a, c) => a + c.points, 0);
  }
  // ai-generated and any other manual type: default to 10pt total.
  return 10;
}

function RubricEditor({
  question,
  existingScores,
  existingComment,
  studentEmpty,
  alreadyGraded,
  locked = false,
  onSave,
  onDelete,
}: {
  question: Question;
  existingScores: Record<string, number>;
  existingComment: string;
  studentEmpty: boolean;
  alreadyGraded: boolean;
  /** When true the grading deadline has passed — all inputs read-only. */
  locked?: boolean;
  onSave(scores: Record<string, number>, comment: string): void;
  onDelete(): void;
}) {
  const [scores, setScores] = useState<Record<string, number>>(existingScores);
  const [comment, setComment] = useState(existingComment);
  // Reset when question switches.
  useEffect(() => {
    setScores(existingScores);
    setComment(existingComment);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.id]);

  const rubric =
    question.type === "essay"
      ? (question as EssayQuestion).rubric
      : null;
  const fallbackCriteria = [
    { id: "content", label: "Nội dung", points: 5 },
    { id: "logic", label: "Lập luận / Trình bày", points: 3 },
    { id: "form", label: "Hình thức / Chính tả", points: 2 },
  ];
  const criteria = rubric && rubric.length > 0 ? rubric : fallbackCriteria;

  const total = Object.values(scores).reduce(
    (a, n) => a + (Number.isFinite(n) ? n : 0),
    0,
  );
  const max = criteria.reduce((a, c) => a + c.points, 0);

  function update(criterionId: string, raw: string) {
    const n = Number(raw);
    setScores((s) => ({ ...s, [criterionId]: Number.isFinite(n) ? n : 0 }));
  }

  return (
    <section className="rounded-xl border bg-card">
      <header className="border-b px-5 py-3">
        <h3 className="inline-flex items-center gap-1.5 text-[13px] font-semibold">
          <ClipboardEdit className="h-3.5 w-3.5 text-violet-600" />
          Rubric chấm
        </h3>
        <p className="text-[11px] text-muted-foreground">
          {rubric == null && (
            <>
              Câu hỏi không có rubric — sử dụng rubric mặc định
              (Nội dung/Lập luận/Hình thức).{" "}
            </>
          )}
          Tổng tối đa: <span className="font-semibold">{max} điểm</span>.
        </p>
      </header>
      <div className="space-y-3 px-5 py-4">
        {studentEmpty && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
            ⚠ HS không trả lời câu này. Mặc định = 0 điểm. Bạn có thể bỏ trống
            và lưu để hệ thống ghi nhận đã chấm.
          </p>
        )}
        <ul className="space-y-2">
          {criteria.map((c) => {
            const v = scores[c.id];
            const valNum = Number.isFinite(v) ? (v as number) : 0;
            const tooHigh = valNum > c.points;
            return (
              <li
                key={c.id}
                className="rounded-lg border bg-card px-3 py-2.5"
              >
                <div className="flex items-center justify-between text-[12.5px]">
                  <span className="font-medium">{c.label}</span>
                  <span className="text-muted-foreground">
                    tối đa{" "}
                    <span className="font-semibold text-foreground">
                      {c.points}
                    </span>
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={c.points}
                    step={0.25}
                    value={Number.isFinite(v) ? String(v) : ""}
                    onChange={(e) => update(c.id, e.target.value)}
                    placeholder="0"
                    disabled={locked}
                    className={cn(
                      "h-8 w-24 text-center",
                      tooHigh && "border-rose-300 ring-1 ring-rose-200",
                      locked && "cursor-not-allowed opacity-60",
                    )}
                  />
                  <div className="flex-1">
                    <div className="h-1 overflow-hidden rounded-full bg-muted/60">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          tooHigh ? "bg-rose-500" : "bg-violet-500",
                        )}
                        style={{
                          width: `${Math.min(100, (valNum / Math.max(1, c.points)) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="rounded-lg border-2 border-violet-200 bg-violet-50 px-3 py-2 text-center">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-violet-800">
            Tổng điểm chấm
          </p>
          <p className="mt-0.5">
            <span className="text-[26px] font-bold leading-none text-violet-900">
              {total}
            </span>
            <span className="ml-1 text-[14px] font-semibold text-violet-700">
              / {max}
            </span>
          </p>
        </div>

        <div>
          <label className="text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
            Nhận xét cho học sinh
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
            disabled={locked}
            placeholder="Nhận xét chung, gợi ý cải thiện…"
            className={cn(
              "mt-1 w-full rounded-md border bg-card px-3 py-2 text-[12.5px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/40",
              locked && "cursor-not-allowed opacity-60",
            )}
          />
        </div>

        {locked && (
          <p className="flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[11.5px] font-semibold text-rose-700">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            Đã quá hạn chấm — điểm đã bị khoá, không thể lưu / sửa / xoá.
          </p>
        )}
        <div className="flex items-center justify-between gap-2 pt-1">
          {alreadyGraded ? (
            <Button
              size="sm"
              variant="outline"
              onClick={onDelete}
              disabled={locked}
              className="gap-1.5 text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Xoá điểm chấm
            </Button>
          ) : (
            <span />
          )}
          <Button
            size="sm"
            onClick={() => onSave(scores, comment.trim())}
            disabled={locked}
            className="gap-1.5"
          >
            <Save className="h-3.5 w-3.5" />
            {alreadyGraded ? "Cập nhật điểm" : "Lưu điểm chấm"}
          </Button>
        </div>
      </div>
    </section>
  );
}
