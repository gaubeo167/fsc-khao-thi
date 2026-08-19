"use client";

import {
  Archive,
  Check,
  Copy,
  Lock,
  PencilLine,
  PlayCircle,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { toast } from "sonner";
import { useCompetenciesStore } from "@/features/competencies/state/competencies-store";
import { useQuestionsStore } from "@/features/question-bank/state/questions-store";
import { useCampusesStore } from "@/features/campus/state/campuses-store";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useCampusStore } from "@/features/campus/state/campus-store";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { useShiftsStore } from "@/features/exam-shifts/state/shifts-store";
import { packageInUse } from "@/lib/in-use";
import { versionOf } from "@/lib/version";
import { cn } from "@/lib/utils";

import { isYccdPackage, type ExamPackage, type GeneratedExam } from "../../data/types";
import { GeneratedView } from "../generated-view";
import { useBlueprintsStore } from "../../state/blueprints-store";
import { useGeneratedStore } from "../../state/generated-store";
import { usePackagesStore } from "../../state/packages-store";
import { YccdWizard } from "./yccd-wizard";

const ViewGeneratedDialog = dynamic(
  () =>
    import("@/features/exams/dialogs/view-generated-dialog").then(
      (m) => m.ViewGeneratedDialog,
    ),
  { ssr: false, loading: () => null },
);

const TrialExamDialog = dynamic(
  () =>
    import("@/features/exams/dialogs/trial-exam-dialog").then(
      (m) => m.TrialExamDialog,
    ),
  { ssr: false },
);

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

/** Vai trò duyệt / xoá gói đề — khớp `isApprover()` trong `firestore.rules`
 *  (rules cho phép cả chủ sở hữu tự sửa gói của mình, nhưng TỰ DUYỆT thì UI
 *  không mở: duyệt là việc của người có quyền duyệt). */
const APPROVER_ROLES = new Set([
  "superadmin",
  "academic-director",
  "campus-admin",
  "subject-lead",
]);
/** Xoá vĩnh viễn KHUNG đề hẹp hơn — rules `/blueprints` chỉ mở cho admin
 *  hoặc chủ sở hữu (không có subject-lead). */
const BLUEPRINT_DELETE_ROLES = new Set([
  "superadmin",
  "academic-director",
  "campus-admin",
]);

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
  const hardRemovePackage = usePackagesStore((s) => s.hardRemove);
  const setPackageStatus = usePackagesStore((s) => s.setStatus);
  const blueprints = useBlueprintsStore((s) => s.blueprints);
  const cloneBlueprint = useBlueprintsStore((s) => s.cloneAsNewVersion);
  const archiveBlueprint = useBlueprintsStore((s) => s.archive);
  const hardRemoveBlueprint = useBlueprintsStore((s) => s.hardRemove);
  const generated = useGeneratedStore((s) => s.generated);
  const addBatch = useGeneratedStore((s) => s.addBatch);
  const removeGeneratedByPackage = useGeneratedStore((s) => s.removeByPackage);
  const shifts = useShiftsStore((s) => s.shifts);
  const subjects = useSubjectsStore((s) => s.subjects);
  const grades = useGradesStore((s) => s.grades);
  const competencies = useCompetenciesStore((s) => s.competencies);
  const questions = useQuestionsStore((s) => s.questions);
  const campuses = useCampusesStore((s) => s.campuses);

  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  /**
   * Tab mở sẵn đọc từ URL (`?tab=generated`).
   *
   * Bước cuối của trợ lý tạo đề có nút "→ Xem Đề đã sinh"; nút đó phải mở
   * đúng kho đề của YCCĐ. Không đọc query ở đây thì link nào cũng rơi về tab
   * "Đề YCCĐ" và người dùng phải tự bấm tiếp một lần nữa để tới chỗ họ vừa
   * được hứa.
   */
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"packages" | "generated">(
    searchParams.get("tab") === "generated" ? "generated" : "packages",
  );
  const [trialing, setTrialing] = useState<GeneratedExam | null>(null);
  const [viewing, setViewing] = useState<GeneratedExam | null>(null);
  const removeGenerated = useGeneratedStore((s) => s.remove);

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

  /**
   * Mã đề của các gói ĐANG HIỆN ở tab "Đề YCCĐ" (`rows` đã lọc lưu trữ /
   * campus / tìm kiếm). Đếm theo toàn bộ gói YCCĐ sẽ lệch với danh sách —
   * đúng lỗi "chỉ có 4 mã đề nhưng thống kê 11": 7 mã kia thuộc gói đã lưu trữ.
   */
  const visibleGenerated = useMemo(() => {
    const ids = new Set(rows.map((p) => p.id));
    return generated.filter((g) => ids.has(g.packageId));
  }, [generated, rows]);

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

  /**
   * Xoá VĨNH VIỄN một đề YCCĐ. Chỉ cho phép khi KHÔNG ca thi nào tham chiếu —
   * kể cả ca đã lưu trữ/kết thúc (chặt hơn `packageInUse` vốn chỉ tính ca còn
   * sống), vì xoá thật sẽ làm hỏng dữ liệu lịch sử của ca đó.
   * Dây chuyền: mã đề đã sinh → gói đề → khung đề (nếu không gói nào khác dùng).
   */
  function hardDelete(p: ExamPackage) {
    if (!session) return;
    if (shifts.some((s) => s.packageId === p.id)) return;

    const genCount = generated.filter((g) => g.packageId === p.id).length;
    const bp = blueprints.find((b) => b.id === p.blueprintId);
    const bpSharedWithOthers = packages.some(
      (x) => x.id !== p.id && x.blueprintId === p.blueprintId,
    );
    // Rules cho /blueprints chỉ mở cho admin hoặc chủ sở hữu — không đủ quyền
    // thì lưu trữ khung thay vì để lệnh xoá rơi im lặng.
    const canDeleteBp =
      !!bp &&
      (BLUEPRINT_DELETE_ROLES.has(session.role) || bp.ownerId === session.userId);

    const lines = [
      `Xoá VĨNH VIỄN đề "${p.name}"?`,
      "",
      "Sẽ xoá:",
      "• Gói đề (cấu hình ma trận YCCĐ, thang điểm)",
      genCount > 0 ? `• ${genCount} mã đề đã sinh` : null,
      bp && !bpSharedWithOthers
        ? canDeleteBp
          ? `• Khung đề "${bp.name}" (không gói nào khác dùng)`
          : `• Khung đề "${bp.name}" sẽ được lưu trữ (bạn không đủ quyền xoá)`
        : null,
      "",
      "Thao tác này KHÔNG thể hoàn tác. Muốn giữ lại để khôi phục sau thì bấm Lưu trữ.",
    ].filter(Boolean);
    if (!confirm(lines.join("\n"))) return;

    removeGeneratedByPackage(p.id);
    hardRemovePackage(p.id, session.userId);
    if (bp && !bpSharedWithOthers) {
      if (canDeleteBp) hardRemoveBlueprint(bp.id, session.userId);
      else
        archiveBlueprint(bp.id, session.userId, "Gói đề YCCĐ đã bị xoá vĩnh viễn");
    }
  }

  const canManage = !!session && session.role !== "student";

  /** Tên hiển thị của một node khung YCCĐ — ma trận in tên Bài/Chương, không in id. */
  const nameOfCompetency = (id: string) =>
    competencies.find((c) => c.id === id)?.title ?? id;
  const competencyById = (id: string) => competencies.find((c) => c.id === id);
  /**
   * Bài (topic) chứa một YCCĐ — lần theo parentId lên trên.
   *
   * Bản đặc tả xếp theo Bài, còn câu hỏi gắn vào node LÁ. Không lần ngược thì
   * mọi mã câu rơi ra ngoài bảng và bản đặc tả trống trơn.
   */
  const topicOfCompetency = (id: string): string | null => {
    let cur = competencies.find((c) => c.id === id);
    const guard = new Set<string>();
    while (cur && !guard.has(cur.id)) {
      guard.add(cur.id);
      if (cur.kind === "topic") return cur.id;
      cur = cur.parentId ? competencies.find((c) => c.id === cur!.parentId) : undefined;
    }
    return null;
  };
  /** Năm học hiện tại theo mốc tháng 8 — "2025-2026". */
  const schoolYearLabel = () => {
    const now = new Date();
    const y = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
    return `${y}-${y + 1}`;
  };

  /** Bối cảnh in đầu file — lấy theo gói đề, không đoán. */
  function metaOf(pkg: ExamPackage | undefined, duration: number) {
    const bp = pkg ? blueprints.find((b) => b.id === pkg.blueprintId) : undefined;
    return {
      schoolName: campuses.find((c) => c.id === session?.campusId)?.name ?? "FPT Schools",
      examName: pkg?.name ?? "Đề kiểm tra",
      subjectName: subjects.find((x) => x.id === bp?.subjectId)?.name ?? "—",
      gradeName: grades.find((x) => x.id === bp?.gradeId)?.name ?? "—",
      durationMinutes: duration,
    };
  }

  /** ĐỀ THI ra Word. `docx` nạp động trong `buildExamDocx`. */
  async function downloadExam(g: GeneratedExam) {
    const pkg = packages.find((p) => p.id === g.packageId);
    const matrix = pkg?.yccdMatrix;
    if (!matrix) {
      toast.error("Gói đề này chưa có ma trận YCCĐ nên chưa xuất được đề theo mẫu Bộ.");
      return;
    }
    try {
      const { buildExamDocx, downloadBlob } = await import("../../lib/moet-docx");
      const blob = await buildExamDocx({
        meta: { ...metaOf(pkg, g.duration), code: g.name },
        questionIds: g.questionIds,
        questionById: new Map(questions.map((q) => [q.id, q])),
        matrix,
      });
      downloadBlob(blob, `${g.name.replace(/\s+/g, "-")}.docx`);
    } catch (e) {
      toast.error(e instanceof Error ? `Không tạo được file: ${e.message}` : "Không tạo được file.");
    }
  }

  /** MA TRẬN + BẢN ĐẶC TẢ ra Word. */
  async function downloadMatrix(pkg: ExamPackage) {
    const matrix = pkg.yccdMatrix;
    if (!matrix) {
      toast.error("Gói đề này chưa có ma trận YCCĐ.");
      return;
    }
    // Bản đặc tả cần một mã đề mẫu để lấy "YCCĐ ra câu nào". Chưa sinh mã đề
    // nào thì vẫn xuất được ma trận, chỉ là cột "Câu trong đề" trống.
    const sample = generated.find((g) => g.packageId === pkg.id);
    try {
      const { buildMatrixDocx, downloadBlob } = await import("../../lib/moet-docx");
      const m = metaOf(pkg, sample?.duration ?? pkg.duration ?? 0);
      const blob = await buildMatrixDocx({
        meta: {
          schoolName: m.schoolName,
          departmentName: undefined,
          // Tên kỳ lấy từ tên gói đề — giáo viên đã đặt "GK1"/"Cuối kì I" ở đó.
          examTitle: pkg.name,
          schoolYear: schoolYearLabel(),
          subjectName: m.subjectName,
          gradeName: m.gradeName,
        },
        matrix,
        scoring: pkg.scoringPolicy ?? null,
        nameOfCompetency,
        competencyById,
        topicOfCompetency,
        sampleQuestionIds: sample?.questionIds ?? [],
        questionById: new Map(questions.map((q) => [q.id, q])),
      });
      downloadBlob(blob, `Ma-tran-${pkg.name.replace(/\s+/g, "-")}.docx`);
    } catch (e) {
      toast.error(e instanceof Error ? `Không tạo được file: ${e.message}` : "Không tạo được file.");
    }
  }

  if (tab === "generated") {
    return (
      <div className="space-y-4">
        <TabBar tab={tab} setTab={setTab} genTotal={visibleGenerated.length} />
        <GeneratedView
          generated={visibleGenerated}
          packages={packages}
          blueprints={blueprints}
          subjects={subjects}
          grades={grades}
          onView={setViewing}
          onTrial={setTrialing}
          onDelete={(g) => {
            if (confirm(`Xoá mã đề "${g.name}"?`)) removeGenerated(g.id);
          }}
          onGenerateMore={(p) => setMode({ view: "edit", pkg: p })}
          onDownloadExam={downloadExam}
          onDownloadMatrix={downloadMatrix}
          generateMoreLabel="Sinh thêm"
          emptyHint="Mở một đề YCCĐ → bước ⑤ để sinh mã đề."
        />
        <ViewGeneratedDialog exam={viewing} onClose={() => setViewing(null)} />
        <TrialExamDialog
          exam={trialing}
          onClose={() => setTrialing(null)}
          onDelete={(g) => {
            setTrialing(null);
            removeGenerated(g.id);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <TabBar tab={tab} setTab={setTab} genTotal={visibleGenerated.length} />
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
            // Xoá vĩnh viễn chặt hơn "đang dùng": ca thi đã lưu trữ vẫn tham
            // chiếu gói đề, xoá đi là hỏng lịch sử ca đó.
            const everUsed = shifts.some((s) => s.packageId === p.id);
            const canHardDelete =
              !!session &&
              !everUsed &&
              (APPROVER_ROLES.has(session.role) || p.ownerId === session.userId);
            const canApprove = !!session && APPROVER_ROLES.has(session.role);
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
                    {/* Duyệt ngay tại danh sách — đề YCCĐ luôn tạo ra ở "Chờ
                        duyệt", bắt người duyệt sang trang Duyệt chỉ để bấm 1
                        nút là thừa. Cùng action `setStatus` như trang Duyệt. */}
                    {!p.archivedAt && session && canApprove && p.status !== "approved" && (
                      <button
                        type="button"
                        onClick={() => setPackageStatus(p.id, "approved", session.userId)}
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-[12px] font-semibold text-emerald-700 hover:bg-emerald-100"
                      >
                        <Check className="h-3.5 w-3.5" /> Duyệt
                      </button>
                    )}
                    {!p.archivedAt && session && canApprove && p.status === "pending" && (
                      <button
                        type="button"
                        onClick={() => {
                          const note = prompt(`Lý do từ chối đề "${p.name}"?`);
                          if (note === null) return;
                          setPackageStatus(p.id, "rejected", session.userId, note);
                        }}
                        className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-[12px] font-medium text-rose-600 hover:bg-rose-50"
                      >
                        <X className="h-3.5 w-3.5" /> Từ chối
                      </button>
                    )}
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
                    ) : null}
                    {!p.archivedAt && (
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
                    {canHardDelete && (
                      <button
                        type="button"
                        onClick={() => hardDelete(p)}
                        title="Xoá vĩnh viễn — chỉ được phép khi chưa ca thi nào dùng đề này."
                        className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-card px-2 py-1 text-[12px] font-semibold text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Xoá vĩnh viễn
                      </button>
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

/** Hai kho của luồng YCCĐ, tách hẳn khỏi luồng khung đề. */
function TabBar({
  tab,
  setTab,
  genTotal,
}: {
  tab: "packages" | "generated";
  setTab: (t: "packages" | "generated") => void;
  genTotal: number;
}) {
  const items: { key: "packages" | "generated"; label: string; badge?: number }[] = [
    { key: "packages", label: "Đề YCCĐ" },
    { key: "generated", label: "Đề đã sinh", badge: genTotal },
  ];
  return (
    <div className="flex flex-wrap gap-1.5 border-b pb-2">
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          onClick={() => setTab(it.key)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-semibold",
            tab === it.key
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-surface-2",
          )}
        >
          {it.label}
          {it.badge != null && (
            <span
              className={cn(
                "rounded px-1.5 text-[11px] font-bold",
                tab === it.key ? "bg-primary/15" : "bg-muted",
              )}
            >
              {it.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
