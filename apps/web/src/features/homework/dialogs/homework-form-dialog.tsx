"use client";

import {
  BookOpen,
  Calendar,
  Check,
  CheckSquare,
  ClipboardList,
  Download,
  Eye,
  FileText,
  GraduationCap,
  Layers,
  Lightbulb,
  Link2,
  Loader2,
  Paperclip,
  Pencil,
  Plus,
  Save,
  Send,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useUsersStore } from "@/features/admin/users/users-store";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useCampusStore } from "@/features/campus/state/campus-store";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { useMaterialsStore } from "@/features/learning-materials/state/materials-store";
import {
  FILE_TYPE_LABEL,
} from "@/features/learning-materials/data/types";
import { findQuestionType } from "@/features/question-bank/data/question-types";
import { RenderedContent } from "@/features/question-bank/components/rendered-content";
import { useQuestionsStore } from "@/features/question-bank/state/questions-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { cn } from "@/lib/utils";

import dynamic from "next/dynamic";

import { homeworkInUse } from "@/lib/in-use";

import type { Homework, HomeworkStatus } from "../data/types";
import { useHomeworkStore } from "../state/homework-store";
import { useHomeworkAttemptsStore } from "../state/homework-attempts-store";
import { HomeworkPreviewDialog } from "./homework-preview-dialog";
import { MaterialPickerDialog } from "./material-picker-dialog";
import { QuestionPickerDialog } from "./question-picker-dialog";

const CreateQuestionDialog = dynamic(
  () =>
    import("@/features/question-bank/dialogs/create-question-dialog").then(
      (m) => m.CreateQuestionDialog,
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
const MaterialViewerDialog = dynamic(
  () =>
    import(
      "@/features/learning-materials/dialogs/material-viewer-dialog"
    ).then((m) => m.MaterialViewerDialog),
  { ssr: false, loading: () => null },
);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: Homework | null;
}

/**
 * Streamlined form — no inline pickers. Question + material selection
 * is delegated to dedicated picker dialogs that open over this one.
 * The form itself focuses on metadata and shows summary cards of what
 * was picked, with quick "Bỏ chọn" affordances per item.
 *
 * "Xem trước / Làm thử" gives the teacher a sanity-check of how the
 * homework will render to students before publishing.
 */
export function HomeworkFormDialog({ open, onOpenChange, editing }: Props) {
  const session = useAuthStore((s) => s.session);
  const activeCampusId = useCampusStore((s) => s.activeCampusId);
  const subjects = useSubjectsStore((s) => s.subjects);
  const grades = useGradesStore((s) => s.grades);
  const allClasses = useGradesStore((s) => s.classes);
  const allUsers = useUsersStore((s) => s.users);
  const allQuestions = useQuestionsStore((s) => s.questions);
  const allMaterials = useMaterialsStore((s) => s.materials);
  const createHomework = useHomeworkStore((s) => s.create);
  const updateHomework = useHomeworkStore((s) => s.update);
  const homeworkAttempts = useHomeworkAttemptsStore((s) => s.attempts);

  // Lock: when editing a homework that has any student attempt,
  // questions + materials become read-only — only roster + dueAt can
  // change. Matches the data integrity rule applied to shifts.
  const lockUsage = useMemo(
    () => (editing ? homeworkInUse(editing.id, homeworkAttempts) : { inUse: false }),
    [editing, homeworkAttempts],
  );
  const isLocked = lockUsage.inUse;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [questionIds, setQuestionIds] = useState<string[]>([]);
  const [materialIds, setMaterialIds] = useState<string[]>([]);
  const [assignedAt, setAssignedAt] = useState(() => todayISO());
  const [dueAt, setDueAt] = useState(() => addDaysISO(todayISO(), 7));
  const [status, setStatus] = useState<HomeworkStatus>("published");
  const [submitting, setSubmitting] = useState(false);

  const [questionPickerOpen, setQuestionPickerOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const createQuestion = useQuestionsStore((s) => s.create);
  // For inline question editing — clicking the pencil on a row opens
  // CreateQuestionDialog with the question prefilled.
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(
    null,
  );
  const [materialPickerOpen, setMaterialPickerOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [viewingQuestionId, setViewingQuestionId] = useState<string | null>(
    null,
  );
  const [viewingMaterialId, setViewingMaterialId] = useState<string | null>(
    null,
  );

  const isEdit = Boolean(editing);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setDescription(editing.description ?? "");
      setSubjectId(editing.subjectId);
      setGradeId(editing.gradeId ?? "");
      setSelectedClassIds(editing.classIds);
      setSelectedStudentIds(editing.studentIds ?? []);
      setQuestionIds(editing.questionIds);
      setMaterialIds(editing.materialIds);
      setAssignedAt(editing.assignedAt);
      setDueAt(editing.dueAt);
      setStatus(editing.status);
    } else {
      setTitle("");
      setDescription("");
      setSubjectId("");
      setGradeId("");
      setSelectedClassIds([]);
      setSelectedStudentIds([]);
      setQuestionIds([]);
      setMaterialIds([]);
      setAssignedAt(todayISO());
      setDueAt(addDaysISO(todayISO(), 7));
      setStatus("published");
    }
  }, [open, editing?.id]);

  const campusId =
    session?.role === "superadmin"
      ? activeCampusId ?? null
      : session?.campusId ?? null;

  const classesForGrade = useMemo(
    () =>
      allClasses.filter(
        (c) =>
          (!campusId || c.campusId === campusId) &&
          (!gradeId || c.gradeId === gradeId),
      ),
    [allClasses, campusId, gradeId],
  );

  /** Roster grouped per selected class — used by the per-student
   *  picker below the class chips.
   *
   * Membership matching has to be defensive because /users docs have
   * accumulated three shapes over time:
   *   a) `classIds: string[]` — current (preferred).
   *   b) `className: string` — legacy single-class string (matches the
   *      class's `name` like "1A" or its `code`).
   *   c) Class doc carries `studentIds: string[]` — some seed data
   *      had this; current model doesn't, but we honor it if present.
   * The roster is the UNION of all three matches so older student
   * records aren't silently invisible. */
  const rosterByClass = useMemo(() => {
    const out: Array<{
      classId: string;
      className: string;
      students: Array<{ id: string; name: string; code?: string }>;
    }> = [];
    for (const cid of selectedClassIds) {
      const cls = allClasses.find((c) => c.id === cid);
      if (!cls) continue;
      const ids = new Set<string>();
      // (c) class.studentIds
      const studentIdsField =
        (cls as { studentIds?: string[] }).studentIds ?? [];
      for (const id of studentIdsField) ids.add(id);
      // (a) user.classIds includes cid
      // (b) user.className matches cls.name or cls.code (case-insensitive)
      const targetNames = [
        cls.name?.toLowerCase(),
        (cls as { code?: string }).code?.toLowerCase(),
      ].filter(Boolean) as string[];
      for (const u of allUsers) {
        if (u.role !== "student") continue;
        const byClassIds = u.classIds?.includes(cid) ?? false;
        const byClassName =
          u.className != null &&
          targetNames.includes(u.className.toLowerCase());
        if (byClassIds || byClassName) ids.add(u.id);
      }
      const students = [...ids]
        .map((sid) => allUsers.find((u) => u.id === sid))
        .filter((u): u is NonNullable<typeof u> => !!u)
        .map((u) => ({
          id: u.id,
          name: u.name,
          code: u.studentCode ?? u.username ?? undefined,
        }))
        .sort((a, b) =>
          a.name.localeCompare(b.name, "vi", { sensitivity: "base" }),
        );
      out.push({ classId: cid, className: cls.name, students });
    }
    return out;
  }, [selectedClassIds, allClasses, allUsers]);

  // Auto-seed selectedStudentIds with the full roster whenever the
  // class selection changes (admin can untick individuals afterward).
  useEffect(() => {
    if (selectedClassIds.length === 0) {
      setSelectedStudentIds([]);
      return;
    }
    const allRosterIds = new Set<string>();
    for (const group of rosterByClass) {
      for (const s of group.students) allRosterIds.add(s.id);
    }
    setSelectedStudentIds((prev) => {
      // Drop ids that are no longer in any chosen class.
      const filtered = prev.filter((sid) => allRosterIds.has(sid));
      // When previously empty (initial seed), add everyone in scope.
      if (filtered.length === 0 && prev.length === 0) {
        return [...allRosterIds];
      }
      // When previously had selections but new students appeared
      // (e.g. ticking a new class), include the new class's students
      // by default — surprising-but-helpful default that matches
      // ShiftWizard.
      const existingIds = new Set(filtered);
      for (const id of allRosterIds) {
        if (!existingIds.has(id)) filtered.push(id);
      }
      return filtered;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClassIds.join("|"), rosterByClass.length]);

  // Materialized question + material rows for the summary cards.
  const selectedQuestions = useMemo(
    () =>
      questionIds
        .map((qid) => allQuestions.find((q) => q.id === qid))
        .filter((q): q is NonNullable<typeof q> => !!q),
    [questionIds, allQuestions],
  );
  const selectedMaterials = useMemo(
    () =>
      materialIds
        .map((mid) => allMaterials.find((m) => m.id === mid))
        .filter((m): m is NonNullable<typeof m> => !!m),
    [materialIds, allMaterials],
  );

  function toggleClass(id: string) {
    setSelectedClassIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }
  function removeQuestion(id: string) {
    setQuestionIds((prev) => prev.filter((x) => x !== id));
  }

  /**
   * Upload a Word file directly into the BTVN flow. Posts to the same
   * /api/import/parse endpoint as the Ngân hàng câu hỏi import dialog,
   * converts each parsed question into a Question row in the bank
   * (kho: "personal", status: "approved" since the teacher is the
   * author + uploader), then auto-ticks the new ids into selectedQuestions.
   *
   * Trade-off: this skips the per-question review UI the bank import
   * dialog has. Teacher can fine-tune by clicking the 👁 / ✏ icons on
   * each card after upload.
   */
  async function importWordFile(file: File) {
    if (!session) return;
    if (!subjectId) {
      toast.error("Chọn môn học trước khi import từ Word");
      return;
    }
    setImporting(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/import/parse", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.message ?? "Đọc file thất bại");
        return;
      }
      const parsed: Array<{
        type: string;
        content: string;
        explanation?: string;
        difficulty: "easy" | "medium" | "hard";
        options?: Array<{ content: string; isCorrect: boolean }>;
        correctAnswer?: boolean;
        blanks?: Array<{ acceptedAnswers: string[] }>;
        pairs?: Array<{ left: string; right: string }>;
        items?: string[];
        rubric?: Array<{ label: string; points: number }>;
        wordMin?: number;
        wordMax?: number;
      }> = data.questions ?? [];
      if (parsed.length === 0) {
        toast.error("Không trích xuất được câu hỏi nào từ file.");
        return;
      }

      // Default storage location: personal kho (teacher's draft pile),
      // approved status so the teacher can use immediately. Going to
      // campus kho would require approval — slower; teacher can
      // promote individual questions later.
      const sharedBase = {
        subjectId,
        gradeId: gradeId || null,
        tocNodeId: null,
        tags: [] as string[],
        kho: "personal" as const,
        campusId: null,
        ownerId: session.userId,
        ownerName: session.name ?? "—",
        status: "approved" as const,
        approvedBy: session.userId,
        rejectionNote: null,
      };
      const newIds: string[] = [];
      for (const q of parsed) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let payload: any = null;
        const baseQ = {
          ...sharedBase,
          content: q.content,
          explanation: q.explanation ?? null,
          difficulty: q.difficulty,
        };
        switch (q.type) {
          case "mcq-single":
          case "mcq-multi":
            payload = {
              ...baseQ,
              type: q.type,
              options: (q.options ?? []).map((o, i) => ({
                id: `opt-${Date.now()}-${i}`,
                ...o,
              })),
            };
            break;
          case "true-false":
            payload = {
              ...baseQ,
              type: "true-false",
              correctAnswer: q.correctAnswer ?? false,
            };
            break;
          case "fill-blank":
            payload = {
              ...baseQ,
              type: "fill-blank",
              blanks: q.blanks ?? [],
            };
            break;
          case "matching":
            payload = {
              ...baseQ,
              type: "matching",
              pairs: (q.pairs ?? []).map((p, i) => ({
                id: `p-${Date.now()}-${i}`,
                ...p,
              })),
            };
            break;
          case "ordering":
            payload = {
              ...baseQ,
              type: "ordering",
              items: (q.items ?? []).map((c, i) => ({
                id: `i-${Date.now()}-${i}`,
                content: c,
              })),
            };
            break;
          case "essay":
            // Essay isn't auto-gradable so it doesn't fit BTVN. Skip
            // silently — surfaced in toast.
            continue;
          case "underline":
            payload = { ...baseQ, type: "underline" };
            break;
          default:
            continue;
        }
        if (payload) {
          const created = createQuestion(payload);
          newIds.push(created.id);
        }
      }
      if (newIds.length === 0) {
        toast.error(
          "File chỉ chứa loại câu hỏi không tự chấm được (vd: tự luận).",
        );
        return;
      }
      setQuestionIds((prev) => [...prev, ...newIds]);
      toast.success(
        `Đã import ${newIds.length} câu hỏi vào kho cá nhân và thêm vào BTVN.`,
      );
    } catch (e) {
      toast.error(
        e instanceof Error ? `Import thất bại: ${e.message}` : "Import thất bại",
      );
    } finally {
      setImporting(false);
      // Reset input so the same file can be re-uploaded if needed.
      if (importFileRef.current) importFileRef.current.value = "";
    }
  }
  function removeMaterial(id: string) {
    setMaterialIds((prev) => prev.filter((x) => x !== id));
  }

  function handleSubmit() {
    if (!session) return;
    if (!title.trim()) return toast.error("Nhập tiêu đề BTVN");
    if (!subjectId) return toast.error("Chọn môn học");
    if (selectedClassIds.length === 0)
      return toast.error("Chọn ít nhất 1 lớp được giao");
    if (questionIds.length === 0)
      return toast.error("Chọn ít nhất 1 câu hỏi");
    if (assignedAt > dueAt)
      return toast.error("Ngày hết hạn phải sau ngày giao");

    if (selectedStudentIds.length === 0) {
      return toast.error(
        "Chọn ít nhất 1 học sinh trong danh sách được giao",
      );
    }

    setSubmitting(true);
    try {
      const payload: Omit<Homework, "id" | "createdAt" | "updatedAt"> = {
        title: title.trim(),
        description: description.trim() || undefined,
        subjectId,
        gradeId: gradeId || null,
        classIds: selectedClassIds,
        studentIds: selectedStudentIds,
        questionIds,
        materialIds,
        assignedAt,
        dueAt,
        campusId,
        ownerId: session.userId,
        ownerName: session.name ?? "—",
        status,
      };
      if (editing) {
        // Integrity guard: when locked, keep the original question +
        // material lists and dueAt-extension-only semantics. The UI
        // already hides the pickers but defense-in-depth here means
        // a stale state mutation (e.g. dialog reused without
        // re-syncing on a re-edit) can't accidentally strip the
        // frozen lists.
        if (isLocked) {
          if (
            new Date(dueAt) < new Date(editing.dueAt) ||
            assignedAt !== editing.assignedAt
          ) {
            toast.error(
              "BTVN đã có HS làm — chỉ được phép GIA HẠN (đẩy ngày hết hạn xa hơn). Ngày giao không thể đổi.",
            );
            setSubmitting(false);
            return;
          }
          updateHomework(editing.id, {
            title: payload.title,
            description: payload.description,
            classIds: payload.classIds,
            studentIds: payload.studentIds,
            dueAt: payload.dueAt,
            status: payload.status,
            // questionIds / materialIds / subjectId / gradeId / assignedAt
            // intentionally NOT in the patch — locked fields stay
            // immutable.
          });
          toast.success(
            "Đã cập nhật BTVN (chỉ HS + ngày hết hạn — câu hỏi giữ nguyên do đã có dữ liệu HS).",
          );
        } else {
          updateHomework(editing.id, payload);
          toast.success("Đã cập nhật BTVN");
        }
      } else {
        createHomework(payload);
        toast.success("Đã tạo BTVN");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(
        e instanceof Error ? `Lưu thất bại: ${e.message}` : "Lưu thất bại",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const subjectName =
    subjects.find((s) => s.id === subjectId)?.name ?? null;
  const gradeName =
    grades.find((g) => g.id === gradeId)?.name ?? null;
  const selectedClassNames = selectedClassIds
    .map((cid) => allClasses.find((c) => c.id === cid)?.name)
    .filter(Boolean);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (submitting) return;
          onOpenChange(o);
        }}
      >
        <DialogContent
          className="flex h-[92vh] w-full max-w-6xl flex-col gap-0 overflow-hidden p-0"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          {/* Header */}
          <DialogHeader className="border-b bg-gradient-to-r from-violet-50 to-purple-50 px-6 py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm">
                <ClipboardList className="h-5 w-5" strokeWidth={1.85} />
              </span>
              <div>
                <DialogTitle className="text-[17px]">
                  {isEdit ? "Chỉnh sửa BTVN" : "Giao bài tập về nhà mới"}
                </DialogTitle>
                <DialogDescription className="mt-0.5">
                  Tạo bài tập HS có thể làm bất kỳ lúc nào trong khoảng buổi
                  học chính khoá.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Body — 2 columns */}
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-y-auto lg:grid-cols-[1fr_320px]">
            {/* Left column — form sections */}
            <div className="space-y-5 px-6 py-5">
              {isLocked && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
                  <p className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-amber-900">
                    🔒 BTVN đã có HS làm bài
                  </p>
                  <p className="mt-1 text-[12px] leading-relaxed text-amber-800">
                    {lockUsage.reason} Tuân thủ nguyên tắc bảo toàn dữ liệu,
                    bạn chỉ có thể: thêm HS vào danh sách được giao và gia
                    hạn ngày hết hạn.
                  </p>
                </div>
              )}
              <FormSection
                step={1}
                tone="violet"
                title="Thông tin chung"
              >
                <div className="space-y-3">
                  <FieldLabel required>Tiêu đề bài tập</FieldLabel>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="VD: BTVN Chương 1 — Phương trình bậc 1"
                    disabled={submitting}
                  />

                  <FieldLabel>Mô tả / Hướng dẫn cho HS</FieldLabel>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    placeholder="Mô tả ngắn gọn bài tập hoặc lưu ý cho HS…"
                    className="w-full rounded-md border bg-background px-3 py-2 text-[13px] disabled:opacity-50"
                    disabled={submitting}
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <FieldLabel required>Môn học</FieldLabel>
                      <Select
                        value={subjectId}
                        onChange={(e) => {
                          setSubjectId(e.target.value);
                          setQuestionIds([]);
                          setMaterialIds([]);
                        }}
                        disabled={submitting}
                      >
                        <option value="">— Chọn môn —</option>
                        {subjects.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <FieldLabel>Khối</FieldLabel>
                      <Select
                        value={gradeId}
                        onChange={(e) => {
                          setGradeId(e.target.value);
                          setSelectedClassIds([]);
                          setQuestionIds([]);
                        }}
                        disabled={submitting}
                      >
                        <option value="">— Mọi khối —</option>
                        {grades.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <FieldLabel required>Ngày giao</FieldLabel>
                      <Input
                        type="date"
                        value={assignedAt}
                        onChange={(e) => setAssignedAt(e.target.value)}
                        disabled={submitting}
                      />
                    </div>
                    <div>
                      <FieldLabel required>Ngày hết hạn</FieldLabel>
                      <Input
                        type="date"
                        value={dueAt}
                        onChange={(e) => setDueAt(e.target.value)}
                        disabled={submitting}
                      />
                    </div>
                  </div>

                  {gradeId ? (
                    <>
                      <FieldLabel required>Lớp được giao</FieldLabel>
                      {classesForGrade.length === 0 ? (
                        <p className="text-meta">
                          Chưa có lớp nào ở khối này.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5 rounded-md border bg-card p-2">
                          {classesForGrade.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => toggleClass(c.id)}
                              disabled={submitting}
                              className={cn(
                                "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[12px] font-medium",
                                selectedClassIds.includes(c.id)
                                  ? "border-violet-300 bg-violet-100 text-violet-800"
                                  : "border-border bg-background text-foreground/70 hover:bg-accent",
                              )}
                            >
                              {selectedClassIds.includes(c.id) ? (
                                <Check className="h-3 w-3" />
                              ) : null}
                              {c.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="rounded-md border border-dashed bg-muted/15 px-3 py-3 text-center text-meta">
                      Chọn <b>khối</b> ở trên để hiển thị danh sách lớp.
                    </div>
                  )}

                  {gradeId && rosterByClass.length > 0 ? (
                    <RosterPanel
                      rosterByClass={rosterByClass}
                      selectedStudentIds={selectedStudentIds}
                      onToggle={(sid) =>
                        setSelectedStudentIds((prev) =>
                          prev.includes(sid)
                            ? prev.filter((x) => x !== sid)
                            : [...prev, sid],
                        )
                      }
                      onToggleClass={(classId, allOn) => {
                        const group = rosterByClass.find(
                          (g) => g.classId === classId,
                        );
                        if (!group) return;
                        const classStudentIds = group.students.map(
                          (s) => s.id,
                        );
                        setSelectedStudentIds((prev) => {
                          if (allOn) {
                            const set = new Set(prev);
                            for (const id of classStudentIds) set.add(id);
                            return [...set];
                          }
                          return prev.filter(
                            (id) => !classStudentIds.includes(id),
                          );
                        });
                      }}
                      disabled={submitting}
                    />
                  ) : null}
                </div>
              </FormSection>

              <FormSection
                step={2}
                tone="emerald"
                title="Câu hỏi"
                count={selectedQuestions.length}
                actions={
                  isLocked ? (
                    <span
                      className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800"
                      title="BTVN đã có HS làm bài — không thể đổi danh sách câu hỏi"
                    >
                      🔒 Đã khoá
                    </span>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <input
                        ref={importFileRef}
                        type="file"
                        accept=".docx,.doc"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void importWordFile(f);
                        }}
                      />
                      <a
                        href={
                          subjectId
                            ? `/api/import/template?subject=${encodeURIComponent(subjectId)}`
                            : "/api/import/template"
                        }
                        download
                        className="inline-flex h-7 items-center gap-1 rounded-md border bg-card px-2 text-[11.5px] font-medium text-foreground/80 hover:bg-accent/30"
                        title={
                          subjectId
                            ? "Tải file mẫu theo môn đã chọn — kèm câu hỏi mẫu + ảnh minh hoạ"
                            : "Tải file mẫu chung — chọn môn trước để được mẫu theo môn"
                        }
                      >
                        <Download className="h-3.5 w-3.5" />
                        Tải file mẫu
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          if (!subjectId)
                            return toast.error(
                              "Chọn môn trước khi import từ Word",
                            );
                          importFileRef.current?.click();
                        }}
                        disabled={submitting || importing}
                        className="inline-flex h-7 items-center gap-1 rounded-md border bg-card px-2 text-[11.5px] font-medium hover:bg-accent/30 disabled:opacity-50"
                        title="Upload file Word — câu hỏi tự thêm vào kho cá nhân + BTVN"
                      >
                        {importing ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Đang đọc…
                          </>
                        ) : (
                          <>
                            <FileText className="h-3.5 w-3.5" />
                            Import từ Word
                          </>
                        )}
                      </button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          if (!subjectId)
                            return toast.error(
                              "Chọn môn trước khi chọn câu hỏi",
                            );
                          setQuestionPickerOpen(true);
                        }}
                        disabled={submitting}
                      >
                        <Plus className="h-4 w-4" />
                        {selectedQuestions.length > 0 ? "Thêm" : "Thêm câu hỏi"}
                      </Button>
                    </div>
                  )
                }
              >
                {selectedQuestions.length === 0 ? (
                  <p className="text-meta">
                    Chưa chọn câu hỏi nào. Bấm "Thêm câu hỏi" để chọn từ kho
                    cá nhân hoặc kho trường.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {selectedQuestions.map((q, i) => {
                      const meta = findQuestionType(q.type);
                      return (
                        <li
                          key={q.id}
                          className="group flex items-start gap-2.5 rounded-md border bg-card px-2.5 py-2 hover:bg-accent/20"
                        >
                          <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-[11px] font-bold text-emerald-700">
                            {i + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <RenderedContent
                              content={q.content}
                              hideUnderlineMarks
                              className="line-clamp-1 text-[12.5px]"
                            />
                            <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10.5px] text-muted-foreground">
                              <span className="font-mono">{q.id}</span>
                              {meta && (
                                <span
                                  className="rounded px-1.5 py-0.5 font-semibold"
                                  style={{
                                    backgroundColor: `${meta.color}1A`,
                                    color: meta.color,
                                  }}
                                >
                                  {meta.name}
                                </span>
                              )}
                              <span className="rounded bg-foreground/8 px-1.5 py-0.5">
                                {q.difficulty}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setViewingQuestionId(q.id)}
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                            title="Xem chi tiết"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          {!isLocked && (
                            <button
                              type="button"
                              onClick={() => setEditingQuestionId(q.id)}
                              className="rounded p-1 text-muted-foreground hover:bg-blue-50 hover:text-blue-600"
                              title="Chỉnh sửa câu hỏi"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {!isLocked && (
                            <button
                              type="button"
                              onClick={() => removeQuestion(q.id)}
                              className="rounded p-1 text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
                              title="Bỏ chọn"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </FormSection>

              <FormSection
                step={3}
                tone="amber"
                title="Đính kèm học liệu"
                count={selectedMaterials.length}
                actions={
                  isLocked ? (
                    <span
                      className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800"
                      title="BTVN đã có HS làm bài — không thể đổi danh sách học liệu"
                    >
                      🔒 Đã khoá
                    </span>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        if (!subjectId)
                          return toast.error(
                            "Chọn môn trước khi chọn học liệu",
                          );
                        setMaterialPickerOpen(true);
                      }}
                      disabled={submitting}
                    >
                      <Plus className="h-4 w-4" />
                      Thêm học liệu
                    </Button>
                  )
                }
              >
                {selectedMaterials.length === 0 ? (
                  <p className="text-meta">
                    Tuỳ chọn. Đính kèm bài giảng / video / PDF để HS xem khi
                    làm bài.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {selectedMaterials.map((m) => (
                      <li
                        key={m.id}
                        className="group flex items-start gap-2.5 rounded-md border bg-card px-2.5 py-2 hover:bg-accent/20"
                      >
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700">
                          {m.sourceType === "link" ? (
                            <Link2 className="h-3.5 w-3.5" />
                          ) : (
                            <FileText className="h-3.5 w-3.5" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-1 text-[12.5px] font-medium">
                            {m.title}
                          </p>
                          <p className="text-[10.5px] text-muted-foreground">
                            {FILE_TYPE_LABEL[m.fileType]}
                            {m.sourceType === "link" ? " · liên kết" : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setViewingMaterialId(m.id)}
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="Xem"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        {!isLocked && (
                          <button
                            type="button"
                            onClick={() => removeMaterial(m.id)}
                            className="rounded p-1 text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
                            title="Bỏ chọn"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </FormSection>

              <FormSection
                step={4}
                tone="zinc"
                title="Trạng thái phát hành"
              >
                <Select
                  value={status}
                  onChange={(e) =>
                    setStatus(e.target.value as HomeworkStatus)
                  }
                  disabled={submitting}
                >
                  <option value="draft">Nháp (HS chưa thấy)</option>
                  <option value="published">
                    Đã giao (HS thấy được trong khoảng ngày)
                  </option>
                  <option value="closed">
                    Đã đóng (không cho nộp thêm)
                  </option>
                </Select>
              </FormSection>
            </div>

            {/* Right column — sticky summary */}
            <aside className="border-l bg-muted/15 px-5 py-5 lg:sticky lg:top-0">
              <div className="rounded-xl border bg-card p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
                    <ClipboardList className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-[14px] font-semibold">
                      Tổng quan bài tập
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Cập nhật theo lựa chọn
                    </p>
                  </div>
                </div>
                <ul className="space-y-2.5 text-[12.5px]">
                  <SummaryItem
                    icon={BookOpen}
                    label="Môn"
                    value={subjectName ?? "—"}
                  />
                  <SummaryItem
                    icon={GraduationCap}
                    label="Khối"
                    value={gradeName ?? "—"}
                  />
                  <SummaryItem
                    icon={Users}
                    label="Lớp"
                    value={
                      selectedClassNames.length === 0
                        ? "—"
                        : (selectedClassNames.join(", ") as string)
                    }
                  />
                  <SummaryItem
                    icon={Users}
                    label="HS được giao"
                    value={`${selectedStudentIds.length} HS`}
                  />
                  <SummaryItem
                    icon={CheckSquare}
                    label="Số câu hỏi"
                    value={`${selectedQuestions.length} câu`}
                  />
                  <SummaryItem
                    icon={Paperclip}
                    label="Học liệu"
                    value={`${selectedMaterials.length} mục`}
                  />
                  <SummaryItem
                    icon={Calendar}
                    label="Ngày giao"
                    value={assignedAt || "—"}
                  />
                  <SummaryItem
                    icon={Calendar}
                    label="Hạn nộp"
                    value={dueAt || "—"}
                    highlight
                  />
                  <SummaryItem
                    icon={Layers}
                    label="Trạng thái"
                    value={
                      status === "draft"
                        ? "Nháp"
                        : status === "published"
                          ? "Đã giao"
                          : "Đã đóng"
                    }
                  />
                </ul>
              </div>

              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-amber-600" />
                  <p className="text-[12.5px] font-semibold text-amber-900">
                    Mẹo hay
                  </p>
                </div>
                <p className="mt-1 text-[11.5px] leading-relaxed text-amber-800">
                  Hãy kèm video bài giảng hoặc tài liệu để HS có thể xem lại
                  khi làm BTVN. Nội dung sẽ hiển thị bên cạnh câu hỏi.
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={() => setPreviewOpen(true)}
                disabled={submitting || questionIds.length === 0}
                title={
                  questionIds.length === 0
                    ? "Cần chọn ít nhất 1 câu hỏi để xem trước"
                    : undefined
                }
                className="mt-3 w-full"
              >
                <Eye className="h-4 w-4" />
                Xem trước / Làm thử
              </Button>
            </aside>
          </div>

          {/* Footer */}
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t bg-card px-6 py-3">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Huỷ
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setStatus("draft");
                handleSubmit();
              }}
              disabled={submitting}
            >
              <Save className="h-4 w-4" />
              Lưu nháp
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="bg-violet-600 hover:bg-violet-700"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Đang lưu…
                </>
              ) : isEdit ? (
                <>
                  <Pencil className="h-4 w-4" />
                  Lưu thay đổi
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Giao bài tập
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pickers */}
      <QuestionPickerDialog
        open={questionPickerOpen}
        onOpenChange={setQuestionPickerOpen}
        selectedIds={questionIds}
        onConfirm={setQuestionIds}
        subjectId={subjectId}
        gradeId={gradeId || null}
        campusId={campusId}
      />
      <MaterialPickerDialog
        open={materialPickerOpen}
        onOpenChange={setMaterialPickerOpen}
        selectedIds={materialIds}
        onConfirm={setMaterialIds}
        subjectId={subjectId}
        campusId={campusId}
      />
      <HomeworkPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        questionIds={questionIds}
        materialIds={materialIds}
        title={title || "BTVN chưa đặt tên"}
      />
      <ViewQuestionDialog
        question={
          viewingQuestionId
            ? allQuestions.find((q) => q.id === viewingQuestionId) ?? null
            : null
        }
        onClose={() => setViewingQuestionId(null)}
      />
      <CreateQuestionDialog
        open={editingQuestionId != null}
        onOpenChange={(o) => {
          if (!o) setEditingQuestionId(null);
        }}
        editing={
          editingQuestionId
            ? allQuestions.find((q) => q.id === editingQuestionId) ?? null
            : null
        }
      />
      <MaterialViewerDialog
        material={
          viewingMaterialId
            ? allMaterials.find((m) => m.id === viewingMaterialId) ?? null
            : null
        }
        onClose={() => setViewingMaterialId(null)}
      />
    </>
  );
}

/** Numbered section header with a colored badge — used to break the
 *  form into "1. Thông tin chung", "2. Câu hỏi", etc. The whole section
 *  is wrapped in a subtle card so each block reads as its own unit. */
function FormSection({
  step,
  tone,
  title,
  count,
  actions,
  children,
}: {
  step: number;
  tone: "violet" | "emerald" | "amber" | "zinc";
  title: string;
  count?: number;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const styles = {
    violet: {
      badge: "bg-violet-600 text-white",
      header: "text-violet-900",
      countPill: "border-violet-200 bg-violet-50 text-violet-700",
    },
    emerald: {
      badge: "bg-emerald-600 text-white",
      header: "text-emerald-900",
      countPill: "border-emerald-200 bg-emerald-50 text-emerald-700",
    },
    amber: {
      badge: "bg-amber-500 text-white",
      header: "text-amber-900",
      countPill: "border-amber-200 bg-amber-50 text-amber-700",
    },
    zinc: {
      badge: "bg-zinc-600 text-white",
      header: "text-zinc-900",
      countPill: "border-zinc-200 bg-zinc-50 text-zinc-700",
    },
  }[tone];
  return (
    <section className="rounded-xl border bg-card shadow-sm">
      <header className="flex items-center justify-between gap-2 border-b bg-muted/15 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-md text-[12px] font-bold",
              styles.badge,
            )}
          >
            {step}
          </span>
          <h3 className={cn("text-[14px] font-semibold", styles.header)}>
            {title}
          </h3>
          {count != null && (
            <span
              className={cn(
                "inline-flex h-5 min-w-[1.5rem] items-center justify-center rounded-md border px-1.5 text-[10.5px] font-bold",
                styles.countPill,
              )}
            >
              {count}
            </span>
          )}
        </div>
        {actions}
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

function FieldLabel({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <Label className="mb-1 block text-[12.5px] font-medium text-foreground/80">
      {children}
      {required ? <span className="ml-1 text-rose-500">*</span> : null}
    </Label>
  );
}

function SummaryItem({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <li className="flex items-center gap-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/40 text-foreground/60">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10.5px] text-muted-foreground">{label}</p>
        <p
          className={cn(
            "truncate font-medium",
            highlight ? "text-rose-700" : "text-foreground",
          )}
        >
          {value}
        </p>
      </div>
    </li>
  );
}

interface RosterGroup {
  classId: string;
  className: string;
  students: Array<{ id: string; name: string; code?: string }>;
}

function RosterPanel({
  rosterByClass,
  selectedStudentIds,
  onToggle,
  onToggleClass,
  disabled,
}: {
  rosterByClass: RosterGroup[];
  selectedStudentIds: string[];
  onToggle: (sid: string) => void;
  onToggleClass: (classId: string, allOn: boolean) => void;
  disabled?: boolean;
}) {
  const totalStudents = rosterByClass.reduce(
    (n, g) => n + g.students.length,
    0,
  );
  const tickedCount = selectedStudentIds.length;
  return (
    <section className="space-y-2 rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="inline-flex items-center gap-1.5">
          <Check className="h-4 w-4 text-foreground/60" />
          Học sinh được giao
          <span className="inline-flex h-5 min-w-[2rem] items-center justify-center rounded-md border border-violet-200 bg-violet-50/50 px-1.5 text-[10.5px] font-bold text-violet-700">
            {tickedCount}/{totalStudents}
          </span>
        </Label>
      </div>
      <div className="space-y-2.5">
        {rosterByClass.map((group) => {
          const classStudentIds = group.students.map((s) => s.id);
          const allTicked =
            classStudentIds.length > 0 &&
            classStudentIds.every((id) => selectedStudentIds.includes(id));
          const someTicked =
            !allTicked &&
            classStudentIds.some((id) => selectedStudentIds.includes(id));
          return (
            <div
              key={group.classId}
              className="rounded-md border bg-muted/15 p-2.5"
            >
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-[12.5px] font-semibold">
                  {group.className}
                  <span className="ml-2 text-[10.5px] font-normal text-muted-foreground">
                    {classStudentIds.filter((id) =>
                      selectedStudentIds.includes(id),
                    ).length}
                    /{classStudentIds.length} HS
                  </span>
                </p>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => onToggleClass(group.classId, true)}
                    disabled={disabled || allTicked}
                    className="rounded-md border bg-card px-2 py-0.5 text-[10.5px] font-medium hover:bg-accent disabled:opacity-50"
                  >
                    Tick all
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleClass(group.classId, false)}
                    disabled={disabled || (!allTicked && !someTicked)}
                    className="rounded-md border bg-card px-2 py-0.5 text-[10.5px] font-medium hover:bg-accent disabled:opacity-50"
                  >
                    Bỏ tick
                  </button>
                </div>
              </div>
              {group.students.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  Lớp chưa có HS được phân.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {group.students.map((s) => {
                    const checked = selectedStudentIds.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => onToggle(s.id)}
                        disabled={disabled}
                        className={cn(
                          "flex items-center gap-2 rounded-md border bg-background px-2 py-1 text-left text-[12px]",
                          checked
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-accent/30",
                        )}
                      >
                        <span
                          className={cn(
                            "inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border",
                            checked
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background",
                          )}
                        >
                          {checked ? (
                            <Check className="h-2.5 w-2.5" strokeWidth={3} />
                          ) : null}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {s.name}
                        </span>
                        {s.code ? (
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {s.code}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function plainText(s: string): string {
  return s
    .replace(/!\[.*?\]\(.*?\)/g, "[ảnh]")
    .replace(/\[u:([^\]]+)\]/g, "$1")
    .replace(/\[zone:\d+\]/g, "___")
    .replace(/\s+/g, " ")
    .trim();
}
