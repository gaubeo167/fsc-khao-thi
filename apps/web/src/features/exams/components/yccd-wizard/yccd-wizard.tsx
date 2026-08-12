"use client";

import {
  ChevronDown,
  ChevronRight,
  Eye,
  Search,
  Target,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { bloomMeta, type Competency } from "@/features/competencies/data/types";
import { useCompetenciesStore } from "@/features/competencies/state/competencies-store";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { useCampusStore } from "@/features/campus/state/campus-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { useQuestionsStore } from "@/features/question-bank/state/questions-store";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useBlueprintsStore } from "@/features/exams/state/blueprints-store";
import { usePackagesStore } from "@/features/exams/state/packages-store";
import { useGeneratedStore } from "@/features/exams/state/generated-store";
import { RenderedContent } from "@/features/question-bank/components/rendered-content";
import { ViewQuestionDialog } from "@/features/question-bank/dialogs/view-question-dialog";
import type { Question } from "@/features/question-bank/data/seed-questions";
import { cn } from "@/lib/utils";

import {
  DEFAULT_DS_GRADUATED,
  MOET_DEFAULT_PARTS,
  type ScoringPolicy,
  type YccdMatrix,
  type YccdPart,
} from "../../data/types";
import type { DraftExam } from "../../lib/generate";
import {
  cellKey,
  checkYccdInvariants,
  generateYccdExams,
  validateYccdMatrix,
  type YccdResolvers,
} from "../../lib/generate-yccd";
import { buildYccdInventory } from "../../lib/yccd-inventory";
import { YccdMatrixTable, type MatrixRow } from "./yccd-matrix-table";

const STEPS = [
  { n: 1, label: "Chọn YCCĐ" },
  { n: 2, label: "Khung đề" },
  { n: 3, label: "Ma trận" },
  { n: 4, label: "Cấu trúc + Điểm" },
  { n: 5, label: "Sinh mã đề" },
  { n: 6, label: "Lưu" },
];

/** Default điểm/câu per part — refined in step ④ (3c). */
const DEFAULT_POINTS: Record<string, number> = {
  mcq: 0.25,
  ds: 1,
  short: 0.25,
  tl: 1,
};

export function YccdWizard() {
  const subjects = useSubjectsStore((s) => s.subjects);
  const tocNodes = useSubjectsStore((s) => s.tocNodes);
  const gradeList = useGradesStore((s) => s.grades);
  const activeCampusId = useCampusStore((s) => s.activeCampusId);
  const allComps = useCompetenciesStore((s) => s.competencies);
  const allQuestions = useQuestionsStore((s) => s.questions);
  const session = useAuthStore((s) => s.session);
  const createBlueprint = useBlueprintsStore((s) => s.create);
  const createPackage = usePackagesStore((s) => s.create);
  const addBatch = useGeneratedStore((s) => s.addBatch);

  const campusSubjects = useMemo(
    () =>
      subjects.filter(
        (s) =>
          s.status === "active" &&
          (!activeCampusId ||
            (Array.isArray(s.campusIds) && s.campusIds.includes(activeCampusId))),
      ),
    [subjects, activeCampusId],
  );

  const [subjectId, setSubjectId] = useState("");
  const [gradeId, setGradeId] = useState("grade-10");
  const [step, setStep] = useState(1);

  // Selected competency ids — outcome ids (YCCĐ) + topic ids (for a Bài's
  // topic-level questions). Granular: pick individual YCCĐ or whole Bài.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [excludeIds, setExcludeIds] = useState<Set<string>>(new Set());
  const [parts] = useState<YccdPart[]>(() => MOET_DEFAULT_PARTS.map((p) => ({ ...p })));
  const [cells, setCells] = useState<Record<string, number>>({});
  const [collapsedCh, setCollapsedCh] = useState<Set<string>>(new Set());
  const [scopeQuery, setScopeQuery] = useState("");
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());

  // Step ④ — cấu trúc + điểm
  const [pointsByPart, setPointsByPart] = useState<Record<string, number>>({});
  const [mcqMultiMode, setMcqMultiMode] = useState<"full" | "partial">("partial");
  const [dsMode, setDsMode] = useState<"graduated" | "weighted" | "full">("graduated");
  const [dsTable, setDsTable] = useState<Record<number, number>>({ ...DEFAULT_DS_GRADUATED });
  const [orderStrategy, setOrderStrategy] = useState<"by-section" | "shuffle-all">("by-section");
  const [duration, setDuration] = useState(45);
  // Step ⑤ — sinh mã đề
  const [variantCount, setVariantCount] = useState(4);
  const [drafts, setDrafts] = useState<DraftExam[]>([]);
  // Step ⑥ — lưu
  const [pkgName, setPkgName] = useState("");
  const [savedPkgId, setSavedPkgId] = useState<string | null>(null);

  const getPoints = (partId: string) =>
    pointsByPart[partId] ?? DEFAULT_POINTS[partId] ?? 0.25;

  // Reset downstream state when scope changes.
  useEffect(() => {
    setSelected(new Set());
    setExcludeIds(new Set());
    setCells({});
    setStep(1);
  }, [subjectId, gradeId]);

  // Competency scope (subject + grade, with all-grade fallback).
  const comps = useMemo(() => {
    if (!subjectId) return [] as Competency[];
    let c = allComps.filter(
      (x) => x.subjectId === subjectId && (x.gradeId === gradeId || x.gradeId == null),
    );
    if (c.length === 0) c = allComps.filter((x) => x.subjectId === subjectId);
    return c;
  }, [allComps, subjectId, gradeId]);

  const chapters = useMemo(
    () => comps.filter((c) => c.kind === "chapter").sort((a, b) => a.order - b.order),
    [comps],
  );
  const topicsOf = (chId: string) =>
    comps.filter((c) => c.kind === "topic" && c.parentId === chId).sort((a, b) => a.order - b.order);
  const outcomesOf = (topicId: string) =>
    comps
      .filter((c) => c.kind === "outcome" && c.parentId === topicId)
      .sort((a, b) => (a.code ?? "").localeCompare(b.code ?? ""));

  const rawPool = useMemo(
    () =>
      allQuestions.filter(
        (q) =>
          !q.archivedAt &&
          q.subjectId === subjectId &&
          (q.gradeId === gradeId || q.gradeId == null) &&
          q.status === "approved",
      ),
    [allQuestions, subjectId, gradeId],
  );

  // ── Code bridge: imported questions carry `tocNodeId` (mục lục) whose CODE
  // equals the YCCĐ code (same source file), but no `competencyIds`. Resolve
  // each question's YCCĐ / Bài by code, and its Bloom from `difficulty`
  // (a/b/c = NB/TH/VD), so counts work WITHOUT touching the DB. Real
  // `competencyIds` set later (Đợt 2) take priority.
  const { pool, resolvers, countByTopic, countByOutcome } = useMemo(() => {
    const tocCode = new Map<string, string>();
    for (const n of tocNodes) if (n.code) tocCode.set(n.id, n.code);
    const compByCode = new Map<string, Competency>();
    const compById = new Map<string, Competency>();
    for (const c of comps) {
      if (c.code) compByCode.set(c.code, c);
      compById.set(c.id, c);
    }
    const DIFF: Record<string, 1 | 2 | 3> = { easy: 1, medium: 2, hard: 3 };

    const topicOf: Record<string, string> = {};
    const bloomOf: Record<string, 1 | 2 | 3> = {};
    for (const c of comps) {
      if (c.kind === "outcome" && c.parentId) {
        topicOf[c.id] = c.parentId;
        if (c.bloomLevel) bloomOf[c.id] = c.bloomLevel;
      } else if (c.kind === "topic") {
        topicOf[c.id] = c.id; // topic maps to itself (topic-level tagged questions)
      }
    }

    const resolve = (q: (typeof rawPool)[number]) => {
      const tagged =
        q.competencyIds?.[0] ??
        (q.type === "multi-tf"
          ? q.subQuestions?.find((s) => s.competencyId)?.competencyId
          : undefined);
      const src = tagged ?? (q.tocNodeId ? compByCode.get(tocCode.get(q.tocNodeId) ?? "")?.id : undefined);
      const c = src ? compById.get(src) : undefined;
      if (!c) return null;
      const topicId = c.kind === "outcome" ? c.parentId ?? c.id : c.id;
      const bloom =
        q.bloomLevel ?? (c.kind === "outcome" ? c.bloomLevel : undefined) ?? DIFF[q.difficulty] ?? 1;
      return { compId: c.id, topicId, bloom: bloom as 1 | 2 | 3, kind: c.kind };
    };

    const ct: Record<string, number> = {};
    const co: Record<string, number> = {};
    const aug = rawPool.map((q) => {
      const pl = resolve(q);
      if (!pl) return q;
      topicOf[pl.compId] = pl.topicId;
      bloomOf[pl.compId] = pl.bloom;
      ct[pl.topicId] = (ct[pl.topicId] ?? 0) + 1;
      if (pl.kind === "outcome") co[pl.compId] = (co[pl.compId] ?? 0) + 1;
      return {
        ...q,
        competencyIds: q.competencyIds?.length ? q.competencyIds : [pl.compId],
        bloomLevel: q.bloomLevel ?? pl.bloom,
      };
    });
    return {
      pool: aug,
      resolvers: { topicOf, bloomOf } as YccdResolvers,
      countByTopic: ct,
      countByOutcome: co,
    };
  }, [rawPool, comps, tocNodes]);

  // Only questions whose resolved YCCĐ / Bài is selected in step ① (granular
  // — a single YCCĐ or a whole Bài). Feeds the matrix inventory + draw.
  const scopedPool = useMemo(
    () =>
      pool.filter((q) => {
        const c = q.competencyIds?.[0];
        return c ? selected.has(c) : false;
      }),
    [pool, selected],
  );

  // Cấu phần đề tự suy theo LOẠI CÂU có trong khung — chỉ hiện phần nào thực
  // sự có câu, không bắt người dùng bật/tắt tay.
  const enabledParts = useMemo(
    () => parts.filter((p) => scopedPool.some((q) => p.questionTypes.includes(q.type))),
    [parts, scopedPool],
  );

  const inventory = useMemo(
    () => buildYccdInventory(scopedPool, enabledParts, resolvers, excludeIds),
    [scopedPool, enabledParts, resolvers, excludeIds],
  );

  // Questions grouped by their resolved competency (outcome or topic-level),
  // id-sorted so "keep first N" is deterministic. Used by step ② khung đề.
  const poolByComp = useMemo(() => {
    const m: Record<string, Question[]> = {};
    for (const q of pool) {
      const c = q.competencyIds?.[0];
      if (c) (m[c] ??= []).push(q);
    }
    for (const k of Object.keys(m)) m[k]!.sort((a, b) => a.id.localeCompare(b.id));
    return m;
  }, [pool]);

  // Set how many of a YCCĐ's questions go into the frame (keep first N by id).
  function setFrameCount(questions: Question[], n: number) {
    setExcludeIds((prev) => {
      const next = new Set(prev);
      questions.forEach((qq, i) => (i < n ? next.delete(qq.id) : next.add(qq.id)));
      return next;
    });
    setDrafts([]);
    setSavedPkgId(null);
  }

  // Selectable comp ids under a Bài: its YCCĐ + topic-level bucket (if any).
  const baiItems = (topicId: string) => {
    const ids = outcomesOf(topicId).map((o) => o.id);
    if ((poolByComp[topicId] ?? []).length > 0) ids.push(topicId);
    return ids;
  };
  function toggleComp(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
    setDrafts([]);
    setSavedPkgId(null);
  }
  function toggleBai(topicId: string) {
    const items = baiItems(topicId);
    const allOn = items.length > 0 && items.every((i) => selected.has(i));
    setSelected((prev) => {
      const n = new Set(prev);
      items.forEach((i) => (allOn ? n.delete(i) : n.add(i)));
      return n;
    });
    setDrafts([]);
    setSavedPkgId(null);
  }

  // Auto-clamp any cell that now exceeds inventory (e.g. after un-ticking).
  useEffect(() => {
    setCells((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        const cap = inventory[k] ?? 0;
        if (next[k]! > cap) {
          next[k] = cap;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [inventory]);

  // A Bài is a matrix row if ≥1 of its YCCĐ (or its topic-level bucket) is
  // selected.
  const rows: MatrixRow[] = useMemo(() => {
    const out: MatrixRow[] = [];
    for (const ch of chapters) {
      for (const t of topicsOf(ch.id)) {
        const inScope =
          selected.has(t.id) ||
          outcomesOf(t.id).some((o) => selected.has(o.id));
        if (inScope) {
          out.push({
            topicId: t.id,
            topicName: t.title,
            chapterId: ch.id,
            chapterName: ch.title,
          });
        }
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapters, selected, comps]);

  const matrixCells = useMemo(
    () =>
      Object.entries(cells)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => {
          const [topicId, partId, bloom] = k.split("|");
          return { topicId: topicId!, partId: partId!, bloom: Number(bloom) as 1 | 2 | 3, count: v };
        }),
    [cells],
  );
  const validation = useMemo(
    () => validateYccdMatrix(matrixCells, inventory),
    [matrixCells, inventory],
  );
  const totalQ = matrixCells.reduce((s, c) => s + c.count, 0);

  const noFramework = subjectId && comps.filter((c) => c.kind === "outcome").length === 0;

  function setCell(t: string, p: string, b: number, v: number) {
    setCells((prev) => ({ ...prev, [cellKey(t, p, b)]: v }));
    setDrafts([]); // matrix changed → stale drafts
    setSavedPkgId(null);
  }

  const subject = subjects.find((s) => s.id === subjectId);
  const grade = gradeList.find((g) => g.id === gradeId);

  // Full YCCĐ matrix + scoring policy (steps ④–⑥).
  const yccdMatrix: YccdMatrix = useMemo(
    () => ({
      parts: enabledParts.map((p) => ({ ...p, pointsPerQuestion: getPoints(p.id) })),
      rows: rows.map((r) => ({ topicId: r.topicId, chapterId: r.chapterId })),
      cells: matrixCells,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabledParts, rows, matrixCells, pointsByPart],
  );
  const scoringPolicy: ScoringPolicy = useMemo(() => {
    const maxScore = matrixCells.reduce((s, c) => s + c.count * getPoints(c.partId), 0);
    return {
      mcqMulti: mcqMultiMode,
      ds: dsMode,
      dsGraduatedTable: dsTable,
      maxScore: Math.round(maxScore * 100) / 100,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrixCells, mcqMultiMode, dsMode, dsTable, pointsByPart]);
  const totalPoints = scoringPolicy.maxScore;

  const invariants = useMemo(
    () =>
      drafts.length > 0
        ? checkYccdInvariants(
            drafts,
            yccdMatrix,
            new Map(pool.map((q) => [q.id, q])),
            resolvers,
          )
        : null,
    [drafts, yccdMatrix, pool, resolvers],
  );

  function handleGenerate() {
    if (!validation.ok || totalQ === 0) return;
    const d = generateYccdExams({
      pool,
      matrix: yccdMatrix,
      resolvers,
      n: Math.max(1, Math.min(50, variantCount)),
      orderStrategy,
    });
    setDrafts(d);
    setSavedPkgId(null);
  }

  function handleSave() {
    if (!session || drafts.length === 0) return;
    const campusId =
      session.role === "superadmin" ? activeCampusId : session.campusId ?? null;
    const byTopic: Record<string, string[]> = {};
    for (const q of scopedPool) {
      if (excludeIds.has(q.id)) continue;
      const oc = q.competencyIds?.[0];
      const tId = oc ? resolvers.topicOf[oc] : undefined;
      if (tId) (byTopic[tId] ??= []).push(q.id);
    }
    const name = pkgName.trim() || `Đề YCCĐ ${subject?.name ?? ""} ${grade?.name ?? ""}`.trim();
    const bp = createBlueprint({
      name,
      subjectId,
      gradeId,
      duration,
      campusId,
      ownerId: session.userId,
      ownerName: session.name ?? "—",
      topics: rows.map((r) => ({
        id: r.topicId,
        name: r.topicName,
        pickedQuestionIds: byTopic[r.topicId] ?? [],
      })),
    });
    const pkg = createPackage({
      name,
      blueprintId: bp.id,
      duration,
      campusId,
      ownerId: session.userId,
      ownerName: session.name ?? "—",
      matrix: [],
      yccdMatrix,
      scoringPolicy,
      status: session.role === "teacher" ? "pending" : "approved",
    });
    addBatch(
      drafts.map((d) => ({ packageId: pkg.id, questionIds: d.questionIds, duration })),
      (i) => `${name} · Đề ${String(i).padStart(3, "0")}`,
    );
    setSavedPkgId(pkg.id);
  }

  const canNext =
    step === 1
      ? rows.length > 0
      : step === 2
        ? true
        : step === 3
          ? validation.ok && totalQ > 0
          : step === 4
            ? totalPoints > 0
            : step === 5
              ? drafts.length > 0
              : false;

  return (
    <div className="space-y-4">
      {/* Context bar */}
      <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-card px-4 py-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
            Môn học
          </span>
          <Select
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            className="h-9 min-w-[200px]"
          >
            <option value="">— Chọn môn —</option>
            {campusSubjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
            Khối
          </span>
          <Select
            value={gradeId}
            onChange={(e) => setGradeId(e.target.value)}
            className="h-9 min-w-[110px]"
          >
            {gradeList.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </label>
        {subject && grade && (
          <p className="ml-auto text-[12px] text-muted-foreground">
            {comps.filter((c) => c.kind === "outcome").length} YCCĐ ·{" "}
            {pool.length} câu đã duyệt trong kho
          </p>
        )}
      </div>

      {!subjectId ? (
        <EmptyHint text="Chọn môn học để bắt đầu tạo đề theo YCCĐ." />
      ) : noFramework ? (
        <div className="rounded-xl border border-dashed bg-muted/20 px-6 py-10 text-center">
          <Target className="mx-auto mb-2 h-9 w-9 text-muted-foreground/60" />
          <p className="text-[13px] font-semibold">
            Môn / khối này chưa có Khung YCCĐ
          </p>
          <p className="mx-auto mt-1 max-w-md text-[12px] text-muted-foreground">
            Tạo khung Yêu cầu cần đạt trước (import từ Word hoặc nhập tay) rồi
            quay lại đây.
          </p>
          <Link
            href="/admin/subjects"
            className="mt-3 inline-block text-[12px] font-semibold text-primary hover:underline"
          >
            → Sang Môn học · tab Khung YCCĐ
          </Link>
        </div>
      ) : (
        <>
          {/* Stepper */}
          <ol className="flex flex-wrap items-center gap-1 rounded-xl border bg-card px-4 py-3">
            {STEPS.map((s, i) => {
              const active = s.n === step;
              const done = s.n < step;
              const reachable = true;
              return (
                <li key={s.n} className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={!reachable || s.n > step}
                    onClick={() => reachable && s.n <= step && setStep(s.n)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] transition",
                      active
                        ? "bg-primary/10 font-semibold text-primary"
                        : done
                          ? "text-emerald-700"
                          : reachable
                            ? "text-foreground/70"
                            : "text-muted-foreground/40",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : done
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                            : "border-border",
                      )}
                    >
                      {s.n}
                    </span>
                    {s.label}
                    {!reachable && <span className="text-[9px]">(3c)</span>}
                  </button>
                  {i < STEPS.length - 1 && (
                    <span className="text-muted-foreground/40">›</span>
                  )}
                </li>
              );
            })}
          </ol>

          {/* Step body */}
          <div className="rounded-xl border bg-card p-4">
            {step === 1 && (
              <StepScope
                chapters={chapters}
                topicsOf={topicsOf}
                outcomesOf={outcomesOf}
                baiItems={baiItems}
                selected={selected}
                onToggleComp={toggleComp}
                onToggleBai={toggleBai}
                collapsed={collapsedCh}
                onToggleCollapse={(id) =>
                  setCollapsedCh((prev) => {
                    const n = new Set(prev);
                    n.has(id) ? n.delete(id) : n.add(id);
                    return n;
                  })
                }
                expandedTopics={expandedTopics}
                onToggleTopicExpand={(id) =>
                  setExpandedTopics((prev) => {
                    const n = new Set(prev);
                    n.has(id) ? n.delete(id) : n.add(id);
                    return n;
                  })
                }
                countByTopic={countByTopic}
                countByOutcome={countByOutcome}
                poolByComp={poolByComp}
                query={scopeQuery}
                onQuery={setScopeQuery}
              />
            )}
            {step === 2 && (
              <StepFrame
                rows={rows}
                chapters={chapters}
                topicsOf={topicsOf}
                outcomesOf={outcomesOf}
                selected={selected}
                poolByComp={poolByComp}
                excludeIds={excludeIds}
                onToggleExclude={(id) =>
                  setExcludeIds((prev) => {
                    const n = new Set(prev);
                    n.has(id) ? n.delete(id) : n.add(id);
                    setDrafts([]);
                    setSavedPkgId(null);
                    return n;
                  })
                }
                onSetFrameCount={setFrameCount}
              />
            )}
            {step === 3 && (
              <StepMatrix
                rows={rows}
                enabledParts={enabledParts}
                inventory={inventory}
                cells={cells}
                pointsByPart={pointsByPart}
                onCellChange={setCell}
                validation={validation}
                totalQ={totalQ}
              />
            )}
            {step === 4 && (
              <StepStructure
                enabledParts={enabledParts}
                pointsByPart={pointsByPart}
                onPoints={(id, v) => setPointsByPart((p) => ({ ...p, [id]: v }))}
                mcqMultiMode={mcqMultiMode}
                setMcqMultiMode={setMcqMultiMode}
                dsMode={dsMode}
                setDsMode={setDsMode}
                dsTable={dsTable}
                setDsTable={setDsTable}
                orderStrategy={orderStrategy}
                setOrderStrategy={setOrderStrategy}
                duration={duration}
                setDuration={setDuration}
                totalPoints={totalPoints}
                cells={cells}
              />
            )}
            {step === 5 && (
              <StepGenerate
                variantCount={variantCount}
                setVariantCount={setVariantCount}
                onGenerate={handleGenerate}
                drafts={drafts}
                enabledParts={enabledParts}
                pointsByPart={pointsByPart}
                totalPoints={totalPoints}
                invariantsOk={invariants ? invariants.ok : null}
              />
            )}
            {step === 6 && (
              <StepSave
                pkgName={pkgName}
                setPkgName={setPkgName}
                drafts={drafts}
                totalPoints={totalPoints}
                saved={savedPkgId != null}
                onSave={handleSave}
              />
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3">
            <Button
              variant="outline"
              size="sm"
              disabled={step === 1}
              onClick={() => setStep((s) => Math.max(1, s - 1))}
            >
              Quay lại
            </Button>
            <span className="text-[12px] text-muted-foreground">
              Bước {step}/6 · {STEPS[step - 1]?.label}
            </span>
            {step < 6 ? (
              <Button size="sm" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
                Tiếp tục
              </Button>
            ) : (
              <span className="w-[80px]" />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed bg-muted/20 px-6 py-10 text-center text-[13px] text-muted-foreground">
      {text}
    </div>
  );
}

// ─────────────────────────── Step 1: scope + inventory ──────────────────
function StepScope({
  chapters,
  topicsOf,
  outcomesOf,
  baiItems,
  selected,
  onToggleComp,
  onToggleBai,
  collapsed,
  onToggleCollapse,
  expandedTopics,
  onToggleTopicExpand,
  countByTopic,
  countByOutcome,
  poolByComp,
  query,
  onQuery,
}: {
  chapters: Competency[];
  topicsOf: (id: string) => Competency[];
  outcomesOf: (id: string) => Competency[];
  baiItems: (topicId: string) => string[];
  selected: Set<string>;
  onToggleComp: (id: string) => void;
  onToggleBai: (topicId: string) => void;
  collapsed: Set<string>;
  onToggleCollapse: (id: string) => void;
  expandedTopics: Set<string>;
  onToggleTopicExpand: (id: string) => void;
  countByTopic: Record<string, number>;
  countByOutcome: Record<string, number>;
  poolByComp: Record<string, Question[]>;
  query: string;
  onQuery: (q: string) => void;
}) {
  const q = query.trim().toLowerCase();
  const matchOutcome = (o: Competency) =>
    !q ||
    (o.code ?? "").toLowerCase().includes(q) ||
    o.title.toLowerCase().includes(q);
  const matchTopic = (t: Competency) =>
    !q ||
    t.title.toLowerCase().includes(q) ||
    (t.code ?? "").toLowerCase().includes(q) ||
    outcomesOf(t.id).some(matchOutcome);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[12.5px] text-muted-foreground">
          Chọn <span className="font-semibold">từng YCCĐ</span> (mở rộng Bài) hoặc
          tích ô Bài để chọn cả nhóm. Mỗi YCCĐ hiện mức Bloom, số câu trong kho
          và <span className="font-semibold">số câu theo từng dạng</span>.
        </p>
        <div className="relative ml-auto min-w-[240px] flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Lọc theo mã / nội dung YCCĐ, Bài…"
            className="h-8 w-full rounded-md border bg-card pl-8 pr-2 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      </div>

      {chapters.length === 0 ? (
        <EmptyHint text="Khung YCCĐ chưa có Chương nào." />
      ) : (
        chapters.map((ch, ci) => {
          const topics = topicsOf(ch.id).filter(matchTopic);
          if (q && topics.length === 0) return null;
          const open = !collapsed.has(ch.id) || !!q;
          return (
            <div key={ch.id} className="rounded-lg border">
              <button
                type="button"
                onClick={() => onToggleCollapse(ch.id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2/50"
              >
                {open ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                  Chương {ci + 1}
                </span>
                <span className="text-[13px] font-semibold">{ch.title}</span>
              </button>
              {open && (
                <ul className="divide-y border-t">
                  {topics.length === 0 ? (
                    <li className="px-3 py-2 text-[12px] text-muted-foreground">
                      Chương này chưa có Bài.
                    </li>
                  ) : (
                    topics.map((t) => {
                      const items = baiItems(t.id);
                      const selCount = items.filter((i) => selected.has(i)).length;
                      const allOn = items.length > 0 && selCount === items.length;
                      const someOn = selCount > 0 && selCount < items.length;
                      const cnt = countByTopic[t.id] ?? 0;
                      const outcomes = outcomesOf(t.id);
                      const hasTopicLevel = items.includes(t.id);
                      const exp = expandedTopics.has(t.id) || !!q;
                      return (
                        <li key={t.id}>
                          <div className="flex items-center gap-2 px-3 py-2 hover:bg-surface-2/40">
                            <IndetCheckbox
                              checked={allOn}
                              indeterminate={someOn}
                              onChange={() => onToggleBai(t.id)}
                              title="Chọn / bỏ tất cả YCCĐ của Bài"
                            />
                            <button
                              type="button"
                              onClick={() => onToggleTopicExpand(t.id)}
                              className="flex flex-1 items-center gap-1.5 text-left"
                            >
                              {items.length > 0 &&
                                (exp ? (
                                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                ))}
                              <span className="text-[12.5px] font-medium">{t.title}</span>
                              <span className="text-[10.5px] text-muted-foreground">
                                (chọn {selCount}/{items.length} YCCĐ)
                              </span>
                            </button>
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[10.5px] font-semibold",
                                cnt > 0
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-muted text-muted-foreground",
                              )}
                            >
                              {cnt} câu
                            </span>
                          </div>
                          {exp && items.length > 0 && (
                            <ul className="space-y-0.5 border-t bg-surface-2/30 px-3 py-1.5">
                              {outcomes.filter(matchOutcome).map((o) => {
                                const bloom = bloomMeta(o.bloomLevel ?? null);
                                const oc = countByOutcome[o.id] ?? 0;
                                return (
                                  <li key={o.id}>
                                    <label className="flex cursor-pointer items-center gap-1.5 rounded py-0.5 pl-4 pr-1 text-[11.5px] hover:bg-surface-2/60">
                                      <input
                                        type="checkbox"
                                        checked={selected.has(o.id)}
                                        onChange={() => onToggleComp(o.id)}
                                        className="h-3.5 w-3.5 shrink-0 accent-[var(--color-primary)]"
                                      />
                                      {o.code && (
                                        <span className="shrink-0 rounded bg-slate-100 px-1 font-mono text-[9.5px] text-slate-600">
                                          {o.code}
                                        </span>
                                      )}
                                      {bloom && (
                                        <span
                                          className={cn(
                                            "shrink-0 rounded px-1 text-[9.5px] font-semibold",
                                            bloom.chipBg,
                                            bloom.chipFg,
                                          )}
                                          title={bloom.full}
                                        >
                                          {bloom.short}
                                        </span>
                                      )}
                                      <span className="min-w-0 flex-1 truncate text-foreground/80">
                                        {o.title}
                                      </span>
                                      {oc > 0 && (
                                        <span className="shrink-0">
                                          <TypeBadges
                                            breakdown={typeBreakdownOf(poolByComp[o.id] ?? [])}
                                          />
                                        </span>
                                      )}
                                      <span
                                        className={cn(
                                          "shrink-0 rounded px-1 text-[9.5px] font-semibold",
                                          oc > 0
                                            ? "bg-emerald-50 text-emerald-700"
                                            : "text-muted-foreground/60",
                                        )}
                                      >
                                        {oc} câu
                                      </span>
                                    </label>
                                  </li>
                                );
                              })}
                              {hasTopicLevel && (!q || "câu chung của bài".includes(q)) && (
                                <li>
                                  <label className="flex cursor-pointer items-center gap-1.5 rounded py-0.5 pl-4 pr-1 text-[11.5px] hover:bg-surface-2/60">
                                    <input
                                      type="checkbox"
                                      checked={selected.has(t.id)}
                                      onChange={() => onToggleComp(t.id)}
                                      className="h-3.5 w-3.5 shrink-0 accent-[var(--color-primary)]"
                                    />
                                    <span className="min-w-0 flex-1 truncate italic text-muted-foreground">
                                      Câu chung của Bài (chưa gắn YCCĐ cụ thể)
                                    </span>
                                    {(poolByComp[t.id] ?? []).length > 0 && (
                                      <span className="shrink-0">
                                        <TypeBadges
                                          breakdown={typeBreakdownOf(poolByComp[t.id] ?? [])}
                                        />
                                      </span>
                                    )}
                                    <span className="shrink-0 rounded bg-emerald-50 px-1 text-[9.5px] font-semibold text-emerald-700">
                                      {(poolByComp[t.id] ?? []).length} câu
                                    </span>
                                  </label>
                                </li>
                              )}
                            </ul>
                          )}
                        </li>
                      );
                    })
                  )}
                </ul>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

// ─────────────────────────── Step 2: khung đề (exclude) ─────────────────
const QTYPE_LABEL: Record<string, string> = {
  "mcq-single": "TN 1 đáp án",
  "mcq-multi": "TN nhiều đáp án",
  "true-false": "Đúng/Sai",
  "multi-tf": "Đúng–Sai nhiều ý",
  "short-answer": "Trả lời ngắn",
  essay: "Tự luận",
  "ai-generated": "Tự luận (AI)",
  "fill-blank": "Điền khuyết",
  matching: "Nối",
  ordering: "Sắp xếp",
  "drag-drop": "Kéo thả",
  underline: "Gạch chân",
};

const PART_SHORT: Record<string, string> = {
  mcq: "Nhiều lựa chọn",
  ds: "Đúng–Sai",
  short: "Trả lời ngắn",
  tl: "Tự luận",
  other: "Khác",
};

/** Cấu phần (dạng câu) của một câu hỏi theo MOET; "other" nếu không khớp. */
function partIdOf(q: Question): string {
  return MOET_DEFAULT_PARTS.find((p) => p.questionTypes.includes(q.type))?.id ?? "other";
}

/** Số câu theo dạng (cấu phần) trong một nhóm câu hỏi. */
function typeBreakdownOf(qs: Question[]): Record<string, number> {
  const by: Record<string, number> = {};
  for (const qq of qs) {
    const id = partIdOf(qq);
    by[id] = (by[id] ?? 0) + 1;
  }
  return by;
}

/**
 * Chia một nhóm câu hỏi thành các cấu phần (dạng câu), sắp theo thứ tự MOET,
 * mỗi cấu phần sắp theo id để "giữ N câu đầu" luôn tất định.
 */
function partitionByPart(qs: Question[]): { partId: string; questions: Question[] }[] {
  const map: Record<string, Question[]> = {};
  for (const qq of qs) (map[partIdOf(qq)] ??= []).push(qq);
  const order = [...MOET_DEFAULT_PARTS.map((p) => p.id), "other"];
  return Object.entries(map)
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([partId, questions]) => ({
      partId,
      questions: [...questions].sort((x, y) => x.id.localeCompare(y.id)),
    }));
}

/** Các badge "dạng câu: số câu" — dùng chung ở bước ① và ②. */
function TypeBadges({ breakdown }: { breakdown: Record<string, number> }) {
  const entries = Object.entries(breakdown).sort();
  if (entries.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-1 align-middle">
      {entries.map(([partId, c]) => (
        <span
          key={partId}
          className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
          title="Số câu theo dạng"
        >
          {PART_SHORT[partId] ?? partId}: {c}
        </span>
      ))}
    </span>
  );
}

function StepFrame({
  rows,
  outcomesOf,
  selected,
  poolByComp,
  excludeIds,
  onToggleExclude,
  onSetFrameCount,
}: {
  rows: MatrixRow[];
  chapters: Competency[];
  topicsOf: (id: string) => Competency[];
  outcomesOf: (id: string) => Competency[];
  selected: Set<string>;
  poolByComp: Record<string, Question[]>;
  excludeIds: Set<string>;
  onToggleExclude: (id: string) => void;
  onSetFrameCount: (questions: Question[], n: number) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [previewQ, setPreviewQ] = useState<Question | null>(null);
  const toggle = (set: Set<string>, setFn: (s: Set<string>) => void, id: string) => {
    const n = new Set(set);
    n.has(id) ? n.delete(id) : n.add(id);
    setFn(n);
  };
  const keptCount = (qs: Question[]) => qs.filter((q) => !excludeIds.has(q.id)).length;
  // Only the YCCĐ / topic-level buckets selected in step ①.
  const selOutcomes = (topicId: string) =>
    outcomesOf(topicId).filter((o) => selected.has(o.id));

  const totalAvail = rows.reduce((s, r) => {
    let c = selected.has(r.topicId) ? (poolByComp[r.topicId] ?? []).length : 0;
    for (const o of selOutcomes(r.topicId)) c += (poolByComp[o.id] ?? []).length;
    return s + c;
  }, 0);
  const totalKept = rows.reduce((s, r) => {
    let c = selected.has(r.topicId) ? keptCount(poolByComp[r.topicId] ?? []) : 0;
    for (const o of selOutcomes(r.topicId)) c += keptCount(poolByComp[o.id] ?? []);
    return s + c;
  }, 0);

  return (
    <div className="space-y-2">
      <p className="text-[12.5px] text-muted-foreground">
        Mỗi YCCĐ hiện <span className="font-semibold">tổng số câu trong kho</span>;
        điền <span className="font-semibold">số câu chọn vào khung</span> (mặc
        định lấy hết). Bấm “Xem” để duyệt + xem nội dung từng câu. Đang chọn{" "}
        <span className="font-semibold text-foreground">{totalKept}</span>/{totalAvail} câu.
      </p>
      {rows.length === 0 ? (
        <EmptyHint text="Chưa chọn Bài nào ở bước ①." />
      ) : (
        rows.map((r) => {
          const groups: {
            id: string;
            label: string;
            code?: string | null;
            bloom?: 1 | 2 | 3 | null;
            questions: Question[];
          }[] = [];
          for (const o of selOutcomes(r.topicId)) {
            const qs = poolByComp[o.id] ?? [];
            if (qs.length > 0)
              groups.push({ id: o.id, label: o.title, code: o.code, bloom: o.bloomLevel, questions: qs });
          }
          const topicQs = selected.has(r.topicId) ? poolByComp[r.topicId] ?? [] : [];
          if (topicQs.length > 0)
            groups.push({
              id: r.topicId,
              label: "Câu chung của Bài (chưa gắn YCCĐ cụ thể)",
              questions: topicQs,
            });
          if (groups.length === 0) return null;
          return (
            <div key={r.topicId} className="rounded-lg border">
              <div className="border-b bg-surface-2 px-3 py-1.5 text-[12px] font-semibold">
                <span className="text-muted-foreground">{r.chapterName} › </span>
                {r.topicName}
              </div>
              <ul className="divide-y">
                {groups.map((g) => {
                  const total = g.questions.length;
                  const n = keptCount(g.questions);
                  const exp = expanded.has(g.id);
                  const bloom = g.bloom ? bloomMeta(g.bloom) : null;
                  const partsOfGroup = partitionByPart(g.questions);
                  return (
                    <li key={g.id}>
                      <div className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          {g.code && (
                            <span className="shrink-0 rounded bg-slate-100 px-1 font-mono text-[10px] text-slate-600">
                              {g.code}
                            </span>
                          )}
                          {bloom && (
                            <span
                              className={cn(
                                "shrink-0 rounded px-1 text-[9.5px] font-semibold",
                                bloom.chipBg,
                                bloom.chipFg,
                              )}
                            >
                              {bloom.short}
                            </span>
                          )}
                          <span className="min-w-[140px] flex-1 text-[12.5px] font-medium">
                            {g.label}
                          </span>
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            Đã chọn{" "}
                            <span className="font-semibold text-foreground">{n}</span>/{total}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggle(expanded, setExpanded, g.id)}
                            className="inline-flex shrink-0 items-center gap-1 rounded-md border bg-card px-2 py-1 text-[11.5px] text-primary hover:bg-surface-2"
                          >
                            {exp ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                            Xem {total} câu
                          </button>
                        </div>
                        {/* Nhập số câu VÀO KHUNG theo TỪNG DẠNG của YCCĐ này. */}
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 pl-0.5">
                          {partsOfGroup.map(({ partId, questions }) => {
                            const kept = keptCount(questions);
                            const cap = questions.length;
                            return (
                              <div key={partId} className="flex items-center gap-1.5">
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                  {PART_SHORT[partId] ?? partId}
                                </span>
                                <span className="text-[11px] text-muted-foreground">
                                  Vào khung:
                                </span>
                                <input
                                  type="number"
                                  min={0}
                                  max={cap}
                                  value={kept}
                                  onChange={(e) =>
                                    onSetFrameCount(
                                      questions,
                                      Math.max(0, Math.min(cap, Number(e.target.value) || 0)),
                                    )
                                  }
                                  title={`Có ${cap} câu dạng ${PART_SHORT[partId] ?? partId} — chọn tối đa ${cap}`}
                                  className="h-7 w-14 rounded-md border bg-card px-2 text-center text-[12.5px] tabular-nums"
                                />
                                <span className="text-[11px] font-semibold text-emerald-700">
                                  /{cap}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      {exp && (
                        <ul className="space-y-1 border-t bg-surface-2/30 px-3 py-2">
                          {g.questions.map((qq) => {
                            const isKept = !excludeIds.has(qq.id);
                            return (
                              <li
                                key={qq.id}
                                className={cn(
                                  "rounded-md border px-2.5 py-1.5",
                                  isKept ? "bg-card" : "bg-muted/30 opacity-70",
                                )}
                              >
                                <div className="flex items-start gap-2">
                                  <input
                                    type="checkbox"
                                    checked={isKept}
                                    onChange={() => onToggleExclude(qq.id)}
                                    className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]"
                                  />
                                  <span className="mt-0.5 shrink-0 rounded bg-slate-100 px-1 font-mono text-[9.5px] text-slate-600">
                                    {qq.id}
                                  </span>
                                  <span className="mt-0.5 shrink-0 rounded bg-violet-50 px-1 text-[9.5px] font-semibold text-violet-700">
                                    {QTYPE_LABEL[qq.type] ?? qq.type}
                                  </span>
                                  <div className="min-w-0 flex-1 text-[12px]">
                                    <RenderedContent
                                      content={qq.content}
                                      inline
                                      className="line-clamp-2"
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setPreviewQ(qq)}
                                    title="Xem trước câu hỏi (đề bài, đáp án, YCCĐ từng ý)"
                                    className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded border bg-card px-1.5 py-0.5 text-[10.5px] font-semibold text-primary hover:bg-surface-2"
                                  >
                                    <Eye className="h-3 w-3" />
                                    Xem
                                  </button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })
      )}
      <ViewQuestionDialog question={previewQ} onClose={() => setPreviewQ(null)} />
    </div>
  );
}

// ─────────────────────────── Step 3: matrix ─────────────────────────────
function StepMatrix({
  rows,
  enabledParts,
  inventory,
  cells,
  pointsByPart: pbp,
  onCellChange,
  validation,
  totalQ,
}: {
  rows: MatrixRow[];
  enabledParts: YccdPart[];
  inventory: Record<string, number>;
  cells: Record<string, number>;
  pointsByPart: Record<string, number>;
  onCellChange: (t: string, p: string, b: number, v: number) => void;
  validation: { ok: boolean; exceeded: unknown[] };
  totalQ: number;
}) {
  const pointsByPart: Record<string, number> = {};
  for (const p of enabledParts)
    pointsByPart[p.id] = pbp[p.id] ?? DEFAULT_POINTS[p.id] ?? 0.25;

  return (
    <div className="space-y-3">
      {/* Cấu phần đề tự suy theo loại câu có trong khung (không bật/tắt tay) */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
          Cấu phần đề (tự động theo loại câu trong khung):
        </span>
        {enabledParts.length === 0 ? (
          <span className="text-[11.5px] italic text-muted-foreground">
            Khung chưa có câu — chọn thêm YCCĐ ở bước ①.
          </span>
        ) : (
          enabledParts.map((p) => (
            <span
              key={p.id}
              className="rounded-full border border-primary bg-primary/10 px-3 py-1 text-[12px] font-medium text-primary"
            >
              ✓ {p.label}
            </span>
          ))
        )}
      </div>

      <p className="text-[12px] text-muted-foreground">
        Ô <span className="rounded bg-emerald-50 px-1 text-emerald-700">tô xanh</span> là
        có câu trong kho; số <span className="font-semibold text-emerald-700">/N</span> dưới
        mỗi ô = <span className="font-semibold">số câu có sẵn</span>. Điền số câu cần —
        không vượt N. Điểm/câu tinh chỉnh ở bước ④.
      </p>

      <YccdMatrixTable
        rows={rows}
        parts={enabledParts}
        inventory={inventory}
        cells={cells}
        pointsByPart={pointsByPart}
        onCellChange={onCellChange}
      />

      {totalQ > 0 && !validation.ok && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          <TriangleAlert className="h-4 w-4 shrink-0" />
          Có ô vượt kho — đã tự kẹp về tối đa. Kiểm tra lại số câu.
        </div>
      )}
      {totalQ > 0 && validation.ok && (
        <p className="text-[12px] text-emerald-700">
          ✓ Ma trận hợp lệ · tổng {totalQ} câu.
        </p>
      )}
    </div>
  );
}

// ─────────────────────────── Step 4: cấu trúc + điểm ────────────────────
function StepStructure({
  enabledParts,
  pointsByPart,
  onPoints,
  mcqMultiMode,
  setMcqMultiMode,
  dsMode,
  setDsMode,
  dsTable,
  setDsTable,
  orderStrategy,
  setOrderStrategy,
  duration,
  setDuration,
  totalPoints,
  cells,
}: {
  enabledParts: YccdPart[];
  pointsByPart: Record<string, number>;
  onPoints: (id: string, v: number) => void;
  mcqMultiMode: "full" | "partial";
  setMcqMultiMode: (m: "full" | "partial") => void;
  dsMode: "graduated" | "weighted" | "full";
  setDsMode: (m: "graduated" | "weighted" | "full") => void;
  dsTable: Record<number, number>;
  setDsTable: (t: Record<number, number>) => void;
  orderStrategy: "by-section" | "shuffle-all";
  setOrderStrategy: (s: "by-section" | "shuffle-all") => void;
  duration: number;
  setDuration: (n: number) => void;
  totalPoints: number;
  cells: Record<string, number>;
}) {
  const has = (id: string) => enabledParts.some((p) => p.id === id);
  const partCount = (partId: string) =>
    Object.entries(cells).reduce(
      (s, [k, v]) => (k.split("|")[1] === partId ? s + v : s),
      0,
    );
  const near10 = Math.abs(totalPoints - 10) < 0.001;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
            Thứ tự câu
          </label>
          <div className="inline-flex overflow-hidden rounded-md border">
            {(["by-section", "shuffle-all"] as const).map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setOrderStrategy(o)}
                className={cn(
                  "px-3 py-1.5 text-[12px] transition",
                  orderStrategy === o
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "bg-card text-muted-foreground hover:bg-accent/30",
                )}
              >
                {o === "by-section" ? "Theo phần (I/II/…)" : "Trộn toàn bộ"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
            Thời gian (phút)
          </label>
          <input
            type="number"
            min={5}
            max={300}
            value={duration}
            onChange={(e) => setDuration(Math.max(5, Number(e.target.value) || 45))}
            className="h-9 w-24 rounded-md border bg-card px-2 text-center text-[13px]"
          />
        </div>
      </div>

      {/* Điểm mỗi phần */}
      <div className="rounded-lg border">
        <div className="border-b bg-surface-2 px-3 py-2 text-[12px] font-semibold">
          Điểm mỗi câu theo phần
        </div>
        <ul className="divide-y">
          {enabledParts.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2">
              <span className="flex-1 text-[12.5px]">{p.label}</span>
              <span className="text-[11px] text-muted-foreground">
                {partCount(p.id)} câu ×
              </span>
              <input
                type="number"
                min={0}
                step={0.25}
                value={pointsByPart[p.id] ?? DEFAULT_POINTS[p.id] ?? 0.25}
                onChange={(e) => onPoints(p.id, Math.max(0, Number(e.target.value) || 0))}
                className="h-8 w-20 rounded-md border bg-card px-2 text-center text-[12.5px]"
              />
              <span className="text-[11px] text-muted-foreground">đ/câu</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Chế độ chấm MOET */}
      {has("mcq") && (
        <ScoreMode
          title="Chấm câu nhiều đáp án đúng (mcq-multi)"
          options={[
            { v: "full", label: "Toàn phần (đúng hết mới có điểm)" },
            { v: "partial", label: "Từng phần (mỗi đáp án đúng)" },
          ]}
          value={mcqMultiMode}
          onChange={(v) => setMcqMultiMode(v as "full" | "partial")}
        />
      )}
      {has("ds") && (
        <div className="space-y-2">
          <ScoreMode
            title="Chấm câu Đúng–Sai nhiều ý"
            options={[
              { v: "graduated", label: "Lũy tiến theo số ý đúng" },
              { v: "weighted", label: "Trọng số từng ý" },
              { v: "full", label: "Toàn phần" },
            ]}
            value={dsMode}
            onChange={(v) => setDsMode(v as "graduated" | "weighted" | "full")}
          />
          {dsMode === "graduated" && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-surface-2/40 px-3 py-2">
              <span className="text-[11.5px] text-muted-foreground">
                Bảng lũy tiến (phần điểm khi đúng n ý):
              </span>
              {[1, 2, 3, 4].map((k) => (
                <label key={k} className="inline-flex items-center gap-1 text-[11.5px]">
                  {k} ý
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={dsTable[k] ?? 0}
                    onChange={(e) =>
                      setDsTable({ ...dsTable, [k]: Math.max(0, Math.min(1, Number(e.target.value) || 0)) })
                    }
                    className="h-7 w-16 rounded border bg-card px-1 text-center"
                  />
                </label>
              ))}
              <button
                type="button"
                onClick={() => setDsTable({ 1: 0.1, 2: 0.25, 3: 0.5, 4: 1 })}
                className="text-[11px] text-primary underline"
              >
                THPT
              </button>
              <button
                type="button"
                onClick={() => setDsTable({ 1: 0.25, 2: 0.5, 3: 0.75, 4: 1 })}
                className="text-[11px] text-primary underline"
              >
                FSC
              </button>
            </div>
          )}
        </div>
      )}

      <div
        className={cn(
          "flex items-center justify-between rounded-lg border px-4 py-2.5 text-[13px] font-semibold",
          near10
            ? "border-emerald-300 bg-emerald-50 text-emerald-800"
            : "border-amber-300 bg-amber-50 text-amber-800",
        )}
      >
        <span>Tổng điểm toàn đề</span>
        <span className="text-[16px]">{totalPoints}đ</span>
      </div>
      {!near10 && (
        <p className="text-[12px] text-amber-700">
          ⚠ Tổng điểm ≠ 10đ — cân nhắc chuẩn hoá về 10 (chỉnh điểm/câu hoặc số câu).
        </p>
      )}
    </div>
  );
}

function ScoreMode({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: { v: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
        {title}
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-[12px] transition",
              value === o.v
                ? "border-primary bg-primary/10 text-primary font-semibold"
                : "border-border bg-card text-muted-foreground hover:bg-accent/30",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────── Step 5: sinh mã đề ─────────────────────────
function StepGenerate({
  variantCount,
  setVariantCount,
  onGenerate,
  drafts,
  enabledParts,
  pointsByPart,
  totalPoints,
  invariantsOk,
}: {
  variantCount: number;
  setVariantCount: (n: number) => void;
  onGenerate: () => void;
  drafts: DraftExam[];
  enabledParts: YccdPart[];
  pointsByPart: Record<string, number>;
  totalPoints: number;
  invariantsOk: boolean | null;
}) {
  const partOf = (draft: DraftExam, partId: string) =>
    draft.sections.find((s) => s.topicId === partId)?.questionIds.length ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
            Số mã đề
          </label>
          <input
            type="number"
            min={1}
            max={50}
            value={variantCount}
            onChange={(e) => setVariantCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
            className="h-9 w-24 rounded-md border bg-card px-2 text-center text-[13px]"
          />
        </div>
        <Button size="sm" onClick={onGenerate}>
          <Target className="h-3.5 w-3.5" />
          Sinh {variantCount} mã đề
        </Button>
        {invariantsOk != null &&
          (invariantsOk ? (
            <span className="text-[12px] font-semibold text-emerald-700">
              ✓ Tất cả mã đề khớp ma trận
            </span>
          ) : (
            <span className="text-[12px] font-semibold text-amber-700">
              ⚠ Một số mã đề thiếu câu (kho không đủ) — quay lại bước ③.
            </span>
          ))}
      </div>

      {drafts.length === 0 ? (
        <EmptyHint text="Bấm “Sinh mã đề” để tạo các biến thể từ ma trận." />
      ) : (
        <ul className="space-y-1.5">
          {drafts.map((d, i) => {
            const pts =
              enabledParts.reduce(
                (s, p) => s + partOf(d, p.id) * (pointsByPart[p.id] ?? DEFAULT_POINTS[p.id] ?? 0.25),
                0,
              );
            return (
              <li
                key={i}
                className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-3 py-2 text-[12px]"
              >
                <span className="rounded bg-primary/10 px-2 py-0.5 font-mono font-semibold text-primary">
                  Đề {String(i + 1).padStart(3, "0")}
                </span>
                {enabledParts.map((p) => (
                  <span key={p.id} className="text-muted-foreground">
                    {p.label.split(" ").slice(-1)[0]}:{" "}
                    <span className="font-semibold text-foreground">{partOf(d, p.id)}</span>
                  </span>
                ))}
                <span className="ml-auto text-muted-foreground">
                  {d.questionIds.length} câu ·{" "}
                  <span className="font-semibold text-foreground">
                    {Math.round(pts * 100) / 100}đ
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {drafts.length > 0 && (
        <p className="text-[11.5px] text-muted-foreground">
          Mỗi mã đề rút ngẫu nhiên khác nhau, cùng ma trận & cùng {totalPoints}đ.
        </p>
      )}
    </div>
  );
}

// ─────────────────────────── Step 6: lưu ────────────────────────────────
function StepSave({
  pkgName,
  setPkgName,
  drafts,
  totalPoints,
  saved,
  onSave,
}: {
  pkgName: string;
  setPkgName: (s: string) => void;
  drafts: DraftExam[];
  totalPoints: number;
  saved: boolean;
  onSave: () => void;
}) {
  const nQ = drafts[0]?.questionIds.length ?? 0;
  return (
    <div className="space-y-4">
      {saved ? (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-5 py-6 text-center">
          <p className="text-[15px] font-bold text-emerald-800">✓ Đã lưu gói đề</p>
          <p className="mt-1 text-[12.5px] text-emerald-700">
            {drafts.length} mã đề đã vào kho “Đề đã sinh”.
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <Link
              href="/admin/exam-blueprints?tab=generated"
              className="rounded-md border bg-card px-3 py-1.5 text-[12.5px] font-semibold text-primary hover:bg-surface-2"
            >
              → Xem “Đề đã sinh”
            </Link>
            <Link
              href="/admin/shifts"
              className="rounded-md border bg-card px-3 py-1.5 text-[12.5px] font-semibold hover:bg-surface-2"
            >
              → Tạo Ca kíp thi
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
              Tên gói đề
            </label>
            <input
              value={pkgName}
              onChange={(e) => setPkgName(e.target.value)}
              placeholder="vd: KT giữa kì I — Sinh học 10"
              className="h-9 w-full max-w-md rounded-md border bg-card px-3 text-[13px]"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Kpi label="Số mã đề" value={drafts.length} />
            <Kpi label="Câu / đề" value={nQ} />
            <Kpi label="Điểm / đề" value={totalPoints} />
          </div>
          <Button size="sm" disabled={drafts.length === 0} onClick={onSave}>
            Lưu vào “Sinh đề”
          </Button>
          {drafts.length === 0 && (
            <p className="text-[12px] text-amber-700">
              Chưa có mã đề — quay lại bước ⑤ để sinh.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-center">
      <p className="text-[20px] font-bold leading-none">{value}</p>
      <p className="mt-1 text-[10.5px] uppercase tracking-[0.05em] text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

function IndetCheckbox({
  checked,
  indeterminate,
  onChange,
  title,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
  title?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate && !checked;
  }, [indeterminate, checked]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      title={title}
      className="h-4 w-4 shrink-0 accent-[var(--color-primary)]"
    />
  );
}
