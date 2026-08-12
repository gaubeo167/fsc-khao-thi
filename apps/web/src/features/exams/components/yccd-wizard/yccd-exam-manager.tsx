"use client";

import { Archive, Copy, Lock, PencilLine, Plus, RotateCcw, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { useAuthStore } from "@/features/auth/state/auth-store";
import { useCampusStore } from "@/features/campus/state/campus-store";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { useShiftsStore } from "@/features/exam-shifts/state/shifts-store";
import { packageInUse } from "@/lib/in-use";
import { versionOf } from "@/lib/version";
import { cn } from "@/lib/utils";

import { isYccdPackage, type ExamPackage } from "../../data/types";
import { useBlueprintsStore } from "../../state/blueprints-store";
import { useGeneratedStore } from "../../state/generated-store";
import { usePackagesStore } from "../../state/packages-store";
import { YccdWizard } from "./yccd-wizard";

type Mode = { view: "list" } | { view: "create" } | { view: "edit"; pkg: ExamPackage };

/**
 * `updatedAt` được khai báo kiểu string nhưng dữ liệu cũ có thể là Firestore
 * Timestamp (client `Timestamp` có .toMillis()/.seconds, hoặc bản serialize
 * `{_seconds}`). Quy về millis an toàn để sort/hiển thị, tránh gọi
 * `.localeCompare` trên object → client-side crash.
 */
function toMillis(v: unknown): number {
  if (!v) return 0;
  if (typeof v === "string") return Date.parse(v) || 0;
  if (typeof v === "number") return v;
  if (typeof v === "object") {
    const o = v as { toMillis?: () => number; seconds?: number; _seconds?: number };
    if (typeof o.toMillis === "function") return o.toMillis();
    if (typeof o.seconds === "number") return o.seconds * 1000;
    if (typeof o._seconds === "number") return o._seconds * 1000;
  }
  return 0;
}

const STATUS_META: Record<
  ExamPackage["status"],
  { label: string; cls: string }
> = {
  draft: { label: "Nháp", cls: "bg-slate-100 text-slate-600" },
  pending: { label: "Chờ duyệt", cls: "bg-amber-50 text-amber-700" },
  approved: { label: "Đã duyệt", cls: "bg-emerald-50 text-emerald-700" },
  rejected: { label: "Từ chối", cls: "bg-rose-50 text-rose-700" },
};

/**
 * Quản lý đề tạo theo YCCĐ: danh sách đề đã tạo → Sửa (nếu chưa dùng ở ca
 * thi) hoặc Nhân bản để sửa (nếu đã dùng). Cùng surface mở wizard 6 bước cho
 * tạo mới / sửa. Song song với "Quản lý đề khung" nhưng riêng cho YCCĐ.
 */
export function YccdExamManager() {
  const [mode, setMode] = useState<Mode>({ view: "list" });

  const session = useAuthStore((s) => s.session);
  const activeCampusId = useCampusStore((s) => s.activeCampusId);
  const packages = usePackagesStore((s) => s.packages);
  const clonePackage = usePackagesStore((s) => s.cloneAsNewVersion);
  const updatePackage = usePackagesStore((s) => s.update);
  const archivePackage = usePackagesStore((s) => s.archive);
  const blueprints = useBlueprintsStore((s) => s.blueprints);
  const cloneBlueprint = useBlueprintsStore((s) => s.cloneAsNewVersion);
  const generated = useGeneratedStore((s) => s.generated);
  const addBatch = useGeneratedStore((s) => s.addBatch);
  const shifts = useShiftsStore((s) => s.shifts);
  const subjects = useSubjectsStore((s) => s.subjects);
  const grades = useGradesStore((s) => s.grades);

  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return packages
      .filter((p) => isYccdPackage(p))
      .filter((p) => (showArchived ? true : !p.archivedAt))
      .filter(
        (p) =>
          !activeCampusId || p.campusId === activeCampusId || p.campusId == null,
      )
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
  }, [packages, showArchived, activeCampusId, query]);

  if (mode.view !== "list") {
    return (
      <YccdWizard
        key={mode.view === "edit" ? `edit-${mode.pkg.id}` : "new"}
        editing={mode.view === "edit" ? mode.pkg : null}
        onExit={() => setMode({ view: "list" })}
      />
    );
  }

  function duplicateAndEdit(p: ExamPackage) {
    if (!session) return;
    const bpClone = cloneBlueprint(p.blueprintId, session.userId, "Nhân bản đề YCCĐ");
    const pkgClone = clonePackage(p.id, session.userId, "Nhân bản đề YCCĐ");
    if (!pkgClone) return;
    const blueprintId = bpClone?.id ?? pkgClone.blueprintId;
    if (bpClone) updatePackage(pkgClone.id, { blueprintId });
    const gens = generated.filter((g) => g.packageId === p.id);
    if (gens.length > 0) {
      addBatch(
        gens.map((g) => ({
          packageId: pkgClone.id,
          questionIds: g.questionIds,
          duration: g.duration,
        })),
        (i) => `${pkgClone.name} · Đề ${String(i).padStart(3, "0")}`,
      );
    }
    setMode({ view: "edit", pkg: { ...pkgClone, blueprintId } });
  }

  const canManage = !!session && session.role !== "student";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo tên đề…"
            className="h-9 w-full rounded-md border bg-card pl-8 pr-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--color-primary)]"
          />
          Hiện đã lưu trữ
        </label>
        <button
          type="button"
          onClick={() => setMode({ view: "create" })}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-[13px] font-semibold text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Tạo đề mới
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/20 px-6 py-12 text-center text-[13px] text-muted-foreground">
          Chưa có đề nào tạo theo YCCĐ. Bấm{" "}
          <span className="font-semibold text-foreground">Tạo đề mới</span> để bắt đầu.
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((p) => {
            const bp = blueprints.find((b) => b.id === p.blueprintId);
            const subjName = subjects.find((s) => s.id === bp?.subjectId)?.name ?? "—";
            const gradeName = grades.find((g) => g.id === bp?.gradeId)?.name ?? "—";
            const genCount = generated.filter((g) => g.packageId === p.id).length;
            const usage = packageInUse(p.id, shifts);
            const totalQ =
              p.yccdMatrix?.cells.reduce((s, c) => s + c.count, 0) ?? 0;
            const partCount = p.yccdMatrix?.parts.length ?? 0;
            const st =
              STATUS_META[p.status] ?? {
                label: String(p.status ?? "—"),
                cls: "bg-slate-100 text-slate-600",
              };
            const v = versionOf(p);
            return (
              <li
                key={p.id}
                className={cn(
                  "rounded-xl border bg-card px-4 py-3",
                  p.archivedAt && "opacity-60",
                )}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="text-[14px] font-semibold">{p.name}</span>
                  {v > 1 && (
                    <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                      v{v}
                    </span>
                  )}
                  <span className={cn("rounded px-1.5 py-0.5 text-[10.5px] font-semibold", st.cls)}>
                    {st.label}
                  </span>
                  {usage.inUse && (
                    <span
                      className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-slate-600"
                      title={usage.reason}
                    >
                      <Lock className="h-3 w-3" /> Đã dùng
                    </span>
                  )}
                  <span className="ml-auto text-[11.5px] text-muted-foreground">
                    {toMillis(p.updatedAt) > 0
                      ? new Date(toMillis(p.updatedAt)).toLocaleString("vi-VN")
                      : ""}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                  <span>
                    {subjName} · {gradeName}
                  </span>
                  <span>·</span>
                  <span>{partCount} phần</span>
                  <span>·</span>
                  <span>{totalQ} câu/đề</span>
                  <span>·</span>
                  <span className="font-semibold text-foreground">
                    {p.scoringPolicy?.maxScore ?? 0}đ
                  </span>
                  <span>·</span>
                  <span>{genCount} mã đề</span>
                </div>
                {canManage && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {p.archivedAt ? (
                      <button
                        type="button"
                        onClick={() =>
                          updatePackage(p.id, {
                            archivedAt: null,
                            archivedBy: null,
                            archiveReason: null,
                          })
                        }
                        className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-[12px] font-medium text-primary hover:bg-surface-2"
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Khôi phục
                      </button>
                    ) : (
                      <>
                        {usage.inUse ? (
                          <button
                            type="button"
                            onClick={() => duplicateAndEdit(p)}
                            title="Đề đã dùng ở ca thi — tạo bản sao (phiên bản mới) để sửa."
                            className="inline-flex items-center gap-1 rounded-md border border-primary/50 bg-primary/5 px-2 py-1 text-[12px] font-semibold text-primary hover:bg-primary/10"
                          >
                            <Copy className="h-3.5 w-3.5" /> Nhân bản để sửa
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setMode({ view: "edit", pkg: p })}
                            className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-[12px] font-medium text-foreground hover:bg-surface-2"
                          >
                            <PencilLine className="h-3.5 w-3.5" /> Sửa
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => duplicateAndEdit(p)}
                          className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-[12px] font-medium text-foreground hover:bg-surface-2"
                        >
                          <Copy className="h-3.5 w-3.5" /> Nhân bản
                        </button>
                        {!usage.inUse && session && (
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                confirm(
                                  `Lưu trữ đề "${p.name}"? Đề sẽ ẩn khỏi danh sách (có thể khôi phục).`,
                                )
                              )
                                archivePackage(p.id, session.userId, "Lưu trữ từ quản lý đề YCCĐ");
                            }}
                            className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-[12px] font-medium text-rose-600 hover:bg-rose-50"
                          >
                            <Archive className="h-3.5 w-3.5" /> Lưu trữ
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
