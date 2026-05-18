"use client";

import {
  BookOpenText,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  ListTree,
  PencilLine,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmActionDialog } from "@/features/admin/users/dialogs/confirm-action-dialog";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { CampusGateBanner } from "@/features/campus/components/campus-gate-banner";
import { useCampusGate } from "@/features/campus/hooks/use-campus-gate";
import { useCampusStore } from "@/features/campus/state/campus-store";
import { useCampusesStore } from "@/features/campus/state/campuses-store";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { TocTree } from "@/features/subjects/components/toc-tree";
import type { Subject } from "@/features/subjects/data/seed-subjects";
import {
  TOC_LEVELS,
  type TocNode,
} from "@/features/subjects/data/seed-toc";
import type { TocAiNode } from "@/features/subjects/dialogs/toc-ai-dialog";

// SubjectDialog mounts a 10-cell colour picker + multi-grade + multi-campus.
// TocAiDialog imports the AI prompt helper. Both defer until opened.
const SubjectDialog = dynamic(
  () =>
    import("@/features/subjects/dialogs/subject-dialog").then(
      (m) => m.SubjectDialog,
    ),
  { ssr: false, loading: () => null },
);
const TocAiDialog = dynamic(
  () =>
    import("@/features/subjects/dialogs/toc-ai-dialog").then(
      (m) => m.TocAiDialog,
    ),
  { ssr: false, loading: () => null },
);
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { PageHeader } from "@/features/shell/components/page-header";
import { cn } from "@/lib/utils";

export default function SubjectsAdminPage() {
  const session = useAuthStore((s) => s.session);
  const activeCampusId = useCampusStore((s) => s.activeCampusId);
  const campuses = useCampusesStore((s) => s.campuses);
  const grades = useGradesStore((s) => s.grades);
  const subjects = useSubjectsStore((s) => s.subjects);
  const tocNodes = useSubjectsStore((s) => s.tocNodes);
  const removeSubject = useSubjectsStore((s) => s.removeSubject);
  const createTocNode = useSubjectsStore((s) => s.createTocNode);
  const updateTocNode = useSubjectsStore((s) => s.updateTocNode);
  const removeTocNode = useSubjectsStore((s) => s.removeTocNode);
  const reorderTocNode = useSubjectsStore((s) => s.reorderTocNode);
  const { canMutate } = useCampusGate();

  // Pinned campus (or staff's locked campus) — used to filter the visible
  // subjects & grade dropdowns so the page becomes "campus-scoped" too.
  const operatingCampusId =
    session?.role === "superadmin"
      ? activeCampusId
      : session?.campusId ?? null;
  const operatingCampus = useMemo(
    () =>
      operatingCampusId
        ? campuses.find((c) => c.id === operatingCampusId) ?? null
        : null,
    [operatingCampusId, campuses],
  );
  const scopedGradeIds = useMemo(
    () => (operatingCampus ? new Set(operatingCampus.gradeIds) : null),
    [operatingCampus],
  );

  const [tab, setTab] = useState<"list" | "toc">("list");

  // Subject list filters
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // TOC pane state
  const [tocSubjectId, setTocSubjectId] = useState<string>(subjects[0]?.id ?? "");
  const [tocGradeId, setTocGradeId] = useState<string>("grade-10");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Subject dialogs
  const [subjectDialogOpen, setSubjectDialogOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [deleteSubjectTarget, setDeleteSubjectTarget] = useState<Subject | null>(null);
  const [deleteTocTarget, setDeleteTocTarget] = useState<TocNode | null>(null);
  const [tocAiOpen, setTocAiOpen] = useState(false);

  const filteredSubjects = useMemo(() => {
    return subjects.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (gradeFilter !== "all" && !s.gradeIds.includes(gradeFilter)) return false;
      // Campus scope: a subject must explicitly include the operating
      // campus in its `campusIds` list. Legacy "all-campus" (empty
      // list) treatment is gone — every subject must be explicitly
      // assigned to a campus to appear in that campus's view.
      if (operatingCampusId) {
        const inCampus =
          Array.isArray(s.campusIds) && s.campusIds.includes(operatingCampusId);
        if (!inCampus) return false;
      }
      // When no campus is pinned (cross-campus view) we further trim by
      // grade-overlap so the tier-incompatible subjects are still hidden
      // from the wrong tier.
      if (scopedGradeIds) {
        const overlaps = s.gradeIds.some((gid) => scopedGradeIds.has(gid));
        if (!overlaps) return false;
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (!`${s.name} ${s.code}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [subjects, search, gradeFilter, statusFilter, operatingCampusId, scopedGradeIds]);

  const tocSubject = subjects.find((s) => s.id === tocSubjectId);
  const tocGrade = grades.find((g) => g.id === tocGradeId);
  const tocForCurrent = useMemo(
    () =>
      tocNodes.filter((n) => n.subjectId === tocSubjectId && n.gradeId === tocGradeId),
    [tocNodes, tocSubjectId, tocGradeId],
  );

  const rootCount = tocForCurrent.filter((n) => n.parentId === null).length;
  const allBranchIds = useMemo(
    () =>
      tocForCurrent
        .filter((n) => tocForCurrent.some((c) => c.parentId === n.id))
        .map((n) => n.id),
    [tocForCurrent],
  );

  function expandAll() {
    setCollapsed(new Set());
  }
  function collapseAll() {
    setCollapsed(new Set(allBranchIds));
  }

  function addRootChapter() {
    createTocNode({
      subjectId: tocSubjectId,
      gradeId: tocGradeId,
      parentId: null,
      name: "",
    });
  }

  /**
   * Recursively persist an AI-generated TOC subtree under `parentId`. Walks
   * the supplied tree and calls `createTocNode` for each node — depth limited
   * to 4 to match the curriculum structure.
   */
  function applyAiTree(tree: TocAiNode[]) {
    function insertLevel(nodes: TocAiNode[], parentId: string | null, depth: number) {
      if (depth >= TOC_LEVELS.length) return;
      for (const node of nodes) {
        const created = createTocNode({
          subjectId: tocSubjectId,
          gradeId: tocGradeId,
          parentId,
          name: node.name,
        });
        if (Array.isArray(node.children) && node.children.length > 0) {
          insertLevel(node.children, created.id, depth + 1);
        }
      }
    }
    insertLevel(tree, null, 0);
  }

  return (
    <>
      <PageHeader
        title="Quản lý môn học"
        description="Quản lý môn học và mục lục câu hỏi theo phân cấp Chương → Chủ đề → Chủ điểm → Kỹ năng."
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditingSubject(null);
              setSubjectDialogOpen(true);
            }}
            disabled={!canMutate}
            title={!canMutate ? "Chọn 1 campus để thêm môn học" : undefined}
          >
            <Plus className="h-4 w-4" />
            Thêm môn học
          </Button>
        }
      />

      <CampusGateBanner />

      <Tabs value={tab} onValueChange={(v) => setTab(v as "list" | "toc")}>
        <div className="mb-3">
          <TabsList>
            <TabsTrigger value="list">Danh sách môn học</TabsTrigger>
            <TabsTrigger value="toc">
              <ListTree className="h-3.5 w-3.5" /> Mục lục môn học
            </TabsTrigger>
          </TabsList>
        </div>

        {/* TAB 1: List */}
        <TabsContent value="list">
          <div className="mb-3 flex flex-wrap items-center gap-2.5 rounded-xl border bg-card p-3">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên hoặc mã môn…"
              className="h-9 max-w-md flex-1"
            />
            <label className="inline-flex items-center gap-1.5">
              <span className="text-meta">Khối</span>
              <Select
                value={gradeFilter}
                onChange={(e) => setGradeFilter(e.target.value)}
                className="h-9 min-w-[120px]"
              >
                <option value="all">Tất cả</option>
                {grades
                  .filter((g) =>
                    scopedGradeIds ? scopedGradeIds.has(g.id) : true,
                  )
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
              </Select>
            </label>
            <label className="inline-flex items-center gap-1.5">
              <span className="text-meta">Trạng thái</span>
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 min-w-[130px]"
              >
                <option value="all">Tất cả</option>
                <option value="active">Hoạt động</option>
                <option value="archived">Lưu trữ</option>
              </Select>
            </label>
          </div>

          {filteredSubjects.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="overflow-hidden rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Tên môn</TableHead>
                    <TableHead>Mã</TableHead>
                    <TableHead>Khối áp dụng</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead className="text-right">Hành động</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSubjects.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <SubjectIcon color={s.color} />
                          <div className="leading-tight">
                            <p className="text-card-title">{s.name}</p>
                            {s.description ? (
                              <p className="text-meta line-clamp-1 max-w-[280px]">
                                {s.description}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-[12px] text-foreground/75">
                          {s.code}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {s.gradeIds.map((gid) => {
                            const g = grades.find((x) => x.id === gid);
                            return g ? (
                              <span
                                key={gid}
                                className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-foreground/70"
                              >
                                {g.code}
                              </span>
                            ) : null;
                          })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold",
                            s.status === "active"
                              ? "bg-[var(--color-success)]/12 text-[var(--color-success)]"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          <span aria-hidden className="h-1 w-1 rounded-full bg-current" />
                          {s.status === "active" ? "Hoạt động" : "Lưu trữ"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <IconButton
                            title="Mục lục"
                            onClick={() => {
                              setTocSubjectId(s.id);
                              if (s.gradeIds[0]) setTocGradeId(s.gradeIds[0]);
                              setTab("toc");
                            }}
                          >
                            <ListTree className="h-4 w-4" strokeWidth={1.75} />
                          </IconButton>
                          <IconButton
                            variant="primary"
                            title="Chỉnh sửa"
                            onClick={() => {
                              setEditingSubject(s);
                              setSubjectDialogOpen(true);
                            }}
                          >
                            <PencilLine className="h-4 w-4" strokeWidth={1.75} />
                          </IconButton>
                          <IconButton
                            variant="destructive"
                            title="Xoá"
                            onClick={() => setDeleteSubjectTarget(s)}
                          >
                            <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                          </IconButton>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* TAB 2: TOC */}
        <TabsContent value="toc">
          <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="rounded-xl border bg-card p-2.5">
              <p className="text-eyebrow mb-2 px-1.5">Chọn môn học</p>
              {/* TOC sidebar honours the same campus scope as the
                  "Danh sách" tab — showing subjects that don't belong
                  to this campus was the source of confusion. */}
              <ul className="space-y-0.5">
                {filteredSubjects.length === 0 && (
                  <li className="px-2 py-3 text-[12px] text-muted-foreground">
                    Chưa có môn học nào trong campus này. Vào tab "Danh
                    sách" → "+ Thêm môn học" để tạo.
                  </li>
                )}
                {filteredSubjects.map((s) => {
                  const active = s.id === tocSubjectId;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => setTocSubjectId(s.id)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] font-medium transition-colors",
                          active
                            ? "bg-primary/8 text-primary"
                            : "text-foreground/75 hover:bg-accent hover:text-foreground",
                        )}
                      >
                        <SubjectIcon color={s.color} size="sm" />
                        <span className="truncate">{s.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </aside>

            <section className="rounded-xl border bg-card p-4">
              <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
                <div className="flex items-center gap-2.5 min-w-0">
                  {tocSubject ? <SubjectIcon color={tocSubject.color} /> : null}
                  <div className="min-w-0">
                    <p className="text-card-title truncate">
                      {tocSubject?.name ?? "—"}{" "}
                      <span className="text-foreground/50">·</span>{" "}
                      {tocGrade?.name ?? "—"}
                    </p>
                    <p className="text-meta tabular-nums">
                      {rootCount} chương
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-1.5">
                    <span className="text-meta">Khối</span>
                    <Select
                      value={tocGradeId}
                      onChange={(e) => setTocGradeId(e.target.value)}
                      className="h-9 min-w-[110px]"
                    >
                      {grades
                        .filter((g) =>
                          scopedGradeIds ? scopedGradeIds.has(g.id) : true,
                        )
                        .map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                    </Select>
                  </label>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setTocAiOpen(true)}
                    disabled={!tocSubject || !tocGrade}
                    title="Phân tích text/ảnh → mục lục 4 cấp"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    AI tạo mục lục
                  </Button>

                  <Button size="sm" variant="outline" onClick={expandAll}>
                    <ChevronsUpDown className="h-3.5 w-3.5" />
                    Mở rộng
                  </Button>
                  <Button size="sm" variant="outline" onClick={collapseAll}>
                    <ChevronsDownUp className="h-3.5 w-3.5" />
                    Thu gọn
                  </Button>

                  <Button size="sm" onClick={addRootChapter}>
                    <Plus className="h-4 w-4" />
                    Thêm chương
                  </Button>
                </div>
              </header>

              {tocForCurrent.length === 0 ? (
                <div className="rounded-lg border border-dashed bg-muted/20 p-8 text-center">
                  <p className="text-section-title">Mục lục trống</p>
                  <p className="text-small mt-1 text-muted-foreground">
                    Bắt đầu bằng cách thêm chương đầu tiên cho {tocSubject?.name} ·{" "}
                    {tocGrade?.name}.
                  </p>
                  <Button size="sm" className="mt-3" onClick={addRootChapter}>
                    <Plus className="h-4 w-4" />
                    Thêm chương
                  </Button>
                </div>
              ) : (
                <TocTree
                  nodes={tocForCurrent}
                  collapsed={collapsed}
                  setCollapsed={setCollapsed}
                  onRename={(id, name) => updateTocNode(id, { name })}
                  onAddChild={(parentId) =>
                    createTocNode({
                      subjectId: tocSubjectId,
                      gradeId: tocGradeId,
                      parentId,
                      name: "",
                    })
                  }
                  onDelete={(n) => {
                    // Empty unsaved nodes can be removed silently
                    if (!n.name.trim()) {
                      removeTocNode(n.id);
                    } else {
                      setDeleteTocTarget(n);
                    }
                  }}
                  onReorder={reorderTocNode}
                />
              )}

              <p className="text-meta mt-4 flex flex-wrap items-center gap-2">
                Phân cấp:{" "}
                {TOC_LEVELS.map((l, i) => (
                  <span key={l.full} className="inline-flex items-center gap-1">
                    {i > 0 ? (
                      <ChevronDown className="h-3 w-3 -rotate-90 text-foreground/30" />
                    ) : null}
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                        l.chipBg,
                        l.chipFg,
                      )}
                    >
                      {l.short}
                    </span>
                    <span className="font-medium text-foreground/70">{l.full}</span>
                  </span>
                ))}
              </p>
            </section>
          </div>
        </TabsContent>
      </Tabs>

      <SubjectDialog
        open={subjectDialogOpen}
        onOpenChange={setSubjectDialogOpen}
        editing={editingSubject}
      />

      <ConfirmActionDialog
        open={Boolean(deleteSubjectTarget)}
        onOpenChange={(o) => !o && setDeleteSubjectTarget(null)}
        variant="destructive"
        title="Xoá môn học?"
        description={
          deleteSubjectTarget ? (
            <>
              Mọi mục lục của{" "}
              <span className="font-medium text-foreground/85">
                {deleteSubjectTarget.name}
              </span>{" "}
              cũng sẽ bị xoá. Hành động không thể hoàn tác.
            </>
          ) : (
            ""
          )
        }
        confirmLabel="Xoá môn học"
        onConfirm={() => deleteSubjectTarget && removeSubject(deleteSubjectTarget.id)}
      />

      <ConfirmActionDialog
        open={Boolean(deleteTocTarget)}
        onOpenChange={(o) => !o && setDeleteTocTarget(null)}
        variant="destructive"
        title="Xoá mục lục?"
        description={
          deleteTocTarget ? (
            <>
              Xoá{" "}
              <span className="font-medium text-foreground/85">{deleteTocTarget.name}</span>{" "}
              cùng toàn bộ mục con bên dưới. Hành động không thể hoàn tác.
            </>
          ) : (
            ""
          )
        }
        confirmLabel="Xoá mục"
        onConfirm={() => deleteTocTarget && removeTocNode(deleteTocTarget.id)}
      />

      <TocAiDialog
        open={tocAiOpen}
        onOpenChange={setTocAiOpen}
        subjectName={tocSubject?.name}
        gradeName={tocGrade?.name}
        onApply={applyAiTree}
      />
    </>
  );
}

function SubjectIcon({ color, size = "md" }: { color: string; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-7 w-7" : "h-8 w-8";
  const iconDim = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  return (
    <span
      className={cn("flex items-center justify-center rounded-lg shrink-0", dim)}
      style={{
        backgroundColor: `${color}1A`,
        color: color,
      }}
    >
      <BookOpenText className={iconDim} strokeWidth={1.75} />
    </span>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border bg-card p-10 text-center">
      <p className="text-section-title">Chưa có môn học phù hợp.</p>
      <p className="text-small mt-1 text-muted-foreground">
        Thử thay đổi bộ lọc hoặc thêm môn học mới.
      </p>
    </div>
  );
}
