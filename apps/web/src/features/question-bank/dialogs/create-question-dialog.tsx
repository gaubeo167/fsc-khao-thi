"use client";

import { zodResolverSafe } from "@/lib/zod-resolver";
import {
  ArrowLeft,
  CheckSquare,
  Eye,
  EyeOff,
  FileText,
  PlayCircle,
  Save,
  Send,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { StepIndicator } from "@/components/ui/step-indicator";
import {
  filterGradesByScope,
  filterSubjectsByScope,
  useUserScope,
} from "@/features/auth/lib/use-scope";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useCampusStore } from "@/features/campus/state/campus-store";
import { useCampusesStore } from "@/features/campus/state/campuses-store";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";

import { ContentEditor } from "../components/content-editor";
import { KhoSelector } from "../components/forms/kho-selector";
import { TocTagFields } from "../components/forms/toc-tag-fields";
import { TypeSpecificFields } from "../components/forms/type-specific-fields";
import { RenderedContent } from "../components/rendered-content";
import { SectionCard } from "../components/section-card";
import {
  QUESTION_TYPES,
  findQuestionType,
  type QuestionType,
} from "../data/question-types";
import type { Question } from "../data/seed-questions";
import { QuestionSchema, type QuestionFormValues } from "../schemas";
import { TryItPanel } from "../components/try-it-panel";
import { useQuestionsStore } from "../state/questions-store";
import { AiBatchDialog } from "./ai-batch-dialog";
import { AnswerView } from "./view-question-dialog";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When supplied, the dialog enters Edit mode and skips Step 1. */
  editing?: Question | null;
}

export function CreateQuestionDialog({ open, onOpenChange, editing }: Props) {
  const session = useAuthStore((s) => s.session);
  const create = useQuestionsStore((s) => s.create);
  const update = useQuestionsStore((s) => s.update);

  const [type, setType] = useState<QuestionType | null>(null);
  // Lifted from QuestionForm so the outer Dialog can intercept outside-
  // clicks / ESC and exit them instead of closing the whole editor.
  const [previewing, setPreviewing] = useState(false);
  const [tryingIt, setTryingIt] = useState(false);

  useEffect(() => {
    if (open && editing) setType(editing.type);
    if (!open) {
      setType(null);
      setPreviewing(false);
      setTryingIt(false);
    }
  }, [open, editing]);

  const isEdit = Boolean(editing);

  /** UX rules for closing the editor:
   *   - Overlay click never closes — too easy to lose work in a long form.
   *   - ESC: if in preview/try-it, exit those (back to editor); else
   *     also blocked (force user to click ✕ or "Quay lại").
   * Returns true when an inner overlay panel was exited and the close
   * gesture should be swallowed. */
  function exitOverlayIfAny(): boolean {
    if (previewing) {
      setPreviewing(false);
      return true;
    }
    if (tryingIt) {
      setTryingIt(false);
      return true;
    }
    return false;
  }

  function handleSubmit(values: QuestionFormValues, finalStatus: Question["status"]) {
    try {
      if (isEdit && editing) {
        update(editing.id, {
          ...(values as any),
          status: finalStatus,
          approvedBy:
            finalStatus === "approved" ? session?.userId ?? null : editing.approvedBy ?? null,
          rejectionNote: null,
        });
        toast.success(
          finalStatus === "approved"
            ? "Đã lưu & duyệt câu hỏi"
            : finalStatus === "pending"
              ? "Đã gửi duyệt câu hỏi"
              : "Đã lưu bản nháp",
        );
      } else {
        const created = create({
          ...(values as any),
          tocNodeId: (values as any).tocNodeId ?? null,
          ownerId: session?.userId ?? "anonymous",
          ownerName: session?.name ?? "—",
          status: finalStatus,
          approvedBy: finalStatus === "approved" ? session?.userId ?? null : null,
          rejectionNote: null,
        });
        toast.success(
          finalStatus === "approved"
            ? `Đã tạo câu hỏi ${created.id}`
            : finalStatus === "pending"
              ? `Đã gửi duyệt ${created.id} — chờ TBM/Admin xác nhận`
              : `Đã lưu bản nháp ${created.id}`,
        );
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(
        e instanceof Error ? `Lưu thất bại: ${e.message}` : "Lưu câu hỏi thất bại",
      );
    }
  }

  // AI-generated questions take a completely different shape (batch + review)
  // so swap into a dedicated dialog instead of QuestionForm.
  if (type === "ai-generated") {
    return (
      <AiBatchDialog
        open={open}
        onOpenChange={onOpenChange}
        onBack={() => setType(null)}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl max-h-[92vh] overflow-y-auto"
        onPointerDownOutside={(e) => {
          // Always swallow the close gesture. If user was in preview /
          // try-it, exit those panels back to the editor; otherwise
          // do nothing — they need to click ✕ or "Quay lại" to leave.
          e.preventDefault();
          exitOverlayIfAny();
        }}
        onInteractOutside={(e) => {
          // Same guard for non-pointer interactions (focus loss to a
          // toast, etc.) so the dialog doesn't close itself.
          e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          exitOverlayIfAny();
        }}
      >
        {type === null ? (
          <TypePicker onPick={setType} onCancel={() => onOpenChange(false)} />
        ) : (
          <QuestionForm
            type={type}
            editing={editing ?? null}
            isEdit={isEdit}
            onBack={isEdit ? undefined : () => setType(null)}
            onSubmit={handleSubmit}
            previewing={previewing}
            setPreviewing={setPreviewing}
            tryingIt={tryingIt}
            setTryingIt={setTryingIt}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/* step 1 — type picker */

function TypePicker({
  onPick,
  onCancel,
}: {
  onPick: (type: QuestionType) => void;
  onCancel: () => void;
}) {
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b pb-4">
        <StepIndicator
          current={1}
          steps={[{ label: "Chọn loại" }, { label: "Soạn nội dung" }]}
        />
        <span className="text-meta">Bước 1 / 2</span>
      </div>

      <header className="mb-4">
        <DialogTitle className="text-section-title">Chọn dạng câu hỏi</DialogTitle>
        <p className="text-meta mt-0.5">
          Mỗi dạng câu hỏi có biểu mẫu nhập riêng. Có thể chỉnh sửa lại sau khi tạo.
        </p>
      </header>

      <ul className="grid gap-2 sm:grid-cols-2">
        {QUESTION_TYPES.map((q) => {
          const Icon = q.icon;
          return (
            <li key={q.id}>
              <button
                type="button"
                onClick={() => onPick(q.id)}
                className="group flex w-full items-start gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/4"
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    backgroundColor: `${q.color}1A`,
                    color: q.color,
                  }}
                >
                  <Icon className="h-5 w-5" strokeWidth={1.85} />
                </span>
                <div className="min-w-0">
                  <p className="text-card-title">{q.name}</p>
                  <p className="text-meta mt-0.5 leading-snug">{q.description}</p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-5 flex items-center justify-end border-t pt-4">
        <Button variant="outline" onClick={onCancel}>
          Hủy
        </Button>
      </div>
    </>
  );
}

/* step 2 — main form */

interface FormProps {
  type: QuestionType;
  editing: Question | null;
  isEdit: boolean;
  onBack?: () => void;
  onSubmit: (values: QuestionFormValues, finalStatus: Question["status"]) => void;
  /** preview / try-it state lifted to the dialog parent so outside-clicks
   *  + ESC can exit those panels without closing the whole editor. */
  previewing: boolean;
  setPreviewing: (next: boolean) => void;
  tryingIt: boolean;
  setTryingIt: (next: boolean) => void;
}

export function QuestionForm({
  type,
  editing,
  isEdit,
  onBack,
  onSubmit,
  previewing,
  setPreviewing,
  tryingIt,
  setTryingIt,
}: FormProps) {
  const session = useAuthStore((s) => s.session);
  const grades = useGradesStore((s) => s.grades);
  const subjects = useSubjectsStore((s) => s.subjects);
  const tocNodes = useSubjectsStore((s) => s.tocNodes);
  const allCampuses = useCampusesStore((s) => s.campuses);
  // Scope — teachers / TBM are restricted to their assigned subjects +
  // grades. Admin-class roles (campus-admin / academic-director /
  // superadmin) bypass via `scope.isUnscoped`.
  const scope = useUserScope();
  // After the role-scope filter, further restrict to the operating
  // campus's gradeIds so a campus-admin on a primary-secondary campus
  // doesn't see K10–K12 (which don't exist there).
  const activeCampusIdLocal = useCampusStore((s) => s.activeCampusId);
  const operatingCampusId =
    session?.role === "superadmin"
      ? activeCampusIdLocal
      : session?.campusId ?? null;
  const operatingCampus = operatingCampusId
    ? allCampuses.find((c) => c.id === operatingCampusId) ?? null
    : null;
  const campusGradeIds = operatingCampus
    ? new Set(operatingCampus.gradeIds)
    : null;
  // Subjects: role-scope first (teacher → assigned subjects only), then
  // campus-scope (subject must belong to or be unrestricted-on the
  // operating campus). Without the campus pass, brand-new campuses saw
  // subjects from every other campus mixed into the dropdown.
  const allowedSubjects = filterSubjectsByScope(subjects, scope).filter(
    (s) => {
      if (!operatingCampus) return true;
      return (
        !s.campusIds ||
        s.campusIds.length === 0 ||
        s.campusIds.includes(operatingCampus.id)
      );
    },
  );
  const allowedGrades = filterGradesByScope(grades, scope).filter(
    (g) => (campusGradeIds ? campusGradeIds.has(g.id) : true),
  );

  const meta = findQuestionType(type);
  const Icon = meta.icon;

  const form = useForm<any>({
    resolver: zodResolverSafe(QuestionSchema),
    defaultValues: editing
      ? defaultsFromExisting(editing)
      : defaultsForType(type, session?.campusId ?? null),
    mode: "onBlur",
  });

  const activeCampusId = useCampusStore((s) => s.activeCampusId);

  const kho = form.watch("kho") as "personal" | "campus";
  useEffect(() => {
    if (kho === "personal") {
      form.setValue("campusId", null);
      return;
    }
    // Đối với staff thông thường, dùng campusId trong session.
    // Superadmin không có campusId riêng → dùng activeCampusId (campus đang
    // được chọn trên thanh điều hướng) để biết câu hỏi thuộc về campus nào.
    const resolvedCampusId = session?.campusId ?? activeCampusId ?? null;
    form.setValue("campusId", resolvedCampusId);
  }, [kho, form, session?.campusId, activeCampusId]);

  const subjectId = form.watch("subjectId") as string;
  const gradeId = form.watch("gradeId") as string;
  const difficulty = form.watch("difficulty") as "easy" | "medium" | "hard";
  const tocNodeId = form.watch("tocNodeId") as string | null;

  const aiContext = {
    questionType: meta.name,
    subject: subjects.find((s) => s.id === subjectId)?.name,
    grade: grades.find((g) => g.id === gradeId)?.name,
    difficulty: DIFFICULTY_PREVIEW[difficulty],
    topic: tocNodeId ? buildTocPath(tocNodes, tocNodeId) : undefined,
  };

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [backConfirmOpen, setBackConfirmOpen] = useState(false);

  /** Pull out the first useful validation error so silent submit failures
   *  become a visible toast-style banner the user can actually act on. */
  function summarizeErrors(errors: Record<string, unknown>): string {
    const first = pickFirstError(errors);
    return first ?? "Vui lòng kiểm tra lại các trường bắt buộc.";
  }

  function saveDraft() {
    setSubmitError(null);
    form.handleSubmit(
      (v) => onSubmit(v, "draft"),
      (errors) => setSubmitError(summarizeErrors(errors)),
    )();
  }
  function submitForApproval() {
    setSubmitError(null);
    form.handleSubmit(
      (v) => onSubmit(v, v.kho === "personal" ? "approved" : "pending"),
      (errors) => setSubmitError(summarizeErrors(errors)),
    )();
  }

  // Superadmin tham gia mọi campus → không cần campusId riêng.
  // Các vai trò staff khác (admin / leader / teacher) cần campusId.
  const canSubmitToCampus =
    !!session &&
    session.role !== "student" &&
    (session.role === "superadmin" || session.campusId !== null);

  return (
    <form className="space-y-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-4">
        <StepIndicator
          current={2}
          steps={[{ label: "Chọn loại" }, { label: "Soạn nội dung" }]}
          onJump={onBack ? () => onBack() : undefined}
        />
        <span className="text-meta">Bước 2 / 2</span>
      </div>

      <header className="flex items-start gap-3 border-b py-4">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{
            backgroundColor: `${meta.color}1A`,
            color: meta.color,
          }}
        >
          <Icon className="h-5 w-5" strokeWidth={1.85} />
        </span>
        <div className="min-w-0 flex-1">
          <DialogTitle className="text-section-title">
            {isEdit ? (
              <>
                Chỉnh sửa: <span className="font-mono">{editing!.id}</span>
              </>
            ) : (
              <>Tạo câu hỏi · {meta.name}</>
            )}
          </DialogTitle>
          <p className="text-meta mt-0.5">{meta.description}</p>
        </div>
      </header>

      {previewing && (
        <PreviewPanel
          values={form.getValues()}
          type={type}
          onExit={() => setPreviewing(false)}
        />
      )}

      {tryingIt && (
        <TryItPanel
          values={form.getValues()}
          type={type}
          onExit={() => setTryingIt(false)}
          subjectName={subjects.find((s) => s.id === subjectId)?.name}
          gradeName={grades.find((g) => g.id === gradeId)?.name}
        />
      )}

      {/* TOP — META */}
      <section className={cn("space-y-5 py-5", (previewing || tryingIt) && "hidden")}>
        {/* Scope debug banner — surfaces the resolved permission scope so
            teachers (and admins helping them) can see why the dropdowns
            below contain a particular subset. */}
        {session && (
          <div
            className={cn(
              "rounded-md border px-3 py-2 text-[11.5px]",
              scope.isUnscoped
                ? "border-blue-200 bg-blue-50 text-blue-900"
                : scope.hasScope
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-rose-200 bg-rose-50 text-rose-900",
            )}
          >
            <b>🔐 Phạm vi của bạn ({session.role}):</b>{" "}
            {scope.isUnscoped ? (
              <span>Toàn campus — không giới hạn môn/khối.</span>
            ) : scope.hasScope ? (
              <span>
                {allowedSubjects.length} môn (
                {allowedSubjects.map((s) => s.name).join(", ")}) ·{" "}
                {scope.allowedGradeIds
                  ? `${allowedGrades.length} khối (${allowedGrades
                      .map((g) => g.code)
                      .join(", ")})`
                  : "tất cả khối trong môn"}
              </span>
            ) : (
              <span>
                <b>Chưa được giao môn nào.</b> Liên hệ Admin campus →
                /admin/users → mở user của bạn → tick "Môn dạy".
              </span>
            )}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Môn học" required error={form.formState.errors.subjectId?.message as string}>
            <Select {...form.register("subjectId")}>
              <option value="">— Chọn môn —</option>
              {allowedSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            {!scope.isUnscoped && (
              <p className="mt-1 text-[10.5px] text-muted-foreground">
                🔒 Giới hạn theo phân công: {allowedSubjects.length} môn.
              </p>
            )}
          </Field>
          <Field label="Khối" required error={form.formState.errors.gradeId?.message as string}>
            <Select {...form.register("gradeId")}>
              <option value="">— Chọn khối —</option>
              {allowedGrades.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
            {!scope.isUnscoped && scope.allowedGradeIds && (
              <p className="mt-1 text-[10.5px] text-muted-foreground">
                🔒 Giới hạn theo phân công: {allowedGrades.length} khối.
              </p>
            )}
          </Field>
          <Field label="Độ khó" required>
            <Select {...form.register("difficulty")}>
              <option value="easy">Dễ (Nhận biết)</option>
              <option value="medium">Trung bình (Thông hiểu)</option>
              <option value="hard">Khó (Vận dụng)</option>
            </Select>
          </Field>
        </div>

        <KhoSelector control={form.control} />

        <TocTagFields control={form.control} watch={form.watch} />

        <input type="hidden" {...form.register("campusId")} />
      </section>

      {/* BOTTOM — CONTENT + ANSWERS in section cards */}
      <section className={cn("space-y-4 border-t py-5", (previewing || tryingIt) && "hidden")}>
        <SectionCard
          icon={FileText}
          tone="blue"
          title="Đề bài câu hỏi"
          required
        >
          <Controller
            control={form.control}
            name="content"
            render={({ field, fieldState }) => (
              <ContentEditor
                value={field.value ?? ""}
                onChange={field.onChange}
                invalid={Boolean(fieldState.error)}
                placeholder={contentPlaceholder(type)}
                aiContext={aiContext}
                showBlankButton={type === "fill-blank"}
                showZoneButton={type === "drag-drop"}
                showUnderlineButton={type === "underline"}
              />
            )}
          />
          {form.formState.errors.content?.message ? (
            <p className="text-[12px] text-destructive mt-1">
              {form.formState.errors.content.message as string}
            </p>
          ) : null}
        </SectionCard>

        <SectionCard
          icon={CheckSquare}
          tone="emerald"
          title={
            <>
              {answerSectionTitle(type)}{" "}
              <span className="text-meta font-normal">— {answerHint(type)}</span>
            </>
          }
        >
          <TypeSpecificFields
            type={type}
            control={form.control}
            setValue={form.setValue}
            errors={form.formState.errors as any}
          />
        </SectionCard>
      </section>

      {submitError && (
        <div className="mt-2 flex items-start gap-2.5 rounded-lg border border-destructive-border bg-destructive-soft px-3 py-2.5 text-[13px] text-destructive-text">
          <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-destructive-text text-white text-[10px] font-bold">
            !
          </span>
          <div className="min-w-0">
            <p className="font-semibold">Không lưu được câu hỏi</p>
            <p className="text-meta mt-0.5 leading-relaxed text-destructive-text/80">
              {submitError}
            </p>
          </div>
        </div>
      )}

      <footer
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 border-t pt-4",
          (previewing || tryingIt) && "hidden",
        )}
      >
        {onBack ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (form.formState.isDirty) {
                setBackConfirmOpen(true);
              } else {
                onBack();
              }
            }}
          >
            <ArrowLeft className="h-4 w-4" />
            Quay lại
          </Button>
        ) : (
          <span />
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setPreviewing(!previewing);
              setTryingIt(false);
            }}
          >
            {previewing ? (
              <>
                <EyeOff className="h-4 w-4" />
                Đóng xem trước
              </>
            ) : (
              <>
                <Eye className="h-4 w-4" />
                Xem trước
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setTryingIt(!tryingIt);
              setPreviewing(false);
            }}
            className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
          >
            <PlayCircle className="h-4 w-4" />
            {tryingIt ? "Đóng làm thử" : "Làm thử"}
          </Button>
          <Button type="button" variant="outline" onClick={saveDraft}>
            <Save className="h-4 w-4" />
            Lưu nháp
          </Button>
          <Button
            type="button"
            onClick={submitForApproval}
            disabled={!canSubmitToCampus && kho === "campus"}
          >
            <Send className="h-4 w-4" />
            {kho === "personal" ? "Lưu vào kho cá nhân" : "Gửi duyệt vào Kho trường"}
          </Button>
        </div>
      </footer>
      <BackConfirmDialog
        open={backConfirmOpen}
        onCancel={() => setBackConfirmOpen(false)}
        onDiscard={() => {
          setBackConfirmOpen(false);
          onBack?.();
        }}
        onSaveDraft={() => {
          setBackConfirmOpen(false);
          form.handleSubmit(
            (v) => {
              onSubmit(v, "draft");
            },
            (errors) => setSubmitError(summarizeErrors(errors)),
          )();
        }}
      />
    </form>
  );
}

function PreviewPanel({
  values,
  type,
  onExit,
}: {
  values: any;
  type: QuestionType;
  onExit: () => void;
}) {
  const meta = findQuestionType(type);
  const subjects = useSubjectsStore((s) => s.subjects);
  const grades = useGradesStore((s) => s.grades);
  const subject = subjects.find((s) => s.id === values.subjectId);
  const grade = grades.find((g) => g.id === values.gradeId);

  const previewQuestion = buildPreviewQuestion(values, type);
  const hasContent =
    (values.content ?? "").trim().length > 0 || hasAnyAnswerData(values, type);

  return (
    <section className="overflow-hidden rounded-xl border bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      {/* Blue title bar */}
      <header className="flex items-center justify-between gap-3 bg-gradient-to-r from-primary to-[#1D4ED8] px-5 py-3 text-white">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/25">
            <Eye className="h-4 w-4" strokeWidth={2} />
          </span>
          <div className="leading-tight">
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-white/75">
              Xem trước · giao diện học sinh
            </p>
            <p className="text-[14px] font-semibold">
              {meta.name}
              {subject ? ` · ${subject.name}` : ""}
              {grade ? ` · ${grade.name}` : ""}
              {" · "}
              {DIFFICULTY_PREVIEW[values.difficulty as keyof typeof DIFFICULTY_PREVIEW] ?? "—"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onExit}
          aria-label="Đóng xem trước"
          title="Đóng xem trước"
          className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-white/20"
        >
          <EyeOff className="h-3.5 w-3.5" strokeWidth={2.25} />
          Đóng
        </button>
      </header>

      <div className="px-5 py-4">
      {!hasContent ? (
        <div className="rounded-lg border border-dashed bg-surface-2 px-4 py-10 text-center">
          <p className="text-section-title text-muted-foreground">
            Chưa có nội dung
          </p>
          <p className="text-meta mt-1">
            Nhập đề bài và đáp án ở dưới để xem preview.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <p className="text-eyebrow mb-2">Nội dung</p>
            <div className="rounded-lg border bg-surface p-4">
              {(values.content ?? "").trim() ? (
                <RenderedContent
                  content={values.content}
                  hideUnderlineMarks={type === "underline"}
                />
              ) : (
                <p className="text-meta italic">— chưa có đề bài —</p>
              )}
            </div>
          </div>

          {previewQuestion ? (
            <div>
              <p className="text-eyebrow mb-2">Đáp án</p>
              <AnswerView question={previewQuestion} />
            </div>
          ) : null}

          {(values.explanation ?? "").trim() ? (
            <div>
              <p className="text-eyebrow mb-2">Giải thích</p>
              <div className="rounded-lg border bg-surface p-4">
                <RenderedContent content={values.explanation} />
              </div>
            </div>
          ) : null}
        </div>
      )}
      </div>
    </section>
  );
}

/** Walk a react-hook-form errors object until we find a leaf message. */
function pickFirstError(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  const o = node as Record<string, unknown>;
  if (typeof o.message === "string" && o.message.length > 0) return o.message;
  for (const key of Object.keys(o)) {
    const found = pickFirstError(o[key]);
    if (found) return found;
  }
  return null;
}

const DIFFICULTY_PREVIEW = {
  easy: "Dễ",
  medium: "Trung bình",
  hard: "Khó",
} as const;

/** Walk the parentId chain to build "Chương · Chủ đề · Chủ điểm" path. */
function buildTocPath(
  tocNodes: Array<{ id: string; name: string; parentId: string | null }>,
  nodeId: string,
): string | undefined {
  const byId = new Map(tocNodes.map((n) => [n.id, n]));
  const parts: string[] = [];
  let cursor: string | null = nodeId;
  let safety = 8;
  while (cursor && safety-- > 0) {
    const node = byId.get(cursor);
    if (!node) break;
    parts.unshift(node.name);
    cursor = node.parentId;
  }
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function hasAnyAnswerData(values: any, type: QuestionType): boolean {
  switch (type) {
    case "mcq-single":
    case "mcq-multi":
      return Array.isArray(values.options) && values.options.some(
        (o: any) => (o.content ?? "").trim().length > 0,
      );
    case "true-false":
      return typeof values.correctAnswer === "boolean";
    case "multi-tf":
      return Array.isArray(values.subQuestions) && values.subQuestions.some(
        (s: any) => (s.statement ?? "").trim().length > 0,
      );
    case "short-answer":
      return Array.isArray(values.acceptedAnswers) && values.acceptedAnswers.length > 0;
    case "fill-blank":
      return Array.isArray(values.blanks) && values.blanks.some(
        (b: any) => Array.isArray(b.acceptedAnswers) && b.acceptedAnswers.length > 0,
      );
    case "matching":
      return Array.isArray(values.pairs) && values.pairs.some(
        (p: any) => (p.left ?? "").trim().length > 0 || (p.right ?? "").trim().length > 0,
      );
    case "ordering":
      return Array.isArray(values.items) && values.items.some(
        (i: any) => (i.content ?? "").trim().length > 0,
      );
    case "drag-drop":
      return (
        Array.isArray(values.zones) && values.zones.length > 0
      );
    case "underline":
      return /\[u:[^\]]+\]/.test((values.content ?? "") as string);
    case "essay":
      return Array.isArray(values.rubric) && values.rubric.length > 0;
    case "ai-generated":
      return (values.prompt ?? "").trim().length > 0;
  }
}

/**
 * Build a synthetic Question object from current form values so the preview
 * can reuse `AnswerView`. Missing meta is stubbed; only the shape needed by
 * the switch in AnswerView matters.
 */
function buildPreviewQuestion(values: any, type: QuestionType): Question | null {
  const shared = {
    id: "preview",
    content: values.content ?? "",
    explanation: values.explanation ?? null,
    subjectId: values.subjectId ?? "",
    gradeId: values.gradeId ?? null,
    difficulty: values.difficulty ?? "medium",
    tags: values.tags ?? [],
    tocNodeId: values.tocNodeId ?? null,
    kho: values.kho ?? "personal",
    campusId: values.campusId ?? null,
    ownerId: "preview",
    ownerName: "—",
    status: "draft" as const,
    approvedBy: null,
    rejectionNote: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  switch (type) {
    case "mcq-single":
    case "mcq-multi":
      if (!Array.isArray(values.options)) return null;
      return { type, ...shared, options: values.options } as Question;
    case "true-false":
      return {
        type,
        ...shared,
        correctAnswer: Boolean(values.correctAnswer),
      } as Question;
    case "multi-tf":
      if (!Array.isArray(values.subQuestions)) return null;
      return { type, ...shared, subQuestions: values.subQuestions } as Question;
    case "short-answer":
      return {
        type,
        ...shared,
        acceptedAnswers: values.acceptedAnswers ?? [],
        caseSensitive: Boolean(values.caseSensitive),
      } as Question;
    case "fill-blank":
      return { type, ...shared, blanks: values.blanks ?? [] } as Question;
    case "matching":
      return { type, ...shared, pairs: values.pairs ?? [] } as Question;
    case "ordering":
      return { type, ...shared, items: values.items ?? [] } as Question;
    case "drag-drop":
      return {
        type,
        ...shared,
        zones: values.zones ?? [],
        distractors: values.distractors ?? [],
      } as Question;
    case "underline":
      return { type, ...shared } as Question;
    case "essay":
      return {
        type,
        ...shared,
        rubric: values.rubric ?? [],
        wordMin: values.wordMin ?? 0,
        wordMax: values.wordMax ?? 0,
        aiAssist: Boolean(values.aiAssist),
      } as Question;
    case "ai-generated":
      return { type, ...shared, prompt: values.prompt ?? "" } as Question;
  }
}

function Field({
  label,
  error,
  required,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      {children}
      {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
    </div>
  );
}

function answerSectionTitle(type: QuestionType): string {
  switch (type) {
    case "matching":
      return "Các cặp đúng";
    case "multi-tf":
      return "Các câu hỏi phụ";
    case "fill-blank":
      return "Đáp án các ô trống";
    case "true-false":
      return "Đáp án đúng/sai";
    case "ordering":
      return "Thứ tự đúng";
    case "drag-drop":
      return "Vùng thả & cụm từ kéo";
    case "underline":
      return "Cụm gạch chân";
    case "essay":
      return "Rubric chấm điểm";
    default:
      return "Các đáp án";
  }
}

function answerHint(type: QuestionType): string {
  switch (type) {
    case "mcq-single":
      return "Đánh dấu 1 đáp án ĐÚNG duy nhất";
    case "mcq-multi":
      return "Đánh dấu nhiều đáp án ĐÚNG";
    case "true-false":
      return "Chọn Đúng hoặc Sai";
    case "multi-tf":
      return "Mỗi câu phụ Đúng / Sai riêng";
    case "fill-blank":
      return "Đáp án chấp nhận cho từng blank";
    case "matching":
      return "Hệ thống sẽ xáo trộn cột phải khi học sinh làm bài";
    case "ordering":
      return "Kéo thả để sắp xếp · Hệ thống sẽ xáo trộn khi học sinh làm bài";
    case "drag-drop":
      return "Vùng thả tự xáo + pool cụm từ kéo (đúng + nhiễu) trộn ngẫu nhiên";
    case "underline":
      return "Bôi đen chữ trong đề bài để đánh dấu cụm cần gạch chân";
    case "short-answer":
      return "Đáp án chấp nhận";
    case "essay":
      return "Tiêu chí giáo viên dùng khi chấm";
    case "ai-generated":
      return "Mô tả yêu cầu cho AI";
  }
}

function contentPlaceholder(type: QuestionType): string {
  switch (type) {
    case "fill-blank":
      return "vd: Thủ đô nước Anh là  · Bấm '+ Thêm ô trống' trên thanh công cụ để chèn ô tại vị trí cần điền.";
    case "true-false":
    case "multi-tf":
      return "vd: Đoạn văn / phát biểu cần đánh giá Đúng / Sai.";
    case "mcq-single":
    case "mcq-multi":
      return "vd: Đạo hàm của $f(x) = x^2$ bằng?\n\nClick Σ trên thanh công cụ để chèn công thức.";
    case "short-answer":
      return "vd: Thủ đô của Việt Nam là gì?";
    case "matching":
      return "vd: Ghép cặp các thủ đô với quốc gia tương ứng.";
    case "ordering":
      return "vd: Sắp xếp các bước của vòng đời nước theo thứ tự.";
    case "drag-drop":
      return "vd: Phương trình: [vùng thả 1] + [vùng thả 2] → NaCl + H₂O. Bấm '+ Chèn vùng thả' để thêm chip.";
    case "underline":
      return "vd: Gạch chân các động từ trong câu sau: Cô bé đang đi đến trường bằng xe đạp. Bôi đen từ rồi bấm 'Đánh dấu gạch chân'.";
    case "essay":
      return "vd: Phân tích bài thơ *Tây Tiến* của Quang Dũng.";
    case "ai-generated":
      return "Mô tả chủ đề câu hỏi — AI sẽ sinh các câu trong phần dưới.";
  }
}

function defaultsForType(type: QuestionType, _campusId: string | null): any {
  const base = {
    content: "",
    explanation: "",
    subjectId: "",
    gradeId: "",
    difficulty: "medium" as const,
    tags: [] as string[],
    tocNodeId: null as string | null,
    kho: "personal" as const,
    campusId: null as string | null,
  };

  switch (type) {
    case "mcq-single":
    case "mcq-multi":
      return {
        type,
        ...base,
        options: [
          { id: "opt-a", content: "", isCorrect: false },
          { id: "opt-b", content: "", isCorrect: false },
          { id: "opt-c", content: "", isCorrect: false },
          { id: "opt-d", content: "", isCorrect: false },
        ],
      };
    case "true-false":
      return { type, ...base, correctAnswer: true };
    case "multi-tf":
      return {
        type,
        ...base,
        subQuestions: [
          { id: "sub-1", statement: "", correctAnswer: true },
          { id: "sub-2", statement: "", correctAnswer: false },
        ],
      };
    case "short-answer":
      return { type, ...base, acceptedAnswers: [], caseSensitive: false };
    case "fill-blank":
      // Blanks sync from `[blank:N]` chips in content — start empty
      return { type, ...base, blanks: [] };
    case "matching":
      return {
        type,
        ...base,
        pairs: [
          { id: "p-1", left: "", right: "" },
          { id: "p-2", left: "", right: "" },
          { id: "p-3", left: "", right: "" },
        ],
        distractors: [],
      };
    case "ordering":
      return {
        type,
        ...base,
        items: [
          { id: "i-1", content: "" },
          { id: "i-2", content: "" },
          { id: "i-3", content: "" },
        ],
      };
    case "drag-drop":
      // Zones sync from `[zone:N]` chips in content — start empty.
      return { type, ...base, zones: [], distractors: [] };
    case "underline":
      return { type, ...base };
    case "essay":
      return {
        type,
        ...base,
        rubric: [
          { id: `r-${Date.now()}-1`, label: "Nội dung & ý tưởng", points: 4 },
          { id: `r-${Date.now()}-2`, label: "Cấu trúc bài viết", points: 3 },
          { id: `r-${Date.now()}-3`, label: "Ngữ pháp & chính tả", points: 3 },
        ],
        wordMin: 100,
        wordMax: 500,
        aiAssist: false,
      };
    case "ai-generated":
      return { type, ...base, prompt: "" };
  }
}

function defaultsFromExisting(q: Question): any {
  const shared = {
    type: q.type,
    content: q.content,
    explanation: q.explanation ?? "",
    subjectId: q.subjectId,
    gradeId: q.gradeId ?? "",
    difficulty: q.difficulty,
    tags: q.tags ?? [],
    tocNodeId: q.tocNodeId ?? null,
    kho: q.kho,
    campusId: q.campusId,
  };
  switch (q.type) {
    case "mcq-single":
    case "mcq-multi":
      return { ...shared, options: q.options };
    case "true-false":
      return { ...shared, correctAnswer: q.correctAnswer };
    case "multi-tf":
      return { ...shared, subQuestions: q.subQuestions };
    case "short-answer":
      return { ...shared, acceptedAnswers: q.acceptedAnswers, caseSensitive: q.caseSensitive };
    case "fill-blank":
      return { ...shared, blanks: q.blanks };
    case "matching":
      return { ...shared, pairs: q.pairs, distractors: q.distractors ?? [] };
    case "ordering":
      return { ...shared, items: q.items };
    case "drag-drop":
      return { ...shared, zones: q.zones, distractors: q.distractors };
    case "underline":
      return shared;
    case "essay":
      return {
        ...shared,
        rubric: q.rubric,
        wordMin: q.wordMin ?? 0,
        wordMax: q.wordMax ?? 0,
        aiAssist: Boolean(q.aiAssist),
      };
    case "ai-generated":
      return { ...shared, prompt: q.prompt };
  }
}

function BackConfirmDialog({
  open,
  onCancel,
  onDiscard,
  onSaveDraft,
}: {
  open: boolean;
  onCancel: () => void;
  onDiscard: () => void;
  onSaveDraft: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md p-0">
        <header className="flex items-start gap-3 border-b px-6 py-4 pr-12">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-200">
            <ArrowLeft className="h-5 w-5" strokeWidth={1.85} aria-hidden />
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-section-title">
              Lưu câu hỏi trước khi quay lại?
            </DialogTitle>
            <p className="text-meta mt-0.5 leading-relaxed">
              Bạn đang có nội dung chưa lưu. Chọn cách xử lý trước khi quay về
              bước chọn dạng câu hỏi.
            </p>
          </div>
        </header>

        <footer className="flex flex-col gap-2 border-t bg-[var(--color-surface-2)] px-6 py-4">
          <Button onClick={onSaveDraft}>
            <Save className="h-4 w-4" />
            Lưu bản nháp rồi quay lại
          </Button>
          <Button variant="outline" onClick={onDiscard} className="text-destructive">
            Bỏ thay đổi & quay lại
          </Button>
          <Button variant="outline" onClick={onCancel}>
            Hủy — tiếp tục nhập
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
