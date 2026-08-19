"use client";

import {
  Building2,
  CheckCircle2,
  Clock,
  FileText,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  User,
  Users as UsersIcon,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/ui/kpi-card";
import { Select } from "@/components/ui/select";
import { ConfirmActionDialog } from "@/features/admin/users/dialogs/confirm-action-dialog";
import { useUserScope } from "@/features/auth/lib/use-scope";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { CampusGateBanner } from "@/features/campus/components/campus-gate-banner";
import { useCampusGate } from "@/features/campus/hooks/use-campus-gate";
import {
  gradesInCampus,
  subjectsInCampus,
} from "@/features/campus/lib/campus-scope";
import { useCampusStore } from "@/features/campus/state/campus-store";
import { useCampusesStore } from "@/features/campus/state/campuses-store";
import { useGradesStore } from "@/features/grades/state/grades-store";
import {
  QUESTION_TYPES,
  type QuestionType,
} from "@/features/question-bank/data/question-types";
import type { Question } from "@/features/question-bank/data/seed-questions";
import { BulkActionBar } from "@/features/question-bank/components/bulk-action-bar";
import { QuestionCard } from "@/features/question-bank/components/question-card";
import { useBulkSelect } from "@/features/question-bank/hooks/use-bulk-select";
import { useDeletability } from "@/features/question-bank/hooks/use-deletability";

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
const ImportQuestionsDialog = dynamic(
  () =>
    import("@/features/question-bank/dialogs/import-questions-dialog").then(
      (m) => m.ImportQuestionsDialog,
    ),
  { ssr: false },
);
const ViewQuestionDialog = dynamic(
  () =>
    import("@/features/question-bank/dialogs/view-question-dialog").then(
      (m) => m.ViewQuestionDialog,
    ),
  { ssr: false, loading: () => null },
);
const InUseEditDialog = dynamic(
  () =>
    import("@/features/question-bank/dialogs/in-use-edit-dialog").then(
      (m) => m.InUseEditDialog,
    ),
  { ssr: false, loading: () => null },
);
const DeleteQuestionDialog = dynamic(
  () =>
    import("@/features/question-bank/dialogs/delete-question-dialog").then(
      (m) => m.DeleteQuestionDialog,
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
import { useExamFormsStore } from "@/features/exam-forms/state/exam-forms-store";
import { MaterialsTab } from "@/features/learning-materials/components/materials-tab";
import { useQuestionsStore } from "@/features/question-bank/state/questions-store";
import { canEditInPlace } from "@/features/question-bank/lib/edit-permission";
import { authHeaders } from "@/lib/api-client";
import { questionInUse } from "@/lib/in-use";
import { getLatestVersionsOf, versionOf } from "@/lib/version";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { PageHeader } from "@/features/shell/components/page-header";
import { cn } from "@/lib/utils";

type KhoView = "campus" | "personal";

/**
 * Lấy id của một câu — truyền vào `useBulkSelect`.
 *
 * Đặt ở phạm vi module CHỨ KHÔNG viết inline `(q) => q.id`: hook nhận nó vào
 * deps của `useMemo`, hàm mới mỗi lần render sẽ dựng lại danh sách id liên
 * tục và effect cắt tỉa tự kích lại chính nó.
 */
const questionId = (q: Question) => q.id;

export default function QuestionBankPage() {
  const session = useAuthStore((s) => s.session);
  const scope = useUserScope();
  const activeCampusId = useCampusStore((s) => s.activeCampusId);
  const campuses = useCampusesStore((s) => s.campuses);
  const grades = useGradesStore((s) => s.grades);
  const subjects = useSubjectsStore((s) => s.subjects);
  const [mainTab, setMainTab] = useState<"questions" | "materials">("questions");
  const allQuestionsRaw = useQuestionsStore((s) => s.questions);
  const archiveQuestion = useQuestionsStore((s) => s.archive);
  const restoreQuestion = useQuestionsStore((s) => s.restore);
  const destroyQuestion = useQuestionsStore((s) => s.destroy);
  const cloneQuestionVersion = useQuestionsStore((s) => s.cloneAsNewVersion);
  const createQuestion = useQuestionsStore((s) => s.create);
  const examForms = useExamFormsStore((s) => s.forms);
  const [showArchived, setShowArchived] = useState(false);
  const [showAllVersions, setShowAllVersions] = useState(false);
  // 1. Hide archived. 2. Optionally collapse to latest-per-chain.
  const questions = useMemo(() => {
    let rows = showArchived
      ? allQuestionsRaw
      : allQuestionsRaw.filter((q) => !q.archivedAt);
    if (!showAllVersions) {
      rows = getLatestVersionsOf(rows);
    }
    return rows;
  }, [allQuestionsRaw, showArchived, showAllVersions]);
  // CTA dialog state — "câu hỏi đã được dùng: sửa trực tiếp hay tạo bản mới?"
  const [versionPrompt, setVersionPrompt] = useState<{
    source: Question;
    blockerReason: string;
  } | null>(null);
  // Lý do sửa, ghi kèm audit. Chỉ khác null khi người dùng chọn "sửa trực
  // tiếp" một câu đang dùng trong đề — lần sửa đó phải giải trình được.
  const [editReason, setEditReason] = useState<string | null>(null);

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
  // Dùng luật chung `campus-scope.ts` chứ không chép lại điều kiện lọc —
  // bản chép thiếu ở hộp "Tải đề lên" là chỗ đã sinh ra lỗi chọn nhầm môn của
  // cơ sở khác.
  const scopedSubjects = useMemo(
    () => subjectsInCampus(subjects, operatingCampus),
    [subjects, operatingCampus],
  );
  const scopedGrades = useMemo(
    () => gradesInCampus(grades, operatingCampus),
    [grades, operatingCampus],
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

  /**
   * Tích chọn hàng loạt. `filtered` là danh sách ĐANG HIỂN THỊ, nên đổi bộ
   * lọc là tập đã tích tự co lại theo — thao tác hàng loạt không bao giờ
   * chạm tới câu ngoài màn hình. Luật ở `lib/bulk-select.ts`.
   */
  const bulk = useBulkSelect(filtered, questionId);
  /** Xác nhận lưu trữ hàng loạt — `null` là chưa mở. */
  const [bulkArchiving, setBulkArchiving] = useState<Question[] | null>(null);
  /** Xác nhận XOÁ CỨNG hàng loạt — `null` là chưa mở. */
  const [bulkDestroying, setBulkDestroying] = useState<Question[] | null>(null);
  /**
   * Soát xoá cứng. Đọc sáu store tham chiếu + cờ tải xong của chúng; luật ở
   * `lib/question-delete.ts`. Dùng CHUNG cho cả nút lẻ và thao tác hàng loạt
   * — hai đường soát khác nhau là hai đường lệch nhau.
   */
  const deletability = useDeletability();
  // `QuestionCard` được memo hoá, nên callback phải ổn định — hàm mới mỗi lần
  // render làm cả danh sách vẽ lại, đúng thứ trang này đã đi tối ưu để tránh.
  const toggleSelect = useCallback(
    (q: Question) => bulk.toggle(q.id),
    [bulk.toggle],
  );
  // Đang bật "Hiển thị đã lưu trữ" thì một tập chọn có thể lẫn cả câu sống lẫn
  // câu đã lưu trữ. Hai hành động ngược nhau nên tách sẵn, mỗi nút một tập.
  const selectedLive = useMemo(
    () => bulk.rowsSelected.filter((q) => !q.archivedAt),
    [bulk.rowsSelected],
  );
  const selectedArchived = useMemo(
    () => bulk.rowsSelected.filter((q) => q.archivedAt),
    [bulk.rowsSelected],
  );
  /**
   * Trong những câu đang chọn, câu nào xoá cứng được.
   *
   * Một câu vướng KHÔNG chặn cả tập: chọn 30 câu mà 2 câu đã vào đề thì xoá
   * 28 câu sạch, rồi nói rõ 2 câu kia vướng ở đâu. Chặn cả 30 là bắt người
   * dùng ngồi bỏ tích từng câu để mò ra thủ phạm.
   */
  const destroySplit = useMemo(
    () => deletability.split(bulk.rowsSelected),
    [deletability, bulk.rowsSelected],
  );

  const kpis = useMemo(() => {
    return {
      total: scoped.length,
      approved: scoped.filter((q) => q.status === "approved").length,
      pending: scoped.filter((q) => q.status === "pending").length,
      draft: scoped.filter((q) => q.status === "draft").length,
      authors: new Set(scoped.map((q) => q.ownerId)).size,
    };
  }, [scoped]);

  // Ai được sửa THẲNG vào câu đang dùng trong đề — theo môn · khối được
  // giao. Dùng lại đúng phạm vi của `useUserScope`, không đẻ luật thứ hai.
  const editVerdict = useMemo(() => {
    const q = versionPrompt?.source;
    if (!session || !q) {
      return { allowed: false, reason: "" };
    }
    return canEditInPlace(
      {
        role: session.role,
        allowedSubjectIds: scope.allowedSubjectIds,
        allowedGradeIds: scope.allowedGradeIds,
      },
      q,
      {
        subject: subjects.find((x) => x.id === q.subjectId)?.name ?? null,
        grade: grades.find((x) => x.id === q.gradeId)?.name ?? null,
      },
    );
  }, [session, scope, versionPrompt, subjects, grades]);

  function openCreate() {
    setEditing(null);
    setEditReason(null);
    setEditorOpen(true);
  }
  function openEdit(q: Question) {
    // Câu đã đóng băng vào một đề đang sống thì không mở thẳng trình soạn:
    // hỏi trước, vì hai lối ra (sửa trực tiếp / tạo bản mới) dẫn tới hai hệ
    // quả ngược nhau. Bản thân việc sửa KHÔNG đụng tới đề đã phát — đề là
    // bản chụp riêng — nên đây là câu hỏi về quyền và ý định, không phải
    // một cái khoá.
    const usage = questionInUse(q.id, examForms);
    if (usage.inUse) {
      setVersionPrompt({ source: q, blockerReason: usage.reason ?? "" });
      return;
    }
    setEditing(q);
    setEditReason(null);
    setEditorOpen(true);
  }

  /**
   * Đẩy câu vừa sửa vào các đề ĐANG SỐNG có chứa nó.
   *
   * Đề đã đóng băng là thứ học sinh đọc VÀ là thứ dùng để chấm — ngân hàng
   * không tham gia. Không có bước này thì sửa đáp án xong, ca thi đang diễn
   * ra vẫn chấm bằng đáp án cũ, và mỗi em vào sau lại ăn thêm một lần lỗi.
   *
   * KHÔNG đụng tới bài đã nộp: điểm đã chấm chỉ đổi qua "Chấm lại ca thi".
   */
  async function syncQuestionToForms(questionId: string) {
    try {
      const res = await fetch(`/api/questions/${questionId}/sync-forms`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(await authHeaders()),
        },
        body: JSON.stringify({ reason: "Sửa trực tiếp câu đang dùng trong đề" }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(
          data?.message ??
            "Đã lưu câu hỏi nhưng KHÔNG cập nhật được vào đề đang dùng.",
        );
        return;
      }
      if ((data.formsUpdated ?? 0) === 0) {
        return;
      }
      const shifts = (data.shiftIds ?? []).length;
      toast.success(
        `Đã cập nhật câu vào ${data.formsUpdated} đề (${shifts} ca thi). Lượt thi từ giờ dùng đáp án mới — bài ĐÃ NỘP cần bấm "Chấm lại ca thi".`,
        { duration: 8000 },
      );
      if (data.structureChanged) {
        toast.warning(
          "Tập phương án đã đổi nên thứ tự trộn của các mã đề bị đặt lại theo ngân hàng.",
          { duration: 8000 },
        );
      }
    } catch (e) {
      toast.error(
        e instanceof Error
          ? `Không cập nhật được vào đề đang dùng: ${e.message}`
          : "Không cập nhật được vào đề đang dùng.",
      );
    }
  }

  /** Sửa thẳng vào câu gốc — chỉ admin / TBM đúng môn · khối. */
  function performDirectEdit(source: Question) {
    setVersionPrompt(null);
    setEditing(source);
    setEditReason(
      `Sửa trực tiếp câu đang dùng trong đề đã đóng băng (${source.id})`,
    );
    setEditorOpen(true);
  }

  function performCloneVersion(source: Question) {
    if (!session) return;
    const clone = cloneQuestionVersion(
      source.id,
      session.userId,
      "Edit khi câu hỏi đã in-use trong đề",
    );
    if (!clone) return;
    setVersionPrompt(null);
    setEditing(clone);
    setEditReason(null);
    setEditorOpen(true);
  }

  /**
   * Lưu trữ hàng loạt.
   *
   * Đi qua `archiveQuestion` từng câu chứ không viết đường ghi riêng: mỗi lần
   * lưu trữ phải để lại một vết audit riêng, và xoá cứng thì bị cấm (bản chụp
   * đề + audit + thống kê còn trỏ vào câu hỏi). Một nút bấm nhanh không phải
   * lý do để đi vòng qua luật đó.
   */
  function performBulkArchive(rows: Question[]) {
    if (!session) return;
    for (const q of rows) {
      archiveQuestion(q.id, session.userId, "Lưu trữ hàng loạt từ ngân hàng câu hỏi");
    }
    bulk.clear();
    setBulkArchiving(null);
    toast.success(`Đã lưu trữ ${rows.length} câu hỏi.`);
  }

  /**
   * Xoá CỨNG hàng loạt.
   *
   * Soát LẠI ngay trước khi xoá thay vì tin vào `destroySplit` đã tính lúc mở
   * hộp thoại: giữa lúc mở và lúc bấm, một listener Firestore có thể vừa đẩy
   * về một BTVN mới có chứa đúng câu đó. Soát lại là rẻ, còn xoá nhầm thì
   * không có đường lùi.
   */
  function performBulkDestroy(rows: Question[]) {
    const { deletable, blocked } = deletability.split(rows);
    for (const q of deletable) {
      destroyQuestion(q.id, "Xoá vĩnh viễn hàng loạt từ ngân hàng câu hỏi");
    }
    bulk.clear();
    setBulkDestroying(null);
    if (deletable.length > 0) {
      toast.success(`Đã xoá vĩnh viễn ${deletable.length} câu hỏi.`);
    }
    if (blocked.length > 0) {
      toast.warning(
        `${blocked.length} câu vừa có tham chiếu mới nên không xoá — đã bỏ qua.`,
        { duration: 8000 },
      );
    }
  }

  /** Khôi phục hàng loạt — đối xứng với lưu trữ, dùng khi đang xem kho lưu trữ. */
  function performBulkRestore(rows: Question[]) {
    if (!session) return;
    for (const q of rows) restoreQuestion(q.id, session.userId);
    bulk.clear();
    toast.success(`Đã khôi phục ${rows.length} câu hỏi.`);
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
        title="Ngân hàng câu hỏi & Học liệu"
        description="Quản lý câu hỏi và tài liệu giảng dạy theo kho cá nhân / kho trường."
        actions={
          <>
            <label className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-muted-foreground">
              <input
                type="checkbox"
                checked={showAllVersions}
                onChange={(e) => setShowAllVersions(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Tất cả phiên bản
            </label>
            <label className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-muted-foreground">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Hiển thị đã lưu trữ
            </label>
            {/* MỘT nút thay cho hai. Trước đây giáo viên phải tự biết file
                của mình thuộc mẫu nào TRƯỚC khi tải lên; chọn sai thì được
                báo "sai mẫu, bấm nút kia". Nay hệ thống tự nhận dạng. */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setImportOpen(true)}
              disabled={!canMutate}
              title={
                !canMutate
                  ? "Chọn 1 campus để tải đề"
                  : "Thả file .docx bất kỳ — hệ thống tự nhận dạng khuôn đề"
              }
            >
              <FileText className="h-4 w-4" />
              Tải đề lên
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

      {/* Top-level switcher: Câu hỏi (existing) vs Học liệu (new
          Phase M). Keeps both UIs co-located in the same admin shell
          while letting each render its own KPIs + filters. */}
      <div className="mb-4 inline-flex rounded-xl border bg-card p-1">
        <button
          type="button"
          onClick={() => setMainTab("questions")}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
            mainTab === "questions"
              ? "bg-foreground text-background"
              : "text-foreground/65 hover:bg-accent hover:text-foreground"
          }`}
        >
          📚 Câu hỏi
        </button>
        <button
          type="button"
          onClick={() => setMainTab("materials")}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
            mainTab === "materials"
              ? "bg-foreground text-background"
              : "text-foreground/65 hover:bg-accent hover:text-foreground"
          }`}
        >
          🎬 Học liệu
        </button>
      </div>

      {mainTab === "materials" ? (
        <MaterialsTab />
      ) : (
      <>
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
        <>
          <BulkActionBar
            allSelected={bulk.allSelected}
            someSelected={bulk.someSelected}
            count={bulk.count}
            visibleCount={filtered.length}
            onToggleAll={bulk.toggleAll}
            onClear={bulk.clear}
          >
            {/* Tách theo trạng thái lưu trữ: một tập chọn lẫn cả hai loại thì
                mỗi nút chỉ làm phần việc của mình, thay vì báo lỗi bắt người
                dùng đi bỏ tích lại từng câu. */}
            {selectedLive.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setBulkArchiving(selectedLive)}
                disabled={!canMutate}
                title={!canMutate ? "Bạn không có quyền lưu trữ câu hỏi" : undefined}
                className="border-destructive/30 text-destructive hover:bg-destructive/5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Lưu trữ {selectedLive.length} câu
              </Button>
            )}
            {/* Chỉ hiện khi THỰC SỰ có câu xoá cứng được. Hiện một nút mờ
                kèm "0 câu" thì vừa vô dụng vừa gợi ý sai là có thể xoá. */}
            {destroySplit.deletable.length > 0 && (
              <Button
                size="sm"
                onClick={() => setBulkDestroying(destroySplit.deletable)}
                disabled={!canMutate}
                title={
                  !canMutate
                    ? "Bạn không có quyền xoá câu hỏi"
                    : "Xoá vĩnh viễn câu do bạn tạo — không khôi phục được"
                }
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Xoá vĩnh viễn {destroySplit.deletable.length} câu
              </Button>
            )}
            {selectedArchived.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => performBulkRestore(selectedArchived)}
                disabled={!canMutate}
                title={!canMutate ? "Bạn không có quyền khôi phục câu hỏi" : undefined}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Khôi phục {selectedArchived.length} câu
              </Button>
            )}
          </BulkActionBar>
          <ul className="space-y-3">
            {filtered.map((q) => (
              <li key={q.id}>
                <QuestionCard
                  question={q}
                  selected={bulk.isSelected(q.id)}
                  onToggleSelect={toggleSelect}
                  onView={setViewing}
                  onEdit={openEdit}
                  onDuplicate={setCopying}
                  onDelete={setDeleting}
                  onRestore={(target) => {
                    if (!session) return;
                    restoreQuestion(target.id, session.userId);
                  }}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="text-meta mt-3">
        Hiển thị <span className="font-semibold tabular-nums">{filtered.length}</span> /{" "}
        {scoped.length} câu hỏi
      </p>

      <CreateQuestionDialog
        open={editorOpen}
        onOpenChange={(o) => {
          setEditorOpen(o);
          if (!o) {
            setEditing(null);
            setEditReason(null);
          }
        }}
        editing={editing}
        editReason={editReason ?? undefined}
        onSaved={(kho, questionId) => {
          setKhoView(kho);
          // Chỉ lối "sửa trực tiếp" mới cần đẩy vào đề — lối tạo phiên bản
          // mới sinh ra câu nháp, chưa nằm trong đề nào.
          if (editReason && questionId) void syncQuestionToForms(questionId);
        }}
      />
      <ImportQuestionsDialog open={importOpen} onOpenChange={setImportOpen} />
      <ViewQuestionDialog question={viewing} onClose={() => setViewing(null)} />

      {/* Xoá một câu: hộp thoại nêu CẢ HAI lối ra và nói rõ cái nào đang mở.
          Bản cũ chỉ có "Lưu trữ", không giải thích — nên câu chưa dùng ở đâu
          vẫn không xoá hẳn được và kho tích rác sau mỗi lần nhập nhầm file. */}
      <DeleteQuestionDialog
        question={deleting}
        verdict={deleting ? deletability.verdictFor(deleting.id) : null}
        onCancel={() => setDeleting(null)}
        onArchive={() => {
          if (!deleting || !session) return;
          archiveQuestion(deleting.id, session.userId, "Admin lưu trữ câu hỏi");
          setDeleting(null);
        }}
        onDestroy={() => {
          if (!deleting) return;
          // Soát lại ngay trước khi xoá — xem chú thích ở performBulkDestroy.
          if (!deletability.verdictFor(deleting.id).deletable) {
            toast.error(
              "Câu này vừa có tham chiếu mới nên không xoá vĩnh viễn được nữa.",
            );
            setDeleting(null);
            return;
          }
          destroyQuestion(deleting.id, "Xoá vĩnh viễn từ ngân hàng câu hỏi");
          toast.success(`Đã xoá vĩnh viễn ${deleting.id}.`);
          setDeleting(null);
        }}
      />
      </>
      )}

      <ConfirmActionDialog
        open={Boolean(bulkArchiving)}
        onOpenChange={(o) => !o && setBulkArchiving(null)}
        variant="destructive"
        title={`Lưu trữ ${bulkArchiving?.length ?? 0} câu hỏi?`}
        description={
          bulkArchiving ? (
            <>
              <span className="font-semibold tabular-nums">
                {bulkArchiving.length}
              </span>{" "}
              câu sẽ được chuyển vào kho lưu trữ. Câu đã đóng băng trong đề thi
              không bị ảnh hưởng — đề HS đã làm vẫn giữ nguyên nội dung gốc. Có
              thể khôi phục từ mục &quot;Hiển thị đã lưu trữ&quot;.
              {/* Liệt kê mã ra: với thao tác hàng loạt, một con số không đủ để
                  người dùng phát hiện mình lỡ tích nhầm. */}
              <span className="text-meta mt-2 block font-mono text-muted-foreground">
                {bulkArchiving
                  .slice(0, 12)
                  .map((q) => q.id)
                  .join(", ")}
                {bulkArchiving.length > 12
                  ? ` … và ${bulkArchiving.length - 12} câu nữa`
                  : ""}
              </span>
            </>
          ) : (
            ""
          )
        }
        confirmLabel={`Lưu trữ ${bulkArchiving?.length ?? 0} câu`}
        onConfirm={() => {
          if (bulkArchiving) performBulkArchive(bulkArchiving);
        }}
      />

      {/* Xoá cứng hàng loạt. Dùng lại ConfirmActionDialog vì tập này đã được
          soát sạch — mọi câu trong đó đều xoá được; cái cần là một lần dừng
          lại cuối cùng, không phải giải thích thêm về từng câu. */}
      <ConfirmActionDialog
        open={Boolean(bulkDestroying)}
        onOpenChange={(o) => !o && setBulkDestroying(null)}
        variant="destructive"
        title={`Xoá vĩnh viễn ${bulkDestroying?.length ?? 0} câu hỏi?`}
        description={
          bulkDestroying ? (
            <>
              <b>Không khôi phục được.</b> Đều là câu <b>do bạn tạo</b>, chưa
              vào đề, chưa vào bài tập, chưa ai làm và không nằm trong chuỗi
              phiên bản nào — nên xoá đi không để lại tham chiếu hỏng. Câu của
              người khác đã được loại khỏi danh sách này. Cần giữ lại thì bấm
              Huỷ rồi dùng <b>Lưu trữ</b>.
              <span className="text-meta mt-2 block font-mono text-muted-foreground">
                {bulkDestroying
                  .slice(0, 12)
                  .map((q) => q.id)
                  .join(", ")}
                {bulkDestroying.length > 12
                  ? ` … và ${bulkDestroying.length - 12} câu nữa`
                  : ""}
              </span>
            </>
          ) : (
            ""
          )
        }
        confirmLabel={`Xoá vĩnh viễn ${bulkDestroying?.length ?? 0} câu`}
        onConfirm={() => {
          if (bulkDestroying) performBulkDestroy(bulkDestroying);
        }}
      />

      <CopyQuestionDialog
        question={copying}
        onClose={() => setCopying(null)}
        onConfirm={performCopy}
      />

      <InUseEditDialog
        open={Boolean(versionPrompt)}
        onOpenChange={(o) => !o && setVersionPrompt(null)}
        question={versionPrompt?.source ?? null}
        blockerReason={versionPrompt?.blockerReason ?? ""}
        nextVersion={
          versionPrompt ? versionOf(versionPrompt.source) + 1 : 2
        }
        verdict={editVerdict}
        onDirectEdit={() => {
          if (versionPrompt) performDirectEdit(versionPrompt.source);
        }}
        onNewVersion={() => {
          if (versionPrompt) performCloneVersion(versionPrompt.source);
        }}
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
