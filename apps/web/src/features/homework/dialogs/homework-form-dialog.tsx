"use client";

import {
  Check,
  CheckSquare,
  Eye,
  FileText,
  Link2,
  Loader2,
  Paperclip,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useCampusStore } from "@/features/campus/state/campus-store";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { useMaterialsStore } from "@/features/learning-materials/state/materials-store";
import {
  FILE_TYPE_LABEL,
} from "@/features/learning-materials/data/types";
import { findQuestionType } from "@/features/question-bank/data/question-types";
import { useQuestionsStore } from "@/features/question-bank/state/questions-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { cn } from "@/lib/utils";

import type { Homework, HomeworkStatus } from "../data/types";
import { useHomeworkStore } from "../state/homework-store";
import { HomeworkPreviewDialog } from "./homework-preview-dialog";
import { MaterialPickerDialog } from "./material-picker-dialog";
import { QuestionPickerDialog } from "./question-picker-dialog";

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
  const allQuestions = useQuestionsStore((s) => s.questions);
  const allMaterials = useMaterialsStore((s) => s.materials);
  const createHomework = useHomeworkStore((s) => s.create);
  const updateHomework = useHomeworkStore((s) => s.update);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [questionIds, setQuestionIds] = useState<string[]>([]);
  const [materialIds, setMaterialIds] = useState<string[]>([]);
  const [assignedAt, setAssignedAt] = useState(() => todayISO());
  const [dueAt, setDueAt] = useState(() => addDaysISO(todayISO(), 7));
  const [status, setStatus] = useState<HomeworkStatus>("published");
  const [submitting, setSubmitting] = useState(false);

  const [questionPickerOpen, setQuestionPickerOpen] = useState(false);
  const [materialPickerOpen, setMaterialPickerOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const isEdit = Boolean(editing);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setDescription(editing.description ?? "");
      setSubjectId(editing.subjectId);
      setGradeId(editing.gradeId ?? "");
      setSelectedClassIds(editing.classIds);
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

    setSubmitting(true);
    try {
      const payload: Omit<Homework, "id" | "createdAt" | "updatedAt"> = {
        title: title.trim(),
        description: description.trim() || undefined,
        subjectId,
        gradeId: gradeId || null,
        classIds: selectedClassIds,
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
        updateHomework(editing.id, payload);
        toast.success("Đã cập nhật BTVN");
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
          className="max-w-3xl max-h-[92vh] overflow-y-auto"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>
              {isEdit ? "Chỉnh sửa BTVN" : "Giao BTVN mới"}
            </DialogTitle>
            <DialogDescription>
              Học sinh có thể làm bất kỳ lúc nào trong khoảng [ngày giao,
              ngày hết hạn]. Đính kèm học liệu để HS tham khảo khi làm.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Title + description */}
            <div className="space-y-1.5">
              <Label>Tiêu đề *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="VD: BTVN Chương 1 — Phương trình bậc 1"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Mô tả / Hướng dẫn cho HS</Label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full rounded-md border bg-background px-3 py-2 text-[13px] disabled:opacity-50"
                disabled={submitting}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Môn *</Label>
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
              <div className="space-y-1.5">
                <Label>Khối</Label>
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
              <div className="space-y-1.5">
                <Label>Ngày giao *</Label>
                <Input
                  type="date"
                  value={assignedAt}
                  onChange={(e) => setAssignedAt(e.target.value)}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Ngày hết hạn *</Label>
                <Input
                  type="date"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                  disabled={submitting}
                />
              </div>
            </div>

            {/* Class picker */}
            <div className="space-y-1.5">
              <Label>Lớp được giao *</Label>
              {classesForGrade.length === 0 ? (
                <p className="text-meta">
                  {gradeId
                    ? "Chưa có lớp nào ở khối này"
                    : "Chọn khối để hiển thị danh sách lớp"}
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
                        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[12px] font-medium",
                        selectedClassIds.includes(c.id)
                          ? "border-primary bg-primary text-primary-foreground"
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
            </div>

            {/* Question picker — button + summary */}
            <SummarySection
              title="Câu hỏi *"
              count={selectedQuestions.length}
              icon={CheckSquare}
              tone="blue"
              actions={
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (!subjectId)
                      return toast.error("Chọn môn trước khi chọn câu hỏi");
                    setQuestionPickerOpen(true);
                  }}
                  disabled={submitting}
                >
                  <Plus className="h-4 w-4" />
                  {selectedQuestions.length > 0
                    ? "Thêm / sửa câu hỏi"
                    : "Chọn câu hỏi từ ngân hàng"}
                </Button>
              }
            >
              {selectedQuestions.length === 0 ? (
                <p className="text-meta">
                  Chưa chọn câu hỏi nào. Bấm nút phía trên để chọn từ kho cá
                  nhân hoặc kho trường.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {selectedQuestions.map((q, i) => {
                    const meta = findQuestionType(q.type);
                    return (
                      <li
                        key={q.id}
                        className="flex items-start gap-2 rounded-md border bg-card px-2.5 py-1.5"
                      >
                        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground/8 text-[10.5px] font-bold text-foreground/70">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-1 text-[12.5px]">
                            {plainText(q.content)}
                          </p>
                          <p className="text-[10.5px] text-muted-foreground">
                            {q.id}
                            {meta ? ` · ${meta.name}` : ""} · {q.difficulty}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeQuestion(q.id)}
                          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="Bỏ chọn"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </SummarySection>

            {/* Material picker */}
            <SummarySection
              title="Học liệu đính kèm"
              count={selectedMaterials.length}
              icon={Paperclip}
              tone="emerald"
              actions={
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (!subjectId)
                      return toast.error("Chọn môn trước khi chọn học liệu");
                    setMaterialPickerOpen(true);
                  }}
                  disabled={submitting}
                >
                  <Plus className="h-4 w-4" />
                  {selectedMaterials.length > 0
                    ? "Thêm / sửa học liệu"
                    : "Chọn học liệu"}
                </Button>
              }
            >
              {selectedMaterials.length === 0 ? (
                <p className="text-meta">
                  Tuỳ chọn. Đính kèm bài giảng / video để HS xem khi làm bài.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {selectedMaterials.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-start gap-2 rounded-md border bg-card px-2.5 py-1.5"
                    >
                      {m.sourceType === "link" ? (
                        <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
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
                        onClick={() => removeMaterial(m.id)}
                        className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="Bỏ chọn"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </SummarySection>

            {/* Status */}
            <div className="space-y-1.5">
              <Label>Trạng thái</Label>
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value as HomeworkStatus)}
                disabled={submitting}
              >
                <option value="draft">Nháp (HS chưa thấy)</option>
                <option value="published">
                  Đã giao (HS thấy được trong khoảng ngày)
                </option>
                <option value="closed">Đã đóng (không cho nộp thêm)</option>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
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
            >
              <Eye className="h-4 w-4" />
              Xem trước / Làm thử
            </Button>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Huỷ
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
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
                "Tạo BTVN"
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
    </>
  );
}

function SummarySection({
  title,
  count,
  icon: Icon,
  tone,
  actions,
  children,
}: {
  title: string;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: "blue" | "emerald";
  actions: React.ReactNode;
  children: React.ReactNode;
}) {
  const accent =
    tone === "blue"
      ? "border-blue-200 bg-blue-50/50 text-blue-700"
      : "border-emerald-200 bg-emerald-50/50 text-emerald-700";
  return (
    <section className="space-y-1.5 rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="inline-flex items-center gap-1.5">
          <Icon className="h-4 w-4 text-foreground/60" />
          {title}
          <span
            className={cn(
              "inline-flex h-5 min-w-[1.5rem] items-center justify-center rounded-md border px-1.5 text-[10.5px] font-bold",
              accent,
            )}
          >
            {count}
          </span>
        </Label>
        {actions}
      </div>
      {children}
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
