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

import {
  CalendarClock,
  Check,
  ClipboardList,
  FileUp,
  GraduationCap,
  ListChecks,
  Scale,
  ShieldCheck,
  Timer,
  Users,
} from "lucide-react";
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
import { RenderedContent } from "@/features/question-bank/components/rendered-content";
import { QUESTION_TYPES, type QuestionType } from "@/features/question-bank/data/question-types";
import { useQuestionsStore } from "@/features/question-bank/state/questions-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { useTeachingStore } from "@/features/teaching/state/teaching-store";
import { rosterForClasses, studentsOfClass, type RosterStudent } from "@/lib/roster";
import { cn } from "@/lib/utils";

import { AntiCheatEditor, countAntiCheatOn } from "../components/anti-cheat-editor";
import { QuickScoringEditor } from "../components/quick-scoring-editor";
import {
  DEFAULT_ANTI_CHEAT,
  DEFAULT_SCORING,
  type AntiCheatConfig,
  type ScoringConfig,
} from "../data/types";
import { formatScore, sumManualPerQuestion } from "../lib/scoring";
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
  const assignments = useTeachingStore((s) => s.assignments);
  const createShift = useShiftsStore((s) => s.create);
  const saveForm = useExamFormsStore((s) => s.saveForm);

  const campusId = session?.campusId ?? activeCampusId ?? null;
  // Hồ sơ của chính mình — mang `gradeIds` / `classIds` phụ trách.
  const me = useMemo(
    () => (session ? allUsers.find((u) => u.id === session.userId) : null),
    [session, allUsers],
  );

  const [name, setName] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [classIds, setClassIds] = useState<string[]>([]);
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [questionIds, setQuestionIds] = useState<string[]>([]);
  const [win, setWin] = useState(defaultWindow);
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [lateJoinMinutes, setLateJoinMinutes] = useState(10);
  const [scoring, setScoring] = useState<ScoringConfig>({ ...DEFAULT_SCORING });
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
    setScoring({ ...DEFAULT_SCORING });
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
  /**
   * Lớp hiện ra sau khi chọn khối, và CHỈ những lớp giáo viên được phân công.
   *
   * "Phân công" ở đây gồm bốn đường, đúng như màn "Lớp của tôi":
   *   1. dạy môn đang chọn ở lớp đó (bảng phân công môn × lớp)
   *   2. chủ nhiệm lớp
   *   3. phụ trách cả khối (`user.gradeIds`)
   *   4. phụ trách lớp (`user.classIds`)
   *
   * Lấy đủ bốn đường vì trường dùng cả bốn; chỉ đọc bảng phân công là giáo
   * viên chủ nhiệm không giao được bài cho chính lớp mình. Cấp quản lý
   * (`scope.isUnscoped`) thấy mọi lớp trong cơ sở.
   */
  const classes = useMemo(() => {
    const inScope = allClasses.filter(
      (c) =>
        (!gradeId || c.gradeId === gradeId) &&
        (campusId ? c.campusId === campusId : true),
    );
    if (scope.isUnscoped || !session) return inScope;
    const gradeIdSet = new Set(me?.gradeIds ?? []);
    const classIdSet = new Set(me?.classIds ?? []);
    return inScope.filter(
      (c) =>
        assignments.some(
          (a) =>
            a.classId === c.id &&
            a.teacherId === session.userId &&
            (!subjectId || a.subjectId === subjectId),
        ) ||
        c.homeroomTeacherId === session.userId ||
        gradeIdSet.has(c.gradeId) ||
        classIdSet.has(c.id),
    );
  }, [allClasses, gradeId, campusId, scope, session, me, assignments, subjectId]);

  // Đổi môn có thể làm hẹp danh sách lớp được phân công — bỏ lại lớp không
  // còn nằm trong danh sách, nếu không bài kiểm tra giao cho lớp mà màn hình
  // không còn hiện.
  useEffect(() => {
    const visible = new Set(classes.map((c) => c.id));
    setClassIds((prev) =>
      prev.every((id) => visible.has(id)) ? prev : prev.filter((id) => visible.has(id)),
    );
  }, [classes]);

  /** Chọn lớp xong mới có danh sách học sinh, tách theo từng lớp. */
  const roster = useMemo(
    () => rosterForClasses(classIds, allClasses, allUsers),
    [classIds, allClasses, allUsers],
  );

  // Bỏ lại học sinh của lớp vừa bỏ tích. Việc TÍCH SẴN nằm ở handler chọn
  // lớp chứ không ở đây: chạy theo `roster` thì mỗi lần dựng lại danh sách là
  // tích lại những em giáo viên vừa cố ý bỏ.
  useEffect(() => {
    const all = new Set(roster.flatMap((r) => r.students.map((s) => s.id)));
    setStudentIds((prev) =>
      prev.every((id) => all.has(id)) ? prev : prev.filter((id) => all.has(id)),
    );
  }, [roster]);

  const toggleStudent = (sid: string) =>
    setStudentIds((prev) =>
      prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid],
    );
  const toggleClassStudents = (ids: string[], on: boolean) =>
    setStudentIds((prev) =>
      on
        ? [...new Set([...prev, ...ids])]
        : prev.filter((x) => !ids.includes(x)),
    );

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
    if (scoring.maxScore <= 0) out.push("Thang điểm phải lớn hơn 0");
    // Hai cách chia điểm này tự gõ tổng, nên lệch là chấm ra thang khác thang
    // giáo viên nghĩ — chặn ngay, đừng để phát hiện lúc trả điểm.
    if (scoring.mode === "by-part") {
      const sum = (scoring.parts ?? []).reduce((a, p) => a + (p.points || 0), 0);
      if (Math.abs(sum - scoring.maxScore) > 0.001) {
        out.push(
          `Tổng điểm các phần (${formatScore(sum)}) phải bằng thang điểm (${formatScore(scoring.maxScore)})`,
        );
      }
    }
    if (scoring.mode === "manual") {
      const sum = sumManualPerQuestion(scoring, questionIds);
      if (Math.abs(sum - scoring.maxScore) > 0.001) {
        out.push(
          `Tổng điểm từng câu (${formatScore(sum)}) phải bằng thang điểm (${formatScore(scoring.maxScore)})`,
        );
      }
    }
    return out;
  }, [subjectId, classIds, studentIds, questionIds, picked, win, durationMinutes, scoring]);

  /** Tích lớp là tích sẵn cả lớp; bỏ tích lớp là bỏ luôn học sinh lớp đó. */
  function toggleClass(cid: string, on: boolean) {
    setClassIds((prev) =>
      on ? [...prev, cid] : prev.filter((x) => x !== cid),
    );
    const cls = allClasses.find((c) => c.id === cid);
    if (!cls) return;
    const ids = studentsOfClass(cls, allUsers).map((st) => st.id);
    setStudentIds((prev) =>
      on ? [...new Set([...prev, ...ids])] : prev.filter((x) => !ids.includes(x)),
    );
  }

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
        scoring,
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
        scoring,
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
      <DialogContent className="flex max-h-[92vh] max-w-6xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-5 py-3">
          <DialogTitle>Tạo bài kiểm tra</DialogTitle>
          <DialogDescription className="text-hint">
            Chọn câu từ kho của bạn hoặc tải một file Word. Học sinh làm bài có
            đồng hồ đếm ngược như ca thi.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px]">
            <div className="min-w-0 space-y-4 px-5 py-4">
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
                  {!gradeId ? (
                    <span className="text-meta text-muted-foreground">
                      Chọn khối để hiện danh sách lớp.
                    </span>
                  ) : classes.length === 0 ? (
                    <span className="text-meta text-muted-foreground">
                      Bạn chưa được phân công lớp nào ở khối này
                      {subjectId ? " với môn đã chọn" : ""}. Liên hệ quản trị
                      nếu phân công chưa đúng.
                    </span>
                  ) : (
                    classes.map((c) => {
                      const on = classIds.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => toggleClass(c.id, !on)}
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
            {classIds.length > 0 && (
              <RosterPanel
                roster={roster}
                selectedIds={studentIds}
                onToggleStudent={toggleStudent}
                onToggleClass={toggleClassStudents}
              />
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
                    <RenderedContent
                      content={q.content}
                      hideUnderlineMarks
                      className="text-small line-clamp-2 min-w-0 flex-1"
                    />
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

          <Section icon={<CalendarClock className="h-4 w-4" />} title="3. Thời gian làm bài">
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
            </div>
          </Section>

          <Section icon={<Scale className="h-4 w-4" />} title="4. Thang điểm">
            <QuickScoringEditor
              scoring={scoring}
              pool={picked}
              onChange={setScoring}
            />
            <div className="mt-3">
              <Field
                label="Số mã đề"
                hint="Vẫn là bộ câu hỏi đó, chỉ đảo thứ tự thành nhiều bản. Hai bạn ngồi cạnh nhau có thể nhận hai mã khác nhau, nên câu 1 của bạn này không phải câu 1 của bạn kia."
              >
                <Select
                  value={String(variantCount)}
                  onChange={(e) => setVariantCount(Number(e.target.value))}
                >
                  <option value="1">1 mã — mọi học sinh cùng thứ tự</option>
                  <option value="2">2 mã đề — chia đôi lớp</option>
                  <option value="4">4 mã đề — hạn chế nhìn bài nhất</option>
                </Select>
              </Field>
            </div>
          </Section>

          <Section icon={<ShieldCheck className="h-4 w-4" />} title="5. Giám sát và chống gian lận">
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
                <div className="rounded-lg border bg-surface-2/40 p-3">
                  <AntiCheatEditor
                    value={antiCheat}
                    onChange={setAntiCheat}
                    title="Biện pháp áp dụng"
                  />
                </div>
              )}
            </div>
          </Section>
            </div>

            <aside className="border-t bg-muted/15 px-5 py-4 lg:border-l lg:border-t-0">
              <div className="lg:sticky lg:top-0">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <ClipboardList className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-body font-semibold">Tổng quan bài kiểm tra</p>
                    <p className="text-hint text-muted-foreground">
                      Cập nhật theo lựa chọn
                    </p>
                  </div>
                </div>
                <ul className="space-y-2.5">
                  <SummaryItem
                    icon={ListChecks}
                    label="Môn"
                    value={subjects.find((x) => x.id === subjectId)?.name ?? "—"}
                  />
                  <SummaryItem
                    icon={GraduationCap}
                    label="Khối"
                    value={grades.find((g) => g.id === gradeId)?.name ?? "—"}
                  />
                  <SummaryItem
                    icon={Users}
                    label="Lớp"
                    value={
                      roster.length === 0
                        ? "—"
                        : roster.map((r) => r.className).join(", ")
                    }
                  />
                  <SummaryItem
                    icon={Users}
                    label="HS được giao"
                    value={`${studentIds.length} HS`}
                  />
                  <SummaryItem
                    icon={ListChecks}
                    label="Số câu hỏi"
                    value={`${questionIds.length} câu · ${variantCount} mã đề`}
                  />
                  <SummaryItem
                    icon={Timer}
                    label="Thời gian làm bài"
                    value={`${durationMinutes} phút`}
                  />
                  <SummaryItem
                    icon={CalendarClock}
                    label="Mở lúc"
                    value={
                      win.start
                        ? new Date(win.start).toLocaleString("vi-VN")
                        : "—"
                    }
                  />
                  <SummaryItem
                    icon={CalendarClock}
                    label="Đóng lúc"
                    value={
                      win.end ? new Date(win.end).toLocaleString("vi-VN") : "—"
                    }
                    highlight
                  />
                  <SummaryItem
                    icon={Scale}
                    label="Thang điểm"
                    value={`${formatScore(scoring.maxScore)} đ · ${SCORING_MODE_LABEL[scoring.mode]}`}
                  />
                  <SummaryItem
                    icon={ShieldCheck}
                    label="Giám sát"
                    value={proctored ? "Có phòng giám sát" : "Không giám sát"}
                  />
                  <SummaryItem
                    icon={ShieldCheck}
                    label="Chống gian lận"
                    value={
                      antiCheatOn
                        ? `${countAntiCheatOn(antiCheat).on}/${countAntiCheatOn(antiCheat).total} biện pháp đã bật`
                        : "Tắt"
                    }
                  />
                </ul>
              </div>
            </aside>
          </div>
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

/**
 * Danh sách học sinh, hiện ra SAU khi chọn lớp.
 *
 * Trước đây màn này chỉ nói "N học sinh sẽ nhận bài kiểm tra". Giáo viên
 * không kiểm được N gồm những ai, mà danh sách lớp trong hệ thống có thể
 * thiếu hoặc thừa em — nên phải nhìn thấy tên, và bỏ tích được từng em
 * (em chuyển lớp, em nghỉ dài).
 */
function RosterPanel({
  roster,
  selectedIds,
  onToggleStudent,
  onToggleClass,
}: {
  roster: Array<{ classId: string; className: string; students: RosterStudent[] }>;
  selectedIds: string[];
  onToggleStudent: (sid: string) => void;
  onToggleClass: (ids: string[], on: boolean) => void;
}) {
  const total = roster.reduce((n, g) => n + g.students.length, 0);
  return (
    <div className="mt-3 space-y-2 rounded-lg border bg-surface-2/40 p-3">
      <p className="text-small font-semibold">
        Học sinh được giao{" "}
        <span className="text-muted-foreground font-normal">
          ({selectedIds.length}/{total})
        </span>
      </p>
      {roster.map((group) => {
        const ids = group.students.map((s) => s.id);
        const onCount = ids.filter((id) => selectedIds.includes(id)).length;
        return (
          <div key={group.classId} className="rounded-md border bg-card p-2.5">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <p className="text-small flex-1 font-semibold">
                {group.className}
                <span className="text-meta ml-2 font-normal text-muted-foreground">
                  {onCount}/{ids.length} HS
                </span>
              </p>
              <button
                type="button"
                className="text-meta rounded-md border px-2 py-0.5 font-medium disabled:opacity-50"
                disabled={ids.length === 0 || onCount === ids.length}
                onClick={() => onToggleClass(ids, true)}
              >
                Chọn cả lớp
              </button>
              <button
                type="button"
                className="text-meta rounded-md border px-2 py-0.5 font-medium disabled:opacity-50"
                disabled={onCount === 0}
                onClick={() => onToggleClass(ids, false)}
              >
                Bỏ chọn
              </button>
            </div>
            {group.students.length === 0 ? (
              <p className="text-meta text-muted-foreground">
                Lớp này chưa có học sinh nào trong hệ thống.
              </p>
            ) : (
              <div className="grid gap-1 sm:grid-cols-2">
                {group.students.map((s) => {
                  const on = selectedIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onToggleStudent(s.id)}
                      className={cn(
                        "text-small flex items-center gap-2 rounded-md border px-2 py-1 text-left",
                        on
                          ? "border-primary bg-primary/5"
                          : "border-border bg-background",
                      )}
                    >
                      <span
                        className={cn(
                          "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                          on
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background",
                        )}
                      >
                        {on ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{s.name}</span>
                      {s.code && (
                        <span className="text-meta shrink-0 font-mono text-muted-foreground">
                          {s.code}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const SCORING_MODE_LABEL: Record<ScoringConfig["mode"], string> = {
  even: "chia đều",
  "by-part": "theo phần",
  "by-difficulty": "theo độ khó",
  manual: "thủ công",
};

/** Một dòng trong bảng tổng quan — cùng hình dạng với màn giao BTVN. */
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
        <p className="text-hint text-muted-foreground">{label}</p>
        <p
          className={cn(
            "text-small truncate font-medium",
            highlight ? "text-rose-700" : "text-foreground",
          )}
        >
          {value}
        </p>
      </div>
    </li>
  );
}

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
