"use client";

import {
  Activity,
  CalendarClock,
  CheckCircle2,
  ClipboardEdit,
  Clock,
  Eye,
  PencilLine,
  Plus,
  Shield,
  ShieldOff,
  DoorOpen,
  GraduationCap,
  RotateCcw,
  Trash2,
  Users,
} from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

// 5-step wizard is bulky; defer the import until the user actually clicks
// "Tạo ca thi mới".
const ShiftWizard = dynamic(
  () =>
    import("@/features/exam-shifts/dialogs/shift-wizard").then(
      (m) => m.ShiftWizard,
    ),
  { ssr: false, loading: () => null },
);

import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/ui/kpi-card";
import { Select } from "@/components/ui/select";
import { ConfirmActionDialog } from "@/features/admin/users/dialogs/confirm-action-dialog";
import { useCanCreate, useUserScope } from "@/features/auth/lib/use-scope";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { CampusGateBanner } from "@/features/campus/components/campus-gate-banner";
import { useCampusGate } from "@/features/campus/hooks/use-campus-gate";
import { useCampusStore } from "@/features/campus/state/campus-store";
import {
  effectiveShiftStatus,
  type ExamShift,
  type ShiftStatus,
} from "@/features/exam-shifts/data/types";
import { useShiftsStore } from "@/features/exam-shifts/state/shifts-store";
import { buildLockedMessage, shiftInUse } from "@/lib/in-use";

import { useAttemptsStore } from "@/features/shift-exam/state/attempts-store";
import { useUsersStore } from "@/features/admin/users/users-store";
import { useBlueprintsStore } from "@/features/exams/state/blueprints-store";
import { usePackagesStore } from "@/features/exams/state/packages-store";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { AssignGradersDialog } from "@/features/grading/dialogs/assign-graders-dialog";
import { useGradingStore } from "@/features/grading/state/grading-store";
import { useQuestionsStore } from "@/features/question-bank/state/questions-store";
import { isManualGradingType } from "@/features/grading/lib/utils";
import { PageHeader } from "@/features/shell/components/page-header";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<ShiftStatus, string> = {
  draft: "Bản nháp",
  scheduled: "Đã lên lịch",
  "in-progress": "Đang thi",
  completed: "Đã xong",
  cancelled: "Đã huỷ",
};

const STATUS_TONE: Record<ShiftStatus, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  scheduled: "bg-blue-100 text-blue-800 border-blue-200",
  "in-progress": "bg-emerald-100 text-emerald-800 border-emerald-200",
  completed: "bg-violet-100 text-violet-700 border-violet-200",
  cancelled: "bg-rose-100 text-rose-700 border-rose-200",
};

export default function ShiftsPage() {
  const session = useAuthStore((s) => s.session);
  const scope = useUserScope();
  const canCreateShift = useCanCreate("shift");
  const activeCampusId = useCampusStore((s) => s.activeCampusId);
  const allShiftsRaw = useShiftsStore((s) => s.shifts);
  const archiveShift = useShiftsStore((s) => s.archive);
  const restoreShift = useShiftsStore((s) => s.restore);
  const setShiftStatus = useShiftsStore((s) => s.setStatus);
  const [showArchived, setShowArchived] = useState(false);
  // List view hides archived rows by default — see lib/lifecycle.ts.
  // Toggle controlled by the page toolbar lets admins inspect history.
  const shifts = useMemo(
    () =>
      showArchived
        ? allShiftsRaw
        : allShiftsRaw.filter((s) => !s.archivedAt),
    [allShiftsRaw, showArchived],
  );
  const { canMutate } = useCampusGate();
  const grades = useGradesStore((s) => s.grades);
  const allClasses = useGradesStore((s) => s.classes);
  const subjects = useSubjectsStore((s) => s.subjects);
  const packages = usePackagesStore((s) => s.packages);
  const blueprints = useBlueprintsStore((s) => s.blueprints);
  const users = useUsersStore((s) => s.users);
  const allQuestions = useQuestionsStore((s) => s.questions);
  const gradingAssignments = useGradingStore((s) => s.assignments);
  const attempts = useAttemptsStore((s) => s.attempts);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [editing, setEditing] = useState<ExamShift | null>(null);
  // Separate state for read-only viewing. The "Xem" eye icon always
  // works (even for shifts locked by attempt data) — it opens the
  // wizard in a disabled state so the teacher can browse the config
  // without being allowed to save changes.
  const [viewing, setViewing] = useState<ExamShift | null>(null);
  const [deleting, setDeleting] = useState<ExamShift | null>(null);
  // When the user tries to edit/delete an in-progress shift we stash the
  // attempted action here and show the force-stop warning instead. Acting
  // on the warning cancels the shift and opens the deferred dialog.
  const [forceStop, setForceStop] = useState<{
    shift: ExamShift;
    intent: "edit" | "delete";
  } | null>(null);
  // CTA dialog when the user tries to edit a shift that already has
  // attempts. Replaces the prior toast.error so the rule is visible
  // in the same place where the user took the action.
  const [shiftLocked, setShiftLocked] = useState<{
    shift: ExamShift;
    reason: string;
  } | null>(null);
  const [gradingTarget, setGradingTarget] = useState<{
    shift: ExamShift;
    manualCount: number;
  } | null>(null);
  const [statusFilter, setStatusFilter] = useState<ShiftStatus | "all">("all");
  const [gradeFilter, setGradeFilter] = useState<string>("all");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  // 30s tick — rerender so derived statuses transition past startAt/endAt
  // without the user having to refresh. Cheap on this page since shifts
  // list is short and effectiveShiftStatus is O(1).
  const [, setNowTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const campusId =
    session?.role === "superadmin"
      ? activeCampusId ?? null
      : session?.campusId ?? null;

  const scoped = useMemo(() => {
    return shifts.filter((s) => {
      if (campusId && s.campusId !== campusId) return false;
      // Subject/grade scope — teachers only see shifts in their
      // assigned môn/khối. Admin roles (`isUnscoped`) see everything.
      if (!scope.isUnscoped && scope.allowedSubjectIds != null) {
        if (!scope.allowedSubjectIds.has(s.subjectId)) return false;
        if (
          scope.allowedGradeIds != null &&
          !scope.allowedGradeIds.has(s.gradeId)
        ) {
          return false;
        }
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shifts, campusId, scope]);

  const filtered = useMemo(() => {
    const rows = scoped.filter((s) => {
      const eff = effectiveShiftStatus(s);
      if (statusFilter !== "all" && eff !== statusFilter) return false;
      if (gradeFilter !== "all" && s.gradeId !== gradeFilter) return false;
      if (subjectFilter !== "all" && s.subjectId !== subjectFilter) return false;
      if (classFilter !== "all" && !s.classIds.includes(classFilter)) return false;
      if (search.trim()) {
        const t = search.trim().toLowerCase();
        if (
          !s.name.toLowerCase().includes(t) &&
          !s.id.toLowerCase().includes(t)
        )
          return false;
      }
      return true;
    });
    // Newest first by createdAt (then fall back to id) — admins almost
    // always want to see what they just created at the top.
    return rows.slice().sort((a, b) => {
      if (a.createdAt !== b.createdAt) {
        return a.createdAt < b.createdAt ? 1 : -1;
      }
      return a.id < b.id ? 1 : -1;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped, statusFilter, gradeFilter, subjectFilter, classFilter, search]);

  const kpis = useMemo(() => {
    const eff = scoped.map((s) => effectiveShiftStatus(s));
    return {
      total: scoped.length,
      scheduled: eff.filter((s) => s === "scheduled").length,
      inProgress: eff.filter((s) => s === "in-progress").length,
      completed: eff.filter((s) => s === "completed").length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped]);

  function openCreate() {
    setEditing(null);
    setWizardOpen(true);
  }
  function openEdit(s: ExamShift) {
    if (effectiveShiftStatus(s) === "in-progress") {
      setForceStop({ shift: s, intent: "edit" });
      return;
    }
    // Enterprise governance: a shift that has any student attempt
    // (submitted or in-progress) cannot be edited — the questions,
    // scoring, roster, and timing must remain frozen for audit. The
    // CTA invites the user to "create a new shift" instead. Shifts
    // aren't versionable artifacts the way questions are, so we
    // don't auto-clone; we just open the wizard with no editing target.
    const usage = shiftInUse(s.id, attempts);
    if (usage.inUse) {
      setShiftLocked({ shift: s, reason: usage.reason ?? "" });
      return;
    }
    setEditing(s);
    setWizardOpen(true);
  }
  /**
   * Delete permission ladder for a shift. Returns the reason a user is
   * blocked, or `null` if they're allowed.
   *
   * Rules:
   *   - Shift has student results (≥1 submitted attempt):
   *       only campus-admin (matching campusId) or superadmin.
   *   - Shift has NO results yet:
   *       campus-admin of that campus, superadmin, OR the original
   *       creator (shift.ownerId === session.userId). Other roles —
   *       including a different teacher — are blocked.
   *
   * Auditing wins over convenience — a teacher shouldn't be able to wipe
   * a colleague's draft shift unless that colleague is themselves.
   */
  function whyDeleteBlocked(
    s: ExamShift,
    submittedCount: number,
  ): { kind: "with-results" | "not-owner"; attemptCount: number } | null {
    if (!session) return { kind: "not-owner", attemptCount: 0 };
    const isCampusRoot =
      session.role === "superadmin" ||
      (session.role === "campus-admin" && session.campusId === s.campusId);
    if (submittedCount > 0) {
      return isCampusRoot ? null : { kind: "with-results", attemptCount: submittedCount };
    }
    // No results yet — owner or admin only.
    if (isCampusRoot) return null;
    if (s.ownerId === session.userId) return null;
    return { kind: "not-owner", attemptCount: 0 };
  }
  const [deleteBlocked, setDeleteBlocked] = useState<{
    shift: ExamShift;
    kind: "with-results" | "not-owner";
    attemptCount: number;
  } | null>(null);

  function tryDelete(s: ExamShift) {
    if (effectiveShiftStatus(s) === "in-progress") {
      setForceStop({ shift: s, intent: "delete" });
      return;
    }
    const submittedCount = attempts.filter(
      (a) => a.shiftId === s.id && a.submittedAt != null,
    ).length;
    const blocked = whyDeleteBlocked(s, submittedCount);
    if (blocked) {
      setDeleteBlocked({ shift: s, ...blocked });
      return;
    }
    setDeleting(s);
  }

  return (
    <>
      <PageHeader
        title="Ca kíp thi"
        description="Lên lịch ca thi, phân phòng, gán giám thị & cấu hình anti-cheat."
        actions={
          // "Tạo ca thi" is admin-class by default; teachers need the
          // `canCreateShift` permission flag. We use `useCanCreate` to
          // honor both role + per-user override.
          canCreateShift ? (
            <Button
              size="sm"
              onClick={openCreate}
              disabled={!canMutate}
              title={!canMutate ? "Chọn 1 campus để tạo ca thi" : undefined}
            >
              <Plus className="h-4 w-4" />
              Tạo ca thi mới
            </Button>
          ) : null
        }
      />

      <CampusGateBanner />

      <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Tổng ca thi"
          value={kpis.total.toLocaleString("vi-VN")}
          icon={CalendarClock}
          tone="blue"
        />
        <KpiCard
          label="Đã lên lịch"
          value={kpis.scheduled.toLocaleString("vi-VN")}
          icon={Clock}
          tone="orange"
        />
        <KpiCard
          label="Đang thi"
          value={kpis.inProgress.toLocaleString("vi-VN")}
          icon={Shield}
          tone="green"
        />
        <KpiCard
          label="Đã xong"
          value={kpis.completed.toLocaleString("vi-VN")}
          icon={CheckCircle2}
          tone="violet"
        />
      </section>

      <div className="mb-3 flex flex-wrap items-center gap-2.5 rounded-xl border bg-card p-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo tên hoặc mã ca thi…"
          className="h-9 min-w-[220px] flex-1"
        />
        <Select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as ShiftStatus | "all")
          }
          className="h-9 min-w-[140px]"
        >
          <option value="all">Tất cả trạng thái</option>
          <option value="draft">{STATUS_LABEL.draft}</option>
          <option value="scheduled">{STATUS_LABEL.scheduled}</option>
          <option value="in-progress">{STATUS_LABEL["in-progress"]}</option>
          <option value="completed">{STATUS_LABEL.completed}</option>
          <option value="cancelled">{STATUS_LABEL.cancelled}</option>
        </Select>
        <Select
          value={gradeFilter}
          onChange={(e) => {
            setGradeFilter(e.target.value);
            // Cascading filter — reset class so a stale class id from the
            // previous grade can't sneak through and zero out the list.
            setClassFilter("all");
          }}
          className="h-9 min-w-[120px]"
        >
          <option value="all">Khối: Tất cả</option>
          {grades
            .filter((g) =>
              scope.isUnscoped || scope.allowedGradeIds == null
                ? true
                : scope.allowedGradeIds.has(g.id),
            )
            .map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
        </Select>
        <Select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          disabled={gradeFilter === "all"}
          title={
            gradeFilter === "all"
              ? "Chọn khối trước rồi mới lọc theo lớp"
              : undefined
          }
          className="h-9 min-w-[120px] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="all">
            {gradeFilter === "all" ? "Lớp: chọn khối trước" : "Lớp: Tất cả"}
          </option>
          {gradeFilter !== "all" &&
            allClasses
              .filter((c) => (campusId ? c.campusId === campusId : true))
              .filter((c) => c.gradeId === gradeFilter)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
        </Select>
        <Select
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          className="h-9 min-w-[120px]"
        >
          <option value="all">Môn: Tất cả</option>
          {subjects
            .filter((s) => s.status === "active")
            .filter((s) =>
              scope.isUnscoped || scope.allowedSubjectIds == null
                ? true
                : scope.allowedSubjectIds.has(s.id),
            )
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </Select>
        {(gradeFilter !== "all" ||
          classFilter !== "all" ||
          subjectFilter !== "all" ||
          statusFilter !== "all" ||
          search.trim()) && (
          <button
            type="button"
            onClick={() => {
              setGradeFilter("all");
              setClassFilter("all");
              setSubjectFilter("all");
              setStatusFilter("all");
              setSearch("");
            }}
            className="rounded-md border bg-card px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground hover:bg-accent/30"
          >
            ✕ Xoá bộ lọc
          </button>
        )}
        <label className="ml-auto inline-flex items-center gap-1.5 text-[11.5px] font-medium text-muted-foreground">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          Hiển thị đã lưu trữ
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center">
          <p className="text-section-title">Chưa có ca thi nào.</p>
          <p className="text-small mt-1 text-muted-foreground">
            Bấm <span className="font-semibold">“Tạo ca thi mới”</span> để bắt
            đầu lên lịch.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
        <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
        <thead className="bg-muted/30 text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2.5 text-left font-semibold">Mã</th>
            <th className="px-3 py-2.5 text-left font-semibold">Tên ca</th>
            <th className="px-3 py-2.5 text-left font-semibold">Môn · Khối</th>
            <th className="px-3 py-2.5 text-left font-semibold">Thời gian</th>
            <th className="px-3 py-2.5 text-center font-semibold">Quy mô</th>
            <th className="px-3 py-2.5 text-left font-semibold">Bộ đề</th>
            <th className="px-3 py-2.5 text-left font-semibold">Trạng thái</th>
            <th className="px-3 py-2.5 text-right font-semibold">Thao tác</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {filtered.map((sh) => {
            const grade = grades.find((g) => g.id === sh.gradeId);
            const subject = subjects.find((s) => s.id === sh.subjectId);
            const pkg = packages.find((p) => p.id === sh.packageId);
            const bp = pkg
              ? blueprints.find((b) => b.id === pkg.blueprintId)
              : null;
            const classes = allClasses.filter((c) => sh.classIds.includes(c.id));
            // Live student count: prefer the explicit `studentIds` on each
            // room (set by the Step 4 AI / manual assigner) and fall back
            // to deriving from users by className for legacy shifts that
            // pre-date the studentIds field.
            const explicit = new Set(
              sh.rooms.flatMap((r) => r.studentIds ?? []),
            );
            let totalStudents = explicit.size;
            if (totalStudents === 0) {
              const codes = new Set(classes.map((c) => c.code));
              totalStudents = users.filter(
                (u) =>
                  u.role === "student" &&
                  u.status === "active" &&
                  u.campusId === sh.campusId &&
                  u.className != null &&
                  codes.has(u.className),
              ).length;
            }
            const activeAntiCheat = Object.values(sh.antiCheat).filter(Boolean)
              .length;
            const totalAntiCheat = Object.keys(sh.antiCheat).length;
            const proctors = sh.rooms.reduce(
              (s, r) => s + r.proctorIds.length,
              0,
            );
            const eff = effectiveShiftStatus(sh);
            return (
              <tr
                key={sh.id}
                className={cn(
                  "hover:bg-accent/15",
                  sh.archivedAt && "opacity-60",
                )}
              >
                <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">
                  {sh.id}
                </td>
                <td className="px-3 py-2.5">
                  <p className="line-clamp-1 font-semibold text-foreground">
                    {sh.name}
                  </p>
                  <p className="line-clamp-1 text-[11px] text-muted-foreground">
                    GV {sh.ownerName}
                    {activeAntiCheat > 0 && (
                      <>
                        {" · "}
                        <Shield className="inline h-3 w-3" /> {activeAntiCheat}/{totalAntiCheat}
                      </>
                    )}
                  </p>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-1">
                    {subject && (
                      <span
                        className="rounded px-1.5 py-0.5 text-[10.5px] font-semibold"
                        style={{
                          backgroundColor: `${subject.color}1A`,
                          color: subject.color,
                        }}
                      >
                        {subject.name}
                      </span>
                    )}
                    {grade && (
                      <span className="rounded bg-foreground/8 px-1.5 py-0.5 text-[10.5px]">
                        {grade.code}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-foreground/80">
                  <p>{formatDateTime(sh.startAt)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    → {formatDateTime(sh.endAt)}
                  </p>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-center gap-1.5 text-[12px] text-foreground/80">
                    <span
                      className="inline-flex cursor-help items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-blue-50"
                      title={`Số lớp được giao: ${classes.length}`}
                      aria-label={`${classes.length} lớp được giao`}
                    >
                      <GraduationCap className="h-3.5 w-3.5 text-blue-600" />
                      <span className="font-semibold">{classes.length}</span>
                    </span>
                    <span
                      className="inline-flex cursor-help items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-violet-50"
                      title={`Số học sinh: ${totalStudents}`}
                      aria-label={`${totalStudents} học sinh`}
                    >
                      <Users className="h-3.5 w-3.5 text-violet-600" />
                      <span className="font-semibold">{totalStudents}</span>
                    </span>
                    <span
                      className="inline-flex cursor-help items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-emerald-50"
                      title={`Số phòng thi: ${sh.rooms.length}`}
                      aria-label={`${sh.rooms.length} phòng thi`}
                    >
                      <DoorOpen className="h-3.5 w-3.5 text-emerald-600" />
                      <span className="font-semibold">{sh.rooms.length}</span>
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-foreground/80">
                  {pkg ? (
                    <>
                      <p className="line-clamp-1">{pkg.name}</p>
                      {bp && (
                        <p className="line-clamp-1 text-[11px] text-muted-foreground">
                          Khung: {bp.name}
                        </p>
                      )}
                    </>
                  ) : (
                    <span className="text-meta">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={cn(
                      "rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]",
                      STATUS_TONE[eff],
                    )}
                  >
                    {STATUS_LABEL[eff]}
                  </span>
                  {sh.archivedAt ? (
                    <span className="ml-1 rounded-md border border-zinc-300 bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
                      🗄
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-end gap-1">
                      {(() => {
                        // Count essay/ai-generated questions in this shift's
                        // blueprint topics so we know whether to surface the
                        // grading-assignment button.
                        if (!pkg || !bp) return null;
                        const ids = bp.topics.flatMap(
                          (t) => t.pickedQuestionIds,
                        );
                        const manualCount = ids
                          .map((id) => allQuestions.find((q) => q.id === id))
                          .filter(
                            (q): q is NonNullable<typeof q> =>
                              !!q && isManualGradingType(q.type),
                          ).length;
                        if (manualCount === 0) return null;
                        const assignedCount = gradingAssignments.filter(
                          (a) => a.shiftId === sh.id,
                        ).length;
                        // Khảo thí rule: only assign graders after the
                        // shift ENDS. Before then there's no submitted
                        // attempt to grade and graders shouldn't see
                        // the question pool early either.
                        const isCompleted =
                          effectiveShiftStatus(sh) === "completed";
                        return (
                          <button
                            type="button"
                            onClick={() => {
                              if (!isCompleted) return;
                              setGradingTarget({ shift: sh, manualCount });
                            }}
                            disabled={!isCompleted}
                            title={
                              isCompleted
                                ? `Phân công chấm — ${manualCount} câu tự luận`
                                : "Chỉ phân công chấm sau khi ca thi kết thúc"
                            }
                            className={cn(
                              "relative inline-flex h-7 w-7 items-center justify-center rounded-md border transition",
                              isCompleted
                                ? "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100"
                                : "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed",
                              isCompleted &&
                                assignedCount === 0 &&
                                "animate-pulse",
                            )}
                          >
                            <ClipboardEdit
                              className="h-3.5 w-3.5"
                              strokeWidth={2}
                            />
                            {isCompleted && assignedCount > 0 && (
                              <span className="absolute -right-1 -top-1 inline-flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-violet-600 px-1 text-[9px] font-bold text-white">
                                {assignedCount}
                              </span>
                            )}
                          </button>
                        );
                      })()}
                      {(() => {
                        // Mirror the monitor page gate: only assigned
                        // proctors + admin-class roles can enter. Render
                        // a disabled badge for everyone else so the
                        // teacher understands why they can't click.
                        const isAdminClass =
                          session?.role === "superadmin" ||
                          session?.role === "academic-director" ||
                          session?.role === "campus-admin";
                        const isProctor =
                          session != null &&
                          sh.rooms.some((r) =>
                            r.proctorIds.includes(session.userId),
                          );
                        const canMonitor = isAdminClass || isProctor;
                        if (!canMonitor) {
                          return (
                            <span
                              title="Chỉ giám thị được phân công + Admin mới vào phòng giám sát"
                              className="inline-flex h-7 w-7 cursor-not-allowed items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-400"
                            >
                              <Activity
                                className="h-3.5 w-3.5"
                                strokeWidth={2}
                              />
                            </span>
                          );
                        }
                        return (
                          <Link
                            href={`/admin/shifts/${sh.id}/monitor`}
                            title="Giám sát thi (live)"
                            className={cn(
                              "inline-flex h-7 w-7 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100",
                              effectiveShiftStatus(sh) === "in-progress" &&
                                "ring-2 ring-emerald-300 ring-offset-1",
                            )}
                          >
                            <Activity
                              className="h-3.5 w-3.5"
                              strokeWidth={2}
                            />
                          </Link>
                        );
                      })()}
                      <IconButton
                        size="sm"
                        title="Xem chi tiết (chỉ đọc)"
                        onClick={() => setViewing(sh)}
                      >
                        <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </IconButton>
                      <IconButton
                        size="sm"
                        variant="primary"
                        title="Sửa ca thi"
                        onClick={() => openEdit(sh)}
                      >
                        <PencilLine className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </IconButton>
                      {sh.archivedAt ? (
                        <IconButton
                          size="sm"
                          variant="primary"
                          title="Khôi phục ca thi đã lưu trữ"
                          onClick={() => {
                            if (!session) return;
                            restoreShift(sh.id, session.userId);
                          }}
                        >
                          <RotateCcw
                            className="h-3.5 w-3.5"
                            strokeWidth={1.75}
                          />
                        </IconButton>
                      ) : (
                        <IconButton
                          size="sm"
                          variant="destructive"
                          title={
                            effectiveShiftStatus(sh) === "in-progress"
                              ? "Ca đang diễn ra — phải dừng trước"
                              : "Lưu trữ ca thi"
                          }
                          onClick={() => tryDelete(sh)}
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </IconButton>
                      )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
        </table>
        </div>
        </div>
      )}

      <ShiftWizard
        open={wizardOpen}
        onOpenChange={(o) => {
          setWizardOpen(o);
          if (!o) setEditing(null);
        }}
        editing={editing}
      />

      {/* Read-only viewer — reuses the wizard with all inputs disabled
          and Save buttons hidden. Lets teachers browse a locked
          shift's configuration without bypassing the integrity gate. */}
      <ShiftWizard
        open={viewing != null}
        onOpenChange={(o) => {
          if (!o) setViewing(null);
        }}
        editing={viewing}
        readOnly
      />

      <ConfirmActionDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        variant="destructive"
        title="Xoá ca thi?"
        description={
          deleting ? (
            (() => {
              const attemptCount = attempts.filter(
                (a) => a.shiftId === deleting.id,
              ).length;
              if (attemptCount > 0) {
                return (
                  <>
                    🔒 <b>Không thể xoá ca thi này.</b> Đã có{" "}
                    <b>{attemptCount}</b> lượt làm bài của học sinh được ghi
                    nhận. Dữ liệu thi của HS không được phép xoá để bảo toàn
                    minh chứng / kết quả. Có thể đổi trạng thái sang "Đã huỷ"
                    để ẩn ca thi khỏi danh sách hoạt động.
                  </>
                );
              }
              return (
                <>
                  <span className="font-mono">{deleting.id}</span> ·{" "}
                  {deleting.name}. Hành động không thể hoàn tác.
                </>
              );
            })()
          ) : (
            ""
          )
        }
        confirmLabel="Xoá ca thi"
        disableConfirm={
          deleting
            ? attempts.some((a) => a.shiftId === deleting.id)
            : false
        }
        onConfirm={() => {
          if (!deleting || !session) return;
          const hasData = attempts.some((a) => a.shiftId === deleting.id);
          if (hasData) return;
          // Soft-archive instead of hard delete. Audit trail captures
          // who did it; admins can restore from the "đã lưu trữ" tab.
          archiveShift(
            deleting.id,
            session.userId,
            "Admin xoá từ danh sách ca thi",
          );
        }}
      />

      {gradingTarget && (
        <AssignGradersDialog
          open={Boolean(gradingTarget)}
          onOpenChange={(o) => !o && setGradingTarget(null)}
          shift={gradingTarget.shift}
          manualQuestionCount={gradingTarget.manualCount}
        />
      )}

      <ConfirmActionDialog
        open={Boolean(forceStop)}
        onOpenChange={(o) => !o && setForceStop(null)}
        variant="destructive"
        title="⛔ Ca thi đang diễn ra — không thể sửa/xoá"
        description={
          forceStop ? (
            <div className="space-y-3">
              <p>
                Ca{" "}
                <span className="font-mono">{forceStop.shift.id}</span> ·{" "}
                <span className="font-semibold text-foreground/85">
                  {forceStop.shift.name}
                </span>{" "}
                đang trong khoảng thời gian thi.
              </p>
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-[12px] text-rose-900">
                <p className="font-semibold">
                  ⚠ Dừng toàn bộ ca sẽ tác động ngay tới học sinh đang thi:
                </p>
                <ul className="ml-5 mt-1 list-disc space-y-0.5">
                  <li>
                    Toàn bộ HS đang làm bài bị <b>buộc submit ngay</b> ở câu hiện tại.
                  </li>
                  <li>
                    Ca chuyển sang trạng thái <b>"Đã huỷ"</b> — không khôi phục được.
                  </li>
                  <li>
                    Sau khi dừng, bạn mới có thể{" "}
                    {forceStop.intent === "edit" ? "chỉnh sửa" : "xoá"} ca.
                  </li>
                </ul>
              </div>
              <p className="text-[12px] text-muted-foreground">
                Nếu chỉ muốn xem lại cấu hình, hãy dùng nút "Giám sát thi" (icon
                hoạt động) — không cần dừng ca.
              </p>
            </div>
          ) : (
            ""
          )
        }
        confirmLabel="Dừng ca thi ngay"
        onConfirm={() => {
          if (!forceStop) return;
          setShiftStatus(forceStop.shift.id, "cancelled");
          // After cancelling, jump straight into the user's original action
          // since the shift is now "cancelled" (no longer in-progress).
          const next = forceStop;
          setForceStop(null);
          // Re-read the latest shift snapshot from the store to make sure
          // the dialog opens against the now-cancelled record.
          const latest = useShiftsStore
            .getState()
            .shifts.find((x) => x.id === next.shift.id);
          if (!latest) return;
          if (next.intent === "edit") {
            setEditing(latest);
            setWizardOpen(true);
          } else {
            setDeleting(latest);
          }
        }}
      />

      <ConfirmActionDialog
        open={Boolean(shiftLocked)}
        onOpenChange={(o) => !o && setShiftLocked(null)}
        variant="default"
        title="🔒 Ca thi đã có học sinh làm bài — không thể chỉnh sửa"
        description={
          shiftLocked ? (
            <>
              {buildLockedMessage({ inUse: true, reason: shiftLocked.reason })}
              <div className="mt-2 rounded-md bg-muted/40 px-3 py-2 text-[11.5px] text-muted-foreground">
                Ca thi không có khái niệm "phiên bản v2" — nếu cần sửa
                đề, hãy tạo ca thi mới và phân HS sang ca đó. Ca cũ vẫn
                giữ nguyên kết quả cho audit.
              </div>
            </>
          ) : (
            ""
          )
        }
        confirmLabel="Tạo ca thi mới"
        onConfirm={() => {
          if (!shiftLocked) return;
          setShiftLocked(null);
          setEditing(null);
          setWizardOpen(true);
        }}
      />

      {/* Delete denied — branch by reason. Two paths: (a) ca có kết quả,
          (b) ca chưa có kết quả nhưng user không phải owner/admin. */}
      <ConfirmActionDialog
        open={Boolean(deleteBlocked)}
        onOpenChange={(o) => !o && setDeleteBlocked(null)}
        title={
          deleteBlocked?.kind === "with-results"
            ? "🔒 Không thể xoá ca thi đã có kết quả"
            : "🔒 Không có quyền xoá ca thi này"
        }
        description={
          deleteBlocked ? (
            <div className="space-y-2">
              <p>
                Ca{" "}
                <span className="font-mono">{deleteBlocked.shift.id}</span> ·{" "}
                <span className="font-semibold text-foreground/85">
                  {deleteBlocked.shift.name}
                </span>
                {deleteBlocked.kind === "with-results" ? (
                  <>
                    {" "}đã có <b>{deleteBlocked.attemptCount} bài làm</b> của
                    học sinh.
                  </>
                ) : (
                  <>
                    {" "}do <b>{deleteBlocked.shift.ownerName}</b> tạo —
                    bạn không phải người tạo và cũng không phải Admin campus.
                  </>
                )}
              </p>
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                {deleteBlocked.kind === "with-results" ? (
                  <>
                    ⚠ Để bảo toàn dữ liệu khảo thí, chỉ{" "}
                    <b>Admin gốc của campus</b> (hoặc{" "}
                    <b>Superadmin hệ thống</b>) mới được phép xoá ca thi đã có
                    kết quả. Liên hệ admin campus để xử lý nếu thực sự cần.
                  </>
                ) : (
                  <>
                    ⚠ Ca thi chưa có kết quả chỉ được{" "}
                    <b>chính người tạo</b> hoặc <b>Admin campus / Superadmin</b>{" "}
                    xoá. Tránh tình huống GV này lỡ tay xoá ca của GV khác.
                  </>
                )}
              </div>
              <p className="text-[12px] text-muted-foreground">
                Tài khoản hiện tại: <b>{session?.role ?? "—"}</b>
                {session?.role === "campus-admin" &&
                  session.campusId !== deleteBlocked.shift.campusId &&
                  " (khác campus với ca thi)"}
                .
              </p>
            </div>
          ) : (
            ""
          )
        }
        confirmLabel="Đã hiểu"
        onConfirm={() => setDeleteBlocked(null)}
      />
    </>
  );
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  } catch {
    return iso;
  }
}
