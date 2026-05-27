"use client";

import {
  Building2,
  CloudUpload,
  Plus,
  User,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useUserScope } from "@/features/auth/lib/use-scope";
import { useCampusStore } from "@/features/campus/state/campus-store";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";

import {
  FILE_TYPE_LABEL,
  type LearningMaterial,
  type MaterialFileType,
} from "../data/types";
import { useMaterialsStore } from "../state/materials-store";
import { MaterialCard } from "./material-card";

const UploadMaterialDialog = dynamic(
  () =>
    import("../dialogs/upload-material-dialog").then(
      (m) => m.UploadMaterialDialog,
    ),
  { ssr: false, loading: () => null },
);

const MaterialViewerDialog = dynamic(
  () =>
    import("../dialogs/material-viewer-dialog").then(
      (m) => m.MaterialViewerDialog,
    ),
  { ssr: false, loading: () => null },
);

type KhoView = "campus" | "personal";

interface Props {
  /** When true (admin pages), shows the kho tabs + filters and the
   *  archive controls on each card. Student view passes false. */
  showAdminControls?: boolean;
  /** Override the materials list — used by the student page to feed
   *  a pre-filtered list (only approved campus). */
  materialsOverride?: LearningMaterial[];
}

export function MaterialsTab({
  showAdminControls = true,
  materialsOverride,
}: Props) {
  const session = useAuthStore((s) => s.session);
  const scope = useUserScope();
  const activeCampusId = useCampusStore((s) => s.activeCampusId);
  const subjects = useSubjectsStore((s) => s.subjects);
  const grades = useGradesStore((s) => s.grades);
  const allMaterials = useMaterialsStore((s) => s.materials);
  const archiveMaterial = useMaterialsStore((s) => s.archive);
  const restoreMaterial = useMaterialsStore((s) => s.restore);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [viewing, setViewing] = useState<LearningMaterial | null>(null);
  const [khoView, setKhoView] = useState<KhoView>("campus");
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [gradeFilter, setGradeFilter] = useState<string>("all");
  const [fileTypeFilter, setFileTypeFilter] = useState<MaterialFileType | "all">(
    "all",
  );
  const [showArchived, setShowArchived] = useState(false);

  const operatingCampusId =
    session?.role === "superadmin"
      ? activeCampusId ?? null
      : session?.campusId ?? null;

  // Source list: either an override (student view) or the full store
  // filtered down by kho + campus + scope.
  const filtered = useMemo(() => {
    let rows = materialsOverride ?? allMaterials;
    if (!showArchived) rows = rows.filter((m) => !m.archivedAt);
    if (showAdminControls) {
      // Kho filter (campus vs personal).
      if (khoView === "campus") {
        rows = rows.filter(
          (m) =>
            m.kho === "campus" &&
            (operatingCampusId ? m.campusId === operatingCampusId : true),
        );
      } else {
        rows = rows.filter(
          (m) => m.kho === "personal" && m.ownerId === session?.userId,
        );
      }
    }
    // Scope filter (teacher can only see their assigned subjects).
    if (!scope.isUnscoped && scope.allowedSubjectIds) {
      rows = rows.filter((m) => scope.allowedSubjectIds!.has(m.subjectId));
    }
    if (subjectFilter !== "all") {
      rows = rows.filter((m) => m.subjectId === subjectFilter);
    }
    if (gradeFilter !== "all") {
      rows = rows.filter((m) => m.gradeId === gradeFilter);
    }
    if (fileTypeFilter !== "all") {
      rows = rows.filter((m) => m.fileType === fileTypeFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((m) =>
        `${m.title} ${m.description ?? ""} ${m.ownerName}`
          .toLowerCase()
          .includes(q),
      );
    }
    // Newest first.
    return rows
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [
    allMaterials,
    materialsOverride,
    showAdminControls,
    showArchived,
    khoView,
    operatingCampusId,
    scope,
    subjectFilter,
    gradeFilter,
    fileTypeFilter,
    search,
    session?.userId,
  ]);

  return (
    <>
      {showAdminControls && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="inline-flex rounded-xl border bg-card p-1">
            <KhoTab
              active={khoView === "campus"}
              onClick={() => setKhoView("campus")}
              icon={Building2}
              label="Kho trường"
            />
            <KhoTab
              active={khoView === "personal"}
              onClick={() => setKhoView("personal")}
              icon={User}
              label="Kho cá nhân"
            />
          </div>
          <Button onClick={() => setUploadOpen(true)}>
            <Plus className="h-4 w-4" />
            Upload học liệu
          </Button>
        </div>
      )}

      {showAdminControls && (
        <div className="mb-3 flex flex-wrap items-center gap-2.5 rounded-xl border bg-card p-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tiêu đề, mô tả, tác giả…"
            className="h-9 min-w-[220px] flex-1"
          />
          <Select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="h-9 min-w-[130px]"
          >
            <option value="all">Môn: Tất cả</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
            className="h-9 min-w-[110px]"
          >
            <option value="all">Khối: Tất cả</option>
            {grades.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
          <Select
            value={fileTypeFilter}
            onChange={(e) =>
              setFileTypeFilter(e.target.value as MaterialFileType | "all")
            }
            className="h-9 min-w-[120px]"
          >
            <option value="all">Loại: Tất cả</option>
            {Object.entries(FILE_TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
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
      )}

      {filtered.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center">
          <CloudUpload className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-section-title">Chưa có học liệu nào</p>
          {showAdminControls ? (
            <p className="text-meta mt-1">
              Bấm{" "}
              <span className="font-semibold">"Upload học liệu"</span> để bắt
              đầu chia sẻ bài giảng, video, tài liệu cho lớp.
            </p>
          ) : (
            <p className="text-meta mt-1">
              Giáo viên sẽ upload bài giảng, tài liệu cho lớp ở đây.
            </p>
          )}
        </div>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {filtered.map((m) => (
            <li key={m.id}>
              <MaterialCard
                material={m}
                onView={setViewing}
                onArchive={
                  showAdminControls
                    ? (target) => {
                        if (!session) return;
                        void archiveMaterial(
                          target.id,
                          session.userId,
                          "Admin/GV lưu trữ học liệu",
                        );
                      }
                    : undefined
                }
                onRestore={
                  showAdminControls
                    ? (target) => {
                        if (!session) return;
                        restoreMaterial(target.id, session.userId);
                      }
                    : undefined
                }
              />
            </li>
          ))}
        </ul>
      )}

      <UploadMaterialDialog open={uploadOpen} onOpenChange={setUploadOpen} />
      <MaterialViewerDialog
        material={viewing}
        onClose={() => setViewing(null)}
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
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
        active
          ? "bg-foreground text-background"
          : "text-foreground/65 hover:bg-accent hover:text-foreground"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
