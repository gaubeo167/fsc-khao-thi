"use client";

import {
  Boxes,
  Eye,
  FileText,
  LayoutGrid,
  Layers,
  Package2,
  PencilLine,
  PlayCircle,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
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
import { useQuestionsStore } from "@/features/question-bank/state/questions-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { PageHeader } from "@/features/shell/components/page-header";
import { cn } from "@/lib/utils";
import { blueprintInUse, buildLockedMessage, packageInUse } from "@/lib/in-use";
import { versionOf } from "@/lib/version";

import { BlueprintCard } from "@/features/exams/components/blueprint-card";
import { DifficultyPills } from "@/features/exams/components/difficulty-pills";
import type {
  ExamBlueprint,
  ExamPackage,
  GeneratedExam,
} from "@/features/exams/data/types";
// Heavy dialogs split out so the page chunk stays light.
const BlueprintDialog = dynamic(
  () =>
    import("@/features/exams/dialogs/blueprint-dialog").then(
      (m) => m.BlueprintDialog,
    ),
  { ssr: false, loading: () => null },
);
const PackageDialog = dynamic(
  () =>
    import("@/features/exams/dialogs/package-dialog").then(
      (m) => m.PackageDialog,
    ),
  { ssr: false, loading: () => null },
);
const GenerateExamsDialog = dynamic(
  () =>
    import("@/features/exams/dialogs/generate-exams-dialog").then(
      (m) => m.GenerateExamsDialog,
    ),
  { ssr: false, loading: () => null },
);
const TrialExamDialog = dynamic(
  () =>
    import("@/features/exams/dialogs/trial-exam-dialog").then(
      (m) => m.TrialExamDialog,
    ),
  { ssr: false, loading: () => null },
);
const ViewGeneratedDialog = dynamic(
  () =>
    import("@/features/exams/dialogs/view-generated-dialog").then(
      (m) => m.ViewGeneratedDialog,
    ),
  { ssr: false, loading: () => null },
);
import {
  countBlueprintByDifficulty,
  indexQuestions,
} from "@/features/exams/lib/blueprint-stats";
import { useBlueprintsStore } from "@/features/exams/state/blueprints-store";
import { useShiftsStore } from "@/features/exam-shifts/state/shifts-store";
import { useGeneratedStore } from "@/features/exams/state/generated-store";
import { usePackagesStore } from "@/features/exams/state/packages-store";

type Tab = "blueprints" | "packages" | "generated";

export default function ExamBlueprintsPage() {
  const session = useAuthStore((s) => s.session);
  const scope = useUserScope();
  const activeCampusId = useCampusStore((s) => s.activeCampusId);
  const allBlueprintsRaw = useBlueprintsStore((s) => s.blueprints);
  const archiveBlueprint = useBlueprintsStore((s) => s.archive);
  const restoreBlueprint = useBlueprintsStore((s) => s.restore);
  const cloneBlueprintVersion = useBlueprintsStore((s) => s.cloneAsNewVersion);
  const allPackagesRaw = usePackagesStore((s) => s.packages);
  const archivePackage = usePackagesStore((s) => s.archive);
  const restorePackage = usePackagesStore((s) => s.restore);
  const clonePackageVersion = usePackagesStore((s) => s.cloneAsNewVersion);
  const [blueprintVersionPrompt, setBlueprintVersionPrompt] = useState<{
    source: ExamBlueprint;
    blockerReason: string;
  } | null>(null);
  const [packageVersionPrompt, setPackageVersionPrompt] = useState<{
    source: ExamPackage;
    blockerReason: string;
  } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  // Hide archived rows by default; admin toggle reveals them.
  const blueprints = useMemo(
    () =>
      showArchived
        ? allBlueprintsRaw
        : allBlueprintsRaw.filter((b) => !b.archivedAt),
    [allBlueprintsRaw, showArchived],
  );
  const packages = useMemo(
    () =>
      showArchived
        ? allPackagesRaw
        : allPackagesRaw.filter((p) => !p.archivedAt),
    [allPackagesRaw, showArchived],
  );
  const generated = useGeneratedStore((s) => s.generated);
  const removeGenerated = useGeneratedStore((s) => s.remove);
  const removeGeneratedByPackage = useGeneratedStore((s) => s.removeByPackage);
  const allShiftsRaw = useShiftsStore((s) => s.shifts);
  // Live (non-archived) shifts only — what the existing checks were
  // computing implicitly before Phase C ever-archived shifts existed.
  const shifts = useMemo(
    () => allShiftsRaw.filter((s) => !s.archivedAt),
    [allShiftsRaw],
  );
  const allQuestions = useQuestionsStore((s) => s.questions);
  const subjects = useSubjectsStore((s) => s.subjects);
  const grades = useGradesStore((s) => s.grades);
  const campuses = useCampusesStore((s) => s.campuses);

  // Scope filter dropdowns by operating campus's tier.
  const operatingCampusId =
    session?.role === "superadmin"
      ? activeCampusId
      : session?.campusId ?? null;
  const operatingCampus = operatingCampusId
    ? campuses.find((c) => c.id === operatingCampusId)
    : null;
  // Memoised — see question-bank page for the same reasoning.
  const scopedGradeIds = useMemo(
    () => (operatingCampus ? new Set(operatingCampus.gradeIds) : null),
    [operatingCampus],
  );
  const scopedSubjects = useMemo(() => {
    if (!operatingCampus) return subjects;
    return subjects.filter((s) => {
      const inCampus =
        Array.isArray(s.campusIds) && s.campusIds.includes(operatingCampus.id);
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

  const [tab, setTab] = useState<Tab>("blueprints");
  // When the user clicks the "Đã sinh" pill on a package row we switch
  // to the Generated tab AND narrow the list to that package only.
  const [generatedPackageFilter, setGeneratedPackageFilter] = useState<
    string | null
  >(null);
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [gradeFilter, setGradeFilter] = useState("all");

  // Dialog state
  const [blueprintDialogOpen, setBlueprintDialogOpen] = useState(false);
  const [editingBlueprint, setEditingBlueprint] = useState<ExamBlueprint | null>(
    null,
  );
  const [deletingBlueprint, setDeletingBlueprint] =
    useState<ExamBlueprint | null>(null);

  const [packageDialogOpen, setPackageDialogOpen] = useState(false);
  const [packageBaseBlueprint, setPackageBaseBlueprint] =
    useState<ExamBlueprint | null>(null);
  const [editingPackage, setEditingPackage] = useState<ExamPackage | null>(null);
  const [deletingPackage, setDeletingPackage] = useState<ExamPackage | null>(
    null,
  );

  const [generatingFor, setGeneratingFor] = useState<ExamPackage | null>(null);
  const [viewingGenerated, setViewingGenerated] =
    useState<GeneratedExam | null>(null);
  const [trialingGenerated, setTrialingGenerated] =
    useState<GeneratedExam | null>(null);
  const [deletingGenerated, setDeletingGenerated] =
    useState<GeneratedExam | null>(null);

  // Scope each list to the current campus + the user's subject/grade
  // assignment. A teacher of Văn shouldn't see Toán blueprints in the
  // list at all; the strict scope mirrors what's enforced in the
  // blueprint creation dialog so the surface stays consistent.
  const scopedBlueprints = useMemo(() => {
    const campusScope =
      session?.role === "superadmin" ? activeCampusId : session?.campusId ?? null;
    return blueprints.filter((b) => {
      if (campusScope && b.campusId !== campusScope) return false;
      if (!scope.isUnscoped && scope.allowedSubjectIds != null) {
        if (!scope.allowedSubjectIds.has(b.subjectId)) return false;
        if (
          scope.allowedGradeIds != null &&
          !scope.allowedGradeIds.has(b.gradeId)
        ) {
          return false;
        }
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blueprints, session, activeCampusId, scope]);

  const scopedPackages = useMemo(() => {
    const blueprintIds = new Set(scopedBlueprints.map((b) => b.id));
    return packages.filter((p) => blueprintIds.has(p.blueprintId));
  }, [packages, scopedBlueprints]);

  const scopedGenerated = useMemo(() => {
    const packageIds = new Set(scopedPackages.map((p) => p.id));
    return generated.filter((g) => packageIds.has(g.packageId));
  }, [generated, scopedPackages]);

  // Apply tab + filter
  const filteredBlueprints = useMemo(() => {
    return scopedBlueprints.filter((b) => {
      if (subjectFilter !== "all" && b.subjectId !== subjectFilter) return false;
      if (gradeFilter !== "all" && b.gradeId !== gradeFilter) return false;
      if (search.trim()) {
        const h = `${b.id} ${b.name} ${b.ownerName}`.toLowerCase();
        if (!h.includes(search.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [scopedBlueprints, subjectFilter, gradeFilter, search]);

  const filteredPackages = useMemo(() => {
    return scopedPackages.filter((p) => {
      const bp = blueprints.find((b) => b.id === p.blueprintId);
      if (!bp) return false;
      if (subjectFilter !== "all" && bp.subjectId !== subjectFilter) return false;
      if (gradeFilter !== "all" && bp.gradeId !== gradeFilter) return false;
      if (search.trim()) {
        const h = `${p.id} ${p.name} ${p.ownerName}`.toLowerCase();
        if (!h.includes(search.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [scopedPackages, blueprints, subjectFilter, gradeFilter, search]);

  const filteredGenerated = useMemo(() => {
    return scopedGenerated.filter((g) => {
      const pkg = packages.find((p) => p.id === g.packageId);
      const bp = pkg ? blueprints.find((b) => b.id === pkg.blueprintId) : null;
      if (!pkg || !bp) return false;
      if (
        generatedPackageFilter &&
        g.packageId !== generatedPackageFilter
      ) {
        return false;
      }
      if (subjectFilter !== "all" && bp.subjectId !== subjectFilter) return false;
      if (gradeFilter !== "all" && bp.gradeId !== gradeFilter) return false;
      if (search.trim()) {
        const h = `${g.id} ${g.name}`.toLowerCase();
        if (!h.includes(search.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [
    scopedGenerated,
    packages,
    blueprints,
    generatedPackageFilter,
    subjectFilter,
    gradeFilter,
    search,
  ]);

  const kpis = useMemo(() => {
    return {
      blueprints: scopedBlueprints.length,
      packages: scopedPackages.length,
      generated: scopedGenerated.length,
      avgQuestions:
        scopedGenerated.length === 0
          ? 0
          : Math.round(
              scopedGenerated.reduce((s, g) => s + g.questionIds.length, 0) /
                scopedGenerated.length,
            ),
    };
  }, [scopedBlueprints, scopedPackages, scopedGenerated]);

  function openCreateBlueprint() {
    setEditingBlueprint(null);
    setBlueprintDialogOpen(true);
  }
  function openEditBlueprint(b: ExamBlueprint) {
    // Enterprise governance: blueprint in-use (referenced by any
    // non-archived package) cannot be edited in place. Surface the
    // "Tạo phiên bản mới" CTA.
    const usage = blueprintInUse(b.id, allPackagesRaw);
    if (usage.inUse) {
      setBlueprintVersionPrompt({ source: b, blockerReason: usage.reason ?? "" });
      return;
    }
    setEditingBlueprint(b);
    setBlueprintDialogOpen(true);
  }
  function performCloneBlueprint(source: ExamBlueprint) {
    if (!session) return;
    const clone = cloneBlueprintVersion(
      source.id,
      session.userId,
      "Edit khi khung đề đã in-use bởi gói đề",
    );
    if (!clone) return;
    setBlueprintVersionPrompt(null);
    setEditingBlueprint(clone);
    setBlueprintDialogOpen(true);
  }
  function openCreatePackage(b: ExamBlueprint) {
    setPackageBaseBlueprint(b);
    setEditingPackage(null);
    setPackageDialogOpen(true);
  }
  function openEditPackage(p: ExamPackage) {
    const usage = packageInUse(p.id, allShiftsRaw);
    if (usage.inUse) {
      setPackageVersionPrompt({ source: p, blockerReason: usage.reason ?? "" });
      return;
    }
    setEditingPackage(p);
    setPackageBaseBlueprint(null);
    setPackageDialogOpen(true);
  }
  function performClonePackage(source: ExamPackage) {
    if (!session) return;
    const clone = clonePackageVersion(
      source.id,
      session.userId,
      "Edit khi gói đề đã in-use bởi ca thi",
    );
    if (!clone) return;
    setPackageVersionPrompt(null);
    setEditingPackage(clone);
    setPackageBaseBlueprint(null);
    setPackageDialogOpen(true);
  }

  return (
    <>
      <PageHeader
        title="Khung đề & Gói đề"
        description="Tạo khung đề (blueprint) → cấu hình gói đề (ma trận) → sinh đề tự động cho ca thi."
        actions={
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-muted-foreground">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Hiển thị đã lưu trữ
            </label>
            <Button
              size="sm"
              onClick={openCreateBlueprint}
              disabled={!canMutate}
              title={!canMutate ? "Chọn 1 campus để tạo khung đề" : undefined}
            >
              <Plus className="h-4 w-4" />
              Tạo khung đề mới
            </Button>
          </div>
        }
      />

      <CampusGateBanner />

      <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Khung đề"
          value={kpis.blueprints.toLocaleString("vi-VN")}
          icon={LayoutGrid}
          tone="blue"
        />
        <KpiCard
          label="Gói đề"
          value={kpis.packages.toLocaleString("vi-VN")}
          icon={Package2}
          tone="green"
        />
        <KpiCard
          label="Đề đã sinh"
          value={kpis.generated.toLocaleString("vi-VN")}
          icon={Sparkles}
          tone="violet"
        />
        <KpiCard
          label="Câu/đề (trung bình)"
          value={kpis.avgQuestions.toLocaleString("vi-VN")}
          icon={FileText}
          tone="orange"
        />
      </section>

      <div className="mb-3 flex items-center gap-2">
        <div className="inline-flex rounded-xl border bg-card p-1">
          <Tab
            active={tab === "blueprints"}
            onClick={() => {
              setTab("blueprints");
              setGeneratedPackageFilter(null);
            }}
            icon={LayoutGrid}
            label="Khung đề"
          />
          <Tab
            active={tab === "packages"}
            onClick={() => {
              setTab("packages");
              setGeneratedPackageFilter(null);
            }}
            icon={Package2}
            label="Gói đề"
          />
          <Tab
            active={tab === "generated"}
            onClick={() => setTab("generated")}
            icon={Sparkles}
            label="Đề đã sinh"
          />
        </div>
        {/* Active package filter chip — shows when the user clicked
            "Đã sinh" from a package row, narrowing the generated list. */}
        {tab === "generated" && generatedPackageFilter && (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-[11.5px] font-medium text-violet-800">
            Đang lọc theo gói:{" "}
            <span className="font-mono">{generatedPackageFilter}</span>
            <button
              type="button"
              onClick={() => setGeneratedPackageFilter(null)}
              className="rounded p-0.5 hover:bg-violet-100"
              title="Bỏ lọc"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2.5 rounded-xl border bg-card p-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo tên…"
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
      </div>

      {tab === "blueprints" && (
        <BlueprintsView
          blueprints={filteredBlueprints}
          allQuestions={allQuestions}
          subjects={subjects}
          grades={grades}
          onEdit={openEditBlueprint}
          onDelete={setDeletingBlueprint}
          onRestore={(b) => {
            if (!session) return;
            restoreBlueprint(b.id, session.userId);
          }}
          onCreatePackage={openCreatePackage}
        />
      )}

      {tab === "packages" && (
        <PackagesView
          packages={filteredPackages}
          blueprints={blueprints}
          allQuestions={allQuestions}
          generated={generated}
          subjects={subjects}
          grades={grades}
          onEdit={openEditPackage}
          onDelete={setDeletingPackage}
          onRestore={(p) => {
            if (!session) return;
            restorePackage(p.id, session.userId);
          }}
          onGenerate={setGeneratingFor}
          onViewGenerated={(p) => {
            setGeneratedPackageFilter(p.id);
            setTab("generated");
          }}
        />
      )}

      {tab === "generated" && (
        <GeneratedView
          generated={filteredGenerated}
          packages={packages}
          blueprints={blueprints}
          subjects={subjects}
          grades={grades}
          onView={setViewingGenerated}
          onTrial={setTrialingGenerated}
          onDelete={setDeletingGenerated}
          onGenerateMore={setGeneratingFor}
        />
      )}

      {/* Dialogs */}
      <BlueprintDialog
        open={blueprintDialogOpen}
        onOpenChange={(o) => {
          setBlueprintDialogOpen(o);
          if (!o) setEditingBlueprint(null);
        }}
        editing={editingBlueprint}
      />

      <PackageDialog
        open={packageDialogOpen}
        onOpenChange={(o) => {
          setPackageDialogOpen(o);
          if (!o) {
            setEditingPackage(null);
            setPackageBaseBlueprint(null);
          }
        }}
        blueprint={packageBaseBlueprint}
        editing={editingPackage}
        onSaved={() => {
          // After save, surface the package in its tab so the user lands on
          // the thing they just created.
          setTab("packages");
        }}
      />

      <GenerateExamsDialog
        package_={generatingFor}
        onClose={() => setGeneratingFor(null)}
        onGenerated={() => {
          // Drop the user straight into the "Đề đã sinh" tab where the new
          // papers appear (grouped under the source package), each with a
          // "Thi thử" button right there.
          setTab("generated");
        }}
      />

      <ViewGeneratedDialog
        exam={viewingGenerated}
        onClose={() => setViewingGenerated(null)}
      />

      <TrialExamDialog
        exam={trialingGenerated}
        onClose={() => setTrialingGenerated(null)}
        onDelete={(g) => removeGenerated(g.id)}
      />

      <ConfirmActionDialog
        open={Boolean(deletingBlueprint)}
        onOpenChange={(o) => !o && setDeletingBlueprint(null)}
        variant="destructive"
        title="Xoá khung đề?"
        description={
          deletingBlueprint ? (
            <>
              <span className="font-mono">{deletingBlueprint.id}</span> ·{" "}
              {deletingBlueprint.name}. Các gói đề + đề đã sinh liên quan sẽ
              KHÔNG bị xoá tự động — hãy kiểm tra trước.
            </>
          ) : (
            ""
          )
        }
        confirmLabel="Lưu trữ khung đề"
        onConfirm={() => {
          if (!deletingBlueprint || !session) return;
          archiveBlueprint(
            deletingBlueprint.id,
            session.userId,
            "Admin lưu trữ khung đề",
          );
        }}
      />

      <ConfirmActionDialog
        open={Boolean(deletingPackage)}
        onOpenChange={(o) => !o && setDeletingPackage(null)}
        variant="destructive"
        title="Xoá gói đề?"
        description={
          deletingPackage ? (
            (() => {
              const refShifts = shifts.filter(
                (sh) => sh.packageId === deletingPackage.id,
              );
              if (refShifts.length > 0) {
                return (
                  <>
                    🔒 <b>Không thể xoá gói đề này.</b>{" "}
                    {refShifts.length} ca thi đang sử dụng:{" "}
                    <span className="font-mono">
                      {refShifts.map((s) => s.name).join(", ")}
                    </span>
                    . Xoá hoặc dời ca thi sang gói khác trước, sau đó mới
                    xoá gói đề.
                  </>
                );
              }
              return (
                <>
                  <span className="font-mono">{deletingPackage.id}</span> ·{" "}
                  {deletingPackage.name}. Tất cả đề đã sinh từ gói đề này sẽ bị
                  xoá theo.
                </>
              );
            })()
          ) : (
            ""
          )
        }
        confirmLabel="Lưu trữ gói đề"
        disableConfirm={
          deletingPackage
            ? shifts.some(
                (sh) =>
                  !sh.archivedAt && sh.packageId === deletingPackage.id,
              )
            : false
        }
        onConfirm={() => {
          if (!deletingPackage || !session) return;
          const inUse = shifts.some(
            (sh) =>
              !sh.archivedAt && sh.packageId === deletingPackage.id,
          );
          if (inUse) return;
          // Soft-archive; generated-store (localStorage) can still be
          // pruned for housekeeping since it's not audit-tracked.
          removeGeneratedByPackage(deletingPackage.id);
          archivePackage(
            deletingPackage.id,
            session.userId,
            "Admin lưu trữ gói đề",
          );
        }}
      />

      <ConfirmActionDialog
        open={Boolean(deletingGenerated)}
        onOpenChange={(o) => !o && setDeletingGenerated(null)}
        variant="destructive"
        title="Xoá đề đã sinh?"
        description={
          deletingGenerated ? (
            <>
              <span className="font-mono">{deletingGenerated.id}</span> ·{" "}
              {deletingGenerated.name}. Hành động không thể hoàn tác.
            </>
          ) : (
            ""
          )
        }
        confirmLabel="Xoá đề"
        onConfirm={() =>
          deletingGenerated && removeGenerated(deletingGenerated.id)
        }
      />

      <ConfirmActionDialog
        open={Boolean(blueprintVersionPrompt)}
        onOpenChange={(o) => !o && setBlueprintVersionPrompt(null)}
        variant="default"
        title="Khung đề đã được dùng bởi gói đề"
        description={
          blueprintVersionPrompt ? (
            <>
              {buildLockedMessage({
                inUse: true,
                reason: blueprintVersionPrompt.blockerReason,
              })}
              <div className="mt-2 rounded-md bg-muted/40 px-3 py-2 text-[11.5px] text-muted-foreground">
                Phiên bản mới sẽ là{" "}
                <span className="font-semibold">
                  v{versionOf(blueprintVersionPrompt.source) + 1}
                </span>{" "}
                trong chuỗi của khung đề{" "}
                <span className="font-mono">{blueprintVersionPrompt.source.name}</span>
                .
              </div>
            </>
          ) : (
            ""
          )
        }
        confirmLabel="Tạo phiên bản mới"
        onConfirm={() => {
          if (blueprintVersionPrompt)
            performCloneBlueprint(blueprintVersionPrompt.source);
        }}
      />

      <ConfirmActionDialog
        open={Boolean(packageVersionPrompt)}
        onOpenChange={(o) => !o && setPackageVersionPrompt(null)}
        variant="default"
        title="Gói đề đã được dùng bởi ca thi"
        description={
          packageVersionPrompt ? (
            <>
              {buildLockedMessage({
                inUse: true,
                reason: packageVersionPrompt.blockerReason,
              })}
              <div className="mt-2 rounded-md bg-muted/40 px-3 py-2 text-[11.5px] text-muted-foreground">
                Phiên bản mới sẽ là{" "}
                <span className="font-semibold">
                  v{versionOf(packageVersionPrompt.source) + 1}
                </span>{" "}
                — bắt đầu ở trạng thái <span className="font-semibold">draft</span>
                , cần được duyệt lại trước khi dùng cho ca thi mới.
              </div>
            </>
          ) : (
            ""
          )
        }
        confirmLabel="Tạo phiên bản mới"
        onConfirm={() => {
          if (packageVersionPrompt)
            performClonePackage(packageVersionPrompt.source);
        }}
      />
    </>
  );
}

function Tab({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick(): void;
  icon: typeof LayoutGrid;
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

/* ───────── Blueprints ───────── */

function BlueprintsView({
  blueprints,
  allQuestions,
  subjects,
  grades,
  onEdit,
  onDelete,
  onRestore,
  onCreatePackage,
}: {
  blueprints: ExamBlueprint[];
  allQuestions: Parameters<typeof BlueprintCard>[0]["questions"];
  subjects: Array<{ id: string; name: string; color: string }>;
  grades: Array<{ id: string; name: string; code: string }>;
  onEdit(b: ExamBlueprint): void;
  onDelete(b: ExamBlueprint): void;
  onRestore(b: ExamBlueprint): void;
  onCreatePackage(b: ExamBlueprint): void;
}) {
  if (blueprints.length === 0) {
    return (
      <EmptyState
        title="Chưa có khung đề nào"
        description="Bấm “Tạo khung đề mới” ở góc trên để bắt đầu."
      />
    );
  }
  // Newest first.
  const sorted = blueprints
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const idx = indexQuestions(allQuestions);
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead className="bg-muted/30 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 text-left font-semibold">Mã</th>
              <th className="px-3 py-2.5 text-left font-semibold">Tên khung đề</th>
              <th className="px-3 py-2.5 text-left font-semibold">Môn · Khối</th>
              <th className="px-3 py-2.5 text-center font-semibold">Cấu trúc</th>
              <th className="px-3 py-2.5 text-center font-semibold">Số câu</th>
              <th className="px-3 py-2.5 text-center font-semibold">Thời lượng</th>
              <th className="px-3 py-2.5 text-left font-semibold">Trạng thái</th>
              <th className="px-3 py-2.5 text-right font-semibold">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sorted.map((b) => {
              const subject = subjects.find((s) => s.id === b.subjectId);
              const grade = grades.find((g) => g.id === b.gradeId);
              const totals = countBlueprintByDifficulty(b, idx);
              const totalQ = totals.easy + totals.medium + totals.hard;
              return (
                <tr
                  key={b.id}
                  className={`hover:bg-accent/15 ${b.archivedAt ? "opacity-60" : ""}`}
                >
                  <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">
                    {b.id}
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="line-clamp-1 font-semibold">{b.name}</p>
                    <p className="line-clamp-1 text-[11px] text-muted-foreground">
                      GV {b.ownerName}
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
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-center gap-1.5 text-[11px]">
                      <span
                        className="inline-flex items-center gap-0.5 rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700"
                        title={`${totals.easy} câu Dễ`}
                      >
                        D <b>{totals.easy}</b>
                      </span>
                      <span
                        className="inline-flex items-center gap-0.5 rounded bg-amber-50 px-1.5 py-0.5 text-amber-700"
                        title={`${totals.medium} câu Trung bình`}
                      >
                        TB <b>{totals.medium}</b>
                      </span>
                      <span
                        className="inline-flex items-center gap-0.5 rounded bg-rose-50 px-1.5 py-0.5 text-rose-700"
                        title={`${totals.hard} câu Khó`}
                      >
                        K <b>{totals.hard}</b>
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center font-semibold">
                    {totalQ}
                  </td>
                  <td className="px-3 py-2.5 text-center text-foreground/80">
                    {b.duration}p
                  </td>
                  <td className="px-3 py-2.5">
                    {versionOf(b) > 1 && (
                      <span className="mr-1 rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                        v{versionOf(b)}
                      </span>
                    )}
                    {b.archivedAt ? (
                      <span className="rounded-md border border-zinc-300 bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
                        🗄 Đã lưu trữ
                      </span>
                    ) : (
                      <span className="rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                        Đang dùng
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      {b.archivedAt ? (
                        <IconButton
                          size="sm"
                          variant="primary"
                          title="Khôi phục"
                          onClick={() => onRestore(b)}
                        >
                          <RotateCcw
                            className="h-3.5 w-3.5"
                            strokeWidth={1.75}
                          />
                        </IconButton>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onCreatePackage(b)}
                            title="Tạo gói đề từ khung này"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Gói đề
                          </Button>
                          <IconButton
                            size="sm"
                            variant="primary"
                            title="Sửa khung đề"
                            onClick={() => onEdit(b)}
                          >
                            <PencilLine
                              className="h-3.5 w-3.5"
                              strokeWidth={1.75}
                            />
                          </IconButton>
                          <IconButton
                            size="sm"
                            variant="destructive"
                            title="Lưu trữ"
                            onClick={() => onDelete(b)}
                          >
                            <Trash2
                              className="h-3.5 w-3.5"
                              strokeWidth={1.75}
                            />
                          </IconButton>
                        </>
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
  );
}

/* ───────── Packages ───────── */

function PackagesView({
  packages,
  blueprints,
  allQuestions,
  generated,
  subjects,
  grades,
  onEdit,
  onDelete,
  onRestore,
  onGenerate,
  onViewGenerated,
}: {
  packages: ExamPackage[];
  blueprints: ExamBlueprint[];
  allQuestions: Parameters<typeof BlueprintCard>[0]["questions"];
  generated: GeneratedExam[];
  subjects: Array<{ id: string; name: string; color: string }>;
  grades: Array<{ id: string; name: string; code: string }>;
  onEdit(p: ExamPackage): void;
  onDelete(p: ExamPackage): void;
  onRestore(p: ExamPackage): void;
  onGenerate(p: ExamPackage): void;
  /** Click on the "Đã sinh" pill — jump to the Generated tab,
   *  pre-filtered to this package. */
  onViewGenerated(p: ExamPackage): void;
}) {
  if (packages.length === 0) {
    return (
      <EmptyState
        title="Chưa có gói đề nào"
        description="Vào tab Khung đề, mở 1 khung đề rồi bấm “Tạo gói đề”."
      />
    );
  }
  const idx = indexQuestions(allQuestions);
  // Newest first.
  const sorted = packages
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead className="bg-muted/30 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 text-left font-semibold">Mã</th>
              <th className="px-3 py-2.5 text-left font-semibold">Tên gói đề</th>
              <th className="px-3 py-2.5 text-left font-semibold">Khung đề</th>
              <th className="px-3 py-2.5 text-left font-semibold">Môn · Khối</th>
              <th className="px-3 py-2.5 text-center font-semibold">Cấu trúc</th>
              <th className="px-3 py-2.5 text-center font-semibold">Câu/đề</th>
              <th className="px-3 py-2.5 text-center font-semibold">Thời lượng</th>
              <th className="px-3 py-2.5 text-center font-semibold">Đã sinh</th>
              <th className="px-3 py-2.5 text-left font-semibold">Duyệt</th>
              <th className="px-3 py-2.5 text-right font-semibold">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sorted.map((p) => {
              const bp = blueprints.find((b) => b.id === p.blueprintId);
              const subject = bp
                ? subjects.find((s) => s.id === bp.subjectId)
                : null;
              const grade = bp
                ? grades.find((g) => g.id === bp.gradeId)
                : null;
              const perExam = p.matrix.reduce(
                (s, r) => s + r.easyCount + r.mediumCount + r.hardCount,
                0,
              );
              const genCount = generated.filter(
                (g) => g.packageId === p.id,
              ).length;
              const bpTotals = bp
                ? countBlueprintByDifficulty(bp, idx)
                : { easy: 0, medium: 0, hard: 0 };
              return (
                <tr
                  key={p.id}
                  className={`hover:bg-accent/15 ${p.archivedAt ? "opacity-60" : ""}`}
                >
                  <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">
                    {p.id}
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="line-clamp-1 font-semibold">{p.name}</p>
                    <p className="line-clamp-1 text-[11px] text-muted-foreground">
                      GV {p.ownerName}
                      {versionOf(p) > 1 ? (
                        <>
                          {" · "}
                          <span className="rounded border border-blue-200 bg-blue-50 px-1 text-[10px] font-bold text-blue-700">
                            v{versionOf(p)}
                          </span>
                        </>
                      ) : null}
                    </p>
                  </td>
                  <td className="px-3 py-2.5">
                    {bp ? (
                      <p className="line-clamp-1 text-foreground/80">
                        {bp.name}
                      </p>
                    ) : (
                      <span className="text-rose-700">— Khung đã xoá</span>
                    )}
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
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-center gap-1.5 text-[11px]">
                      <span
                        className="inline-flex items-center gap-0.5 rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700"
                        title={`Pool ${bpTotals.easy} câu Dễ`}
                      >
                        D <b>{bpTotals.easy}</b>
                      </span>
                      <span
                        className="inline-flex items-center gap-0.5 rounded bg-amber-50 px-1.5 py-0.5 text-amber-700"
                        title={`Pool ${bpTotals.medium} câu Trung bình`}
                      >
                        TB <b>{bpTotals.medium}</b>
                      </span>
                      <span
                        className="inline-flex items-center gap-0.5 rounded bg-rose-50 px-1.5 py-0.5 text-rose-700"
                        title={`Pool ${bpTotals.hard} câu Khó`}
                      >
                        K <b>{bpTotals.hard}</b>
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center font-semibold">
                    {perExam}
                  </td>
                  <td className="px-3 py-2.5 text-center text-foreground/80">
                    {p.duration}p
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {genCount > 0 ? (
                      <button
                        type="button"
                        onClick={() => onViewGenerated(p)}
                        title={`Xem ${genCount} đề đã sinh từ gói này`}
                        className="inline-flex cursor-pointer items-center gap-1 rounded bg-violet-50 px-1.5 py-0.5 text-violet-700 transition-colors hover:bg-violet-100"
                      >
                        <Sparkles className="h-3 w-3" />
                        <b>{genCount}</b>
                      </button>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 rounded bg-muted/40 px-1.5 py-0.5 text-muted-foreground"
                        title="Chưa sinh đề nào từ gói này"
                      >
                        <Sparkles className="h-3 w-3" />
                        <b>0</b>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <PackageStatusBadge status={p.status} />
                    {p.archivedAt ? (
                      <span className="ml-1 rounded-md border border-zinc-300 bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
                        🗄
                      </span>
                    ) : null}
                    {p.status === "rejected" && p.rejectionNote && (
                      <p
                        className="mt-1 line-clamp-1 text-[10.5px] text-rose-700"
                        title={p.rejectionNote}
                      >
                        ⚠ {p.rejectionNote}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      {p.archivedAt ? (
                        <IconButton
                          size="sm"
                          variant="primary"
                          title="Khôi phục"
                          onClick={() => onRestore(p)}
                        >
                          <RotateCcw
                            className="h-3.5 w-3.5"
                            strokeWidth={1.75}
                          />
                        </IconButton>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!bp}
                            onClick={() => onGenerate(p)}
                            title="Sinh đề tự động từ gói này"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            Sinh đề
                          </Button>
                          <IconButton
                            size="sm"
                            variant="primary"
                            title="Sửa gói đề"
                            onClick={() => onEdit(p)}
                          >
                            <PencilLine
                              className="h-3.5 w-3.5"
                              strokeWidth={1.75}
                            />
                          </IconButton>
                          <IconButton
                            size="sm"
                            variant="destructive"
                            title="Lưu trữ"
                            onClick={() => onDelete(p)}
                          >
                            <Trash2
                              className="h-3.5 w-3.5"
                              strokeWidth={1.75}
                            />
                          </IconButton>
                        </>
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
  );
}

/* ───────── Generated (grouped by package) ───────── */

function GeneratedView({
  generated,
  packages,
  blueprints,
  subjects,
  grades,
  onView,
  onTrial,
  onDelete,
  onGenerateMore,
}: {
  generated: GeneratedExam[];
  packages: ExamPackage[];
  blueprints: ExamBlueprint[];
  subjects: ReturnType<typeof useSubjectsStore.getState>["subjects"];
  grades: ReturnType<typeof useGradesStore.getState>["grades"];
  onView(g: GeneratedExam): void;
  onTrial(g: GeneratedExam): void;
  onDelete(g: GeneratedExam): void;
  onGenerateMore(p: ExamPackage): void;
}) {
  if (generated.length === 0) {
    return (
      <EmptyState
        title="Chưa có đề nào được sinh"
        description="Vào tab Gói đề → bấm “Sinh đề” để tự động tạo các đề thi từ ma trận."
      />
    );
  }
  // Group by packageId, preserving generated order (newest first per package).
  const groups = new Map<string, GeneratedExam[]>();
  for (const g of generated) {
    const list = groups.get(g.packageId);
    if (list) list.push(g);
    else groups.set(g.packageId, [g]);
  }

  return (
    <div className="space-y-6">
      {Array.from(groups.entries()).map(([packageId, exams]) => {
        const pkg = packages.find((p) => p.id === packageId);
        const bp = pkg ? blueprints.find((b) => b.id === pkg.blueprintId) : null;
        const subject = bp ? subjects.find((s) => s.id === bp.subjectId) : null;
        const grade = bp ? grades.find((g) => g.id === bp.gradeId) : null;
        const perExam = exams[0]?.questionIds.length ?? 0;
        return (
          <section
            key={packageId}
            className="overflow-hidden rounded-xl border bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
          >
            {/* Group header (Gói đề meta + sinh thêm) */}
            <header className="flex flex-wrap items-center gap-3 border-b bg-blue-50/40 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  {subject && (
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                      style={{
                        backgroundColor: `${subject.color}1A`,
                        color: subject.color,
                      }}
                    >
                      {subject.name}
                    </span>
                  )}
                  {grade && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-foreground/70">
                      {grade.code}
                    </span>
                  )}
                  <span className="rounded-md bg-foreground/8 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground/65">
                    {packageId}
                  </span>
                </div>
                <p className="text-[15px] font-semibold leading-snug text-foreground">
                  {pkg?.name ?? `Gói đề đã bị xoá (${packageId})`}
                </p>
                <p className="text-[12px] text-muted-foreground">
                  {perExam} câu/đề · {pkg?.duration ?? "?"} phút ·{" "}
                  {bp ? `Khung: ${bp.name}` : "Khung đề đã bị xoá"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-semibold tabular-nums text-primary-text">
                  {exams.length} đề
                </span>
                {pkg && (
                  <Button size="sm" onClick={() => onGenerateMore(pkg)}>
                    <Sparkles className="h-3.5 w-3.5" />
                    Sinh thêm
                  </Button>
                )}
              </div>
            </header>

            {/* Exam cards */}
            <ul className="grid gap-2.5 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {exams.map((g, idx) => (
                <li
                  key={g.id}
                  className="overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-[0_4px_14px_-4px_rgba(15,23,42,0.08)]"
                >
                  <div className="space-y-2 border-b bg-primary/8 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-0.5 text-[11px] font-bold text-white">
                        #{idx + 1}
                      </span>
                      <span className="font-mono text-[10px] font-semibold text-muted-foreground">
                        {g.id}
                      </span>
                    </div>
                    <p className="text-[13px] font-semibold leading-snug text-foreground">
                      {g.name}
                    </p>
                    <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span>📑 {g.questionIds.length} câu</span>
                      <span>· ⏱ {g.duration}p</span>
                      <span>· {formatGenAt(g.createdAt)}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1 px-2.5 py-2">
                    <Button
                      size="sm"
                      onClick={() => onTrial(g)}
                      className="flex-1"
                    >
                      <PlayCircle className="h-3.5 w-3.5" />
                      Thi thử
                    </Button>
                    <IconButton
                      size="sm"
                      title="Xem chi tiết"
                      onClick={() => onView(g)}
                    >
                      <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </IconButton>
                    <IconButton
                      size="sm"
                      variant="destructive"
                      title="Xoá đề"
                      onClick={() => onDelete(g)}
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </IconButton>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function formatGenAt(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  } catch {
    return iso;
  }
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-10 text-center">
      <p className="text-section-title">{title}</p>
      <p className="text-small mt-1 text-muted-foreground">{description}</p>
    </div>
  );
}

function PackageStatusBadge({ status }: { status: ExamPackage["status"] }) {
  const cfg = {
    draft: {
      label: "Bản nháp",
      className: "border-slate-300 bg-slate-100 text-slate-700",
    },
    pending: {
      label: "Chờ duyệt",
      className: "border-amber-300 bg-amber-100 text-amber-800",
    },
    approved: {
      label: "Đã duyệt",
      className: "border-emerald-300 bg-emerald-100 text-emerald-800",
    },
    rejected: {
      label: "Bị từ chối",
      className: "border-rose-300 bg-rose-100 text-rose-700",
    },
  }[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]",
        cfg.className,
      )}
    >
      {cfg.label}
    </span>
  );
}
