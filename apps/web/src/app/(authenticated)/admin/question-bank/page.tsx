"use client";

import {
  Building2,
  CheckCircle2,
  Clock,
  FileText,
  ListChecks,
  Plus,
  ShieldCheck,
  User,
  Users as UsersIcon,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/ui/kpi-card";
import { Select } from "@/components/ui/select";
import { ConfirmActionDialog } from "@/features/admin/users/dialogs/confirm-action-dialog";
import { useUserScope } from "@/features/auth/lib/use-scope";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { CampusGateBanner } from "@/features/campus/components/campus-gate-banner";
import { useCampusGate } from "@/features/campus/hooks/use-campus-gate";
import { useCampusStore } from "@/features/campus/state/campus-store";
import { useCampusesStore } from "@/features/campus/state/campuses-store";
import { useGradesStore } from "@/features/grades/state/grades-store";
import {
  QUESTION_TYPES,
  type QuestionType,
} from "@/features/question-bank/data/question-types";
import type { Question } from "@/features/question-bank/data/seed-questions";
import { QuestionCard } from "@/features/question-bank/components/question-card";

// Dialogs are heavy (math editor, mammoth, KaTeX, etc.) — code-splitting
// them keeps the question-bank route's initial JS small, which is the
// single biggest dev-mode nav speedup.
const CreateQuestionDialog = dynamic(
  () =>
    import("@/features/question-bank/dialogs/create-question-dialog").then(
      (m) => m.CreateQuestionDialog,
    ),
  { ssr: false, loading: () => null },
);
const ImportWordDialog = dynamic(
  () =>
    import("@/features/question-bank/dialogs/import-word-dialog").then(
      (m) => m.ImportWordDialog,
    ),
  { ssr: false, loading: () => null },
);
const ViewQuestionDialog = dynamic(
  () =>
    import("@/features/question-bank/dialogs/view-question-dialog").then(
      (m) => m.ViewQuestionDialog,
    ),
  { ssr: false, loading: () => null },
);
const CopyQuestionDialog = dynamic(
  () =>
    import("@/features/question-bank/dialogs/copy-question-dialog").then(
      (m) => m.CopyQuestionDialog,
    ),
  { ssr: false, loading: () => null },
);
import { useQuestionsStore } from "@/features/question-bank/state/questions-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { PageHeader } from "@/features/shell/components/page-header";
import { cn } from "@/lib/utils";

type KhoView = "campus" | "personal";

export default function QuestionBankPage() {
  const session = useAuthStore((s) => s.session);
  const scope = useUserScope();
  const activeCampusId = useCampusStore((s) => s.activeCampusId);
  const campuses = useCampusesStore((s) => s.campuses);
  const grades = useGradesStore((s) => s.grades);
  const subjects = useSubjectsStore((s) => s.subjects);
  const questions = useQuestionsStore((s) => s.questions);
  const remove = useQuestionsStore((s) => s.remove);
  const createQuestion = useQuestionsStore((s) => s.create);

  // Pinned campus scope: grade + subject filter dropdowns only show options
  // applicable to the operating campus's tier.
  const operatingCampusId =
    session?.role === "superadmin"
      ? activeCampusId
      : session?.campusId ?? null;
  // Stabilise the campus object reference so downstream memos don't bust.
  const operatingCampus = useMemo(
    () =>
      operatingCampusId
        ? campuses.find((c) => c.id === operatingCampusId) ?? null
        : null,
    [operatingCampusId, campuses],
  );
  // Memoised so child renders don't see a new array reference every tick —
  // cuts down on noticeable lag when switching tabs / filter values.
  const scopedGradeIds = useMemo(
    () => (operatingCampus ? new Set(operatingCampus.gradeIds) : null),
    [operatingCampus],
  );
  const scopedSubjects = useMemo(() => {
    if (!operatingCampus) return subjects;
    return subjects.filter((s) => {
      const inCampus =
        !s.campusIds ||
        s.campusIds.length === 0 ||
        s.campusIds.includes(operatingCampus.id);
      if (!inCampus) return false;
      return s.gradeIds.some((gid) =>
        operatingCampus.gradeIds.includes(gid),
      );
    });
  }, [subjects, operatingCampus]);
  const scopedGrades = useMemo(
    () =>
      scopedGradeIds
        ? grades.filter((g) => scopedGradeIds.has(g.id))
        : grades,
    [grades, scopedGradeIds],
  );

  const { canMutate } = useCampusGate();

  const [khoView, setKhoView] = useState<KhoView>("campus");
  const [editorOpen, setEditorOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Question | null>(null);
  const [viewing, setViewing] = useState<Question | null>(null);
  const [deleting, setDeleting] = useState<Question | null>(null);
  const [copying, setCopying] = useState<Question | null>(null);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<QuestionType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<Question["status"] | "all">("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [difficultyFilter, setDifficultyFilter] = useState<Question["difficulty"] | "all">("all");

  const scoped = useMemo(() => {
    if (!session) return [];
    return questions.filter((q) => {
      if (khoView === "personal") {
        if (q.kho !== "personal" || q.ownerId !== session.userId) return false;
        // Apply subject/grade gate to personal kho too — strict scope
        // means a re-assigned teacher should NOT see their old personal
        // questions in a subject they no longer teach.
        if (!scope.isUnscoped && scope.allowedSubjectIds != null) {
          if (!scope.allowedSubjectIds.has(q.subjectId)) return false;
          if (
            scope.allowedGradeIds != null &&
            q.gradeId != null &&
            !scope.allowedGradeIds.has(q.gradeId)
          ) {
            return false;
          }
        }
        return true;
      }
      if (q.kho !== "campus") return false;
      // Campus scope check.
      if (session.role === "superadmin") {
        if (activeCampusId && q.campusId !== activeCampusId) return false;
      } else if (q.campusId !== session.campusId) {
        return false;
      }
      // Subject + grade scope — STRICT. Teacher of Văn cannot see ANY
      // Toán question, even ones they themselves authored (e.g. they
      // were re-assigned away from Toán). Admin-class roles
      // (`isUnscoped`) skip this check entirely.
      if (!scope.isUnscoped && scope.allowedSubjectIds != null) {
        if (!scope.allowedSubjectIds.has(q.subjectId)) return false;
        if (
          scope.allowedGradeIds != null &&
          q.gradeId != null &&
          !scope.allowedGradeIds.has(q.gradeId)
        ) {
          return false;
        }
      }
      // Only APPROVED questions live in the public Kho campus.
      // Authors still see their own pending / rejected / draft so they
      // can track what they submitted — but other staff only see the
      // bank's approved corpus. This enforces the rule "câu phải qua
      // duyệt mới được vào kho" cả khi người tạo là admin.
      if (q.status !== "approved" && q.ownerId !== session.userId) {
        return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions, session, activeCampusId, khoView, scope]);

  const filtered = useMemo(() => {
    const list = scoped.filter((q) => {
      if (typeFilter !== "all" && q.type !== typeFilter) return false;
      if (statusFilter !== "all" && q.status !== statusFilter) return false;
      if (subjectFilter !== "all" && q.subjectId !== subjectFilter) return false;
      if (gradeFilter !== "all" && q.gradeId !== gradeFilter) return false;
      if (difficultyFilter !== "all" && q.difficulty !== difficultyFilter) return false;
      if (search.trim()) {
        const qStr = search.trim().toLowerCase();
        const hay = `${q.id} ${q.content} ${q.ownerName}`.toLowerCase();
        if (!hay.includes(qStr)) return false;
      }
      return true;
    });
    // Newest first — sort by createdAt descending. Falls back to id
    // comparison so questions with identical timestamps (or missing
    // createdAt on legacy records) still sort deterministically.
    return list.slice().sort((a, b) => {
      const ta = Date.parse(a.createdAt) || 0;
      const tb = Date.parse(b.createdAt) || 0;
      if (tb !== ta) return tb - ta;
      return b.id.localeCompare(a.id);
    });
  }, [scoped, typeFilter, statusFilter, subjectFilter, gradeFilter, difficultyFilter, search]);

  const kpis = useMemo(() => {
    return {
      total: scoped.length,
      approved: scoped.filter((q) => q.status === "approved").length,
      pending: scoped.filter((q) => q.status === "pending").length,
      draft: scoped.filter((q) => q.status === "draft").length,
      authors: new Set(scoped.map((q) => q.ownerId)).size,
    };
  }, [scoped]);

  function openCreate() {
    setEditing(null);
    setEditorOpen(true);
  }
  function openEdit(q: Question) {
    setEditing(q);
    setEditorOpen(true);
  }

  function performCopy(q: Question) {
    if (!session) return;
    const targetKho: KhoView = q.kho === "campus" ? "personal" : "campus";
    const targetStatus = targetKho === "personal" ? "approved" : "pending";
    const targetCampusId =
      targetKho === "personal"
        ? null
        : session.campusId ?? activeCampusId ?? null;

    // Strip id / createdAt / updatedAt — the store assigns fresh ones.
    // Also re-stamp ownership, kho, campusId, and approval state so the new
    // copy enters its destination kho with the right flow.
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = q;
    createQuestion({
      ...rest,
      kho: targetKho,
      campusId: targetCampusId,
      ownerId: session.userId,
      ownerName: session.name ?? "—",
      status: targetStatus,
      approvedBy: targetStatus === "approved" ? session.userId : null,
      rejectionNote: null,
    } as Omit<Question, "id" | "createdAt" | "updatedAt">);
    setCopying(null);
    // Switch tab to destination so the user sees the new card right away.
    setKhoView(targetKho);
  }

  return (
    <>
      <PageHeader
        title="Ngân hàng câu hỏi"
        description="Quản lý câu hỏi của kho campus và kho cá nhân — Quản lý & khảo thí thông minh."
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setImportOpen(true)}
              disabled={!canMutate}
              title={!canMutate ? "Chọn 1 campus để import" : undefined}
            >
              <ListChecks className="h-4 w-4" />
              Import từ Word
            </Button>
            <Button
              size="sm"
              onClick={openCreate}
              disabled={!canMutate}
              title={!canMutate ? "Chọn 1 campus để tạo câu hỏi" : undefined}
            >
              <Plus className="h-4 w-4" />
              Tạo câu hỏi mới
            </Button>
          </>
        }
      />

      <CampusGateBanner />

      <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Tổng câu hỏi" value={kpis.total.toLocaleString("vi-VN")} icon={FileText} tone="blue" />
        <KpiCard label="Đã duyệt" value={kpis.approved.toLocaleString("vi-VN")} icon={CheckCircle2} tone="green" />
        <KpiCard label="Chờ duyệt" value={kpis.pending.toLocaleString("vi-VN")} icon={Clock} tone="orange" />
        <KpiCard label="Bản nháp" value={kpis.draft.toLocaleString("vi-VN")} icon={ShieldCheck} tone="violet" />
        <KpiCard label="Tác giả" value={kpis.authors.toLocaleString("vi-VN")} icon={UsersIcon} tone="blue" />
      </section>

      <div className="mb-3 inline-flex rounded-xl border bg-card p-1">
        <KhoTab
          active={khoView === "campus"}
          onClick={() => setKhoView("campus")}
          icon={Building2}
          label="Kho chung"
        />
        <KhoTab
          active={khoView === "personal"}
          onClick={() => setKhoView("personal")}
          icon={User}
          label="Kho cá nhân"
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2.5 rounded-xl border bg-card p-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo mã, nội dung, tác giả…"
          className="h-9 min-w-[220px] flex-1"
        />
        <Select
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          className="h-9 min-w-[140px]"
        >
          <option value="all">Tất cả môn học</option>
          {scopedSubjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select
          value={gradeFilter}
          onChange={(e) => setGradeFilter(e.target.value)}
          className="h-9 min-w-[130px]"
        >
          <option value="all">Tất cả khối</option>
          {scopedGrades.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
        <Select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as QuestionType | "all")}
          className="h-9 min-w-[170px]"
        >
          <option value="all">Tất cả loại câu hỏi</option>
          {QUESTION_TYPES.filter((q) => q.variant !== "ai").map((q) => (
            <option key={q.id} value={q.id}>
              {q.name}
            </option>
          ))}
        </Select>
        <Select
          value={difficultyFilter}
          onChange={(e) =>
            setDifficultyFilter(e.target.value as Question["difficulty"] | "all")
          }
          className="h-9 min-w-[130px]"
        >
          <option value="all">Tất cả độ khó</option>
          <option value="easy">Nhận biết</option>
          <option value="medium">Thông hiểu</option>
          <option value="hard">Vận dụng</option>
        </Select>
        <Select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as Question["status"] | "all")
          }
          className="h-9 min-w-[140px]"
        >
          <option value="all">Tất cả trạng thái</option>
          <option value="approved">Đã duyệt</option>
          <option value="pending">Chờ duyệt</option>
          <option value="draft">Bản nháp</option>
          <option value="rejected">Từ chối</option>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center">
          <p className="text-section-title">Chưa có câu hỏi phù hợp.</p>
          <p className="text-small mt-1 text-muted-foreground">
            Thử thay đổi bộ lọc hoặc tạo câu hỏi mới.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((q) => (
            <li key={q.id}>
              <QuestionCard
                question={q}
                onView={setViewing}
                onEdit={openEdit}
                onDuplicate={setCopying}
                onDelete={setDeleting}
              />
            </li>
          ))}
        </ul>
      )}

      <p className="text-meta mt-3">
        Hiển thị <span className="font-semibold tabular-nums">{filtered.length}</span> /{" "}
        {scoped.length} câu hỏi
      </p>

      <CreateQuestionDialog
        open={editorOpen}
        onOpenChange={(o) => {
          setEditorOpen(o);
          if (!o) setEditing(null);
        }}
        editing={editing}
      />
      <ImportWordDialog open={importOpen} onOpenChange={setImportOpen} />
      <ViewQuestionDialog question={viewing} onClose={() => setViewing(null)} />

      <ConfirmActionDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        variant="destructive"
        title="Xoá câu hỏi?"
        description={
          deleting ? (
            <>
              Mã <span className="font-mono">{deleting.id}</span>. Hành động không thể hoàn tác.
            </>
          ) : (
            ""
          )
        }
        confirmLabel="Xoá câu hỏi"
        onConfirm={() => deleting && remove(deleting.id)}
      />

      <CopyQuestionDialog
        question={copying}
        onClose={() => setCopying(null)}
        onConfirm={performCopy}
      />
    </>
  );
}

function KhoTab({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Building2;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg px-4 py-1.5 text-[13px] font-medium transition-colors",
        active
          ? "bg-foreground text-background"
          : "text-foreground/65 hover:bg-accent hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.85} />
      {label}
    </button>
  );
}
