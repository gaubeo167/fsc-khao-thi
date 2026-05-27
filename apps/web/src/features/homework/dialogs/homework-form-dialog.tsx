"use client";

import { Check, Loader2, X } from "lucide-react";
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
import { useQuestionsStore } from "@/features/question-bank/state/questions-store";
import type { Question } from "@/features/question-bank/data/seed-questions";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { cn } from "@/lib/utils";

import {
  HOMEWORK_QUESTION_TYPES,
  type Homework,
  type HomeworkStatus,
} from "../data/types";
import { useHomeworkStore } from "../state/homework-store";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: Homework | null;
}

/**
 * Single-page form (no wizard steps) — teacher fills everything at
 * once. Question + material pickers are inline lists with search +
 * checkbox.
 *
 * Word import is a separate flow (covered in task H4). The button
 * shortcut here drops users into the existing /admin/question-bank
 * import dialog; questions land in their personal kho, then the
 * teacher picks them via the same checkbox list.
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
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
    setSearch("");
  }, [open, editing?.id]);

  const campusId =
    session?.role === "superadmin"
      ? activeCampusId ?? null
      : session?.campusId ?? null;

  // Class picker — narrow to chosen grade + campus.
  const classesForGrade = useMemo(() => {
    return allClasses.filter(
      (c) =>
        (!campusId || c.campusId === campusId) &&
        (!gradeId || c.gradeId === gradeId),
    );
  }, [allClasses, campusId, gradeId]);

  // Question pool — auto-gradable only, matching subject+grade+campus,
  // approved (campus kho) or owned by me (personal kho). Filter by
  // search text.
  const pool = useMemo(() => {
    const sq = search.trim().toLowerCase();
    return allQuestions.filter((q) => {
      if (!HOMEWORK_QUESTION_TYPES.has(q.type)) return false;
      if (q.archivedAt) return false;
      if (subjectId && q.subjectId !== subjectId) return false;
      if (gradeId && q.gradeId && q.gradeId !== gradeId) return false;
      if (campusId && q.campusId && q.campusId !== campusId) return false;
      // Visible: approved in campus kho OR my own personal kho
      const visible =
        q.status === "approved" ||
        (q.kho === "personal" && q.ownerId === session?.userId);
      if (!visible) return false;
      if (sq) {
        const hay = `${q.content} ${q.tags.join(" ")} ${q.id}`.toLowerCase();
        if (!hay.includes(sq)) return false;
      }
      return true;
    });
  }, [allQuestions, search, subjectId, gradeId, campusId, session?.userId]);

  // Material pool — same subject + approved-in-campus OR personal.
  const materialPool = useMemo(() => {
    return allMaterials.filter((m) => {
      if (m.archivedAt) return false;
      if (subjectId && m.subjectId !== subjectId) return false;
      const visible =
        m.status === "approved" ||
        (m.kho === "personal" && m.ownerId === session?.userId);
      if (!visible) return false;
      if (campusId && m.campusId && m.campusId !== campusId) return false;
      return true;
    });
  }, [allMaterials, subjectId, campusId, session?.userId]);

  function toggleQuestion(id: string) {
    setQuestionIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }
  function toggleMaterial(id: string) {
    setMaterialIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }
  function toggleClass(id: string) {
    setSelectedClassIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function handleSubmit() {
    if (!session) return;
    if (!title.trim()) {
      toast.error("Nhập tiêu đề BTVN");
      return;
    }
    if (!subjectId) {
      toast.error("Chọn môn học");
      return;
    }
    if (selectedClassIds.length === 0) {
      toast.error("Chọn ít nhất 1 lớp được giao");
      return;
    }
    if (questionIds.length === 0) {
      toast.error("Chọn ít nhất 1 câu hỏi");
      return;
    }
    if (assignedAt > dueAt) {
      toast.error("Ngày hết hạn phải sau ngày giao");
      return;
    }
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
          {/* Meta */}
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

          {/* Question picker */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label>
                Câu hỏi *
                <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                  ({questionIds.length} đã chọn)
                </span>
              </Label>
              <div className="flex items-center gap-2">
                <a
                  href="/admin/question-bank"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 items-center gap-1 rounded-md border bg-card px-2 text-[11.5px] font-medium hover:bg-accent/30"
                  title="Mở Ngân hàng câu hỏi trong tab mới để import từ Word → quay lại tick chọn"
                >
                  📄 Import Word
                </a>
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm theo nội dung / tag / mã…"
                  className="h-8 max-w-[260px]"
                  disabled={submitting}
                />
              </div>
            </div>
            <div className="max-h-[260px] overflow-y-auto rounded-md border bg-card">
              {pool.length === 0 ? (
                <p className="px-3 py-6 text-center text-meta">
                  {subjectId
                    ? "Không có câu hỏi nào phù hợp với bộ lọc."
                    : "Chọn môn trước để hiển thị câu hỏi."}
                </p>
              ) : (
                <ul className="divide-y">
                  {pool.map((q) => (
                    <li key={q.id}>
                      <button
                        type="button"
                        onClick={() => toggleQuestion(q.id)}
                        disabled={submitting}
                        className={cn(
                          "flex w-full items-start gap-2 px-3 py-2 text-left text-[12.5px] hover:bg-accent/30",
                          questionIds.includes(q.id) && "bg-primary/8",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                            questionIds.includes(q.id)
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background",
                          )}
                        >
                          {questionIds.includes(q.id) ? (
                            <Check className="h-3 w-3" strokeWidth={3} />
                          ) : null}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 leading-snug">
                            {plainText(q.content)}
                          </p>
                          <p className="mt-0.5 text-[10.5px] text-muted-foreground">
                            {q.id} · {q.type} · {q.difficulty}{" "}
                            {q.tags.length > 0
                              ? ` · ${q.tags.map((t) => `#${t}`).join(" ")}`
                              : ""}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Material picker */}
          <div className="space-y-1.5">
            <Label>
              Đính kèm học liệu
              <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                ({materialIds.length} đã chọn — HS sẽ xem được khi làm bài)
              </span>
            </Label>
            <div className="max-h-[180px] overflow-y-auto rounded-md border bg-card">
              {materialPool.length === 0 ? (
                <p className="px-3 py-6 text-center text-meta">
                  Chưa có học liệu nào trong môn này.
                </p>
              ) : (
                <ul className="divide-y">
                  {materialPool.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => toggleMaterial(m.id)}
                        disabled={submitting}
                        className={cn(
                          "flex w-full items-start gap-2 px-3 py-2 text-left text-[12.5px] hover:bg-accent/30",
                          materialIds.includes(m.id) && "bg-primary/8",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                            materialIds.includes(m.id)
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background",
                          )}
                        >
                          {materialIds.includes(m.id) ? (
                            <Check className="h-3 w-3" strokeWidth={3} />
                          ) : null}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-1 font-medium">{m.title}</p>
                          <p className="mt-0.5 text-[10.5px] text-muted-foreground">
                            {m.fileType}{" "}
                            {m.sourceType === "link" ? "· Liên kết" : ""}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

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

        <div className="flex justify-end gap-2 pt-2">
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
              "Lưu thay đổi"
            ) : (
              "Tạo BTVN"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
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
/** Strip markdown / HTML markers so the question preview row stays tight. */
function plainText(s: string): string {
  return s
    .replace(/!\[.*?\]\(.*?\)/g, "[ảnh]")
    .replace(/\[u:([^\]]+)\]/g, "$1")
    .replace(/\[zone:\d+\]/g, "___")
    .replace(/\s+/g, " ")
    .trim();
}
