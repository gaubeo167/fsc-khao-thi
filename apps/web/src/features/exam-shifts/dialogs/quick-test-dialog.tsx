"use client";

/**
 * Tạo BÀI KIỂM TRA — bản rút gọn của ca thi, dành cho giáo viên tự ra đề.
 *
 * ── Vì sao không dùng trình tạo ca thi ──────────────────────────────────────
 *
 * Ca thi bắt giáo viên đi qua khung đề → gói đề ĐÃ DUYỆT → sinh đề → chia
 * phòng → gán giám thị. Đúng cho kỳ thi chính thức, nhưng một bài kiểm tra 15
 * phút thì không ai đi hết đường đó. Màn này làm như màn giao BTVN: chọn câu
 * thẳng từ kho của mình hoặc tải một file Word, chọn lớp, đặt giờ, xong.
 *
 * ── Nhưng vẫn LÀ một ca thi ────────────────────────────────────────────────
 *
 * Bản ghi ghi ra là `ExamShift` với `kind: "test"`, nên mọi thứ phía sau chạy
 * y như ca thi mà không phải viết lại: đồng hồ đếm ngược, chống gian lận, ghi
 * vi phạm phía máy chủ, phòng giám sát, chấm tự luận, báo cáo, và đề được
 * ĐÓNG BĂNG để sửa câu hỏi sau này không đổi bài đã làm.
 *
 * Ba chỗ ca thi bắt buộc mà bài kiểm tra bỏ qua, và cách bỏ:
 *
 *   · gói đề  → đóng băng thẳng từ danh sách câu (`materializeQuickForm`)
 *   · phòng   → gom cả lớp vào MỘT phòng, giáo viên là giám thị nếu có bật
 *               giám sát; tắt thì phòng không có giám thị nào
 *   · thời lượng → ghi thẳng `durationMinutes` lên bản ghi
 */

import { CalendarClock, FileUp, ListChecks, ShieldCheck, Users } from "lucide-react";
import dynamic from "next/dynamic";
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
import { useUsersStore } from "@/features/admin/users/users-store";
import { useAuthStore } from "@/features/auth/state/auth-store";
import {
  filterGradesByScope,
  filterSubjectsByScope,
  useUserScope,
} from "@/features/auth/lib/use-scope";
import { useCampusScope } from "@/features/campus/lib/use-campus-scope";
import { useCampusStore } from "@/features/campus/state/campus-store";
import { useExamFormsStore } from "@/features/exam-forms/state/exam-forms-store";
import { materializeQuickForm } from "@/features/exam-forms/lib/materialize";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { QUESTION_TYPES, type QuestionType } from "@/features/question-bank/data/question-types";
import { useQuestionsStore } from "@/features/question-bank/state/questions-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { rosterForClasses } from "@/lib/roster";
import { cn } from "@/lib/utils";

import { DEFAULT_ANTI_CHEAT, type AntiCheatConfig } from "../data/types";
import { useShiftsStore } from "../state/shifts-store";

const QuestionPickerDialog = dynamic(
  () =>
    import("@/features/homework/dialogs/question-picker-dialog").then(
      (m) => m.QuestionPickerDialog,
    ),
  { ssr: false, loading: () => null },
);
const ImportQuestionsDialog = dynamic(
  () =>
    import("@/features/question-bank/dialogs/import-questions-dialog").then(
      (m) => m.ImportQuestionsDialog,
    ),
  { ssr: false, loading: () => null },
);

/**
 * Dạng câu dùng được trong bài kiểm tra: TẤT CẢ trừ `ai-generated`.
 *
 * Rộng hơn BTVN (chỉ dạng máy chấm được) vì bài kiểm tra đi qua màn chấm tay
 * như ca thi, nên câu tự luận vẫn dùng được.
 */
const TEST_QUESTION_TYPES: ReadonlySet<QuestionType> = new Set(
  QUESTION_TYPES.map((t) => t.id).filter((id) => id !== "ai-generated"),
);

/** Giờ mặc định: mở sau 5 phút, đóng sau 60 phút. */
function defaultWindow(): { start: string; end: string } {
  const start = new Date(Date.now() + 5 * 60_000);
  const end = new Date(start.getTime() + 60 * 60_000);
  return { start: toLocalInput(start), end: toLocalInput(end) };
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QuickTestDialog({ open, onOpenChange }: Props) {
  const session = useAuthStore((s) => s.session);
  const scope = useUserScope();
  const campusScope = useCampusScope();
  const activeCampusId = useCampusStore((s) => s.activeCampusId);
  const allSubjects = useSubjectsStore((s) => s.subjects);
  const allGrades = useGradesStore((s) => s.grades);
  const allClasses = useGradesStore((s) => s.classes);
  const allUsers = useUsersStore((s) => s.users);
  const allQuestions = useQuestionsStore((s) => s.questions);
  const createShift = useShiftsStore((s) => s.create);
  const saveForm = useExamFormsStore((s) => s.saveForm);

  const campusId = session?.campusId ?? activeCampusId ?? null;

  const [name, setName] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [classIds, setClassIds] = useState<string[]>([]);
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [questionIds, setQuestionIds] = useState<string[]>([]);
  const [win, setWin] = useState(defaultWindow);
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [lateJoinMinutes, setLateJoinMinutes] = useState(10);
  const [maxScore, setMaxScore] = useState(10);
  const [variantCount, setVariantCount] = useState(1);
  const [proctored, setProctored] = useState(true);
  const [antiCheatOn, setAntiCheatOn] = useState(true);
  const [antiCheat, setAntiCheat] = useState<AntiCheatConfig>(DEFAULT_ANTI_CHEAT);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Mỗi lần mở lại là một bài mới — giữ lại state cũ thì lần sau giáo viên
  // vô tình giao lại đúng đề của lần trước.
  useEffect(() => {
    if (!open) return;
    setName("");
    setSubjectId("");
    setGradeId("");
    setClassIds([]);
    setStudentIds([]);
    setQuestionIds([]);
    setWin(defaultWindow());
    setDurationMinutes(45);
    setLateJoinMinutes(10);
    setMaxScore(10);
    setVariantCount(1);
    setProctored(true);
    setAntiCheatOn(true);
    setAntiCheat(DEFAULT_ANTI_CHEAT);
  }, [open]);

  const subjects = useMemo(
    () => filterSubjectsByScope(campusScope.scopeSubjects(allSubjects), scope),
    [allSubjects, campusScope, scope],
  );
  const grades = useMemo(
    () => filterGradesByScope(campusScope.scopeGrades(allGrades), scope),
    [allGrades, campusScope, scope],
  );
  const classes = useMemo(
    () =>
      allClasses.filter(
        (c) =>
          (!gradeId || c.gradeId === gradeId) &&
          (campusId ? c.campusId === campusId : true),
      ),
    [allClasses, gradeId, campusId],
  );

  const roster = useMemo(
    () => rosterForClasses(classIds, allClasses, allUsers),
    [classIds, allClasses, allUsers],
  );

  // Chọn lớp là tích sẵn cả lớp; giáo viên bỏ tích từng em sau.
  useEffect(() => {
    setStudentIds(roster.flatMap((r) => r.students.map((s) => s.id)));
  }, [roster]);

  const picked = useMemo(
    () =>
      questionIds
        .map((id) => allQuestions.find((q) => q.id === id))
        .filter((q): q is NonNullable<typeof q> => Boolean(q)),
    [questionIds, allQuestions],
  );

  const problems = useMemo(() => {
    const out: string[] = [];
    if (!subjectId) out.push("Chưa chọn môn học");
    if (classIds.length === 0) out.push("Chưa chọn lớp nào");
    if (studentIds.length === 0) out.push("Chưa có học sinh nào trong lớp đã chọn");
    if (questionIds.length === 0) out.push("Chưa chọn câu hỏi nào");
    if (picked.length !== questionIds.length) {
      out.push("Có câu hỏi đã bị xoá khỏi kho — bỏ chọn rồi chọn lại");
    }
    if (!win.start || !win.end) out.push("Chưa đặt giờ mở / đóng");
    else if (new Date(win.end) <= new Date(win.start)) {
      out.push("Giờ đóng phải sau giờ mở");
    }
    if (durationMinutes < 1) out.push("Thời gian làm bài phải lớn hơn 0");
    if (maxScore <= 0) out.push("Thang điểm phải lớn hơn 0");
    return out;
  }, [subjectId, classIds, studentIds, questionIds, picked, win, durationMinutes, maxScore]);

  async function handleSubmit() {
    if (!session || problems.length > 0) return;
    setSaving(true);
    try {
      const startAt = new Date(win.start).toISOString();
      const endAt = new Date(win.end).toISOString();
      const subjectName = subjects.find((s) => s.id === subjectId)?.name ?? "";
      const shift = createShift({
        name: name.trim() || `Bài kiểm tra ${subjectName}`.trim(),
        kind: "test",
        gradeId,
        subjectId,
        classIds,
        questionIds,
        durationMinutes,
        startAt,
        endAt,
        lateJoinMinutes,
        // MỘT phòng cho cả bài kiểm tra: phòng ở đây không phải phòng thi thật,
        // nó là chỗ hệ thống giữ danh sách học sinh và giám thị. Màn giám sát
        // và màn làm bài đều đọc `rooms[].studentIds`, nên giữ nguyên hình
        // dạng đó là mọi thứ phía sau chạy không cần sửa.
        rooms: [
          {
            id: `room_${Date.now().toString(36)}`,
            name: "Cả lớp",
            capacity: Math.max(studentIds.length, 1),
            classIds,
            studentIds,
            proctorIds: proctored ? [session.userId] : [],
          },
        ],
        scoring: { maxScore, mode: "even" },
        orderStrategy: "as-authored",
        showSectionHeadings: false,
        antiCheat: antiCheatOn
          ? antiCheat
          : // Tắt hết, kể cả ngưỡng tự nộp — tắt nửa vời thì học sinh bị nộp
            // bài oan vì một lần chuyển tab.
            {
              randomizeQuestions: false,
              randomizeOptions: false,
              requireFullscreen: false,
              blockTabSwitch: false,
              blockCopyPaste: false,
              blockRightClick: false,
              oneTimeStart: false,
              fullscreenExitLimit: 0,
              tabSwitchLimit: 0,
            },
        campusId,
        ownerId: session.userId,
        ownerName: session.name ?? "—",
        status: "scheduled",
      });

      const form = materializeQuickForm({
        shiftId: shift.id,
        campusId,
        questions: picked,
        variantCount,
        scoring: { maxScore, mode: "even" },
        durationMinutes,
        actorUid: session.userId,
        formId: `form_${shift.id}_${Date.now().toString(36)}`,
      });
      await saveForm(form);
      toast.success(`Đã tạo "${shift.name}" cho ${studentIds.length} học sinh.`);
      onOpenChange(false);
    } catch (e) {
      // Ca thi đã ghi mà đề đóng băng hỏng thì học sinh vào sẽ không có đề —
      // nói thẳng ra để giáo viên xoá và làm lại, đừng để họ tưởng đã xong.
      toast.error(
        e instanceof Error ? `Không tạo được bài kiểm tra: ${e.message}` : "Không tạo được bài kiểm tra.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-4xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-5 py-3">
          <DialogTitle>Tạo bài kiểm tra</DialogTitle>
          <DialogDescription className="text-hint">
            Chọn câu từ kho của bạn hoặc tải một file Word. Học sinh làm bài có
            đồng hồ đếm ngược như ca thi.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <Section icon={<Users className="h-4 w-4" />} title="1. Lớp và môn">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tên bài kiểm tra">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="vd: Kiểm tra 15 phút — Mệnh đề"
                />
              </Field>
              <Field label="Môn học *">
                <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                  <option value="">— Chọn môn —</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Khối">
                <Select
                  value={gradeId}
                  onChange={(e) => {
                    setGradeId(e.target.value);
                    setClassIds([]);
                  }}
                >
                  <option value="">— Chọn khối —</option>
                  {grades.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Lớp được giao *">
                <div className="flex flex-wrap gap-1.5">
                  {classes.length === 0 ? (
                    <span className="text-meta text-muted-foreground">
                      Chọn khối để hiện danh sách lớp.
                    </span>
                  ) : (
                    classes.map((c) => {
                      const on = classIds.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() =>
                            setClassIds((prev) =>
                              on ? prev.filter((x) => x !== c.id) : [...prev, c.id],
                            )
                          }
                          className={cn(
                            "rounded-md border px-2.5 py-1 text-meta font-semibold",
                            on
                              ? "border-primary bg-primary/10 text-primary"
                              : "bg-card text-foreground/70",
                          )}
                        >
                          {c.name}
                        </button>
                      );
                    })
                  )}
                </div>
              </Field>
            </div>
            {studentIds.length > 0 && (
              <p className="text-meta mt-2 text-muted-foreground">
                {studentIds.length} học sinh sẽ nhận bài kiểm tra này.
              </p>
            )}
          </Section>

          <Section
            icon={<ListChecks className="h-4 w-4" />}
            title="2. Câu hỏi"
            actions={
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!subjectId}
                  onClick={() => setImportOpen(true)}
                  title={
                    subjectId
                      ? "Tải file Word — câu vào kho cá nhân và gắn luôn vào bài"
                      : "Chọn môn học trước"
                  }
                >
                  <FileUp className="mr-1.5 h-4 w-4" />
                  Tải file Word
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!subjectId}
                  onClick={() => setPickerOpen(true)}
                >
                  Chọn từ kho
                </Button>
              </div>
            }
          >
            {questionIds.length === 0 ? (
              <p className="text-meta text-muted-foreground">
                Chưa có câu nào. Chọn từ kho cá nhân / kho trường, hoặc tải một
                file Word.
              </p>
            ) : (
              <ol className="space-y-1">
                {picked.map((q, i) => (
                  <li
                    key={q.id}
                    className="flex items-start gap-2 rounded-md border bg-card px-2.5 py-1.5"
                  >
                    <span className="text-meta font-semibold text-muted-foreground">
                      {i + 1}.
                    </span>
                    <span className="text-small line-clamp-2 flex-1">
                      {q.content.replace(/!\[[^\]]*\]\([^)]*\)/g, "🖼 ").slice(0, 160)}
                    </span>
                    <button
                      type="button"
                      className="text-meta text-destructive"
                      onClick={() =>
                        setQuestionIds((prev) => prev.filter((x) => x !== q.id))
                      }
                    >
                      Bỏ
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </Section>

          <Section icon={<CalendarClock className="h-4 w-4" />} title="3. Thời gian và điểm">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Mở lúc *">
                <Input
                  type="datetime-local"
                  value={win.start}
                  onChange={(e) => setWin((w) => ({ ...w, start: e.target.value }))}
                />
              </Field>
              <Field label="Đóng lúc *">
                <Input
                  type="datetime-local"
                  value={win.end}
                  onChange={(e) => setWin((w) => ({ ...w, end: e.target.value }))}
                />
              </Field>
              <Field label="Thời gian làm bài (phút) *">
                <Input
                  type="number"
                  min={1}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                />
              </Field>
              <Field
                label="Cho vào muộn (phút)"
                hint="Quá số phút này tính từ giờ mở thì học sinh không vào được nữa."
              >
                <Input
                  type="number"
                  min={0}
                  value={lateJoinMinutes}
                  onChange={(e) => setLateJoinMinutes(Number(e.target.value))}
                />
              </Field>
              <Field label="Thang điểm *" hint="Điểm chia đều cho các câu.">
                <Input
                  type="number"
                  min={1}
                  step="0.5"
                  value={maxScore}
                  onChange={(e) => setMaxScore(Number(e.target.value))}
                />
              </Field>
              <Field
                label="Số mã đề"
                hint="Nhiều mã đề thì mỗi mã một thứ tự câu khác nhau."
              >
                <Select
                  value={String(variantCount)}
                  onChange={(e) => setVariantCount(Number(e.target.value))}
                >
                  <option value="1">1 — mọi học sinh cùng thứ tự</option>
                  <option value="2">2 mã đề</option>
                  <option value="4">4 mã đề</option>
                </Select>
              </Field>
            </div>
          </Section>

          <Section icon={<ShieldCheck className="h-4 w-4" />} title="4. Giám sát và chống gian lận">
            <div className="space-y-2">
              <Toggle
                checked={proctored}
                onChange={setProctored}
                label="Mở phòng giám sát"
                hint="Bạn theo dõi được tiến độ và vi phạm của từng học sinh trong lúc làm bài."
              />
              <Toggle
                checked={antiCheatOn}
                onChange={setAntiCheatOn}
                label="Bật chống gian lận"
                hint="Toàn màn hình, chặn chuyển tab, chặn sao chép — tự nộp bài khi quá số lần cho phép."
              />
              {antiCheatOn && (
                <div className="grid gap-1.5 rounded-lg border bg-surface-2/40 p-3 sm:grid-cols-2">
                  {ANTI_CHEAT_FLAGS.map((f) => (
                    <label key={f.key} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={Boolean(antiCheat[f.key])}
                        onChange={(e) =>
                          setAntiCheat((prev) => ({ ...prev, [f.key]: e.target.checked }))
                        }
                      />
                      <span className="text-small">{f.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </Section>
        </div>

        <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t px-5 py-3">
          {problems.length > 0 ? (
            <span className="text-meta text-amber-700">{problems[0]}</span>
          ) : (
            <span className="text-meta text-emerald-700">
              {questionIds.length} câu · {studentIds.length} học sinh · {durationMinutes} phút
            </span>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button
              size="sm"
              disabled={saving || problems.length > 0}
              onClick={() => void handleSubmit()}
            >
              {saving ? "Đang tạo…" : "Tạo bài kiểm tra"}
            </Button>
          </div>
        </footer>
      </DialogContent>

      {pickerOpen && (
        <QuestionPickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          selectedIds={questionIds}
          onConfirm={setQuestionIds}
          subjectId={subjectId}
          gradeId={gradeId || null}
          campusId={campusId}
          allowedTypes={TEST_QUESTION_TYPES}
        />
      )}
      {importOpen && (
        <ImportQuestionsDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          defaultKho="personal"
          onSaved={(ids) => {
            setQuestionIds((prev) => [...prev, ...ids]);
            toast.success(`Đã thêm ${ids.length} câu vào bài kiểm tra.`);
          }}
        />
      )}
    </Dialog>
  );
}

/** Cờ chống gian lận có phần cưỡng chế THẬT ở màn làm bài. */
const ANTI_CHEAT_FLAGS: Array<{ key: keyof AntiCheatConfig; label: string }> = [
  { key: "requireFullscreen", label: "Bắt buộc toàn màn hình" },
  { key: "blockTabSwitch", label: "Chặn chuyển tab" },
  { key: "blockCopyPaste", label: "Chặn sao chép / dán" },
  { key: "blockRightClick", label: "Chặn chuột phải" },
  { key: "oneTimeStart", label: "Chỉ được vào làm một lần" },
  { key: "randomizeOptions", label: "Đảo thứ tự phương án" },
];

function Section({
  icon,
  title,
  actions,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-4">
      <header className="mb-3 flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <h3 className="text-section-title flex-1">{title}</h3>
        {actions}
      </header>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <Label className="text-small font-medium text-foreground/80">{label}</Label>
      <div className="mt-1">{children}</div>
      {hint && <span className="text-hint mt-0.5 block text-muted-foreground">{hint}</span>}
    </label>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex items-start gap-2 rounded-lg border bg-card px-3 py-2">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="text-small block font-semibold">{label}</span>
        <span className="text-hint block text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}
