"use client";

import { ArrowLeft, Lock } from "lucide-react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { pickVariantForStudent } from "@/features/exam-forms/data/types";
import { useExamFormsStore } from "@/features/exam-forms/state/exam-forms-store";
import { effectiveShiftStatus } from "@/features/exam-shifts/data/types";
import { useShiftsStore } from "@/features/exam-shifts/state/shifts-store";
import { useBlueprintsStore } from "@/features/exams/state/blueprints-store";
import { usePackagesStore } from "@/features/exams/state/packages-store";
import { useQuestionsStore } from "@/features/question-bank/state/questions-store";
import { ExamRuntime } from "@/features/shift-exam/components/exam-runtime";
import { useAttemptsStore } from "@/features/shift-exam/state/attempts-store";
import type { Question } from "@/features/question-bank/data/seed-questions";
import { isFirebaseConfigured } from "@/lib/firebase";

export default function ExamPage() {
  const params = useParams<{ shiftId: string }>();
  const shiftId = params.shiftId;
  const session = useAuthStore((s) => s.session);
  const shift = useShiftsStore((s) =>
    s.shifts.find((x) => x.id === shiftId),
  );
  const packages = usePackagesStore((s) => s.packages);
  const blueprints = useBlueprintsStore((s) => s.blueprints);
  const allQuestions = useQuestionsStore((s) => s.questions);
  const existingAttempt = useAttemptsStore((s) =>
    session
      ? s.attempts.find(
          (a) => a.shiftId === shiftId && a.studentId === session.userId,
        )
      : undefined,
  );

  // Refresh derived status periodically — relevant for the "ca chưa mở" gate.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  // IMPORTANT: questions must be derived BEFORE any early-return so the hook
  // order stays stable across all render branches. The old position (after
  // the gate ladder) crashed on submit — the moment the attempt got a
  // `submittedAt`, the "Bạn đã nộp bài" early return triggered and
  // useMemo got skipped, blowing up React's hooks invariant on the next
  // render.
  const pkg = shift ? packages.find((p) => p.id === shift.packageId) : null;
  const bp = pkg ? blueprints.find((b) => b.id === pkg.blueprintId) : null;
  // Snapshot-first: the exam form is the source of truth. It was
  // frozen when the shift was published, so editing a question in the
  // bank after this point cannot change what the student sees.
  const examForm = useExamFormsStore((s) =>
    shift ? s.activeForShift(shift.id) : null,
  );
  const questions = useMemo(() => {
    if (!shift || !session) return [];
    if (examForm) {
      const variant = pickVariantForStudent(examForm, session.userId);
      if (variant) return variant.questions;
    }
    // Legacy fallback for shifts created before snapshots existed.
    // Functionally equivalent to the old code path; a banner up the
    // file warns the teacher their shift is unfrozen.
    if (!bp || !pkg) return [];
    const targetTotal = pkg.matrix.reduce(
      (acc, m) => acc + m.easyCount + m.mediumCount + m.hardCount,
      0,
    );
    const pickedIds = bp.topics.flatMap((t) => t.pickedQuestionIds);
    const qs = pickedIds
      .map((id) => allQuestions.find((q) => q.id === id))
      .filter((q): q is NonNullable<typeof q> => !!q)
      .filter(
        (q) =>
          q.status === "approved" &&
          (shift.campusId ? q.campusId === shift.campusId : true),
      );
    let seed = 5381;
    const key = `${shift.id}|${session.userId}`;
    for (let i = 0; i < key.length; i++) {
      seed = ((seed << 5) + seed + key.charCodeAt(i)) | 0;
    }
    function rand() {
      seed = (seed * 16807) % 2147483647;
      return (seed & 2147483647) / 2147483647;
    }
    const shuffled = [...qs];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    return targetTotal > 0 ? shuffled.slice(0, targetTotal) : shuffled;
  }, [examForm, bp, pkg, allQuestions, shift, session]);

  // Students don't subscribe to all /questions. The snapshot path
  // (examForm) already carries frozen questions, so nothing to load. Only
  // the legacy fallback (shift with no exam form) reads the live bank —
  // fetch just that blueprint's picked questions on demand. Hook stays
  // above the early returns to keep hook order stable (see note above).
  // Production students get ANSWER-STRIPPED questions from the server
  // (/api/exam/[id]/questions) — they no longer read /questions or
  // /exam_forms (which carry the answer key). Demo mode + staff keep the
  // local snapshot/fallback path below.
  const useServer = isFirebaseConfigured() && session?.role === "student";
  const [serverQuestions, setServerQuestions] = useState<Question[] | null>(null);
  const [serverDebug, setServerDebug] = useState<unknown>(null);
  useEffect(() => {
    if (!useServer || !shift || !session) return;
    let alive = true;
    setServerQuestions(null);
    (async () => {
      try {
        const { authHeaders } = await import("@/lib/api-client");
        const res = await fetch(`/api/exam/${shift.id}/questions`, {
          method: "POST",
          headers: { ...(await authHeaders()) },
        });
        if (!alive) return;
        const bodyText = await res.text().catch(() => "");
        let parsed: { questions?: Question[]; _debug?: unknown } | null = null;
        try {
          parsed = JSON.parse(bodyText);
        } catch {
          parsed = null;
        }
        const data = res.ok && parsed ? parsed : null;
        if (!data?.questions?.length) {
          // eslint-disable-next-line no-console
          console.warn("[exam] /questions trả rỗng — chẩn đoán:", res.status, bodyText.slice(0, 300));
        }
        setServerDebug(
          data?._debug ?? {
            _httpStatus: res.status,
            _url: `/api/exam/${shift.id}/questions`,
            _contentType: res.headers.get("content-type"),
            _bodySnippet: bodyText.slice(0, 200),
          },
        );
        setServerQuestions(data?.questions ?? []);
      } catch (e) {
        if (alive) {
          setServerDebug({ _fetchError: (e as Error).message });
          setServerQuestions([]);
        }
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useServer, shift?.id, session?.userId]);

  const ensureQuestions = useQuestionsStore((s) => s.ensureQuestions);
  // Client fallback fetch only in demo/staff (server handles it in prod).
  const needFallbackQuestions =
    !useServer && !examForm && session?.role === "student";
  const fallbackIdsKey =
    needFallbackQuestions && bp
      ? bp.topics.flatMap((t) => t.pickedQuestionIds).join(",")
      : "";
  const [fallbackQReady, setFallbackQReady] = useState(false);
  useEffect(() => {
    if (!needFallbackQuestions || !bp) {
      setFallbackQReady(true);
      return;
    }
    const ids = bp.topics.flatMap((t) => t.pickedQuestionIds);
    if (ids.length === 0) {
      setFallbackQReady(true);
      return;
    }
    let alive = true;
    setFallbackQReady(false);
    ensureQuestions(ids).finally(() => {
      if (alive) setFallbackQReady(true);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needFallbackQuestions, fallbackIdsKey, ensureQuestions]);

  // Questions actually shown: server-stripped (prod student) or local.
  const effectiveQuestions = useServer ? serverQuestions ?? [] : questions;

  if (!shift) return notFound();
  if (!session) {
    return (
      <Gate
        title="Bạn chưa đăng nhập"
        hint="Vui lòng đăng nhập bằng tài khoản học sinh để vào thi."
        backHref="/"
      />
    );
  }
  if (session.role !== "student") {
    return (
      <Gate
        title="Trang này chỉ dành cho học sinh"
        hint="Đăng nhập bằng tài khoản học sinh để làm bài. Tài khoản nhân viên có thể vào Giám sát thi từ /admin/shifts."
        backHref="/admin/shifts"
      />
    );
  }
  if (shift.campusId !== session.campusId) {
    return (
      <Gate
        title="Ca thi không thuộc campus của bạn"
        hint="Bạn không có quyền vào ca thi này."
        backHref="/my-exams"
      />
    );
  }

  const effective = effectiveShiftStatus(shift);
  if (effective === "scheduled") {
    return (
      <Gate
        title="Ca thi chưa mở"
        hint={`Vui lòng quay lại lúc ${new Date(
          shift.startAt,
        ).toLocaleString("vi-VN")} — khi giờ mở ca đã đến.`}
        backHref="/my-exams"
      />
    );
  }
  if (effective === "cancelled") {
    return (
      <Gate
        title="Ca thi đã bị huỷ"
        hint="Ca này đã được admin dừng. Liên hệ giáo viên nếu cần thêm thông tin."
        backHref="/my-exams"
      />
    );
  }
  if (effective === "completed" && !existingAttempt) {
    return (
      <Gate
        title="Ca thi đã kết thúc"
        hint="Bạn không kịp vào ca này. Liên hệ giáo viên để biết hướng xử lý."
        backHref="/my-exams"
      />
    );
  }
  if (existingAttempt?.submittedAt) {
    return (
      <Gate
        title="Bạn đã nộp bài cho ca này"
        hint="Mỗi ca thi chỉ làm 1 lần. Xem điểm và kết quả ở trang kết quả."
        backHref={`/exam/${shift.id}/result`}
        backLabel="Xem kết quả"
      />
    );
  }

  // Late-join cutoff: once `startAt + lateJoinMinutes` has passed,
  // students who haven't started yet cannot enter. Existing attempts
  // (already in-progress) can still continue until endAt.
  if (!existingAttempt) {
    const lateMin = shift.lateJoinMinutes ?? 0;
    const cutoff =
      new Date(shift.startAt).getTime() + lateMin * 60_000;
    if (Date.now() > cutoff) {
      const cutoffStr = new Date(cutoff).toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      });
      return (
        <Gate
          title="Đã hết giờ vào muộn"
          hint={`Ca thi cho phép vào muộn tối đa ${lateMin} phút (đến ${cutoffStr}). Bạn không thể vào ca thi này nữa. Liên hệ giáo viên giám sát để được hỗ trợ.`}
          backHref="/my-exams"
        />
      );
    }
  }

  // Legacy fallback still fetching its questions — don't flash the
  // "no questions" gate at a student mid-exam.
  if (
    (needFallbackQuestions && !fallbackQReady) ||
    (useServer && serverQuestions === null)
  ) {
    return (
      <Gate
        title="Đang tải đề thi…"
        hint="Vui lòng đợi trong giây lát."
        backHref="/my-exams"
      />
    );
  }
  if (effectiveQuestions.length === 0) {
    return (
      <div className="space-y-3">
        <Gate
          title="Bộ đề chưa có câu hỏi"
          hint="Bộ đề của ca thi này chưa được gắn câu hỏi đã duyệt. Liên hệ giáo viên / admin để bổ sung."
          backHref="/my-exams"
        />
        {useServer && serverDebug ? (
          <pre className="mx-auto max-w-md overflow-x-auto rounded-lg border bg-muted/30 p-3 text-[11px] text-foreground/70">
            chẩn đoán: {JSON.stringify(serverDebug, null, 2)}
          </pre>
        ) : null}
      </div>
    );
  }

  // Effective duration: prefer the package's `duration`, fall back to the
  // blueprint's. Both are in minutes. If both somehow end up 0 (legacy
  // data), default to 45 minutes so the timer never starts at 0.
  const durationMin =
    pkg && pkg.duration > 0
      ? pkg.duration
      : bp && bp.duration > 0
        ? bp.duration
        : 45;

  const variantForStudent =
    examForm && session ? pickVariantForStudent(examForm, session.userId) : null;
  return (
    <ExamRuntime
      shift={shift}
      questions={effectiveQuestions}
      durationMin={durationMin}
      examFormId={examForm?.id ?? null}
      variantId={variantForStudent?.variantId ?? null}
    />
  );
}

function Gate({
  title,
  hint,
  backHref,
  backLabel = "Quay lại lịch thi",
}: {
  title: string;
  hint: string;
  backHref: string;
  backLabel?: string;
}) {
  return (
    <div className="mx-auto max-w-md rounded-2xl border bg-card p-8 text-center">
      <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-700">
        <Lock className="h-4 w-4" />
      </div>
      <h2 className="text-[16px] font-semibold">{title}</h2>
      <p className="mt-1.5 text-[13px] text-muted-foreground">{hint}</p>
      <Button asChild size="sm" variant="outline" className="mt-4 gap-1.5">
        <Link href={backHref}>
          <ArrowLeft className="h-3.5 w-3.5" />
          {backLabel}
        </Link>
      </Button>
    </div>
  );
}
