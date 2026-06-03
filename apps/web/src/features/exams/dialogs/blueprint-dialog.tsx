"use client";

import {
  ArrowDown,
  ArrowUp,
  LayoutGrid,
  Library,
  Pin,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useCampusStore } from "@/features/campus/state/campus-store";
import { useCampusScope } from "@/features/campus/lib/use-campus-scope";
import {
  filterGradesByScope,
  filterSubjectsByScope,
  useUserScope,
} from "@/features/auth/lib/use-scope";
import { useGradesStore } from "@/features/grades/state/grades-store";
import type { Question } from "@/features/question-bank/data/seed-questions";
import { useQuestionsStore } from "@/features/question-bank/state/questions-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";

import { DifficultyPills } from "../components/difficulty-pills";
import type { BlueprintTopic, ExamBlueprint } from "../data/types";
import {
  countTopicByDifficulty,
  indexQuestions,
} from "../lib/blueprint-stats";
import { useBlueprintsStore } from "../state/blueprints-store";

import { PickQuestionsDialog } from "./pick-questions-dialog";

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
  editing?: ExamBlueprint | null;
}

function newTopicId(): string {
  return `tp-${Math.random().toString(36).slice(2, 10)}`;
}

export function BlueprintDialog({ open, onOpenChange, editing }: Props) {
  const session = useAuthStore((s) => s.session);
  const activeCampusId = useCampusStore((s) => s.activeCampusId);
  const allSubjects = useSubjectsStore((s) => s.subjects);
  const allGrades = useGradesStore((s) => s.grades);
  // Teachers / TBM are locked to their assigned subjects + grades for
  // blueprint authoring — same rule as the question bank. Layered on
  // top, the campus scope ensures we never surface subjects/grades
  // belonging to other campuses (the user complaint that triggered
  // this audit).
  const scope = useUserScope();
  const campusScope = useCampusScope();
  const subjects = campusScope.scopeSubjects(
    filterSubjectsByScope(allSubjects, scope),
  );
  const grades = campusScope.scopeGrades(
    filterGradesByScope(allGrades, scope),
  );
  const allQuestions = useQuestionsStore((s) => s.questions);
  const createBlueprint = useBlueprintsStore((s) => s.create);
  const updateBlueprint = useBlueprintsStore((s) => s.update);

  const [name, setName] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [duration, setDuration] = useState(60);
  const [topics, setTopics] = useState<BlueprintTopic[]>([]);
  const [pickingTopic, setPickingTopic] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setSubjectId(editing.subjectId);
      setGradeId(editing.gradeId);
      setDuration(editing.duration);
      setTopics(editing.topics);
    } else {
      setName("");
      setSubjectId("");
      setGradeId("");
      setDuration(60);
      setTopics([{ id: newTopicId(), name: "", pickedQuestionIds: [] }]);
    }
    setError(null);
    setPickingTopic(null);
  }, [open, editing]);

  // Pool of questions that may be picked into this blueprint:
  //   kho=campus, status=approved, scoped to current campus, matching subject+grade.
  const eligiblePool = useMemo(() => {
    const campusScope = session?.role === "superadmin"
      ? activeCampusId
      : session?.campusId ?? null;
    return allQuestions.filter((q) => {
      if (q.kho !== "campus") return false;
      if (q.status !== "approved") return false;
      if (q.type === "ai-generated") return false;
      if (campusScope && q.campusId !== campusScope) return false;
      if (subjectId && q.subjectId !== subjectId) return false;
      if (gradeId && q.gradeId !== gradeId) return false;
      return true;
    });
  }, [allQuestions, session, activeCampusId, subjectId, gradeId]);

  const eligiblePoolById = useMemo(
    () => indexQuestions(eligiblePool),
    [eligiblePool],
  );

  function addTopic() {
    setTopics([...topics, { id: newTopicId(), name: "", pickedQuestionIds: [] }]);
  }
  function removeTopic(id: string) {
    setTopics(topics.filter((t) => t.id !== id));
  }
  function updateTopicName(id: string, name: string) {
    setTopics(topics.map((t) => (t.id === id ? { ...t, name } : t)));
  }
  function moveTopic(id: string, dir: -1 | 1) {
    const idx = topics.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const next = [...topics];
    const swap = idx + dir;
    if (swap < 0 || swap >= topics.length) return;
    [next[idx], next[swap]] = [next[swap]!, next[idx]!];
    setTopics(next);
  }
  function setTopicPicks(id: string, picks: string[]) {
    setTopics(topics.map((t) => (t.id === id ? { ...t, pickedQuestionIds: picks } : t)));
  }

  function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError("Vui lòng nhập tên khung đề.");
      return;
    }
    if (!subjectId || !gradeId) {
      setError("Chọn môn học và khối.");
      return;
    }
    if (!session) {
      setError("Không tìm thấy phiên đăng nhập.");
      return;
    }
    const cleanedTopics = topics
      .map((t) => ({ ...t, name: t.name.trim() }))
      .filter((t) => t.name.length > 0);
    if (cleanedTopics.length === 0) {
      setError("Khai báo ít nhất 1 mạch kiến thức.");
      return;
    }
    const campusId =
      session.role === "superadmin"
        ? activeCampusId ?? null
        : session.campusId ?? null;

    if (editing) {
      updateBlueprint(editing.id, {
        name: name.trim(),
        subjectId,
        gradeId,
        duration: Number(duration) || 60,
        topics: cleanedTopics,
      });
    } else {
      createBlueprint({
        name: name.trim(),
        subjectId,
        gradeId,
        duration: Number(duration) || 60,
        campusId,
        ownerId: session.userId,
        ownerName: session.name ?? "—",
        topics: cleanedTopics,
      });
    }
    onOpenChange(false);
  }

  const pickingFor = topics.find((t) => t.id === pickingTopic) ?? null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl p-0 max-h-[94vh] overflow-y-auto">
          <header className="flex items-start gap-3 border-b px-6 py-4 pr-12">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-200">
              <LayoutGrid className="h-5 w-5" strokeWidth={1.85} />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-section-title">
                Khung đề (Blueprint)
              </DialogTitle>
              <p className="text-meta mt-0.5">
                Định nghĩa mạch kiến thức & gắn câu hỏi từ kho nhà trường.
              </p>
            </div>
          </header>

          <div className="space-y-5 px-6 py-5">
            {/* General info */}
            <section className="rounded-xl border bg-surface-2/40 p-4">
              <p className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-foreground/85">
                <Pin className="h-3.5 w-3.5 text-rose-500" strokeWidth={2} />
                Thông tin chung
              </p>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
                    Tên khung đề <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="vd: Khung đề Toán 7 — Học kỳ I"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
                      Môn học <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={subjectId}
                      onChange={(e) => setSubjectId(e.target.value)}
                    >
                      <option value="">— Chọn môn —</option>
                      {subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                    {!scope.isUnscoped && (
                      <p className="text-[10.5px] text-muted-foreground">
                        🔒 Giới hạn theo phân công ({subjects.length} môn)
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
                      Khối <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={gradeId}
                      onChange={(e) => setGradeId(e.target.value)}
                    >
                      <option value="">— Chọn khối —</option>
                      {grades.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </Select>
                    {!scope.isUnscoped && scope.allowedGradeIds && (
                      <p className="text-[10.5px] text-muted-foreground">
                        🔒 Giới hạn theo phân công ({grades.length} khối)
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
                      Thời gian (phút)
                    </Label>
                    <Input
                      type="number"
                      min={5}
                      max={300}
                      value={duration}
                      onChange={(e) => setDuration(Number(e.target.value) || 60)}
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Topics */}
            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-foreground/85">
                  <Library className="h-3.5 w-3.5 text-amber-600" strokeWidth={2} />
                  Mạch kiến thức ({topics.length}) —{" "}
                  <span className="text-meta font-normal">
                    Khai báo chương/chủ đề & gắn câu hỏi
                  </span>
                </p>
              </div>

              <ul className="space-y-3">
                {topics.map((t, idx) => {
                  const counts = countTopicByDifficulty(t, eligiblePoolById);
                  const sum = counts.easy + counts.medium + counts.hard;
                  return (
                    <li
                      key={t.id}
                      className="rounded-xl border bg-card p-3"
                    >
                      <div className="grid grid-cols-[28px_minmax(0,1fr)_auto_auto_auto] items-center gap-2">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary-soft text-[12px] font-bold text-primary-text">
                          {idx + 1}
                        </span>
                        <Input
                          value={t.name}
                          onChange={(e) => updateTopicName(t.id, e.target.value)}
                          placeholder="vd: Đại số / Hình học …"
                        />
                        <IconButton
                          size="sm"
                          title="Đẩy lên"
                          disabled={idx === 0}
                          onClick={() => moveTopic(t.id, -1)}
                        >
                          <ArrowUp className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </IconButton>
                        <IconButton
                          size="sm"
                          title="Đẩy xuống"
                          disabled={idx === topics.length - 1}
                          onClick={() => moveTopic(t.id, 1)}
                        >
                          <ArrowDown className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </IconButton>
                        <IconButton
                          size="sm"
                          variant="destructive"
                          title="Xoá mạch"
                          onClick={() => removeTopic(t.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </IconButton>
                      </div>

                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground/60">
                          Câu hỏi đã bốc{" "}
                          <span className="text-primary">({sum} câu)</span>
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="ml-auto"
                          disabled={!subjectId || !gradeId}
                          onClick={() => setPickingTopic(t.id)}
                          title={
                            !subjectId || !gradeId
                              ? "Chọn môn + khối trước khi bốc câu"
                              : undefined
                          }
                        >
                          <Library className="h-3.5 w-3.5" />
                          Bốc câu hỏi từ ngân hàng
                        </Button>
                      </div>

                      {sum === 0 ? (
                        <p className="mt-2 rounded-md border border-dashed bg-muted/20 px-3 py-1.5 text-[12px] text-muted-foreground">
                          Chưa bốc câu nào. Bấm "Bốc câu hỏi từ ngân hàng" để
                          chọn từ kho nhà trường.
                        </p>
                      ) : (
                        <DifficultyPills counts={counts} className="mt-2" />
                      )}
                    </li>
                  );
                })}
              </ul>

              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addTopic}
                className="mt-3"
              >
                <Plus className="h-3.5 w-3.5" />
                Thêm mạch kiến thức
              </Button>
            </section>

            {error && (
              <div className="rounded-lg border border-destructive-border bg-destructive-soft px-3 py-2 text-[13px] text-destructive-text">
                {error}
              </div>
            )}
          </div>

          <footer className="flex items-center justify-between border-t bg-[var(--color-surface-2)] px-6 py-3.5">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
              Hủy
            </Button>
            <Button onClick={handleSubmit}>
              <Save className="h-4 w-4" />
              {editing ? "Lưu thay đổi" : "Lưu khung đề"}
            </Button>
          </footer>
        </DialogContent>
      </Dialog>

      {pickingFor && (
        <PickQuestionsDialog
          open
          onOpenChange={(o) => {
            if (!o) setPickingTopic(null);
          }}
          topicName={pickingFor.name || `Mạch ${topics.indexOf(pickingFor) + 1}`}
          pool={eligiblePool as Question[]}
          initialSelected={pickingFor.pickedQuestionIds}
          // Cross-mạch dedup: ids already picked by OTHER topics in this
          // blueprint are excluded from the picker so the same question can't
          // appear in multiple mạch.
          excludedIds={topics
            .filter((t) => t.id !== pickingFor.id)
            .flatMap((t) => t.pickedQuestionIds)}
          onConfirm={(picks) => {
            setTopicPicks(pickingFor.id, picks);
            setPickingTopic(null);
          }}
        />
      )}
    </>
  );
}
