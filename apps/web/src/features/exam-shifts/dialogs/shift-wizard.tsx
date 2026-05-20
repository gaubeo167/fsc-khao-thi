"use client";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  GraduationCap,
  Package2,
  Plus,
  Save,
  Shield,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  Wand2,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Question } from "@/features/question-bank/data/seed-questions";

// Heavy dialog — lazy-load so the wizard mount stays light.
const ViewQuestionDialog = dynamic(
  () =>
    import("@/features/question-bank/dialogs/view-question-dialog").then(
      (m) => m.ViewQuestionDialog,
    ),
  { ssr: false },
);

/** Pretty one-line preview of a question content for tables / lists.
 *  Strips authoring markers ([u:...], [zone:N], [blank:N], media, math
 *  delimiters) so the snippet reads like prose. */
function questionSnippet(content: string): string {
  return content
    .replace(/\[u:([^\]\n]+)\]/g, "$1")
    .replace(/\[zone:\d+\]/g, "___")
    .replace(/\[blank:\d+\]/g, "___")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "[ảnh]")
    .replace(/\[(video|audio):[^\]]+\]/g, "[$1]")
    .replace(/\$\$([\s\S]*?)\$\$/g, "$1")
    .replace(/\$([^$\n]+)\$/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
import { useUserScope } from "@/features/auth/lib/use-scope";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useCampusStore } from "@/features/campus/state/campus-store";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { useUsersStore } from "@/features/admin/users/users-store";
import { useBlueprintsStore } from "@/features/exams/state/blueprints-store";
import { useGeneratedStore } from "@/features/exams/state/generated-store";
import { usePackagesStore } from "@/features/exams/state/packages-store";
import type {
  ExamBlueprint,
  ExamPackage,
} from "@/features/exams/data/types";
import { useQuestionsStore } from "@/features/question-bank/state/questions-store";
import { materializeExamForm } from "@/features/exam-forms/lib/materialize";
import { useExamFormsStore } from "@/features/exam-forms/state/exam-forms-store";
import { cn } from "@/lib/utils";

import {
  DEFAULT_ANTI_CHEAT,
  DEFAULT_RESULT_VISIBILITY,
  DEFAULT_SCORING,
  type AntiCheatConfig,
  type ExamShift,
  type RoomAssignMode,
  type ScoringConfig,
  type ScoringMode,
  type ShiftRoom,
  type StudentResultVisibility,
} from "../data/types";
import {
  countByDifficulty,
  difficultyScorePreview,
  formatScore,
  sumManualPerQuestion,
} from "../lib/scoring";
import { gradeNumber, tierForGrade } from "../lib/grade-tier";
import { useShiftsStore } from "../state/shifts-store";

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
  editing?: ExamShift | null;
}

type StepId = 1 | 2 | 3 | 4 | 5;

const STEPS: Array<{
  id: StepId;
  title: string;
  subtitle: string;
  icon: typeof GraduationCap;
}> = [
  { id: 1, title: "Đối tượng", subtitle: "Khối · Môn · Lớp", icon: GraduationCap },
  { id: 2, title: "Bộ đề", subtitle: "Chọn gói đề", icon: Package2 },
  { id: 3, title: "Lịch thi", subtitle: "Giờ mở/đóng", icon: Calendar },
  { id: 4, title: "Phòng & GT", subtitle: "Phòng thi · Giám thị", icon: Users },
  { id: 5, title: "Cấu hình", subtitle: "Anti-cheat & xác nhận", icon: Shield },
];

interface WizardState {
  name: string;
  gradeId: string;
  subjectId: string;
  classIds: string[];
  /** Explicit per-shift roster — uids of students who can take this
   *  exam. Auto-seeded from "every student in selected classes" when
   *  classes change, then admin can untick individuals in Step 1's
   *  roster panel. Step 4 auto-distributes ONLY these students into
   *  rooms — anyone unticked never sees the shift. */
  selectedStudentIds: string[];
  packageId: string;
  startAt: string; // datetime-local format
  endAt: string;
  lateJoinMinutes: number;
  rooms: ShiftRoom[];
  /** Default capacity used when the AI auto-creator generates new rooms
   *  in Step 4. Editable per-room afterwards. */
  roomCapacity: number;
  /** Strategy used to order students before the AI distributes them
   *  across rooms in Step 4. */
  assignMode: RoomAssignMode;
  /** Scoring policy for the exam — max total + how points distribute. */
  scoring: ScoringConfig;
  /** What students see on the result page after the shift ends. */
  studentResultVisibility: StudentResultVisibility;
  antiCheat: AntiCheatConfig;
}

function emptyState(): WizardState {
  // Default start: tomorrow 8AM. End: +90min.
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(8, 0, 0, 0);
  const end = new Date(start.getTime() + 90 * 60 * 1000);
  return {
    name: "",
    gradeId: "",
    subjectId: "",
    classIds: [],
    selectedStudentIds: [],
    packageId: "",
    startAt: toDatetimeLocal(start),
    endAt: toDatetimeLocal(end),
    lateJoinMinutes: 10,
    // Start with NO rooms — Step 4 asks the user to choose between
    // ⚡ auto-create or manual add, and an auto-seeded "P201" would
    // confuse that flow.
    rooms: [],
    roomCapacity: 30,
    assignMode: "alphabet",
    scoring: { ...DEFAULT_SCORING },
    studentResultVisibility: DEFAULT_RESULT_VISIBILITY,
    antiCheat: { ...DEFAULT_ANTI_CHEAT },
  };
}

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function newRoomId(): string {
  return `room-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Default number of variants ("đề") to materialize when freezing an
 * exam form. Four is the conventional VN-school cap (Đề 001-004); the
 * Phase D version-chain UI will let admins override per-shift.
 */
const DEFAULT_VARIANT_COUNT = 4;

interface MaterializeArgs {
  shiftId: string;
  pkgId: string;
  scoring: ScoringConfig;
  campusId: string | null;
  actorUid: string;
  isEdit: boolean;
  packages: ExamPackage[];
  blueprints: ExamBlueprint[];
  allQuestions: Question[];
}

/**
 * Build the immutable exam form for a shift and save it. On edits we
 * first archive the previous active form so analytics / past attempts
 * still resolve, but new students get the latest snapshot.
 */
async function materializeAndSave(args: MaterializeArgs): Promise<void> {
  const pkg = args.packages.find((p) => p.id === args.pkgId);
  if (!pkg) {
    throw new Error(
      `materializeAndSave: package ${args.pkgId} not in store`,
    );
  }
  const blueprint = args.blueprints.find((b) => b.id === pkg.blueprintId);
  if (!blueprint) {
    throw new Error(
      `materializeAndSave: blueprint ${pkg.blueprintId} not in store`,
    );
  }
  // Filter the question pool the same way the legacy exam page did:
  // approved + matching campus. Subject/grade filtering happens
  // implicitly through the blueprint's pickedQuestionIds.
  const pickedSet = new Set(
    blueprint.topics.flatMap((t) => t.pickedQuestionIds),
  );
  const pool = args.allQuestions.filter(
    (q) =>
      pickedSet.has(q.id) &&
      q.status === "approved" &&
      (args.campusId ? q.campusId === args.campusId : true),
  );
  if (pool.length === 0) {
    throw new Error(
      "materializeAndSave: empty question pool after filtering",
    );
  }
  const formId = `form_${args.shiftId}_${Date.now().toString(36)}`;
  const form = materializeExamForm({
    shiftId: args.shiftId,
    campusId: args.campusId,
    blueprint,
    pkg,
    questionPool: pool,
    variantCount: DEFAULT_VARIANT_COUNT,
    scoring: args.scoring,
    actorUid: args.actorUid,
    formId,
  });

  const store = useExamFormsStore.getState();
  if (args.isEdit) {
    await store.archiveForShift(
      args.shiftId,
      "Replaced by republish from shift wizard",
    );
  }
  await store.saveForm(form);
}

export function ShiftWizard({ open, onOpenChange, editing }: Props) {
  const session = useAuthStore((s) => s.session);
  const activeCampusId = useCampusStore((s) => s.activeCampusId);
  const grades = useGradesStore((s) => s.grades);
  const allClasses = useGradesStore((s) => s.classes);
  const subjects = useSubjectsStore((s) => s.subjects);
  const packages = usePackagesStore((s) => s.packages);
  const blueprints = useBlueprintsStore((s) => s.blueprints);
  const generated = useGeneratedStore((s) => s.generated);
  const users = useUsersStore((s) => s.users);
  const allQuestions = useQuestionsStore((s) => s.questions);
  const createShift = useShiftsStore((s) => s.create);
  const updateShift = useShiftsStore((s) => s.update);

  const campusId =
    session?.role === "superadmin"
      ? activeCampusId ?? null
      : session?.campusId ?? null;

  const [step, setStep] = useState<StepId>(1);
  const [state, setState] = useState<WizardState>(emptyState);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setStep(1);
    if (editing) {
      // Reconstruct selectedStudentIds from existing rooms so the
      // Step 1 roster panel reflects what's actually frozen on the
      // shift.
      const existingStudentIds = Array.from(
        new Set(editing.rooms.flatMap((r) => r.studentIds ?? [])),
      );
      setState({
        name: editing.name,
        gradeId: editing.gradeId,
        subjectId: editing.subjectId,
        classIds: editing.classIds,
        selectedStudentIds: existingStudentIds,
        packageId: editing.packageId,
        startAt: toDatetimeLocal(new Date(editing.startAt)),
        endAt: toDatetimeLocal(new Date(editing.endAt)),
        lateJoinMinutes: editing.lateJoinMinutes,
        // Back-fill legacy rooms that pre-date the `studentIds` field
        // so the new UI doesn't crash on `undefined.length`.
        rooms: editing.rooms.map((r) => ({
          ...r,
          studentIds: r.studentIds ?? [],
        })),
        roomCapacity:
          editing.rooms[0]?.capacity && editing.rooms[0].capacity > 0
            ? editing.rooms[0].capacity
            : 30,
        assignMode: "alphabet",
        scoring: editing.scoring ?? { ...DEFAULT_SCORING },
        studentResultVisibility:
          editing.studentResultVisibility ?? DEFAULT_RESULT_VISIBILITY,
        antiCheat: editing.antiCheat,
      });
    } else {
      setState(emptyState());
    }
  }, [open, editing]);

  // Derived data ------------------------------------------------------------
  const subjectsForGrade = useMemo(() => {
    if (!state.gradeId) return [];
    return subjects.filter((s) => {
      if (s.status !== "active") return false;
      if (s.gradeIds.length > 0 && !s.gradeIds.includes(state.gradeId))
        return false;
      // Per-campus subject setup: if the subject restricts to a campus list,
      // the shift's campus must be in that list.
      if (
        campusId &&
        s.campusIds &&
        s.campusIds.length > 0 &&
        !s.campusIds.includes(campusId)
      ) {
        return false;
      }
      return true;
    });
  }, [subjects, state.gradeId, campusId]);

  const classesForCampus = useMemo(() => {
    return allClasses.filter(
      (c) =>
        c.status === "active" &&
        c.gradeId === state.gradeId &&
        (campusId ? c.campusId === campusId : true),
    );
  }, [allClasses, state.gradeId, campusId]);

  // Normalise reference ids before comparison so old corrupt data with
  // trailing dashes or stray whitespace ("grade-5-", " grade-5 ") still
  // matches `state.gradeId` ("grade-5"). The persist migrations strip these
  // too, but the in-memory normalisation is a belt-and-suspenders so the
  // user doesn't see a broken filter while the migration races on first
  // mount.
  const norm = (s: string | null | undefined) =>
    (s ?? "").trim().replace(/[-\s]+$/g, "");
  const stateGradeId = norm(state.gradeId);
  const stateSubjectId = norm(state.subjectId);
  const stateCampusId = norm(campusId);

  // Filter strategy — STRICT on every dimension the user picked in step 1.
  // (Earlier this was lenient on `subject` to work around stale grade ids
  // with trailing dashes; that data was healed by `data-heal.ts` and the
  // leniency now actively confuses users — picking Văn K1 shouldn't
  // surface Toán K1 packages.)
  const gradeScopedApprovedPackages = useMemo(() => {
    return packages.filter((p) => {
      if (p.status !== "approved") return false;
      const bp = blueprints.find((b) => b.id === p.blueprintId);
      if (!bp) return false;
      if (stateCampusId && norm(bp.campusId) !== stateCampusId) return false;
      if (stateGradeId && norm(bp.gradeId) !== stateGradeId) return false;
      if (stateSubjectId && norm(bp.subjectId) !== stateSubjectId) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packages, blueprints, stateCampusId, stateGradeId, stateSubjectId]);

  // Pending packages — same scope — for the empty-state hint so we can
  // tell the user "you have one but it's still waiting approval".
  const gradeScopedPendingPackages = useMemo(() => {
    return packages.filter((p) => {
      if (p.status === "approved") return false;
      const bp = blueprints.find((b) => b.id === p.blueprintId);
      if (!bp) return false;
      if (stateCampusId && norm(bp.campusId) !== stateCampusId) return false;
      if (stateGradeId && norm(bp.gradeId) !== stateGradeId) return false;
      if (stateSubjectId && norm(bp.subjectId) !== stateSubjectId) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packages, blueprints, stateCampusId, stateGradeId, stateSubjectId]);

  // With strict subject filtering above, every entry in
  // `gradeScopedApprovedPackages` already matches the picked subject, so
  // the "exact match" set is just the full list. Kept for back-compat
  // with Step2Package which expects this prop.
  const exactMatchPackageIds = useMemo(() => {
    return new Set(gradeScopedApprovedPackages.map((p) => p.id));
  }, [gradeScopedApprovedPackages]);

  // Auto-name suggestion
  useEffect(() => {
    if (state.name) return;
    if (!state.subjectId || !state.gradeId) return;
    const subj = subjects.find((s) => s.id === state.subjectId);
    const gr = grades.find((g) => g.id === state.gradeId);
    if (subj && gr) {
      setState((s) => ({
        ...s,
        name: `Ca thi ${subj.name} — ${gr.name}`,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.subjectId, state.gradeId]);

  // Validation per step
  function validate(s: StepId): string | null {
    if (s >= 1) {
      if (!state.gradeId) return "Hãy chọn khối.";
      if (!state.subjectId) return "Hãy chọn môn.";
      if (state.classIds.length === 0) return "Chọn ít nhất 1 lớp.";
    }
    if (s >= 2) {
      if (!state.packageId) return "Chọn 1 bộ đề đã duyệt.";
      if (!state.scoring.maxScore || state.scoring.maxScore <= 0) {
        return "Điểm tối đa phải > 0.";
      }
      if (state.scoring.mode === "manual") {
        // Validate sum PER VARIANT — each generated đề must sum to
        // maxScore. (Older code summed the whole blueprint pool, which
        // gave a false negative when the package had multiple đề and
        // each was independently balanced.)
        const pkg = packages.find((p) => p.id === state.packageId);
        const variants = pkg
          ? generated.filter((g) => g.packageId === pkg.id)
          : [];
        if (variants.length > 0) {
          for (const v of variants) {
            const sum = sumManualPerQuestion(state.scoring, v.questionIds);
            const diff = Math.abs(sum - state.scoring.maxScore);
            if (diff > 0.001) {
              return `${v.name}: tổng điểm thủ công (${formatScore(sum)}) phải bằng điểm tối đa (${formatScore(state.scoring.maxScore)}).`;
            }
          }
        } else {
          // No đề generated yet → fall back to the blueprint pool
          // check so legacy / pre-generation flows still validate.
          const bp = pkg
            ? blueprints.find((b) => b.id === pkg.blueprintId)
            : null;
          if (bp) {
            const ids = bp.topics.flatMap((t) => t.pickedQuestionIds);
            const sum = sumManualPerQuestion(state.scoring, ids);
            const diff = Math.abs(sum - state.scoring.maxScore);
            if (diff > 0.001) {
              return `Tổng điểm thủ công trên pool (${formatScore(sum)}) phải bằng điểm tối đa (${formatScore(state.scoring.maxScore)}). Sinh đề trước để validate theo từng đề.`;
            }
          }
        }
      }
    }
    if (s >= 3) {
      if (!state.startAt) return "Chưa nhập giờ mở.";
      if (!state.endAt) return "Chưa nhập giờ đóng.";
      if (new Date(state.endAt).getTime() <= new Date(state.startAt).getTime()) {
        return "Giờ đóng phải sau giờ mở.";
      }
    }
    if (s >= 4) {
      if (state.rooms.length === 0) return "Khai báo ít nhất 1 phòng thi.";
      const emptyName = state.rooms.find((r) => !r.name.trim());
      if (emptyName) return "Có phòng thiếu tên.";

      // Student-level checks: no double-booking, every student assigned,
      // every room has at least 1 proctor.
      //
      // "Every student" here means the roster ticked in Step 1 — HS
      // unticked don't need a room. Empty selectedStudentIds = legacy
      // flow (no roster picker yet) → fall back to "everyone in the
      // selected classes".
      const explicitRoster = new Set(state.selectedStudentIds);
      const allStudents = users.filter((u) => {
        if (u.role !== "student" || u.status !== "active") return false;
        if (campusId && u.campusId !== campusId) return false;
        if (state.selectedStudentIds.length > 0) {
          return explicitRoster.has(u.id);
        }
        return allClasses.some(
          (c) =>
            state.classIds.includes(c.id) && c.code === u.className,
        );
      });
      const seen = new Set<string>();
      for (const r of state.rooms) {
        for (const sid of r.studentIds ?? []) {
          if (seen.has(sid)) {
            const dupe = users.find((u) => u.id === sid)?.name ?? sid;
            return `HS "${dupe}" được gán vào nhiều phòng.`;
          }
          seen.add(sid);
        }
      }
      const unassignedHS = allStudents.filter((s) => !seen.has(s.id));
      if (unassignedHS.length > 0) {
        return `Còn ${unassignedHS.length} HS chưa được gán phòng.`;
      }
      const noProctor = state.rooms.find((r) => r.proctorIds.length === 0);
      if (noProctor) {
        return `Phòng "${noProctor.name}" chưa gán giám thị.`;
      }
    }
    return null;
  }

  function handleNext() {
    const err = validate(step);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setStep((s) => (s < 5 ? ((s + 1) as StepId) : s));
  }

  function handleBack() {
    setError(null);
    setStep((s) => (s > 1 ? ((s - 1) as StepId) : s));
  }

  function handleSubmit() {
    for (const s of [1, 2, 3, 4, 5] as StepId[]) {
      const err = validate(s);
      if (err) {
        setError(err);
        setStep(s);
        return;
      }
    }
    if (!session) {
      setError("Phiên đăng nhập không hợp lệ.");
      return;
    }

    const payload = {
      name: state.name.trim() || "Ca thi chưa đặt tên",
      gradeId: state.gradeId,
      subjectId: state.subjectId,
      classIds: state.classIds,
      packageId: state.packageId,
      startAt: new Date(state.startAt).toISOString(),
      endAt: new Date(state.endAt).toISOString(),
      lateJoinMinutes: Number(state.lateJoinMinutes) || 0,
      rooms: state.rooms,
      scoring: state.scoring,
      studentResultVisibility: state.studentResultVisibility,
      antiCheat: state.antiCheat,
      campusId,
      ownerId: session.userId,
      ownerName: session.name ?? "—",
      status: "scheduled" as const,
    };
    let shiftId: string;
    if (editing) {
      updateShift(editing.id, payload);
      shiftId = editing.id;
    } else {
      const created = createShift(payload);
      shiftId = created.id;
    }

    // Materialize the exam form (frozen snapshot of questions + scoring)
    // so the runtime never reads live /questions for this shift. If
    // editing, archive any old form for this shift first — Phase D will
    // chain versions; for now the latest form wins.
    void materializeAndSave({
      shiftId,
      pkgId: payload.packageId,
      scoring: payload.scoring ?? {
        maxScore: 10,
        mode: "even" as const,
        difficultyWeights: { easy: 1, medium: 1.5, hard: 2 },
      },
      campusId: payload.campusId,
      actorUid: session.userId,
      isEdit: Boolean(editing),
      packages,
      blueprints,
      allQuestions,
    }).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[shift-wizard] materialize failed", err);
      // The shift itself was written successfully; the form failure
      // doesn't roll back. The exam page falls back to live mode +
      // shows a banner so the teacher knows to retry.
    });
    onOpenChange(false);
  }

  // Step renderers ----------------------------------------------------------
  const stepBody = (() => {
    switch (step) {
      case 1:
        return (
          <Step1Targets
            state={state}
            setState={setState}
            grades={grades}
            subjects={subjectsForGrade}
            classes={classesForCampus}
            campusId={campusId}
          />
        );
      case 2:
        return (
          <Step2Package
            state={state}
            setState={setState}
            packages={gradeScopedApprovedPackages}
            exactMatchIds={exactMatchPackageIds}
            pendingCount={gradeScopedPendingPackages.length}
            blueprints={blueprints}
            subjects={subjects}
            grades={grades}
            allPackages={packages}
            campusId={campusId}
          />
        );
      case 3:
        return <Step3Schedule state={state} setState={setState} />;
      case 4:
        return (
          <Step4Rooms
            state={state}
            setState={setState}
            classes={allClasses}
            users={users}
            campusId={campusId}
          />
        );
      case 5:
        return (
          <Step5Config
            state={state}
            setState={setState}
            grades={grades}
            subjects={subjects}
            classes={allClasses}
            packages={packages}
            users={users}
          />
        );
    }
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl p-0 max-h-[96vh] overflow-y-auto"
        srDescription="Hộp thoại tạo hoặc chỉnh sửa ca thi — gồm các bước chọn đối tượng, bộ đề, lịch thi, phòng/giám thị và cấu hình anti-cheat."
      >
        <header className="flex items-start gap-3 border-b px-6 py-4 pr-12">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-200">
            <Calendar className="h-5 w-5" strokeWidth={1.85} />
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-section-title">
              {editing ? "Sửa ca thi" : "Tạo ca thi mới"}
            </DialogTitle>
            <p className="text-meta mt-0.5">
              Lên lịch & cấu hình ca thi cho học sinh
            </p>
          </div>
        </header>

        {/* Stepper */}
        <div className="px-6 pt-4">
          <ol className="flex flex-wrap items-stretch gap-2">
            {STEPS.map((s) => {
              const Icon = s.icon;
              const active = step === s.id;
              const done = step > s.id;
              return (
                <li key={s.id} className="flex-1 min-w-[140px]">
                  <button
                    type="button"
                    onClick={() => {
                      // Only allow jumping back, not skipping forward.
                      if (s.id <= step) setStep(s.id);
                    }}
                    className={cn(
                      "flex h-full w-full items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors",
                      active
                        ? "border-primary bg-primary/8"
                        : done
                          ? "border-emerald-300 bg-emerald-50"
                          : "border-border bg-card text-foreground/70",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[12px] font-bold",
                        active
                          ? "bg-primary text-white"
                          : done
                            ? "bg-emerald-500 text-white"
                            : "bg-muted text-foreground/70",
                      )}
                    >
                      {done ? <Check className="h-3.5 w-3.5" /> : s.id}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-foreground">
                        <Icon className="mr-1 inline h-3 w-3" strokeWidth={1.85} />
                        {s.title}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">
                        {s.subtitle}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="px-6 py-5">{stepBody}</div>

        {error && (
          <div className="mx-6 mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
            <AlertTriangle className="mr-1 inline h-3.5 w-3.5" /> {error}
          </div>
        )}

        <footer className="flex items-center justify-between border-t bg-[var(--color-surface-2)] px-6 py-3.5">
          <Button
            type="button"
            variant="outline"
            onClick={step === 1 ? () => onOpenChange(false) : handleBack}
          >
            {step === 1 ? <X className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
            {step === 1 ? "Huỷ" : "Quay lại"}
          </Button>
          {step < 5 ? (
            <Button type="button" onClick={handleNext}>
              Tiếp theo
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" onClick={handleSubmit}>
              <Save className="h-4 w-4" />
              {editing ? "Lưu thay đổi" : "Tạo ca thi"}
            </Button>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}

/* ───────── Step 1 — Đối tượng ───────── */

function Step1Targets({
  state,
  setState,
  grades,
  subjects,
  classes,
  campusId,
}: {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
  grades: ReturnType<typeof useGradesStore.getState>["grades"];
  subjects: ReturnType<typeof useSubjectsStore.getState>["subjects"];
  classes: ReturnType<typeof useGradesStore.getState>["classes"];
  campusId: string | null;
}) {
  // Always render 12 grade slots so missing grades (e.g. 1-5 in the seed)
  // still appear and visually communicate the school's full layout — we just
  // disable the ones that don't exist in `grades`.
  const allGradeIds = Array.from({ length: 12 }, (_, i) => `grade-${i + 1}`);

  // Teachers are scoped to their assigned subjects + grades — they
  // can't create a shift for a subject / grade they don't teach.
  const scope = useUserScope();

  function selectGrade(gid: string) {
    if (gid === state.gradeId) return;
    setState((s) => ({ ...s, gradeId: gid, subjectId: "", classIds: [] }));
  }

  function toggleClass(cid: string) {
    setState((s) => ({
      ...s,
      classIds: s.classIds.includes(cid)
        ? s.classIds.filter((c) => c !== cid)
        : [...s.classIds, cid],
    }));
  }

  function selectAllClasses() {
    setState((s) => ({ ...s, classIds: classes.map((c) => c.id) }));
  }
  function clearClasses() {
    setState((s) => ({ ...s, classIds: [] }));
  }

  // Live student count per class — same logic as /admin/grades. The
  // legacy `class.studentCount` field has drifted in many demos, so we
  // derive from the users store at render time.
  const usersList = useUsersStore((s) => s.users);
  const liveStudentCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of classes) {
      m.set(
        c.id,
        usersList.filter(
          (u) =>
            u.role === "student" &&
            u.status === "active" &&
            u.className === c.code &&
            (campusId ? u.campusId === campusId : true),
        ).length,
      );
    }
    return m;
  }, [classes, usersList, campusId]);

  return (
    <div className="space-y-5">
      {/* Grade selector */}
      <section className="rounded-xl border bg-surface-2/40 p-4">
        <p className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-foreground/85">
          🎓 Chọn khối <span className="text-destructive">*</span>
        </p>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
          {allGradeIds.map((gid) => {
            const num = gradeNumber(gid) ?? 0;
            const tier = tierForGrade(gid);
            const exists = grades.some((g) => g.id === gid);
            // Scope gating — block grades outside the user's teaching
            // assignment. Admin-class roles (`isUnscoped`) keep full
            // access. Empty `allowedGradeIds` for a non-admin = no grade
            // restriction within their assigned subjects.
            const inScope =
              scope.isUnscoped ||
              scope.allowedGradeIds == null ||
              scope.allowedGradeIds.has(gid);
            const enabled = exists && inScope;
            const active = state.gradeId === gid;
            return (
              <button
                key={gid}
                type="button"
                disabled={!enabled}
                onClick={() => selectGrade(gid)}
                title={
                  !exists
                    ? "Khối này chưa được tạo trong campus"
                    : !inScope
                      ? "Bạn chưa được phân công khối này"
                      : undefined
                }
                className={cn(
                  "relative rounded-xl border-2 px-2 py-2.5 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  active
                    ? "border-primary bg-primary/8"
                    : "border-border bg-card hover:border-primary/40 hover:bg-accent/30",
                )}
              >
                {exists && !inScope && !scope.isUnscoped && (
                  <span className="absolute -right-1 -top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-100 text-[8px]">
                    🔒
                  </span>
                )}
                <span
                  className={cn(
                    "inline-flex h-7 w-9 items-center justify-center rounded-md text-[13px] font-bold tabular-nums",
                    active
                      ? "bg-primary text-white"
                      : "bg-primary-soft text-primary-text",
                  )}
                >
                  {num}
                </span>
                <p className="mt-1 text-[12px] font-semibold text-foreground">
                  Khối {num}
                </p>
                <p className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                  {tier}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Subject selector */}
      <section className="rounded-xl border bg-surface-2/40 p-4">
        <p className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-foreground/85">
          📚 Chọn môn <span className="text-destructive">*</span>
          {state.gradeId && (
            <span className="text-meta font-normal">
              — {subjects.length} môn áp dụng cho{" "}
              {grades.find((g) => g.id === state.gradeId)?.name ?? ""}
            </span>
          )}
        </p>
        {!state.gradeId ? (
          <p className="rounded-md border border-dashed bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
            Chọn khối ở phía trên để xem danh sách môn.
          </p>
        ) : subjects.length === 0 ? (
          <p className="rounded-md border border-dashed bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
            Khối này chưa khai báo môn học nào.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {subjects.map((subj) => {
              const active = state.subjectId === subj.id;
              const inScope =
                scope.isUnscoped ||
                (scope.allowedSubjectIds != null &&
                  scope.allowedSubjectIds.has(subj.id));
              return (
                <button
                  key={subj.id}
                  type="button"
                  disabled={!inScope}
                  onClick={() =>
                    inScope &&
                    setState((s) => ({ ...s, subjectId: subj.id }))
                  }
                  title={
                    inScope
                      ? undefined
                      : "Bạn chưa được phân công môn này"
                  }
                  className={cn(
                    "relative rounded-xl border-2 px-3 py-2 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                    active
                      ? "border-primary bg-primary/8"
                      : "border-border bg-card hover:border-primary/40 hover:bg-accent/30",
                  )}
                >
                  {!inScope && !scope.isUnscoped && (
                    <span className="absolute -right-1 -top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-100 text-[8px]">
                      🔒
                    </span>
                  )}
                  <p
                    className="text-[14px] font-bold tracking-wide"
                    style={{ color: subj.color }}
                  >
                    {subj.code ?? subj.name.slice(0, 3).toUpperCase()}
                  </p>
                  <p className="text-[12px] font-semibold text-foreground">
                    {subj.name}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Class selector */}
      <section className="rounded-xl border bg-surface-2/40 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-foreground/85">
            🏫 Chọn lớp <span className="text-destructive">*</span>
            <span className="text-meta font-normal">
              — {classes.length} lớp{campusId ? ` tại campus hiện tại` : ""}
            </span>
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={selectAllClasses}>
              <Check className="h-3.5 w-3.5" />
              Chọn tất cả
            </Button>
            <Button size="sm" variant="outline" onClick={clearClasses}>
              Bỏ chọn
            </Button>
          </div>
        </div>
        {!state.gradeId ? (
          <p className="rounded-md border border-dashed bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
            Chọn khối ở trên trước.
          </p>
        ) : classes.length === 0 ? (
          <p className="rounded-md border border-dashed bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
            Không có lớp nào thuộc khối này tại campus hiện tại.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {classes.map((c) => {
              const checked = state.classIds.includes(c.id);
              return (
                <li key={c.id}>
                  <label
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 rounded-lg border-2 bg-card px-3 py-2 transition-colors",
                      checked
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40 hover:bg-accent/30",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleClass(c.id)}
                      className="h-4 w-4 accent-[var(--color-primary)]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-foreground">
                        {c.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {liveStudentCount.get(c.id) ?? 0} HS ·{" "}
                        {c.homeroomTeacher || "Chưa phân công"}
                      </p>
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Roster picker — students of each selected class, tick-all by
          default. Frozen at create time so HS thêm vào lớp sau đó
          không tự vào được ca thi. */}
      {state.classIds.length > 0 && (
        <RosterPicker
          classes={classes}
          classIds={state.classIds}
          selectedStudentIds={state.selectedStudentIds}
          campusId={campusId}
          onChange={(ids) =>
            setState((s) => ({ ...s, selectedStudentIds: ids }))
          }
        />
      )}
    </div>
  );
}

/* ───────── Roster picker — student checklist per class ───────── */

function RosterPicker({
  classes,
  classIds,
  selectedStudentIds,
  campusId,
  onChange,
}: {
  classes: ReturnType<typeof useGradesStore.getState>["classes"];
  classIds: string[];
  selectedStudentIds: string[];
  campusId: string | null;
  onChange(next: string[]): void;
}) {
  const users = useUsersStore((s) => s.users);
  // Group active students by class.code so the picker matches the
  // existing `user.className === class.code` join.
  const selectedClasses = useMemo(
    () => classes.filter((c) => classIds.includes(c.id)),
    [classes, classIds],
  );
  const studentsByClass = useMemo(() => {
    const map = new Map<
      string,
      Array<{ id: string; name: string; studentCode?: string }>
    >();
    for (const c of selectedClasses) {
      const list = users
        .filter(
          (u) =>
            u.role === "student" &&
            u.status === "active" &&
            u.className === c.code &&
            (campusId ? u.campusId === campusId : true),
        )
        .sort((a, b) => a.name.localeCompare(b.name, "vi"))
        .map((u) => ({ id: u.id, name: u.name, studentCode: u.studentCode }));
      map.set(c.id, list);
    }
    return map;
  }, [selectedClasses, users, campusId]);

  // Seed selectedStudentIds with "everyone in selected classes" when
  // the selection is still empty for a class. Don't overwrite ticks
  // the admin already adjusted.
  useEffect(() => {
    const allEligible = new Set<string>();
    for (const list of studentsByClass.values())
      for (const s of list) allEligible.add(s.id);
    // Filter out ticked HS that left the eligible set (class was
    // unticked) so they don't sneak back in.
    const prunedExisting = selectedStudentIds.filter((id) =>
      allEligible.has(id),
    );
    // Add anyone not yet in the picked set whose class was *newly*
    // added. We detect "newly added" by checking if NO HS from that
    // class is ticked yet — then auto-tick all of them.
    const next = new Set(prunedExisting);
    for (const [, list] of studentsByClass) {
      const anyTicked = list.some((s) => next.has(s.id));
      if (!anyTicked) for (const s of list) next.add(s.id);
    }
    const arr = Array.from(next);
    // Only commit when something changed (avoid infinite re-render).
    if (
      arr.length !== selectedStudentIds.length ||
      arr.some((id, i) => id !== selectedStudentIds[i])
    ) {
      onChange(arr);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentsByClass]);

  function toggle(id: string) {
    onChange(
      selectedStudentIds.includes(id)
        ? selectedStudentIds.filter((x) => x !== id)
        : [...selectedStudentIds, id],
    );
  }
  function tickAll(classId: string) {
    const list = studentsByClass.get(classId) ?? [];
    const next = new Set(selectedStudentIds);
    for (const s of list) next.add(s.id);
    onChange(Array.from(next));
  }
  function untickAll(classId: string) {
    const list = studentsByClass.get(classId) ?? [];
    const ids = new Set(list.map((s) => s.id));
    onChange(selectedStudentIds.filter((id) => !ids.has(id)));
  }

  const totalEligible = Array.from(studentsByClass.values()).reduce(
    (a, l) => a + l.length,
    0,
  );

  return (
    <section className="rounded-xl border bg-surface-2/40 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-foreground/85">
          👥 Học sinh được vào thi
          <span className="text-meta font-normal">
            — {selectedStudentIds.length} / {totalEligible} HS được chọn
          </span>
        </p>
        <p className="text-[11px] text-muted-foreground">
          Bỏ tick để loại HS khỏi ca thi này. Roster frozen — HS thêm vào lớp
          sau khi tạo ca thi sẽ KHÔNG tự vào thi.
        </p>
      </div>

      {selectedClasses.length === 0 ? (
        <p className="rounded-md border border-dashed bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
          Chọn lớp ở trên trước.
        </p>
      ) : (
        <div className="space-y-3">
          {selectedClasses.map((c) => {
            const list = studentsByClass.get(c.id) ?? [];
            const tickedCount = list.filter((s) =>
              selectedStudentIds.includes(s.id),
            ).length;
            return (
              <div key={c.id} className="rounded-lg border bg-card p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[12.5px] font-semibold text-foreground/85">
                    🏫 {c.name}{" "}
                    <span className="text-muted-foreground font-normal">
                      — {tickedCount} / {list.length} HS
                    </span>
                  </p>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => tickAll(c.id)}
                      className="rounded-md border bg-card px-2 py-0.5 text-[11px] font-semibold hover:bg-accent/30"
                    >
                      Tick all
                    </button>
                    <button
                      type="button"
                      onClick={() => untickAll(c.id)}
                      className="rounded-md border bg-card px-2 py-0.5 text-[11px] font-semibold hover:bg-accent/30"
                    >
                      Bỏ tick
                    </button>
                  </div>
                </div>
                {list.length === 0 ? (
                  <p className="rounded-md border border-dashed bg-muted/20 px-3 py-1.5 text-[11.5px] text-muted-foreground">
                    Lớp chưa có HS active.
                  </p>
                ) : (
                  <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    {list.map((s) => {
                      const checked = selectedStudentIds.includes(s.id);
                      return (
                        <li key={s.id}>
                          <label
                            className={cn(
                              "flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 transition-colors",
                              checked
                                ? "border-primary bg-primary/5"
                                : "border-border bg-card hover:border-primary/40",
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggle(s.id)}
                              className="h-3.5 w-3.5 accent-[var(--color-primary)]"
                            />
                            <span className="min-w-0 flex-1 truncate text-[12.5px]">
                              {s.name}
                              {s.studentCode && (
                                <span className="ml-1 text-[10.5px] text-muted-foreground">
                                  ({s.studentCode})
                                </span>
                              )}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ───────── Step 2 — Bộ đề ───────── */

function Step2Package({
  state,
  setState,
  packages,
  exactMatchIds,
  pendingCount,
  blueprints,
  subjects,
  grades,
  allPackages,
  campusId,
}: {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
  packages: ReturnType<typeof usePackagesStore.getState>["packages"];
  exactMatchIds: Set<string>;
  pendingCount: number;
  blueprints: ReturnType<typeof useBlueprintsStore.getState>["blueprints"];
  subjects: ReturnType<typeof useSubjectsStore.getState>["subjects"];
  grades: ReturnType<typeof useGradesStore.getState>["grades"];
  allPackages: ReturnType<typeof usePackagesStore.getState>["packages"];
  campusId: string | null;
}) {
  // With strict subject filtering, `packages` only contains exact matches
  // (same grade + subject + campus + approved). Keep one list. The
  // `exactMatchIds` prop is retained for back-compat but no longer drives
  // a split.
  void exactMatchIds; // back-compat — strict filter makes this trivially equal to packages

  if (packages.length === 0) {
    // Diagnostic: surface why the strict filter returned nothing.
    const subjName =
      subjects.find((s) => s.id === state.subjectId)?.name ?? "—";
    const gradeName = grades.find((g) => g.id === state.gradeId)?.name ?? "—";
    // Approved packages in the same campus + grade but DIFFERENT subject —
    // common case where user picked Văn K1 but only Toán K1 packages exist.
    const sameGradeSameCampusOtherSubject = allPackages.filter((p) => {
      if (p.status !== "approved") return false;
      const bp = blueprints.find((b) => b.id === p.blueprintId);
      if (!bp) return false;
      if (campusId && bp.campusId !== campusId) return false;
      if (state.gradeId && bp.gradeId !== state.gradeId) return false;
      return bp.subjectId !== state.subjectId;
    });
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-dashed bg-muted/20 px-5 py-8 text-center">
          <p className="text-section-title">
            Không có bộ đề đã duyệt cho{" "}
            <span className="text-foreground">
              {subjName} · {gradeName}
            </span>
          </p>
          {pendingCount > 0 ? (
            <p className="text-meta mt-1">
              Có{" "}
              <span className="font-semibold text-amber-700">
                {pendingCount} gói đề
              </span>{" "}
              khớp môn + khối này đang ở trạng thái{" "}
              <span className="font-semibold">Chờ duyệt</span> / Từ chối. Vào{" "}
              <a
                href="/admin/approvals"
                className="font-semibold text-primary underline"
              >
                Phê duyệt → Gói đề
              </a>{" "}
              để duyệt trước rồi quay lại bước này.
            </p>
          ) : sameGradeSameCampusOtherSubject.length > 0 ? (
            <p className="text-meta mt-1">
              Khối <b>{gradeName}</b> đã có{" "}
              <span className="font-semibold">
                {sameGradeSameCampusOtherSubject.length} gói đề duyệt
              </span>{" "}
              cho môn khác (
              {Array.from(
                new Set(
                  sameGradeSameCampusOtherSubject
                    .map((p) => {
                      const bp = blueprints.find(
                        (b) => b.id === p.blueprintId,
                      );
                      return bp
                        ? subjects.find((s) => s.id === bp.subjectId)?.name
                        : null;
                    })
                    .filter(Boolean),
                ),
              ).join(", ")}
              ) — nhưng chưa có cho môn{" "}
              <b>{subjName}</b>. Tạo gói đề cho môn này ở{" "}
              <a
                href="/admin/exam-blueprints"
                className="font-semibold text-primary underline"
              >
                Khung đề & Gói đề
              </a>
              .
            </p>
          ) : (
            <p className="text-meta mt-1">
              Chưa có gói đề{" "}
              <span className="font-semibold">đã duyệt</span> nào cho{" "}
              {subjName} · {gradeName}. Tạo ở{" "}
              <a
                href="/admin/exam-blueprints"
                className="font-semibold text-primary underline"
              >
                Khung đề & Gói đề
              </a>
              , đợi Admin duyệt, rồi quay lại đây.
            </p>
          )}
        </div>

        {/* Show approved packages for the same grade across other subjects
            so the user can quickly tell "wrong subject was picked" vs
            "no package exists at all". */}
        {sameGradeSameCampusOtherSubject.length > 0 && (
          <div className="rounded-xl border bg-card p-3 text-[12px] text-foreground/75">
            <p className="mb-2 font-semibold text-foreground/85">
              Khối {grades.find((g) => g.id === state.gradeId)?.name ?? "—"}{" "}
              có gói đã duyệt ở các môn khác:
            </p>
            <ul className="ml-3 list-disc space-y-0.5">
              {sameGradeSameCampusOtherSubject.slice(0, 10).map((p) => {
                const bp = blueprints.find((b) => b.id === p.blueprintId);
                const subj = bp
                  ? subjects.find((s) => s.id === bp.subjectId)
                  : null;
                return (
                  <li key={p.id}>
                    {p.name}{" "}
                    <span className="text-muted-foreground">
                      — môn <b>{subj?.name ?? "?"}</b>
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-muted-foreground">
              Nếu bạn muốn dùng một trong các gói trên, quay lại bước 1 và
              đổi sang môn tương ứng.
            </p>
          </div>
        )}
      </div>
    );
  }

  function pickPackage(packageId: string) {
    const p = packages.find((x) => x.id === packageId);
    const bp = p ? blueprints.find((b) => b.id === p.blueprintId) : null;
    setState((s) => ({
      ...s,
      packageId,
      // Re-sync subject + grade from the picked package's blueprint so
      // step 5's summary and step 4's class filtering stay consistent
      // regardless of what the user picked in step 1.
      subjectId: bp?.subjectId ?? s.subjectId,
      gradeId: bp?.gradeId ?? s.gradeId,
    }));
  }

  const subjName = subjects.find((s) => s.id === state.subjectId)?.name ?? "—";
  const gradeName = grades.find((g) => g.id === state.gradeId)?.name ?? "—";
  return (
    <div className="space-y-4">
      <p className="text-[12px] text-muted-foreground">
        Chỉ hiển thị các gói đề <span className="font-semibold">đã duyệt</span>{" "}
        khớp đúng <span className="font-semibold">{subjName}</span> ·{" "}
        <span className="font-semibold">{gradeName}</span> đã chọn ở bước 1.
      </p>

      <PackageList
        title={`Gói đã duyệt cho ${subjName} · ${gradeName} (${packages.length})`}
        highlighted
        packages={packages}
        state={state}
        blueprints={blueprints}
        subjects={subjects}
        grades={grades}
        pickPackage={pickPackage}
      />

      {state.packageId && (
        <ScoringPanel state={state} setState={setState} />
      )}
    </div>
  );
}

/* ───────── Scoring panel (Step 2.5 — thang điểm) ───────── */

function ScoringPanel({
  state,
  setState,
}: {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
}) {
  // Resolve the picked package's blueprint to enumerate its question pool
  // for the manual-mode list and to count by difficulty for previews.
  const packages = usePackagesStore((s) => s.packages);
  const blueprints = useBlueprintsStore((s) => s.blueprints);
  const allQuestions = useQuestionsStore((s) => s.questions);

  const pkg = packages.find((p) => p.id === state.packageId);
  const bp = pkg ? blueprints.find((b) => b.id === pkg.blueprintId) : null;
  // Generated exams (đề 001 / 002 …) for this package. The user wants
  // to set điểm per đề so each variant must show only its own
  // questions. Falls back to the blueprint pool if no đề has been
  // generated yet (the wizard can still be configured pre-generation).
  const generated = useGeneratedStore((s) => s.generated);
  const variants = useMemo(() => {
    if (!pkg) return [];
    return generated
      .filter((g) => g.packageId === pkg.id)
      .sort((a, b) => a.name.localeCompare(b.name, "vi", { numeric: true }));
  }, [generated, pkg]);
  const [activeVariantId, setActiveVariantId] = useState<string>("");
  useEffect(() => {
    if (variants.length > 0 && !variants.some((v) => v.id === activeVariantId)) {
      setActiveVariantId(variants[0]!.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variants.map((v) => v.id).join("|")]);
  const activeVariant = variants.find((v) => v.id === activeVariantId) ?? null;

  // Pool = the questions actually answered by the student for the
  // selected đề. When no đề exists yet, fall back to the blueprint
  // pool so the wizard is still usable.
  const pool = useMemo(() => {
    const ids = activeVariant
      ? activeVariant.questionIds
      : bp
        ? bp.topics.flatMap((t) => t.pickedQuestionIds)
        : [];
    return ids
      .map((id) => allQuestions.find((q) => q.id === id))
      .filter((q): q is NonNullable<typeof q> => !!q);
  }, [activeVariant, bp, allQuestions]);

  // Difficulty counts. With a generated đề active, count its actual
  // questions. Otherwise project from the package matrix so the
  // weights table reflects the "câu / đề" the student will see, not
  // the entire blueprint pool.
  const diffCounts = useMemo(() => {
    if (activeVariant) return countByDifficulty(pool);
    if (pkg) {
      return pkg.matrix.reduce(
        (acc, row) => ({
          easy: acc.easy + row.easyCount,
          medium: acc.medium + row.mediumCount,
          hard: acc.hard + row.hardCount,
        }),
        { easy: 0, medium: 0, hard: 0 },
      );
    }
    return countByDifficulty(pool);
  }, [activeVariant, pkg, pool]);
  const scoring = state.scoring;
  // Number of câu per đề the student actually takes. With a generated
  // variant selected, that's exactly questionIds.length. Without a
  // variant (pre-generation) we fall back to the package matrix sum
  // — that's the "câu/đề" the package guarantees per generated đề.
  const perExamCount = useMemo(() => {
    if (activeVariant) return activeVariant.questionIds.length;
    if (!pkg) return pool.length;
    return pkg.matrix.reduce(
      (acc, row) => acc + row.easyCount + row.mediumCount + row.hardCount,
      0,
    );
  }, [activeVariant, pkg, pool.length]);
  // For chia đều / theo độ khó: divide by perExamCount, not pool.length.
  // For thủ công: pool.length when no đề (admin manages full pool) OR
  // perExamCount when a đề is active (admin sees only that đề's 8 câu).
  const divisorForEvenSplit = perExamCount > 0 ? perExamCount : pool.length;
  // Which question (if any) is currently being viewed in the detail
  // dialog. Click the eye icon on a row → set to that question →
  // ViewQuestionDialog opens with full content.
  const [viewing, setViewing] = useState<Question | null>(null);

  function patchScoring(next: Partial<ScoringConfig>) {
    setState((s) => ({ ...s, scoring: { ...s.scoring, ...next } }));
  }
  function setMode(mode: ScoringMode) {
    setState((s) => {
      const draft: ScoringConfig = { ...s.scoring, mode };
      if (mode === "by-difficulty" && !draft.difficultyWeights) {
        draft.difficultyWeights = { easy: 1, medium: 1.5, hard: 2 };
      }
      if (mode === "manual" && !draft.perQuestion) {
        // Initial split = even on pool so user only adjusts deltas.
        const each =
          pool.length > 0 ? draft.maxScore / pool.length : 0;
        const init: Record<string, number> = {};
        for (const q of pool) init[q.id] = Math.round(each * 100) / 100;
        draft.perQuestion = init;
      }
      return { ...s, scoring: draft };
    });
  }

  const preview = difficultyScorePreview(scoring, pool);
  // Manual mode: sum the per-question scores ONLY for the currently-
  // visible đề (or the blueprint pool if no đề generated). Tổng của
  // mỗi đề phải = maxScore — tabs above show per-variant validity.
  const manualSum =
    scoring.mode === "manual" ? sumManualPerQuestion(scoring, pool.map((q) => q.id)) : 0;
  const manualValid =
    scoring.mode !== "manual" ||
    Math.abs(manualSum - scoring.maxScore) < 0.001;

  return (
    <section className="rounded-xl border bg-card p-4">
      <header className="mb-3">
        <h3 className="text-section-title">⚖ Thang điểm bộ đề</h3>
        <p className="text-meta mt-0.5">
          Đặt tổng điểm tối đa của ca thi và cách phân bổ cho từng câu.
        </p>
      </header>

      {/* Variant picker — when the package has generated đề, the user
          picks each one and sets điểm for it. Câu trùng giữa các đề tự
          dùng chung điểm (perQuestion là 1 map shared) — admin chỉ cần
          setup câu mới ở đề kế tiếp. */}
      {variants.length > 0 && (
        <div className="mb-3 rounded-lg border bg-card p-2">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
              Chọn đề để chấm điểm
            </p>
            <p className="text-[11px] text-muted-foreground">
              {variants.length} đề · điểm câu trùng tự share giữa các đề
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {variants.map((v) => {
              const variantSum = v.questionIds.reduce(
                (acc, qid) => acc + (scoring.perQuestion?.[qid] ?? 0),
                0,
              );
              const variantValid =
                scoring.mode !== "manual" ||
                Math.abs(variantSum - scoring.maxScore) < 0.001;
              const isActive = v.id === activeVariantId;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setActiveVariantId(v.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] font-semibold transition",
                    isActive
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card hover:bg-accent/30",
                  )}
                >
                  {v.name}
                  {scoring.mode === "manual" && (
                    <span
                      className={cn(
                        "inline-flex h-4 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[9.5px] font-bold",
                        isActive
                          ? "bg-white/25 text-white"
                          : variantValid
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-rose-100 text-rose-700",
                      )}
                    >
                      {variantValid ? "✓" : "✗"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Max score — preset 10 / 100 / Khác (custom input). */}
      <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
        <div>
          <Label className="text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
            Điểm tối đa
          </Label>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {[10, 100].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => patchScoring({ maxScore: preset })}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-[12px] font-semibold transition",
                  scoring.maxScore === preset
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card hover:bg-accent/30",
                )}
              >
                {preset}
              </button>
            ))}
            <span className="flex items-center gap-1 rounded-md border bg-card px-2 py-1">
              <span className="text-[11px] font-semibold text-muted-foreground">
                Khác
              </span>
              <Input
                type="number"
                min={1}
                max={1000}
                step={0.5}
                value={scoring.maxScore}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v > 0) patchScoring({ maxScore: v });
                }}
                className="h-7 w-20 text-center text-[12px]"
              />
            </span>
          </div>
        </div>

        <div>
          <Label className="text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
            Chế độ phân bổ
          </Label>
          <div className="mt-1 grid grid-cols-3 gap-1.5">
            {(
              [
                { v: "even", label: "Chia đều", desc: "Mọi câu cùng điểm" },
                {
                  v: "by-difficulty",
                  label: "Theo độ khó",
                  desc: "Dễ < TB < Khó",
                },
                {
                  v: "manual",
                  label: "Thủ công",
                  desc: "Tự đặt mỗi câu",
                },
              ] as Array<{ v: ScoringMode; label: string; desc: string }>
            ).map((opt) => (
              <button
                key={opt.v}
                type="button"
                onClick={() => setMode(opt.v)}
                className={cn(
                  "rounded-md border px-2 py-1.5 text-center transition",
                  scoring.mode === opt.v
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                    : "border-border bg-card hover:bg-accent/30",
                )}
              >
                <p className="text-[12px] font-semibold">{opt.label}</p>
                <p className="text-[10.5px] text-muted-foreground">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Mode-specific config */}
      <div className="mt-4">
        {scoring.mode === "even" && (
          <div className="rounded-md border bg-muted/30 px-3 py-2.5 text-[12px]">
            <p>
              Mỗi câu trong đề ={" "}
              <span className="font-semibold text-foreground">
                {formatScore(scoring.maxScore / Math.max(1, divisorForEvenSplit))}{" "}
                điểm
              </span>{" "}
              · {divisorForEvenSplit} câu/đề ×{" "}
              {formatScore(scoring.maxScore / Math.max(1, divisorForEvenSplit))} ={" "}
              <b>{formatScore(scoring.maxScore)} điểm</b>
            </p>
          </div>
        )}

        {scoring.mode === "by-difficulty" && (
          <div className="space-y-2.5">
            <p className="text-[11px] text-muted-foreground">
              Đặt tỉ lệ trọng số tương đối — hệ thống tự chia điểm tối đa
              theo tỉ lệ này × số câu mỗi mức.
            </p>
            <ul className="grid gap-2 sm:grid-cols-3">
              {(
                [
                  {
                    k: "easy",
                    label: "Dễ",
                    color: "emerald",
                    count: diffCounts.easy,
                  },
                  {
                    k: "medium",
                    label: "Trung bình",
                    color: "amber",
                    count: diffCounts.medium,
                  },
                  {
                    k: "hard",
                    label: "Khó",
                    color: "rose",
                    count: diffCounts.hard,
                  },
                ] as Array<{
                  k: "easy" | "medium" | "hard";
                  label: string;
                  color: string;
                  count: number;
                }>
              ).map((row) => (
                <li
                  key={row.k}
                  className="rounded-lg border bg-card px-3 py-2"
                >
                  <p
                    className={cn(
                      "text-[11px] font-bold uppercase tracking-[0.06em]",
                      row.color === "emerald"
                        ? "text-emerald-700"
                        : row.color === "amber"
                          ? "text-amber-700"
                          : "text-rose-700",
                    )}
                  >
                    {row.label} ({row.count} câu)
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">
                      Trọng số:
                    </span>
                    <Input
                      type="number"
                      min={0}
                      step={0.25}
                      value={scoring.difficultyWeights?.[row.k] ?? 1}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (!Number.isFinite(v) || v < 0) return;
                        patchScoring({
                          difficultyWeights: {
                            ...(scoring.difficultyWeights ?? {
                              easy: 1,
                              medium: 1.5,
                              hard: 2,
                            }),
                            [row.k]: v,
                          },
                        });
                      }}
                      className="h-8 w-20"
                    />
                  </div>
                  <p className="mt-1.5 text-[11.5px]">
                    Mỗi câu{" "}
                    <span className="font-semibold">
                      {formatScore(preview[row.k])} đ
                    </span>
                  </p>
                </li>
              ))}
            </ul>
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-900">
              ✓ Tổng mỗi đề:{" "}
              <span className="font-bold">
                {formatScore(scoring.maxScore)} điểm
              </span>{" "}
              ({diffCounts.easy} dễ × {formatScore(preview.easy)} đ +{" "}
              {diffCounts.medium} TB × {formatScore(preview.medium)} đ +{" "}
              {diffCounts.hard} khó × {formatScore(preview.hard)} đ
              {" "}= {diffCounts.easy + diffCounts.medium + diffCounts.hard} câu/đề){" "}
              <span className="font-semibold">— đủ thang điểm</span>
            </p>
          </div>
        )}

        {scoring.mode === "manual" && (
          <div className="space-y-2">
            <p className="rounded-md border border-blue-200 bg-blue-50/60 px-3 py-2 text-[11.5px] text-blue-900">
              {activeVariant ? (
                <>
                  <b>📋 Đang chấm điểm {activeVariant.name}</b> ({pool.length}{" "}
                  câu). Câu trùng với đề khác đã có điểm từ trước —{" "}
                  <b>tự fill</b>, chỉ cần setup câu mới.{" "}
                  <b>Tổng đề này phải = {formatScore(scoring.maxScore)} đ</b>.
                </>
              ) : (
                <>
                  <b>💡 Pool gồm {pool.length} câu</b> — bộ đề chưa sinh đề cụ
                  thể, đang setup điểm trên toàn ngân hàng blueprint.{" "}
                  <b>Tổng phải = {formatScore(scoring.maxScore)} đ</b>.
                </>
              )}
            </p>
            <ul className="max-h-[300px] space-y-1.5 overflow-y-auto rounded-md border bg-muted/20 p-2">
              {pool.map((q, idx) => (
                <li
                  key={q.id}
                  className="flex items-center gap-2 rounded-md bg-card px-2 py-1.5"
                >
                  <span className="w-7 text-right text-[11px] font-semibold text-muted-foreground">
                    {idx + 1}.
                  </span>
                  <span
                    className={cn(
                      "rounded-full border px-1.5 py-0 text-[9.5px] font-bold uppercase",
                      q.difficulty === "easy"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : q.difficulty === "medium"
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-rose-200 bg-rose-50 text-rose-700",
                    )}
                  >
                    {q.difficulty === "easy"
                      ? "Dễ"
                      : q.difficulty === "medium"
                        ? "TB"
                        : "Khó"}
                  </span>
                  <p
                    className="min-w-0 flex-1 truncate text-[11.5px] text-foreground/85"
                    title={questionSnippet(q.content)}
                  >
                    {questionSnippet(q.content) || (
                      <span className="italic text-muted-foreground">
                        (chưa có nội dung)
                      </span>
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => setViewing(q)}
                    title="Xem chi tiết câu hỏi"
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <Eye className="h-3.5 w-3.5" strokeWidth={1.85} />
                  </button>
                  <Input
                    type="number"
                    min={0}
                    step={0.25}
                    value={scoring.perQuestion?.[q.id] ?? 0}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (!Number.isFinite(v) || v < 0) return;
                      patchScoring({
                        perQuestion: {
                          ...(scoring.perQuestion ?? {}),
                          [q.id]: v,
                        },
                      });
                    }}
                    className="h-7 w-20 text-right text-[12px]"
                  />
                  <span className="text-[10px] text-muted-foreground">đ</span>
                </li>
              ))}
            </ul>
            <div
              className={cn(
                "rounded-md border px-3 py-2 text-[12.5px]",
                manualValid
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-rose-300 bg-rose-50 text-rose-900",
              )}
            >
              Tổng đang đặt:{" "}
              <span className="font-semibold">{formatScore(manualSum)} đ</span>{" "}
              / {formatScore(scoring.maxScore)} đ —{" "}
              {manualValid ? (
                <b>✓ Hợp lệ</b>
              ) : (
                <b>
                  ✗ Lệch {formatScore(Math.abs(manualSum - scoring.maxScore))} đ
                  · không tiến tiếp được đến khi cân = max
                </b>
              )}
              {!manualValid && (
                <button
                  type="button"
                  onClick={() => {
                    // Auto-normalise the per-question scores so sum =
                    // maxScore. Multiplicative scaling preserves
                    // relative weights the user already set.
                    if (manualSum <= 0) return;
                    const factor = scoring.maxScore / manualSum;
                    const next: Record<string, number> = {};
                    for (const q of pool) {
                      const cur = scoring.perQuestion?.[q.id] ?? 0;
                      next[q.id] = Math.round(cur * factor * 100) / 100;
                    }
                    patchScoring({ perQuestion: next });
                  }}
                  className="ml-2 rounded-md border border-rose-400 bg-white px-2 py-0.5 text-[11px] font-semibold hover:bg-rose-100"
                >
                  Tự cân về {formatScore(scoring.maxScore)} đ
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      <ViewQuestionDialog
        question={viewing}
        onClose={() => setViewing(null)}
      />
    </section>
  );
}

function PackageList({
  title,
  highlighted,
  packages,
  state,
  blueprints,
  subjects,
  grades,
  pickPackage,
}: {
  title: string;
  highlighted?: boolean;
  packages: ReturnType<typeof usePackagesStore.getState>["packages"];
  state: WizardState;
  blueprints: ReturnType<typeof useBlueprintsStore.getState>["blueprints"];
  subjects: ReturnType<typeof useSubjectsStore.getState>["subjects"];
  grades: ReturnType<typeof useGradesStore.getState>["grades"];
  pickPackage: (id: string) => void;
}) {
  return (
    <section>
      <p
        className={cn(
          "mb-2 text-[11px] font-bold uppercase tracking-[0.06em]",
          highlighted ? "text-emerald-700" : "text-foreground/65",
        )}
      >
        {title}
      </p>
      <ul className="space-y-2">
        {packages.map((p) => {
          const bp = blueprints.find((b) => b.id === p.blueprintId);
          const subj = bp ? subjects.find((s) => s.id === bp.subjectId) : null;
          const gr = bp ? grades.find((g) => g.id === bp.gradeId) : null;
          const perExam = p.matrix.reduce(
            (s, r) => s + r.easyCount + r.mediumCount + r.hardCount,
            0,
          );
          const checked = state.packageId === p.id;
          return (
            <li key={p.id}>
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border-2 bg-card p-3 transition-colors",
                  checked
                    ? "border-primary bg-primary/5"
                    : highlighted
                      ? "border-emerald-200 hover:border-primary/40 hover:bg-accent/30"
                      : "border-border hover:border-primary/40 hover:bg-accent/30",
                )}
              >
                <input
                  type="radio"
                  name="package"
                  checked={checked}
                  onChange={() => pickPackage(p.id)}
                  className="mt-1 h-4 w-4 accent-[var(--color-primary)]"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {subj && (
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{
                          backgroundColor: `${subj.color}1A`,
                          color: subj.color,
                        }}
                      >
                        {subj.name}
                      </span>
                    )}
                    {gr && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-foreground/70">
                        {gr.code}
                      </span>
                    )}
                    <p className="text-[14px] font-semibold text-foreground">
                      {p.name}
                    </p>
                  </div>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {bp ? `Khung đề: ${bp.name}` : "Khung đề đã bị xoá"}
                  </p>
                  <p className="mt-1 text-[12px] text-foreground/80">
                    {perExam} câu/đề · ⏱ {p.duration} phút
                  </p>
                </div>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
                  Đã duyệt
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ───────── Step 3 — Lịch thi ───────── */

function Step3Schedule({
  state,
  setState,
}: {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
}) {
  const start = state.startAt ? new Date(state.startAt) : null;
  const end = state.endAt ? new Date(state.endAt) : null;
  const durMin =
    start && end ? Math.round((end.getTime() - start.getTime()) / 60000) : null;

  return (
    <div className="space-y-5">
      <section className="rounded-xl border bg-surface-2/40 p-4">
        <p className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-foreground/85">
          📅 Lịch thi <span className="text-destructive">*</span>
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
              Giờ mở (bắt đầu thi)
            </Label>
            <Input
              type="datetime-local"
              value={state.startAt}
              onChange={(e) =>
                setState((s) => ({ ...s, startAt: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
              Giờ đóng (deadline nộp bài)
            </Label>
            <Input
              type="datetime-local"
              value={state.endAt}
              onChange={(e) => setState((s) => ({ ...s, endAt: e.target.value }))}
            />
          </div>
        </div>
        {durMin !== null && (
          <p className="mt-3 text-[12px] text-foreground/75">
            Thời lượng cửa sổ thi:{" "}
            <span className="font-semibold text-foreground">
              {durMin >= 60
                ? `${Math.floor(durMin / 60)}h ${durMin % 60}p`
                : `${durMin} phút`}
            </span>
            {durMin <= 0 && (
              <span className="ml-2 text-rose-700">
                (giờ đóng phải sau giờ mở)
              </span>
            )}
          </p>
        )}
      </section>

      <section className="rounded-xl border bg-surface-2/40 p-4">
        <p className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-foreground/85">
          ⏱ Cho phép vào trễ
        </p>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            max={120}
            value={state.lateJoinMinutes}
            onChange={(e) =>
              setState((s) => ({
                ...s,
                lateJoinMinutes: Math.max(0, Number(e.target.value) || 0),
              }))
            }
            className="w-24 text-center"
          />
          <span className="text-[13px] text-foreground/75">
            phút sau giờ mở — học sinh tới muộn quá thời gian này sẽ không vào
            thi được.
          </span>
        </div>
      </section>
    </div>
  );
}

/* ───────── Step 4 — Phòng & GT ───────── */

/** Last-word (given-name) extractor used for Vietnamese A-Z sort. */
function vietnameseGivenName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1] ?? fullName;
}

function sortStudentsBy<T extends { id: string; name: string; className?: string | null }>(
  list: T[],
  mode: RoomAssignMode,
): T[] {
  const arr = [...list];
  if (mode === "alphabet") {
    arr.sort((a, b) =>
      vietnameseGivenName(a.name).localeCompare(
        vietnameseGivenName(b.name),
        "vi",
        { sensitivity: "base" },
      ),
    );
  } else if (mode === "class") {
    arr.sort((a, b) => {
      const byClass = (a.className ?? "").localeCompare(
        b.className ?? "",
        "vi",
        { numeric: true },
      );
      if (byClass !== 0) return byClass;
      return vietnameseGivenName(a.name).localeCompare(
        vietnameseGivenName(b.name),
        "vi",
      );
    });
  } else {
    // Fisher–Yates shuffle for the "random" mode.
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    }
  }
  return arr;
}

function Step4Rooms({
  state,
  setState,
  classes,
  users,
  campusId,
}: {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
  classes: ReturnType<typeof useGradesStore.getState>["classes"];
  users: ReturnType<typeof useUsersStore.getState>["users"];
  campusId: string | null;
}) {
  // Per-room expand/collapse state. Defaults to expanded so the user
  // immediately sees what was generated by the AI.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Eligible proctors: campus-scoped staff (teachers / subject-leads /
  // admin), excluding the global superadmin and any suspended user.
  const eligibleProctors = useMemo(
    () =>
      users.filter(
        (u) =>
          u.status === "active" &&
          u.role !== "superadmin" &&
          u.role !== "student" &&
          (campusId ? u.campusId === campusId : true),
      ),
    [users, campusId],
  );

  // Resolve every student in the picked classes. `className` on the user
  // record is the join key (legacy schema — we keep it because changing
  // it would also touch the users store and several views).
  const studentsInScope = useMemo(() => {
    const codes = new Set(
      classes
        .filter((c) => state.classIds.includes(c.id))
        .map((c) => c.code),
    );
    // Only candidates: in selected classes AND ticked in Step 1's
    // roster picker. Anyone unticked never enters Step 4's auto-
    // distribute or the per-room assignment UI.
    const selectedSet = new Set(state.selectedStudentIds);
    return users.filter(
      (u) =>
        u.role === "student" &&
        u.status === "active" &&
        (campusId ? u.campusId === campusId : true) &&
        u.className != null &&
        codes.has(u.className) &&
        // Empty selectedStudentIds = legacy (no roster picker yet) →
        // include everyone, otherwise respect the explicit selection.
        (state.selectedStudentIds.length === 0 || selectedSet.has(u.id)),
    );
  }, [users, classes, state.classIds, state.selectedStudentIds, campusId]);

  const studentById = useMemo(() => {
    const m = new Map<string, (typeof studentsInScope)[number]>();
    for (const s of studentsInScope) m.set(s.id, s);
    return m;
  }, [studentsInScope]);

  // ───── Stats
  const assignedIds = useMemo(() => {
    const set = new Set<string>();
    for (const r of state.rooms) for (const id of r.studentIds ?? []) set.add(id);
    return set;
  }, [state.rooms]);
  const totalStudents = studentsInScope.length;
  const assignedCount = studentsInScope.filter((s) => assignedIds.has(s.id)).length;
  const unassignedCount = totalStudents - assignedCount;
  const roomsWithProctor = state.rooms.filter((r) => r.proctorIds.length > 0).length;

  // Sĩ số nên cần (cho hint)
  const recommendedRoomCount = Math.max(
    1,
    Math.ceil(totalStudents / Math.max(1, state.roomCapacity)),
  );

  // ───── Mutators
  function updateRoom(id: string, patch: Partial<ShiftRoom>) {
    setState((s) => ({
      ...s,
      rooms: s.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  }
  function removeRoom(id: string) {
    setState((s) => ({ ...s, rooms: s.rooms.filter((r) => r.id !== id) }));
  }
  function toggleCollapsed(id: string) {
    setCollapsed((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function setRoomCapacity(value: number) {
    const v = Math.max(1, Math.min(500, Math.floor(value) || 1));
    setState((s) => ({ ...s, roomCapacity: v }));
  }
  function setAssignMode(value: RoomAssignMode) {
    setState((s) => ({ ...s, assignMode: value }));
  }
  function aiAutoCreate() {
    if (totalStudents === 0) return;
    const sorted = sortStudentsBy(studentsInScope, state.assignMode);
    const cap = Math.max(1, state.roomCapacity);
    const roomCount = Math.ceil(sorted.length / cap);
    const next: ShiftRoom[] = [];
    for (let i = 0; i < roomCount; i++) {
      const slice = sorted.slice(i * cap, (i + 1) * cap);
      const classIdsInRoom = Array.from(
        new Set(
          slice
            .map((s) =>
              classes.find(
                (c) => c.code === s.className && state.classIds.includes(c.id),
              )?.id,
            )
            .filter((x): x is string => !!x),
        ),
      );
      next.push({
        id: newRoomId(),
        name: `P${201 + i}`,
        capacity: cap,
        classIds: classIdsInRoom,
        studentIds: slice.map((s) => s.id),
        proctorIds: [],
      });
    }
    setState((s) => ({ ...s, rooms: next }));
  }
  function addManualRoom() {
    setState((s) => ({
      ...s,
      rooms: [
        ...s.rooms,
        {
          id: newRoomId(),
          name: `P${201 + s.rooms.length}`,
          capacity: s.roomCapacity,
          classIds: [],
          studentIds: [],
          proctorIds: [],
        },
      ],
    }));
  }
  function clearAllRooms() {
    setState((s) => ({ ...s, rooms: [] }));
  }
  function addStudentToRoom(roomId: string, studentId: string) {
    setState((s) => ({
      ...s,
      rooms: s.rooms.map((r) => {
        if (r.id === roomId) {
          if (r.studentIds.includes(studentId)) return r;
          const stu = studentById.get(studentId);
          const cid = stu
            ? classes.find(
                (c) =>
                  c.code === stu.className && state.classIds.includes(c.id),
              )?.id
            : null;
          return {
            ...r,
            studentIds: [...r.studentIds, studentId],
            classIds: cid && !r.classIds.includes(cid)
              ? [...r.classIds, cid]
              : r.classIds,
          };
        }
        // Drop this student from any other room (single-assignment rule).
        if (r.studentIds.includes(studentId)) {
          return {
            ...r,
            studentIds: r.studentIds.filter((id) => id !== studentId),
          };
        }
        return r;
      }),
    }));
  }
  function removeStudentFromRoom(roomId: string, studentId: string) {
    updateRoom(roomId, {
      studentIds: state.rooms
        .find((r) => r.id === roomId)!
        .studentIds.filter((id) => id !== studentId),
    });
  }
  function clearStudentsFromRoom(roomId: string) {
    updateRoom(roomId, { studentIds: [] });
  }

  return (
    <div className="space-y-5">
      {/* ───── Top controls ───── */}
      <div className="rounded-xl border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-[12px] font-semibold">
              Sĩ số tối đa / phòng
            </Label>
            <Input
              type="number"
              min={1}
              max={500}
              value={state.roomCapacity}
              onChange={(e) => setRoomCapacity(Number(e.target.value))}
              className="mt-1"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Khuyến nghị: 25–35 HS/phòng. Cần{" "}
              <span className="font-semibold text-foreground">
                {recommendedRoomCount}
              </span>{" "}
              phòng cho{" "}
              <span className="font-semibold text-foreground">
                {totalStudents}
              </span>{" "}
              HS.
            </p>
          </div>
          <div>
            <Label className="text-[12px] font-semibold">
              Cách gán học sinh
            </Label>
            <select
              value={state.assignMode}
              onChange={(e) => setAssignMode(e.target.value as RoomAssignMode)}
              className="mt-1 h-9 w-full rounded-md border bg-card px-3 text-[13px]"
            >
              <option value="alphabet">Theo bảng chữ cái A–Z</option>
              <option value="class">Theo lớp (gom cùng lớp)</option>
              <option value="random">Ngẫu nhiên</option>
            </select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              A–Z sắp xếp theo tên (chữ cuối) — chuẩn danh sách HS Việt Nam.
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={aiAutoCreate}
            disabled={totalStudents === 0}
            className="gap-1.5"
          >
            <Wand2 className="h-3.5 w-3.5" />
            Tự tạo & gán phòng
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={addManualRoom}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Thêm phòng thủ công
          </Button>
          {state.rooms.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={clearAllRooms}
              className="ml-auto gap-1.5 text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Xoá tất cả phòng
            </Button>
          )}
        </div>
      </div>

      {/* ───── Stats summary ───── */}
      <div className="grid grid-cols-3 gap-3">
        <StatBlock
          label="PHÒNG THI"
          value={state.rooms.length}
          tone={state.rooms.length > 0 ? "blue" : "muted"}
        />
        <StatBlock
          label="HS ĐÃ GÁN"
          value={`${assignedCount}/${totalStudents}`}
          tone={
            totalStudents > 0 && assignedCount === totalStudents
              ? "green"
              : assignedCount > 0
                ? "amber"
                : "muted"
          }
        />
        <StatBlock
          label="PHÒNG CÓ GIÁM THỊ"
          value={`${roomsWithProctor}/${state.rooms.length}`}
          tone={
            state.rooms.length > 0 && roomsWithProctor === state.rooms.length
              ? "green"
              : roomsWithProctor > 0
                ? "amber"
                : "muted"
          }
        />
      </div>

      {/* ───── Unassigned warning ───── */}
      {unassignedCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            <span className="font-semibold">Còn {unassignedCount} học sinh</span>{" "}
            chưa được gán phòng.
            <span className="ml-1 text-amber-700">
              Click <span className="font-semibold">"⚡ Tự tạo &amp; gán phòng"</span>{" "}
              hoặc thêm phòng thủ công và kéo HS vào.
            </span>
          </span>
        </div>
      )}

      {/* ───── Rooms list ───── */}
      <div>
        <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold">
          <Eye className="h-4 w-4 text-muted-foreground" />
          Danh sách phòng thi
        </h3>

        {state.rooms.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-center">
            <Sparkles className="mx-auto h-7 w-7 text-muted-foreground/60" />
            <p className="mt-2 text-[13px] font-semibold">
              Chưa có phòng thi nào
            </p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Click{" "}
              <span className="font-semibold">"⚡ Tự tạo &amp; gán phòng"</span>{" "}
              để hệ thống tự sinh phòng thi theo cấu hình bên trên.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {state.rooms.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                isCollapsed={collapsed.has(room.id)}
                onToggleCollapsed={() => toggleCollapsed(room.id)}
                onUpdate={(patch) => updateRoom(room.id, patch)}
                onRemove={() => removeRoom(room.id)}
                onAddStudent={(sid) => addStudentToRoom(room.id, sid)}
                onRemoveStudent={(sid) => removeStudentFromRoom(room.id, sid)}
                onClearStudents={() => clearStudentsFromRoom(room.id)}
                studentsInScope={studentsInScope}
                classes={classes}
                proctors={eligibleProctors}
                assignedElsewhere={
                  new Set(
                    state.rooms
                      .filter((r) => r.id !== room.id)
                      .flatMap((r) => r.studentIds ?? []),
                  )
                }
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ───── Step 4 sub-components ───── */

function StatBlock({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "blue" | "green" | "amber" | "muted";
}) {
  const tones: Record<typeof tone, string> = {
    blue: "text-blue-700",
    green: "text-emerald-700",
    amber: "text-amber-700",
    muted: "text-muted-foreground",
  };
  return (
    <div className="rounded-xl border bg-card px-3 py-3 text-center">
      <div className={cn("text-[22px] font-bold leading-tight", tones[tone])}>
        {value}
      </div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function RoomCard({
  room,
  isCollapsed,
  onToggleCollapsed,
  onUpdate,
  onRemove,
  onAddStudent,
  onRemoveStudent,
  onClearStudents,
  studentsInScope,
  classes,
  proctors,
  assignedElsewhere,
}: {
  room: ShiftRoom;
  isCollapsed: boolean;
  onToggleCollapsed(): void;
  onUpdate(patch: Partial<ShiftRoom>): void;
  onRemove(): void;
  onAddStudent(studentId: string): void;
  onRemoveStudent(studentId: string): void;
  onClearStudents(): void;
  studentsInScope: ReturnType<typeof useUsersStore.getState>["users"];
  classes: ReturnType<typeof useGradesStore.getState>["classes"];
  proctors: ReturnType<typeof useUsersStore.getState>["users"];
  assignedElsewhere: Set<string>;
}) {
  const [showAddHS, setShowAddHS] = useState(false);
  const [hsQuery, setHsQuery] = useState("");

  const roomStudents = useMemo(() => {
    const m = new Map(studentsInScope.map((s) => [s.id, s]));
    return room.studentIds
      .map((id) => m.get(id))
      .filter((s): s is (typeof studentsInScope)[number] => !!s);
  }, [room.studentIds, studentsInScope]);

  const candidates = useMemo(() => {
    return studentsInScope
      .filter((s) => !room.studentIds.includes(s.id))
      .filter((s) =>
        hsQuery.trim()
          ? s.name.toLowerCase().includes(hsQuery.trim().toLowerCase()) ||
            (s.className ?? "")
              .toLowerCase()
              .includes(hsQuery.trim().toLowerCase())
          : true,
      );
  }, [studentsInScope, room.studentIds, hsQuery]);

  const filledRatio =
    room.capacity > 0 ? room.studentIds.length / room.capacity : 0;
  const ratioTone =
    filledRatio >= 1
      ? "text-rose-700 bg-rose-50 border-rose-200"
      : filledRatio >= 0.7
        ? "text-emerald-700 bg-emerald-50 border-emerald-200"
        : "text-blue-700 bg-blue-50 border-blue-200";

  const classOfStudent = (s: { className?: string | null }) => {
    if (!s.className) return null;
    return classes.find((c) => c.code === s.className) ?? null;
  };

  return (
    <li className="rounded-xl border bg-card">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <span className="text-[15px]">🏫</span>
        <Input
          value={room.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="Tên phòng (vd: P201)"
          className="h-8 max-w-[160px] text-[13px] font-semibold"
        />
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
            ratioTone,
          )}
        >
          {room.studentIds.length}/{room.capacity}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={onToggleCollapsed}
            className="h-7 w-7 p-0"
            title={isCollapsed ? "Mở rộng" : "Thu gọn"}
          >
            {isCollapsed ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onRemove}
            className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
            title="Xoá phòng"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="space-y-4 px-4 py-3">
          {/* Capacity */}
          <div>
            <Label className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground/65">
              Sĩ số tối đa
            </Label>
            <Input
              type="number"
              min={1}
              max={500}
              value={room.capacity}
              onChange={(e) =>
                onUpdate({
                  capacity: Math.max(1, Number(e.target.value) || 1),
                })
              }
              className="mt-1 max-w-[140px]"
            />
          </div>

          {/* Proctors */}
          <div>
            <div className="mb-1 flex items-center gap-2">
              <Label className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground/65">
                👁 Giám thị ({room.proctorIds.length})
              </Label>
              {room.proctorIds.length === 0 && (
                <span className="text-[11px] text-amber-700">
                  ⚠ Bắt buộc có ít nhất 1 GT
                </span>
              )}
            </div>
            <ProctorPicker
              value={room.proctorIds}
              proctors={proctors}
              onChange={(ids) => onUpdate({ proctorIds: ids })}
            />
          </div>

          {/* Students */}
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <Label className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground/65">
                🎓 Học sinh ({room.studentIds.length})
              </Label>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowAddHS((v) => !v)}
                  className="h-7 gap-1 text-[11px]"
                >
                  <UserPlus className="h-3 w-3" />
                  Thêm HS
                </Button>
                {room.studentIds.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={onClearStudents}
                    className="h-7 text-[11px] text-destructive"
                  >
                    Xoá hết
                  </Button>
                )}
              </div>
            </div>

            {showAddHS && (
              <div className="mb-2 rounded-md border bg-surface-2/40 p-2">
                <Input
                  value={hsQuery}
                  onChange={(e) => setHsQuery(e.target.value)}
                  placeholder="Tìm HS theo tên hoặc lớp…"
                  className="h-8 text-[12px]"
                />
                <ul className="mt-2 max-h-[200px] space-y-1 overflow-y-auto">
                  {candidates.map((s) => {
                    const dup = assignedElsewhere.has(s.id);
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => onAddStudent(s.id)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[12px] hover:bg-accent/40",
                            dup && "italic text-muted-foreground",
                          )}
                          title={
                            dup
                              ? "HS đang ở phòng khác — thêm vào đây sẽ tự gỡ khỏi phòng cũ."
                              : undefined
                          }
                        >
                          <span className="flex-1 font-medium">{s.name}</span>
                          <span className="rounded bg-blue-50 px-1.5 text-[10px] font-semibold text-blue-700">
                            {s.className ?? "—"}
                          </span>
                          {dup && (
                            <span className="text-[10px] text-amber-700">
                              ✱ đã ở phòng khác
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                  {candidates.length === 0 && (
                    <li className="px-2 py-1 text-[11px] text-muted-foreground">
                      Không còn HS nào để thêm vào phòng này.
                    </li>
                  )}
                </ul>
              </div>
            )}

            {roomStudents.length === 0 ? (
              <p className="rounded-md border border-dashed bg-muted/20 px-3 py-2 text-center text-[11px] text-muted-foreground">
                Chưa có HS trong phòng. Click "+ Thêm HS" để kéo HS vào, hoặc dùng
                "⚡ Tự tạo &amp; gán phòng" ở trên.
              </p>
            ) : (
              <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {roomStudents.map((s, idx) => {
                  const cls = classOfStudent(s);
                  return (
                    <li
                      key={s.id}
                      className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-[12px]"
                    >
                      <span className="w-5 text-right text-muted-foreground">
                        {idx + 1}
                      </span>
                      <span className="flex-1 truncate font-medium">{s.name}</span>
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                        {cls?.code ?? s.className ?? "—"}
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemoveStudent(s.id)}
                        className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        title="Gỡ khỏi phòng"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

function ProctorPicker({
  value,
  proctors,
  onChange,
}: {
  value: string[];
  proctors: ReturnType<typeof useUsersStore.getState>["users"];
  onChange(ids: string[]): void;
}) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(
    () => proctors.filter((p) => value.includes(p.id)),
    [proctors, value],
  );
  const available = useMemo(
    () => proctors.filter((p) => !value.includes(p.id)),
    [proctors, value],
  );

  return (
    <div className="rounded-md border bg-card">
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 border-b bg-surface-2/40 p-2">
          {selected.map((p) => (
            <li
              key={p.id}
              className="inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-[11px] font-medium"
            >
              <span>{p.name}</span>
              <span className="text-[9px] uppercase text-muted-foreground">
                {p.role}
              </span>
              <button
                type="button"
                onClick={() => onChange(value.filter((id) => id !== p.id))}
                className="ml-1 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                aria-label={`Gỡ ${p.name}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-[12px] text-muted-foreground hover:bg-accent/30"
      >
        <span>+ Thêm giám thị từ giáo viên</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <ul className="max-h-[180px] space-y-0.5 overflow-y-auto border-t p-1">
          {available.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  onChange([...value, p.id]);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[12px] hover:bg-accent/40"
              >
                <span className="flex-1 font-medium">{p.name}</span>
                <span className="text-[10px] uppercase text-muted-foreground">
                  {p.role}
                </span>
              </button>
            </li>
          ))}
          {available.length === 0 && (
            <li className="px-2 py-1 text-[11px] text-muted-foreground">
              Không còn nhân sự khả dụng trong campus.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/* ───────── Step 5 — Cấu hình anti-cheat + xác nhận ───────── */

const ANTI_CHEAT_FLAGS: Array<{
  key: keyof AntiCheatConfig;
  label: string;
  description: string;
  tone: "high" | "med" | "low";
}> = [
  {
    key: "randomizeQuestions",
    label: "Đảo thứ tự câu hỏi",
    description: "Mỗi học sinh nhận thứ tự câu khác nhau.",
    tone: "low",
  },
  {
    key: "randomizeOptions",
    label: "Đảo thứ tự phương án (MCQ)",
    description: "Đảo A/B/C/D để giảm copy đáp án giữa các máy.",
    tone: "low",
  },
  {
    key: "requireFullscreen",
    label: "Bắt buộc fullscreen",
    description: "Thoát fullscreen sẽ cảnh báo / auto-submit.",
    tone: "med",
  },
  {
    key: "blockTabSwitch",
    label: "Chặn chuyển tab / cửa sổ",
    description: "Phát hiện Alt-Tab, đếm lần vi phạm.",
    tone: "med",
  },
  {
    key: "blockCopyPaste",
    label: "Chặn copy / paste",
    description: "Disable Ctrl-C / Ctrl-V trong đề thi.",
    tone: "med",
  },
  {
    key: "blockRightClick",
    label: "Chặn chuột phải",
    description: "Tránh học sinh inspect element.",
    tone: "low",
  },
  {
    key: "requireWebcam",
    label: "Yêu cầu webcam",
    description: "Stream webcam suốt ca thi để giám thị review.",
    tone: "high",
  },
  {
    key: "faceDetection",
    label: "Phát hiện khuôn mặt",
    description: "Lấy mẫu định kỳ — phát hiện vắng mặt / có người khác.",
    tone: "high",
  },
  {
    key: "oneTimeStart",
    label: "Vào thi 1 lần duy nhất",
    description: "Không cho pause/resume — phải làm liền mạch.",
    tone: "med",
  },
];

function Step5Config({
  state,
  setState,
  grades,
  subjects,
  classes,
  packages,
  users,
}: {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
  grades: ReturnType<typeof useGradesStore.getState>["grades"];
  subjects: ReturnType<typeof useSubjectsStore.getState>["subjects"];
  classes: ReturnType<typeof useGradesStore.getState>["classes"];
  packages: ReturnType<typeof usePackagesStore.getState>["packages"];
  users: ReturnType<typeof useUsersStore.getState>["users"];
}) {
  const grade = grades.find((g) => g.id === state.gradeId);
  const subject = subjects.find((s) => s.id === state.subjectId);
  const pkg = packages.find((p) => p.id === state.packageId);
  const selectedClasses = classes.filter((c) => state.classIds.includes(c.id));
  // Prefer the explicit `room.studentIds` (Step 4 has assigned them).
  // Fall back to deriving by className from the users-store for legacy
  // shifts that pre-date the AI-assign Step 4.
  const explicitStudentIds = new Set(
    state.rooms.flatMap((r) => r.studentIds ?? []),
  );
  let totalStudents = explicitStudentIds.size;
  if (totalStudents === 0) {
    const selectedCodes = new Set(selectedClasses.map((c) => c.code));
    totalStudents = users.filter(
      (u) =>
        u.role === "student" &&
        u.status === "active" &&
        u.className != null &&
        selectedCodes.has(u.className),
    ).length;
  }

  return (
    <div className="space-y-5">
      {/* Shift name */}
      <section className="rounded-xl border bg-surface-2/40 p-4">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
          Tên ca thi
        </p>
        <Input
          value={state.name}
          onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
          placeholder="vd: Ca thi Toán — Khối 7"
        />
      </section>

      {/* Student result visibility — controls what HS sees on the
          /exam/[id]/result page after the shift ends. */}
      <section className="rounded-xl border bg-surface-2/40 p-4">
        <p className="mb-1 inline-flex items-center gap-1.5 text-[13px] font-semibold text-foreground/85">
          👁 Quyền xem kết quả của học sinh
        </p>
        <p className="mb-3 text-[11.5px] text-muted-foreground">
          Sau khi ca thi kết thúc, học sinh sẽ nhìn thấy điều gì khi vào{" "}
          <span className="font-mono">/exam/.../result</span>. Giáo viên và
          admin luôn xem được đầy đủ trên trang Báo cáo.
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {(
            [
              {
                v: "full" as const,
                label: "Hiện đầy đủ",
                hint: "Điểm tổng · từng câu đúng / sai · nhận xét GV",
                tone: "border-emerald-300 bg-emerald-50/40 text-emerald-900",
                activeTone: "border-emerald-400 ring-1 ring-emerald-300",
              },
              {
                v: "score-only" as const,
                label: "Chỉ điểm tổng",
                hint: "HS chỉ thấy điểm số tổng, không xem được từng câu",
                tone: "border-amber-300 bg-amber-50/40 text-amber-900",
                activeTone: "border-amber-400 ring-1 ring-amber-300",
              },
              {
                v: "hidden" as const,
                label: "Ẩn hoàn toàn",
                hint: "Block /result tới khi GV công bố lại — phù hợp khi cần chấm tự luận trước",
                tone: "border-rose-300 bg-rose-50/40 text-rose-900",
                activeTone: "border-rose-400 ring-1 ring-rose-300",
              },
            ]
          ).map((opt) => {
            const active =
              (state.studentResultVisibility ?? "full") === opt.v;
            return (
              <label
                key={opt.v}
                className={cn(
                  "cursor-pointer rounded-lg border-2 bg-card p-3 transition",
                  active ? opt.activeTone : "border-border hover:bg-accent/20",
                )}
              >
                <input
                  type="radio"
                  name="studentResultVisibility"
                  className="sr-only"
                  checked={active}
                  onChange={() =>
                    setState((s) => ({
                      ...s,
                      studentResultVisibility: opt.v,
                    }))
                  }
                />
                <p className="text-[13px] font-semibold">{opt.label}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {opt.hint}
                </p>
              </label>
            );
          })}
        </div>
      </section>

      {/* Anti-cheat */}
      <section className="rounded-xl border bg-surface-2/40 p-4">
        <p className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-foreground/85">
          🛡️ Cấu hình Anti-cheat
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {ANTI_CHEAT_FLAGS.map((flag) => {
            const checked = state.antiCheat[flag.key];
            const toneClass =
              flag.tone === "high"
                ? "border-rose-200"
                : flag.tone === "med"
                  ? "border-amber-200"
                  : "border-emerald-200";
            return (
              <li key={flag.key}>
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-2.5 rounded-lg border-2 bg-card p-2.5 transition-colors",
                    checked ? toneClass : "border-border hover:bg-accent/20",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) =>
                      setState((s) => ({
                        ...s,
                        antiCheat: {
                          ...s.antiCheat,
                          [flag.key]: e.target.checked,
                        },
                      }))
                    }
                    className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-foreground">
                      {flag.label}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {flag.description}
                    </p>
                  </div>
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Summary */}
      <section className="rounded-xl border-2 border-emerald-200 bg-emerald-50/40 p-4">
        <p className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-emerald-800">
          <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
          Xác nhận tổng quan
        </p>
        <dl className="grid gap-1.5 text-[13px]">
          <Row label="Đối tượng">
            {grade?.name ?? "—"} · {subject?.name ?? "—"} ·{" "}
            {selectedClasses.length} lớp ({totalStudents} HS)
          </Row>
          <Row label="Bộ đề">
            {pkg?.name ?? "—"}{" "}
            <span className="text-meta">
              · ⏱ {pkg?.duration ?? "?"}p ·{" "}
              {pkg
                ? pkg.matrix.reduce(
                    (s, r) => s + r.easyCount + r.mediumCount + r.hardCount,
                    0,
                  )
                : "?"}{" "}
              câu/đề
            </span>
          </Row>
          <Row label="Thời gian">
            {state.startAt
              ? new Date(state.startAt).toLocaleString("vi-VN")
              : "—"}{" "}
            → {state.endAt ? new Date(state.endAt).toLocaleString("vi-VN") : "—"}
          </Row>
          <Row label="Phòng & GT">
            {state.rooms.length} phòng,{" "}
            {state.rooms.reduce((s, r) => s + r.proctorIds.length, 0)} giám thị
          </Row>
          <Row label="Anti-cheat">
            {
              Object.values(state.antiCheat).filter(Boolean).length
            }{" "}
            /{Object.keys(state.antiCheat).length} biện pháp đã bật
          </Row>
        </dl>
      </section>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <dt className="w-28 shrink-0 font-semibold text-foreground/70">{label}</dt>
      <dd className="min-w-0 flex-1 text-foreground">{children}</dd>
    </div>
  );
}
