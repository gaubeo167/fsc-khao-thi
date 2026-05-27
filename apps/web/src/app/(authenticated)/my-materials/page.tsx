"use client";

import {
  BookOpen,
  ClipboardList,
  FileText,
  FileType,
  FolderOpen,
  Image as ImageIcon,
  Library,
  Music2,
  Play,
  Search,
  Share2,
  Sparkles,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { KpiCard, type KpiTone } from "@/components/ui/kpi-card";
import { Select } from "@/components/ui/select";
import { useUsersStore } from "@/features/admin/users/users-store";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { useHomeworkStore } from "@/features/homework/state/homework-store";
import { MaterialCard } from "@/features/learning-materials/components/material-card";
import {
  FILE_TYPE_LABEL,
  type LearningMaterial,
  type MaterialFileType,
} from "@/features/learning-materials/data/types";
import { useMaterialsStore } from "@/features/learning-materials/state/materials-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { PageHeader } from "@/features/shell/components/page-header";

const MaterialViewerDialog = dynamic(
  () =>
    import(
      "@/features/learning-materials/dialogs/material-viewer-dialog"
    ).then((m) => m.MaterialViewerDialog),
  { ssr: false, loading: () => null },
);

/** Where a visible material came from — used for filter chip + per-card
 *  badge so the student can tell at a glance which BTVN required this
 *  material vs. which one was just shared with the lớp/khối. */
type MaterialSource = "homework" | "shared";

interface VisibleMaterial {
  material: LearningMaterial;
  source: MaterialSource;
  /** When source = "homework", the title of the BTVN that brought
   *  this material in. Null for shared. */
  homeworkTitle: string | null;
  homeworkId: string | null;
}

const FILE_TYPE_TILES: Array<{
  key: MaterialFileType;
  label: string;
  icon: typeof Play;
  tone: KpiTone;
}> = [
  { key: "video", label: "Video", icon: Play, tone: "red" },
  { key: "pdf", label: "PDF", icon: FileText, tone: "orange" },
  { key: "word", label: "Word", icon: FileText, tone: "blue" },
  { key: "powerpoint", label: "PowerPoint", icon: FileType, tone: "orange" },
  { key: "excel", label: "Excel", icon: FileText, tone: "green" },
  { key: "image", label: "Hình ảnh", icon: ImageIcon, tone: "violet" },
  { key: "audio", label: "Audio", icon: Music2, tone: "blue" },
  { key: "other", label: "Khác", icon: FolderOpen, tone: "blue" },
];

export default function MyMaterialsPage() {
  const session = useAuthStore((s) => s.session);
  const allMaterials = useMaterialsStore((s) => s.materials);
  const allHomework = useHomeworkStore((s) => s.homework);
  const allClasses = useGradesStore((s) => s.classes);
  const subjects = useSubjectsStore((s) => s.subjects);
  const grades = useGradesStore((s) => s.grades);
  const users = useUsersStore((s) => s.users);

  // UNION of class membership signals so legacy users (className) and
  // new users (classIds[]) are both resolved.
  const myClassIds = useMemo(() => {
    if (!session) return new Set<string>();
    const ids = new Set<string>();
    const me = users.find((u) => u.id === session.userId);
    // 1) classes that list me explicitly
    for (const c of allClasses) {
      const studentIds = (c as { studentIds?: string[] }).studentIds ?? [];
      if (studentIds.includes(session.userId)) ids.add(c.id);
    }
    // 2) user.classIds[]
    if (me?.classIds) for (const id of me.classIds) ids.add(id);
    // 3) legacy user.className → match by code or name (case-insensitive)
    if (me?.className) {
      const cn = me.className.trim().toLowerCase();
      for (const c of allClasses) {
        if (c.code.toLowerCase() === cn || c.name.toLowerCase() === cn) {
          ids.add(c.id);
        }
      }
    }
    return ids;
  }, [allClasses, users, session]);

  /** Build the visibility map — every approved campus material the
   *  student should see, with provenance attached. */
  const visible = useMemo<VisibleMaterial[]>(() => {
    if (!session) return [];
    const seen = new Map<string, VisibleMaterial>();

    // Pass 1 — materials EXPLICITLY shared with at least one of the
    // student's classes. Materials with empty classIds are NOT shown
    // here even if they sit in kho trường (approved); they need either
    // (a) explicit class assignment, or (b) attachment to a BTVN
    // assigned to this student (pass 2). This matches teacher intent —
    // "available in kho trường" ≠ "shared with students".
    for (const m of allMaterials) {
      if (m.archivedAt) continue;
      if (m.kho !== "campus") continue;
      if (m.status !== "approved") continue;
      if (session.campusId && m.campusId !== session.campusId) continue;
      if (!m.classIds || m.classIds.length === 0) continue;
      const reachable = m.classIds.some((cid) => myClassIds.has(cid));
      if (!reachable) continue;
      seen.set(m.id, {
        material: m,
        source: "shared",
        homeworkTitle: null,
        homeworkId: null,
      });
    }

    // Pass 2 — materials attached to BTVN this student was assigned.
    // BTVN can pull in personal-kho materials too (teacher's own
    // uploads not yet promoted to kho trường), so we don't restrict by
    // kho/status here.
    for (const h of allHomework) {
      if (h.archivedAt) continue;
      if (h.status === "draft") continue;
      if (session.campusId && h.campusId !== session.campusId) continue;
      const perStudent = h.studentIds && h.studentIds.length > 0;
      const reachable = perStudent
        ? h.studentIds!.includes(session.userId)
        : h.classIds.some((cid) => myClassIds.has(cid));
      if (!reachable) continue;
      for (const mid of h.materialIds) {
        const m = allMaterials.find((x) => x.id === mid);
        if (!m || m.archivedAt) continue;
        // BTVN trumps "shared" provenance — knowing the BTVN context
        // is more useful to the student.
        seen.set(m.id, {
          material: m,
          source: "homework",
          homeworkTitle: h.title,
          homeworkId: h.id,
        });
      }
    }

    // Content-identity dedupe: when a teacher uploads the same file to
    // both kho trường (Chia sẻ) and kho cá nhân (BTVN attach), the
    // student would otherwise see it twice. Merge by
    // (title + fileType + sizeBytes/externalUrl), keeping the BTVN row
    // when both exist (more specific context).
    const byKey = new Map<string, VisibleMaterial>();
    for (const v of seen.values()) {
      const m = v.material;
      const key = `${m.title.trim().toLowerCase()}|${m.fileType}|${m.sourceType === "link" ? m.externalUrl ?? "" : m.sizeBytes}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, v);
        continue;
      }
      // BTVN provenance wins; otherwise keep the newer.
      if (v.source === "homework" && existing.source !== "homework") {
        byKey.set(key, v);
      } else if (
        v.source === existing.source &&
        v.material.createdAt > existing.material.createdAt
      ) {
        byKey.set(key, v);
      }
    }

    return [...byKey.values()].sort((a, b) =>
      a.material.createdAt < b.material.createdAt ? 1 : -1,
    );
  }, [allMaterials, allHomework, session, myClassIds]);

  // -------- Filters --------
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [gradeFilter, setGradeFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<MaterialFileType | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<MaterialSource | "all">(
    "all",
  );

  // Subjects the student actually has materials in — keeps the dropdown tight.
  const mySubjects = useMemo(() => {
    const ids = new Set(visible.map((v) => v.material.subjectId));
    return subjects.filter((s) => ids.has(s.id));
  }, [visible, subjects]);

  const myGrades = useMemo(() => {
    const ids = new Set(
      visible.map((v) => v.material.gradeId).filter(Boolean) as string[],
    );
    return grades.filter((g) => ids.has(g.id));
  }, [visible, grades]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visible.filter((v) => {
      const m = v.material;
      if (subjectFilter !== "all" && m.subjectId !== subjectFilter) {
        return false;
      }
      if (gradeFilter !== "all" && m.gradeId !== gradeFilter) return false;
      if (typeFilter !== "all" && m.fileType !== typeFilter) return false;
      if (sourceFilter !== "all" && v.source !== sourceFilter) return false;
      if (q) {
        const hay = `${m.title} ${m.description ?? ""} ${m.ownerName} ${m.tags.join(
          " ",
        )} ${v.homeworkTitle ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [visible, search, subjectFilter, gradeFilter, typeFilter, sourceFilter]);

  // -------- Dashboard KPIs (over the unfiltered scope) --------
  const kpis = useMemo(() => {
    const total = visible.length;
    const homeworkCount = visible.filter(
      (v) => v.source === "homework",
    ).length;
    const sharedCount = total - homeworkCount;
    // "Mới trong 7 ngày" — pulled in within the last week.
    const cutoff = Date.now() - 7 * 24 * 3600_000;
    const recentCount = visible.filter(
      (v) => new Date(v.material.createdAt).getTime() >= cutoff,
    ).length;
    return { total, homeworkCount, sharedCount, recentCount };
  }, [visible]);

  // Per-type counts so the filter strip can show "Video 3" etc.
  const typeCounts = useMemo(() => {
    const out: Record<MaterialFileType, number> = {
      video: 0,
      pdf: 0,
      word: 0,
      powerpoint: 0,
      excel: 0,
      image: 0,
      audio: 0,
      other: 0,
    };
    for (const v of visible) out[v.material.fileType]++;
    return out;
  }, [visible]);

  // Tile colors mirror MaterialCard's iconForType.
  const [viewing, setViewing] = useState<LearningMaterial | null>(null);

  const hasActiveFilters =
    search.trim().length > 0 ||
    subjectFilter !== "all" ||
    gradeFilter !== "all" ||
    typeFilter !== "all" ||
    sourceFilter !== "all";

  function resetFilters() {
    setSearch("");
    setSubjectFilter("all");
    setGradeFilter("all");
    setTypeFilter("all");
    setSourceFilter("all");
  }

  return (
    <>
      <PageHeader
        title="Học liệu của tôi"
        description="Bài giảng, video, tài liệu giáo viên đã chia sẻ hoặc giao cho bạn qua BTVN."
      />

      {/* Dashboard */}
      <section className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Tổng học liệu"
          value={kpis.total.toLocaleString("vi-VN")}
          icon={Library}
          tone="blue"
          hint={`${mySubjects.length} môn · ${myGrades.length || 1} khối`}
        />
        <KpiCard
          label="Từ BTVN"
          value={kpis.homeworkCount.toLocaleString("vi-VN")}
          icon={ClipboardList}
          tone="violet"
          hint="Tài liệu đính kèm bài tập về nhà"
        />
        <KpiCard
          label="GV chia sẻ"
          value={kpis.sharedCount.toLocaleString("vi-VN")}
          icon={Share2}
          tone="green"
          hint="Giáo viên chia sẻ cho lớp / khối"
        />
        <KpiCard
          label="Mới 7 ngày qua"
          value={kpis.recentCount.toLocaleString("vi-VN")}
          icon={Sparkles}
          tone="orange"
          hint="Học liệu thêm trong tuần"
        />
      </section>

      {/* Filter strip — search + dropdowns */}
      <section className="mb-3 flex flex-wrap items-center gap-2.5 rounded-xl border bg-card p-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-2.5 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tiêu đề, mô tả, BTVN, GV…"
            className="h-9 pl-7"
          />
        </div>
        <Select
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          className="h-9 min-w-[140px]"
        >
          <option value="all">Môn: Tất cả</option>
          {mySubjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        {myGrades.length > 1 ? (
          <Select
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
            className="h-9 min-w-[110px]"
          >
            <option value="all">Khối: Tất cả</option>
            {myGrades.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        ) : null}
        <Select
          value={typeFilter}
          onChange={(e) =>
            setTypeFilter(e.target.value as MaterialFileType | "all")
          }
          className="h-9 min-w-[130px]"
        >
          <option value="all">Loại: Tất cả</option>
          {Object.entries(FILE_TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Select
          value={sourceFilter}
          onChange={(e) =>
            setSourceFilter(e.target.value as MaterialSource | "all")
          }
          className="h-9 min-w-[140px]"
        >
          <option value="all">Nguồn: Tất cả</option>
          <option value="homework">Từ BTVN</option>
          <option value="shared">GV chia sẻ</option>
        </Select>
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center gap-1 rounded-lg border bg-card px-2.5 py-1.5 text-[11.5px] font-medium text-foreground/65 transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-3 w-3" />
            Xoá lọc
          </button>
        ) : null}
      </section>

      {/* File-type quick-filter chips with counts — student-friendly */}
      <section className="mb-3 flex flex-wrap items-center gap-2">
        <TypeChip
          icon={Library}
          label="Tất cả"
          count={visible.length}
          active={typeFilter === "all"}
          onClick={() => setTypeFilter("all")}
        />
        {FILE_TYPE_TILES.filter((t) => typeCounts[t.key] > 0).map((t) => (
          <TypeChip
            key={t.key}
            icon={t.icon}
            label={t.label}
            count={typeCounts[t.key]}
            active={typeFilter === t.key}
            onClick={() => setTypeFilter(t.key)}
          />
        ))}
      </section>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center">
          <BookOpen className="mx-auto mb-3 h-10 w-10 text-muted-foreground/45" />
          <p className="text-section-title">
            {visible.length === 0
              ? "Chưa có học liệu nào"
              : "Không có học liệu khớp bộ lọc"}
          </p>
          <p className="text-meta mt-1">
            {visible.length === 0
              ? "Giáo viên sẽ chia sẻ bài giảng, video, tài liệu cho bạn ở đây."
              : "Thử xoá bộ lọc hoặc đổi từ khoá tìm kiếm."}
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {filtered.map((v) => (
            <li key={v.material.id}>
              {/* Provenance chip — rendered as a thin bar above the
                  card so it never collides with MaterialCard's right-
                  side icons (Eye/Pencil/Trash). */}
              <div
                className={
                  v.source === "homework"
                    ? "flex items-center gap-1.5 rounded-t-xl border border-b-0 border-violet-200 bg-violet-50/70 px-3 py-1 text-[11px]"
                    : "flex items-center gap-1.5 rounded-t-xl border border-b-0 border-emerald-200 bg-emerald-50/70 px-3 py-1 text-[11px]"
                }
              >
                {v.source === "homework" ? (
                  <>
                    <ClipboardList
                      className="h-3 w-3 text-violet-700"
                      strokeWidth={1.85}
                    />
                    <span className="font-semibold text-violet-700">BTVN</span>
                    {v.homeworkTitle ? (
                      <span className="truncate text-violet-700/85">
                        · {v.homeworkTitle}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <>
                    <Share2
                      className="h-3 w-3 text-emerald-700"
                      strokeWidth={1.85}
                    />
                    <span className="font-semibold text-emerald-700">
                      Chia sẻ
                    </span>
                    <span className="text-emerald-700/80">
                      · GV chia sẻ cho lớp / khối
                    </span>
                  </>
                )}
              </div>
              {/* MaterialCard keeps its own rounded border; the chip
                  above visually merges with it via rounded-t on the chip
                  and matching border color. The card's rounded-t is
                  hidden by the chip strip on top. */}
              <div className="-mt-px">
                <MaterialCard material={v.material} onView={setViewing} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <MaterialViewerDialog
        material={viewing}
        onClose={() => setViewing(null)}
      />
    </>
  );
}

function TypeChip({
  icon: Icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: typeof Play;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "inline-flex items-center gap-1.5 rounded-full border border-foreground bg-foreground px-2.5 py-1 text-[11.5px] font-semibold text-background"
          : "inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-[11.5px] font-medium text-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
      }
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.85} />
      {label}
      <span
        className={
          active
            ? "tabular-nums opacity-85"
            : "tabular-nums text-muted-foreground"
        }
      >
        {count}
      </span>
    </button>
  );
}
