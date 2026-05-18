"use client";

import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  Eye,
  Hourglass,
  MessageSquareWarning,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  StopCircle,
  X,
} from "lucide-react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmActionDialog } from "@/features/admin/users/dialogs/confirm-action-dialog";
import { useUsersStore } from "@/features/admin/users/users-store";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useCampusStore } from "@/features/campus/state/campus-store";
import {
  effectiveShiftStatus,
  type ExamShift,
} from "@/features/exam-shifts/data/types";
import {
  ATTEMPT_LABEL,
  ATTEMPT_TONE,
  type AttemptState,
} from "@/features/exam-shifts/lib/mock-monitoring";
import { useShiftsStore } from "@/features/exam-shifts/state/shifts-store";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { useBlueprintsStore } from "@/features/exams/state/blueprints-store";
import { usePackagesStore } from "@/features/exams/state/packages-store";
import { useQuestionsStore } from "@/features/question-bank/state/questions-store";
import {
  detectAnomalies,
  type Anomaly,
} from "@/features/shift-exam/lib/anomaly-detection";
import {
  useAttemptsStore,
  type StudentAttempt,
  type ViolationKind,
} from "@/features/shift-exam/state/attempts-store";
import {
  useProctorStore,
  type ProctorEvent,
} from "@/features/shift-exam/state/proctor-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { cn } from "@/lib/utils";

const STATUS_LABEL_VN: Record<string, string> = {
  draft: "Bản nháp",
  scheduled: "Sắp diễn ra",
  "in-progress": "Đang diễn ra",
  completed: "Đã kết thúc",
  cancelled: "Đã huỷ",
};

const VIOLATION_LABEL: Record<ViolationKind, string> = {
  tabSwitches: "Chuyển tab",
  fullscreenExits: "Thoát fullscreen",
  pasteAttempts: "Cố paste nội dung",
};
const VIOLATION_ICON: Record<ViolationKind, string> = {
  tabSwitches: "🔀",
  fullscreenExits: "⬜",
  pasteAttempts: "📋",
};

function formatDuration(ms: number): string {
  if (ms <= 0) return "—";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function relativeTime(iso: string, now: number): string {
  const diff = now - new Date(iso).getTime();
  if (diff < 0) return "vừa lập kế hoạch";
  if (diff < 45_000) return "vừa xong";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h trước`;
  const d = Math.floor(h / 24);
  return `${d}d trước`;
}

interface MonitorRow {
  studentId: string;
  name: string;
  className: string | null;
  roomId: string;
  roomName: string;
  state: AttemptState;
  currentQuestion: number;
  progress: number;
  elapsedMin: number;
  violations: number;
  lastEvent: string;
  attempt: StudentAttempt | null;
  anomalies: Anomaly[];
  unreadProctorMsgs: number;
  /** Convenience: at least one warn / critical anomaly OR ≥3 violations. */
  isAtRisk: boolean;
}

interface FeedItem {
  id: string;
  studentId: string;
  studentName: string;
  className: string | null;
  source: "violation" | "anomaly" | "proctor";
  severity: "info" | "warn" | "critical";
  title: string;
  detail?: string;
  /** Bucketed count for violation rollups (e.g. "Chuyển tab × 4"). */
  count?: number;
  /** ISO timestamp — feed sorted desc. */
  at: string;
  /** Proctor event id when source==='proctor' so we can ack it. */
  proctorEventId?: string;
  /** Whether the related proctor msg has been read by student. */
  acknowledged?: boolean;
}

function buildRow(
  shift: ExamShift,
  studentId: string,
  studentName: string,
  className: string | null,
  roomId: string,
  roomName: string,
  attempt: StudentAttempt | null,
  proctorEventCount: number,
  totalQuestionsInExam: number,
  now: number,
  roomMedianProgress: number | undefined,
): MonitorRow {
  const eff = effectiveShiftStatus(shift, now);
  let state: AttemptState;
  let progress = 0;
  let currentQuestion = 0;
  let elapsedMin = 0;
  let violations = 0;
  let lastEvent = "—";

  if (!attempt) {
    if (eff === "scheduled" || eff === "draft") {
      state = "not-started";
      lastEvent = "Chờ vào ca";
    } else if (eff === "completed" || eff === "cancelled") {
      state = "absent";
      lastEvent = "Không vào ca";
    } else {
      state = "not-started";
      lastEvent = "Chưa vào ca thi";
    }
  } else {
    const startedMs = new Date(attempt.startedAt).getTime();
    elapsedMin = Math.max(0, Math.round((now - startedMs) / 60_000));
    const answered = Object.keys(attempt.answers).length;
    const total = attempt.questionIds.length || totalQuestionsInExam || 1;
    progress = Math.round((answered / total) * 100);
    currentQuestion = Math.min(total - 1, Math.max(0, answered));
    violations =
      attempt.violations.tabSwitches +
      attempt.violations.fullscreenExits +
      attempt.violations.pasteAttempts;

    if (attempt.submittedAt) {
      state = "submitted";
      lastEvent = `Nộp ${relativeTime(attempt.submittedAt, now)}`;
    } else if (violations >= 8) {
      state = "violated";
      lastEvent = "Quá nhiều vi phạm";
    } else if (answered > 0) {
      state = "in-progress";
      lastEvent = `Câu ${currentQuestion + 1} · ${progress}% · ${elapsedMin}p`;
    } else {
      state = "in-progress";
      lastEvent = `Vừa vào · ${elapsedMin}p`;
    }
  }

  const anomalies = attempt
    ? detectAnomalies({
        attempt,
        now,
        totalQuestions: attempt.questionIds.length || totalQuestionsInExam,
        roomMedianProgress,
      })
    : [];

  const isAtRisk =
    violations >= 3 ||
    anomalies.some((a) => a.severity === "warn" || a.severity === "critical");

  return {
    studentId,
    name: studentName,
    className,
    roomId,
    roomName,
    state,
    currentQuestion,
    progress,
    elapsedMin,
    violations,
    lastEvent,
    attempt,
    anomalies,
    unreadProctorMsgs: proctorEventCount,
    isAtRisk,
  };
}

export default function MonitorPage() {
  const params = useParams<{ id: string }>();
  const shiftId = params.id;

  const shift = useShiftsStore((s) =>
    s.shifts.find((x) => x.id === shiftId),
  );
  const setShiftStatus = useShiftsStore((s) => s.setStatus);
  const session = useAuthStore((s) => s.session);
  const activeCampusId = useCampusStore((s) => s.activeCampusId);
  const allClasses = useGradesStore((s) => s.classes);
  const subjects = useSubjectsStore((s) => s.subjects);
  const users = useUsersStore((s) => s.users);
  const allAttempts = useAttemptsStore((s) => s.attempts);
  const allEvents = useProctorStore((s) => s.events);
  const sendEvent = useProctorStore((s) => s.send);
  const ackEvent = useProctorStore((s) => s.acknowledge);
  const packages = usePackagesStore((s) => s.packages);
  const blueprints = useBlueprintsStore((s) => s.blueprints);
  const allQuestions = useQuestionsStore((s) => s.questions);

  const campusId =
    session?.role === "superadmin"
      ? activeCampusId ?? null
      : session?.campusId ?? null;

  // 2s tick for live updates. The monitor also re-hydrates the student-
  // side Zustand stores when the `storage` event fires so a teacher
  // viewing the monitor in tab A sees a student's progress in tab B
  // almost immediately — Zustand's `persist` middleware writes on every
  // mutation but doesn't propagate cross-tab by default.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 2_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    // Attempts + shifts are now synced via Firestore onSnapshot —
    // cross-tab updates are automatic. Only the (still-local) proctor
    // events store needs the localStorage event hook.
    if (typeof window === "undefined") return;
    function onStorage(e: StorageEvent) {
      if (e.key === "fsc-proctor-events") {
        useProctorStore.persist.rehydrate();
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // UI state
  const [proctorTarget, setProctorTarget] = useState<{
    studentId: string;
    studentName: string;
    prefillKind?: "warning" | "violation" | "info";
    prefillBody?: string;
  } | null>(null);
  const [tab, setTab] = useState<"all" | "in-progress" | "at-risk">("all");
  const [search, setSearch] = useState("");
  const [confirmingStop, setConfirmingStop] = useState(false);

  if (!shift) return notFound();
  if (campusId && shift.campusId !== campusId) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
        Ca thi không thuộc campus đang chọn.
      </div>
    );
  }
  // Proctor-only gate: a teacher / subject-lead may only watch the
  // monitor if they were explicitly assigned as a giám thị for one of
  // the rooms of this shift. Admin-class roles (campus-admin / academic-
  // director / superadmin) skip the gate.
  if (session) {
    const isAdminClass =
      session.role === "superadmin" ||
      session.role === "academic-director" ||
      session.role === "campus-admin";
    if (!isAdminClass) {
      const isProctor = shift.rooms.some((r) =>
        r.proctorIds.includes(session.userId),
      );
      if (!isProctor) {
        return (
          <div className="mx-auto max-w-md rounded-2xl border bg-card p-8 text-center">
            <p className="text-[14px] font-semibold">
              🔒 Bạn không có quyền giám sát ca này
            </p>
            <p className="mt-2 text-[12px] text-muted-foreground">
              Chỉ giáo viên được phân công làm <b>giám thị</b> cho ca thi
              này (gán trong Bước 4 — Phòng & Giám thị của Wizard) hoặc
              Admin campus mới được vào phòng giám sát.
            </p>
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              Liên hệ Admin để bổ sung phân công nếu cần.
            </p>
          </div>
        );
      }
    }
  }

  const subject = subjects.find((s) => s.id === shift.subjectId);
  const eff = effectiveShiftStatus(shift, nowMs);

  const pkg = packages.find((p) => p.id === shift.packageId);
  const bp = pkg ? blueprints.find((b) => b.id === pkg.blueprintId) : null;
  const expectedQuestions = pkg
    ? pkg.matrix.reduce(
        (a, r) => a + r.easyCount + r.mediumCount + r.hardCount,
        0,
      )
    : 0;

  const startMs = new Date(shift.startAt).getTime();
  const endMs = new Date(shift.endAt).getTime();
  const totalDurationMs = Math.max(0, endMs - startMs);
  const elapsedMs = Math.max(0, Math.min(nowMs - startMs, totalDurationMs));
  const remainingMs = Math.max(0, endMs - nowMs);
  const sinceStart = nowMs - startMs;
  const shiftTimePct =
    totalDurationMs > 0
      ? Math.min(100, Math.max(0, (elapsedMs / totalDurationMs) * 100))
      : 0;

  // Resolve display rows.
  const usersById = useMemo(() => {
    const m = new Map<string, (typeof users)[number]>();
    for (const u of users) m.set(u.id, u);
    return m;
  }, [users]);

  function deriveStudentsForRoom(r: {
    studentIds?: string[];
    classIds: string[];
  }): string[] {
    if (r.studentIds && r.studentIds.length > 0) return r.studentIds;
    const classIds = r.classIds.length > 0 ? r.classIds : shift!.classIds;
    const codes = new Set(
      allClasses.filter((c) => classIds.includes(c.id)).map((c) => c.code),
    );
    return users
      .filter(
        (u) =>
          u.role === "student" &&
          u.status === "active" &&
          u.campusId === shift!.campusId &&
          u.className != null &&
          codes.has(u.className),
      )
      .map((u) => u.id);
  }

  const allRows: MonitorRow[] = useMemo(() => {
    const out: MonitorRow[] = [];
    for (const r of shift.rooms) {
      const studentIds = deriveStudentsForRoom(r);
      // Median progress for the room
      const inProgress: number[] = [];
      for (const sid of studentIds) {
        const att = allAttempts.find(
          (a) => a.shiftId === shift.id && a.studentId === sid,
        );
        if (!att || att.submittedAt) continue;
        const t = att.questionIds.length || expectedQuestions || 1;
        inProgress.push((Object.keys(att.answers).length / t) * 100);
      }
      const sorted = [...inProgress].sort((a, b) => a - b);
      const median =
        sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : undefined;
      for (const sid of studentIds) {
        const stu = usersById.get(sid);
        const att =
          allAttempts.find(
            (a) => a.shiftId === shift.id && a.studentId === sid,
          ) ?? null;
        const unread = allEvents.filter(
          (e) =>
            e.shiftId === shift.id &&
            e.studentId === sid &&
            e.acknowledgedAt == null,
        ).length;
        out.push(
          buildRow(
            shift,
            sid,
            stu?.name ?? `(Đã xoá: ${sid})`,
            stu?.className ?? null,
            r.id,
            r.name,
            att,
            unread,
            expectedQuestions || (att?.questionIds.length ?? 0),
            nowMs,
            median,
          ),
        );
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shift, usersById, allAttempts, allEvents, nowMs, expectedQuestions]);

  // Stats for the top KPI strip.
  const stats = useMemo(() => {
    const acc: Record<AttemptState, number> = {
      "not-started": 0,
      "in-progress": 0,
      submitted: 0,
      violated: 0,
      absent: 0,
    };
    let totalViolations = 0;
    let totalProgress = 0;
    let progressCount = 0;
    for (const r of allRows) {
      acc[r.state]++;
      totalViolations += r.violations;
      if (r.attempt) {
        totalProgress += r.progress;
        progressCount++;
      }
    }
    const avgProgress =
      progressCount > 0 ? Math.round(totalProgress / progressCount) : 0;
    return { ...acc, totalViolations, avgProgress, total: allRows.length };
  }, [allRows]);

  // Filtered rows for the left column.
  const filteredRows = useMemo(() => {
    return allRows.filter((r) => {
      if (tab === "in-progress" && r.state !== "in-progress") return false;
      if (tab === "at-risk" && !r.isAtRisk) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (
          !r.name.toLowerCase().includes(q) &&
          !(r.className ?? "").toLowerCase().includes(q) &&
          !r.roomName.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [allRows, tab, search]);

  // ───── Event feed: unified chronological list
  const feed: FeedItem[] = useMemo(() => {
    const items: FeedItem[] = [];
    for (const r of allRows) {
      // (a) Violation events (timestamped).
      if (r.attempt?.recentEvents) {
        // Bucket consecutive events of the same kind within 30s into one
        // line item so the feed doesn't get hammered by rapid-fire blocks.
        const bucketed: Array<{ kind: ViolationKind; lastAt: string; count: number }> =
          [];
        for (const ev of r.attempt.recentEvents) {
          const last = bucketed[bucketed.length - 1];
          if (
            last &&
            last.kind === ev.kind &&
            new Date(ev.at).getTime() - new Date(last.lastAt).getTime() <
              30_000
          ) {
            last.count++;
            last.lastAt = ev.at;
          } else {
            bucketed.push({ kind: ev.kind, lastAt: ev.at, count: 1 });
          }
        }
        for (const b of bucketed) {
          const sev: "info" | "warn" | "critical" =
            b.count >= 3 ? "critical" : b.count >= 2 ? "warn" : "info";
          items.push({
            id: `vio-${r.studentId}-${b.kind}-${b.lastAt}`,
            studentId: r.studentId,
            studentName: r.name,
            className: r.className,
            source: "violation",
            severity: sev,
            title: VIOLATION_LABEL[b.kind],
            detail: `${VIOLATION_ICON[b.kind]} ${VIOLATION_LABEL[b.kind]}`,
            count: b.count,
            at: b.lastAt,
          });
        }
      }
      // (b) AI anomalies — synthetic timestamp = now (they're live signals).
      for (const a of r.anomalies) {
        items.push({
          id: `anom-${r.studentId}-${a.code}`,
          studentId: r.studentId,
          studentName: r.name,
          className: r.className,
          source: "anomaly",
          severity: a.severity,
          title: a.title,
          detail: a.hint,
          at: new Date(nowMs).toISOString(),
        });
      }
    }
    // (c) Proctor events for this shift.
    const proctorForShift = allEvents.filter((e) => e.shiftId === shift.id);
    for (const ev of proctorForShift) {
      const stu = usersById.get(ev.studentId);
      items.push({
        id: `pro-${ev.id}`,
        studentId: ev.studentId,
        studentName: stu?.name ?? ev.studentId,
        className: stu?.className ?? null,
        source: "proctor",
        severity:
          ev.kind === "violation"
            ? "critical"
            : ev.kind === "warning"
              ? "warn"
              : "info",
        title:
          ev.kind === "violation"
            ? `Vi phạm: ${ev.tag ?? "Khác"}`
            : ev.kind === "warning"
              ? `Cảnh báo: ${ev.tag ?? "Khác"}`
              : `Thông báo: ${ev.tag ?? "Khác"}`,
        detail: ev.body,
        at: ev.createdAt,
        proctorEventId: ev.id,
        acknowledged: ev.acknowledgedAt != null,
      });
    }
    return items.sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    );
  }, [allRows, allEvents, shift.id, nowMs, usersById]);

  const aggAnomalies = useMemo(() => {
    let critical = 0;
    let warn = 0;
    let info = 0;
    for (const r of allRows) {
      for (const a of r.anomalies) {
        if (a.severity === "critical") critical++;
        else if (a.severity === "warn") warn++;
        else info++;
      }
    }
    return { critical, warn, info };
  }, [allRows]);

  const totalRiskRows = allRows.filter((r) => r.isAtRisk).length;

  function ackAllProctor() {
    for (const ev of allEvents) {
      if (ev.shiftId === shift!.id && ev.acknowledgedAt == null) {
        ackEvent(ev.id);
      }
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl border bg-card px-5 py-4">
        <div className="flex flex-wrap items-start gap-3">
          <Link
            href="/admin/shifts"
            className="inline-flex h-8 items-center gap-1 rounded-md border bg-card px-2.5 text-[12px] font-semibold text-foreground/80 hover:bg-accent/30"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Quay lại danh sách
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {eff === "in-progress" && (
                <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-rose-700">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
                  </span>
                  LIVE
                </span>
              )}
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-foreground/65">
                {shift.id}
              </span>
              <span
                className={cn(
                  "rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]",
                  eff === "in-progress"
                    ? "border-emerald-200 bg-emerald-100 text-emerald-800"
                    : eff === "completed"
                      ? "border-violet-200 bg-violet-100 text-violet-800"
                      : eff === "scheduled"
                        ? "border-blue-200 bg-blue-100 text-blue-800"
                        : "border-slate-200 bg-slate-100 text-slate-700",
                )}
              >
                {STATUS_LABEL_VN[eff] ?? eff}
              </span>
            </div>
            <h1 className="mt-1 truncate text-[18px] font-bold leading-tight">
              {shift.rooms[0]?.name && `${shift.rooms[0].name} — `}
              {shift.name}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground">
              {subject && (
                <span className="rounded bg-blue-50 px-1.5 py-0.5 font-semibold text-blue-700">
                  {subject.name}
                </span>
              )}
              <span>
                {new Date(shift.startAt).toLocaleString("vi-VN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  day: "2-digit",
                  month: "2-digit",
                })}{" "}
                →{" "}
                {new Date(shift.endAt).toLocaleString("vi-VN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  day: "2-digit",
                  month: "2-digit",
                })}
              </span>
              {bp && (
                <span>
                  Bộ đề:{" "}
                  <span className="font-semibold">
                    {pkg?.name ?? bp.name}
                  </span>{" "}
                  ({expectedQuestions} câu)
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setNowMs(Date.now())}
              className="gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
            {eff === "in-progress" && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setConfirmingStop(true)}
                className="gap-1.5"
              >
                <StopCircle className="h-3.5 w-3.5" />
                Dừng khẩn cấp
              </Button>
            )}
          </div>
        </div>

        {/* Time progress */}
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Hourglass className="h-3 w-3" />
              {eff === "scheduled"
                ? `Bắt đầu sau ${formatDuration(-sinceStart)}`
                : eff === "in-progress"
                  ? `Còn ${formatDuration(remainingMs)}`
                  : `Đã kết thúc ${formatDuration(-remainingMs)} trước`}
            </span>
            <span>{Math.round(shiftTimePct)}%</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-muted/60">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                eff === "in-progress"
                  ? "bg-emerald-500"
                  : eff === "completed"
                    ? "bg-violet-500"
                    : "bg-blue-400",
              )}
              style={{ width: `${shiftTimePct}%` }}
            />
          </div>
        </div>
      </div>

      {/* AI anomaly banner */}
      {(aggAnomalies.critical > 0 || aggAnomalies.warn > 0) && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-xl border px-3 py-2 text-[12.5px]",
            aggAnomalies.critical > 0
              ? "border-rose-300 bg-rose-50 text-rose-900"
              : "border-amber-200 bg-amber-50 text-amber-900",
          )}
        >
          <Sparkles className="h-4 w-4 shrink-0" />
          <span>
            <b>AI phát hiện:</b>{" "}
            {aggAnomalies.critical > 0 &&
              `${aggAnomalies.critical} KHẨN, `}
            {aggAnomalies.warn > 0 && `${aggAnomalies.warn} cảnh báo, `}
            {aggAnomalies.info > 0 && `${aggAnomalies.info} theo dõi`}
            .{" "}
            <button
              type="button"
              onClick={() => setTab("at-risk")}
              className="font-semibold underline-offset-2 hover:underline"
            >
              Lọc HS có rủi ro →
            </button>
          </span>
        </div>
      )}

      {/* 7 stat tiles */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <StatTile label="TỔNG THÍ SINH" value={stats.total} tone="muted" />
        <StatTile label="ĐÃ NỘP" value={stats.submitted} tone="blue" />
        <StatTile
          label="ĐANG LÀM"
          value={stats["in-progress"]}
          tone="green"
          highlight={stats["in-progress"] > 0}
        />
        <StatTile
          label="CHƯA VÀO"
          value={stats["not-started"]}
          tone="amber"
        />
        <StatTile label="VẮNG" value={stats.absent} tone="rose" />
        <StatTile
          label="VI PHẠM"
          value={stats.totalViolations}
          tone="amber"
          highlight={stats.totalViolations > 0}
        />
        <StatTile label="TIẾN ĐỘ" value={`${stats.avgProgress}%`} tone="violet" />
      </div>

      {/* Split body */}
      <div className="grid gap-4 lg:grid-cols-[1.2fr_minmax(0,1fr)]">
        {/* LEFT: students */}
        <section className="rounded-xl border bg-card">
          <header className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
            <h2 className="text-[14px] font-semibold">📋 Danh sách thí sinh</h2>
            <span className="text-[11px] text-muted-foreground">
              ({filteredRows.length}/{allRows.length})
            </span>
            <div className="ml-auto flex items-center gap-1">
              {(
                [
                  { v: "all", label: "Tất cả", count: allRows.length },
                  {
                    v: "in-progress",
                    label: "Đang làm",
                    count: stats["in-progress"],
                  },
                  {
                    v: "at-risk",
                    label: "Rủi ro",
                    count: totalRiskRows,
                  },
                ] as Array<{
                  v: "all" | "in-progress" | "at-risk";
                  label: string;
                  count: number;
                }>
              ).map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setTab(opt.v)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-[11.5px] font-semibold transition",
                    tab === opt.v
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-accent/30",
                  )}
                >
                  {opt.label}
                  <span
                    className={cn(
                      "ml-1 rounded px-1 text-[10px]",
                      tab === opt.v
                        ? "bg-primary-foreground/20"
                        : "bg-muted",
                    )}
                  >
                    {opt.count}
                  </span>
                </button>
              ))}
            </div>
          </header>
          <div className="border-b px-3 py-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm HS / lớp / phòng…"
              className="h-8 text-[12px]"
            />
          </div>
          {filteredRows.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">
              Không có HS khớp bộ lọc.
            </p>
          ) : (
            <ul className="divide-y">
              {filteredRows.map((r, idx) => (
                <StudentListRow
                  key={r.studentId}
                  index={idx + 1}
                  row={r}
                  totalQuestions={
                    r.attempt?.questionIds.length ?? expectedQuestions ?? 0
                  }
                  onSendProctor={(presetTag, presetKind) =>
                    setProctorTarget({
                      studentId: r.studentId,
                      studentName: r.name,
                      prefillKind: presetKind,
                      prefillBody: presetTag ?? "",
                    })
                  }
                />
              ))}
            </ul>
          )}
        </section>

        {/* RIGHT: event feed */}
        <section className="rounded-xl border bg-card">
          <header className="flex items-center gap-2 border-b px-4 py-2.5">
            <h2 className="text-[14px] font-semibold">🛡 Cảnh báo & Vi phạm</h2>
            <span className="text-[11px] text-muted-foreground">
              ({feed.length})
            </span>
            <button
              type="button"
              onClick={ackAllProctor}
              disabled={!feed.some((f) => f.source === "proctor" && !f.acknowledged)}
              className="ml-auto inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold text-foreground/80 transition hover:bg-accent/30 disabled:opacity-40"
            >
              <CheckCircle2 className="h-3 w-3" />
              Đánh dấu xử lý hết
            </button>
          </header>
          {feed.length === 0 ? (
            <div className="p-6 text-center">
              <ShieldAlert className="mx-auto h-7 w-7 text-emerald-600" />
              <p className="mt-2 text-[13px] font-semibold">
                Không có vi phạm hay cảnh báo nào
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Mọi thứ đang diễn ra bình thường.
              </p>
            </div>
          ) : (
            <ul className="max-h-[640px] divide-y overflow-y-auto">
              {feed.map((item) => (
                <FeedRow
                  key={item.id}
                  item={item}
                  now={nowMs}
                  onResolve={() => {
                    if (item.proctorEventId) ackEvent(item.proctorEventId);
                  }}
                  onWarn={() =>
                    setProctorTarget({
                      studentId: item.studentId,
                      studentName: item.studentName,
                      prefillKind:
                        item.source === "violation"
                          ? "violation"
                          : "warning",
                      prefillBody:
                        item.source === "violation"
                          ? `Ghi nhận ${item.title.toLowerCase()} (${item.count ?? 1} lần). Yêu cầu dừng ngay.`
                          : item.detail ?? "",
                    })
                  }
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Proctor dialog */}
      {proctorTarget && session && (
        <ProctorActionDialog
          target={proctorTarget}
          onClose={() => setProctorTarget(null)}
          onSubmit={({ kind, tag, body }) => {
            sendEvent({
              shiftId: shift.id,
              studentId: proctorTarget.studentId,
              proctorId: session.userId,
              proctorName: session.name ?? "Giám thị",
              kind,
              body,
              tag,
            });
            setProctorTarget(null);
          }}
        />
      )}

      {/* Emergency stop */}
      <ConfirmActionDialog
        open={confirmingStop}
        onOpenChange={(o) => !o && setConfirmingStop(false)}
        variant="destructive"
        title="⛔ Dừng khẩn cấp ca thi?"
        description={
          <div className="space-y-2">
            <p>
              Hành động này sẽ <b>buộc kết thúc ngay</b> ca thi đang diễn ra.
            </p>
            <ul className="ml-5 list-disc text-[12.5px] text-rose-900">
              <li>
                <b>{stats["in-progress"]} HS đang thi</b> sẽ bị submit tự động
                tại câu hiện tại.
              </li>
              <li>Ca thi chuyển trạng thái "Đã huỷ" — không khôi phục được.</li>
              <li>Mọi nhân sự giám thị sẽ thấy thông báo dừng ngay lập tức.</li>
            </ul>
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
              ⚠ Chỉ dùng khi có sự cố nghiêm trọng (gian lận hàng loạt, mất
              điện, hệ thống lỗi, v.v.). Cho việc dừng định kỳ, để ca chạy hết
              giờ.
            </p>
          </div>
        }
        confirmLabel="Dừng ngay & huỷ ca"
        onConfirm={() => {
          setShiftStatus(shift!.id, "cancelled");
          setConfirmingStop(false);
        }}
      />
    </div>
  );
}

/* ───── sub-components ───── */

function StatTile({
  label,
  value,
  tone,
  highlight,
}: {
  label: string;
  value: number | string;
  tone: "blue" | "green" | "amber" | "rose" | "violet" | "muted";
  highlight?: boolean;
}) {
  const tones: Record<typeof tone, { text: string; bg: string }> = {
    blue: { text: "text-blue-700", bg: "bg-blue-50/40" },
    green: { text: "text-emerald-700", bg: "bg-emerald-50/40" },
    amber: { text: "text-amber-700", bg: "bg-amber-50/40" },
    rose: { text: "text-rose-700", bg: "bg-rose-50/40" },
    violet: { text: "text-violet-700", bg: "bg-violet-50/40" },
    muted: { text: "text-foreground", bg: "bg-muted/30" },
  };
  const t = tones[tone];
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2.5",
        highlight ? t.bg : "bg-card",
      )}
    >
      <div className={cn("text-[20px] font-bold leading-none", t.text)}>
        {value}
      </div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function StudentListRow({
  index,
  row,
  totalQuestions,
  onSendProctor,
}: {
  index: number;
  row: MonitorRow;
  totalQuestions: number;
  onSendProctor(presetTag?: string, presetKind?: "warning" | "violation"): void;
}) {
  const accent =
    row.state === "submitted"
      ? "bg-blue-500"
      : row.state === "violated"
        ? "bg-rose-500"
        : row.state === "in-progress"
          ? "bg-emerald-500"
          : "bg-slate-300";
  return (
    <li
      className={cn(
        "flex items-center gap-3 px-3 py-2",
        row.isAtRisk && row.state === "in-progress" && "bg-rose-50/40",
      )}
    >
      <span className="w-5 text-right text-[11px] text-muted-foreground">
        {index}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-[13px] font-semibold">{row.name}</p>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-foreground/70">
            {row.className ?? "—"}
          </span>
          {row.isAtRisk && (
            <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[9.5px] font-bold uppercase text-rose-700">
              ⚠ rủi ro
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          <span
            className={cn(
              "mr-1 rounded-md border px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.05em]",
              ATTEMPT_TONE[row.state],
            )}
          >
            {ATTEMPT_LABEL[row.state]}
          </span>
          {row.lastEvent}
        </p>
        {/* AI chips inline (compact) */}
        {row.anomalies.length > 0 && (
          <ul className="mt-1 flex flex-wrap gap-1">
            {row.anomalies.slice(0, 3).map((a) => (
              <li
                key={a.code}
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0 text-[9.5px]",
                  a.severity === "critical"
                    ? "border-rose-300 bg-rose-50 text-rose-800"
                    : a.severity === "warn"
                      ? "border-amber-300 bg-amber-50 text-amber-800"
                      : "border-blue-200 bg-blue-50 text-blue-800",
                )}
                title={a.hint ?? ""}
              >
                <Sparkles className="h-2 w-2" />
                {a.title}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex w-20 flex-col items-end gap-0.5">
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted/60">
          <div className={cn("h-full", accent)} style={{ width: `${row.progress}%` }} />
        </div>
        <p className="text-[9.5px] text-muted-foreground">
          {row.progress}% · {totalQuestions ? `Câu ${row.currentQuestion + 1}/${totalQuestions}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-1">
        {row.violations > 0 && (
          <span
            className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9.5px] font-bold text-amber-900"
            title={`${row.violations} vi phạm anti-cheat`}
          >
            <CircleAlert className="h-2.5 w-2.5" />
            {row.violations}
          </span>
        )}
        {row.unreadProctorMsgs > 0 && (
          <span
            className="inline-flex items-center gap-0.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[9.5px] font-bold text-blue-800"
            title="HS chưa đọc tin nhắn"
          >
            <MessageSquareWarning className="h-2.5 w-2.5" />
            {row.unreadProctorMsgs}
          </span>
        )}
        <button
          type="button"
          onClick={() => onSendProctor()}
          disabled={row.state === "submitted" || row.state === "absent"}
          className="rounded-md border bg-card p-1 text-muted-foreground transition hover:bg-accent/30 disabled:opacity-30"
          title="Gửi cảnh báo / vi phạm"
        >
          <Send className="h-3 w-3" />
        </button>
      </div>
    </li>
  );
}

function FeedRow({
  item,
  now,
  onResolve,
  onWarn,
}: {
  item: FeedItem;
  now: number;
  onResolve(): void;
  onWarn(): void;
}) {
  const sevLabel: Record<"info" | "warn" | "critical", string> = {
    info: "NHẸ",
    warn: "TRUNG BÌNH",
    critical: "KHẨN",
  };
  const sevTone: Record<"info" | "warn" | "critical", string> = {
    info: "border-blue-200 bg-blue-50 text-blue-800",
    warn: "border-amber-300 bg-amber-50 text-amber-800",
    critical: "border-rose-300 bg-rose-50 text-rose-800",
  };
  const iconBg =
    item.source === "violation"
      ? "bg-rose-100 text-rose-700"
      : item.source === "anomaly"
        ? "bg-amber-100 text-amber-700"
        : item.severity === "critical"
          ? "bg-rose-100 text-rose-700"
          : "bg-blue-100 text-blue-700";
  const icon =
    item.source === "violation"
      ? "🚫"
      : item.source === "anomaly"
        ? "✨"
        : item.severity === "critical"
          ? "🚨"
          : "💬";
  return (
    <li className="flex items-start gap-2 px-3 py-2.5 hover:bg-accent/10">
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[12px]",
          iconBg,
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-[12.5px] font-semibold">
            {item.studentName}
          </p>
          {item.className && (
            <span className="rounded bg-muted px-1 text-[9.5px] font-semibold text-foreground/65">
              {item.className}
            </span>
          )}
          {item.count != null && item.count > 1 && (
            <span className="rounded-full bg-foreground/10 px-1.5 py-0 text-[9.5px] font-bold text-foreground/80">
              ×{item.count}
            </span>
          )}
          <span
            className={cn(
              "rounded-full border px-1.5 py-0 text-[9.5px] font-bold uppercase",
              sevTone[item.severity],
            )}
          >
            {sevLabel[item.severity]}
          </span>
          {item.source === "proctor" && item.acknowledged && (
            <span className="rounded-full bg-emerald-100 px-1.5 py-0 text-[9.5px] font-bold uppercase text-emerald-700">
              ✓ HS đã đọc
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[12px] font-medium">{item.title}</p>
        {item.detail && (
          <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
            {item.detail}
          </p>
        )}
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          {relativeTime(item.at, now)}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1">
        {item.source === "proctor" ? (
          <button
            type="button"
            onClick={onResolve}
            disabled={item.acknowledged}
            className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-0.5 text-[10.5px] font-semibold text-foreground/80 hover:bg-accent/30 disabled:opacity-40"
          >
            <Eye className="h-2.5 w-2.5" />
            {item.acknowledged ? "Đã xử lý" : "Xử lý"}
          </button>
        ) : (
          <button
            type="button"
            onClick={onWarn}
            className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-800 hover:bg-amber-100"
          >
            <Send className="h-2.5 w-2.5" />
            Gửi cảnh báo
          </button>
        )}
      </div>
    </li>
  );
}

function ProctorActionDialog({
  target,
  onClose,
  onSubmit,
}: {
  target: {
    studentId: string;
    studentName: string;
    prefillKind?: "warning" | "violation" | "info";
    prefillBody?: string;
  };
  onClose(): void;
  onSubmit(input: {
    kind: "warning" | "violation" | "info";
    tag: string | null;
    body: string;
  }): void;
}) {
  const [kind, setKind] = useState<"warning" | "violation" | "info">(
    target.prefillKind ?? "warning",
  );
  const [tag, setTag] = useState("");
  const [body, setBody] = useState(target.prefillBody ?? "");

  const PRESET_TAGS: Record<typeof kind, string[]> = {
    warning: [
      "Nói chuyện riêng",
      "Quay đầu nhìn bài bạn",
      "Sử dụng điện thoại",
      "Rời chỗ ngồi",
    ],
    violation: [
      "Trao đổi đáp án",
      "Đem tài liệu vào phòng thi",
      "Nhìn bài bạn nhiều lần",
      "Cố ý phá thiết bị",
    ],
    info: ["Sức khoẻ kém", "Đi vệ sinh", "Hỏi GT"],
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal
    >
      <div className="w-full max-w-md rounded-xl bg-card p-5 shadow-xl">
        <header className="mb-3 flex items-start gap-2">
          <span
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full",
              kind === "warning"
                ? "bg-amber-50 text-amber-700"
                : kind === "violation"
                  ? "bg-rose-50 text-rose-700"
                  : "bg-blue-50 text-blue-700",
            )}
          >
            <MessageSquareWarning className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold leading-tight">
              Gửi tới {target.studentName}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Tin nhắn sẽ hiện ngay trên màn hình HS và lưu vào lịch sử bài
              thi.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-accent/30"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-3">
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
              Loại
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { v: "warning", label: "⚠ Cảnh báo", tone: "amber" },
                  { v: "violation", label: "🚨 Vi phạm", tone: "rose" },
                  { v: "info", label: "ℹ Thông báo", tone: "blue" },
                ] as Array<{
                  v: "warning" | "violation" | "info";
                  label: string;
                  tone: "amber" | "rose" | "blue";
                }>
              ).map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => {
                    setKind(opt.v);
                    setTag("");
                  }}
                  className={cn(
                    "rounded-md border px-2 py-1.5 text-[11px] font-semibold transition",
                    kind === opt.v
                      ? opt.tone === "amber"
                        ? "border-amber-300 bg-amber-50 text-amber-900 ring-1 ring-amber-200"
                        : opt.tone === "rose"
                          ? "border-rose-300 bg-rose-50 text-rose-900 ring-1 ring-rose-200"
                          : "border-blue-300 bg-blue-50 text-blue-900 ring-1 ring-blue-200"
                      : "border-border bg-card text-muted-foreground hover:bg-accent/30",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
              Tag nhanh
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {PRESET_TAGS[kind].map((t) => (
                <li key={t}>
                  <button
                    type="button"
                    onClick={() => setTag(t === tag ? "" : t)}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[11px] transition",
                      tag === t
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card hover:bg-accent/30",
                    )}
                  >
                    {t}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
              Nội dung
            </p>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder={
                kind === "warning"
                  ? "vd: Em không trao đổi với bạn bên cạnh nữa."
                  : kind === "violation"
                    ? "vd: Ghi nhận trao đổi đáp án lần 1, cần dừng ngay."
                    : "vd: Em đã được cho phép đi vệ sinh."
              }
              className="w-full rounded-md border bg-card px-3 py-2 text-[12.5px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>
              Huỷ
            </Button>
            <Button
              size="sm"
              onClick={() =>
                onSubmit({
                  kind,
                  tag: tag.trim() || null,
                  body: body.trim() || tag.trim() || "(Không có nội dung)",
                })
              }
              className="gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              Gửi tới HS
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
