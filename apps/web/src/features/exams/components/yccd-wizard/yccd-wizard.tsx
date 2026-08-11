"use client";

import {
  ChevronDown,
  ChevronRight,
  Search,
  Target,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { bloomMeta, type Competency } from "@/features/competencies/data/types";
import { useCompetenciesStore } from "@/features/competencies/state/competencies-store";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { useCampusStore } from "@/features/campus/state/campus-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { useQuestionsStore } from "@/features/question-bank/state/questions-store";
import { RenderedContent } from "@/features/question-bank/components/rendered-content";
import { cn } from "@/lib/utils";

import {
  MOET_DEFAULT_PARTS,
  type YccdPart,
} from "../../data/types";
import {
  cellKey,
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

  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());
  const [excludeIds, setExcludeIds] = useState<Set<string>>(new Set());
  const [parts] = useState<YccdPart[]>(() => MOET_DEFAULT_PARTS.map((p) => ({ ...p })));
  const [enabled, setEnabled] = useState<Set<string>>(new Set(["mcq", "ds", "tl"]));
  const [cells, setCells] = useState<Record<string, number>>({});
  const [collapsedCh, setCollapsedCh] = useState<Set<string>>(new Set());
  const [scopeQuery, setScopeQuery] = useState("");
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());

  // Reset downstream state when scope changes.
  useEffect(() => {
    setSelectedTopics(new Set());
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

  const enabledParts = useMemo(
    () => parts.filter((p) => enabled.has(p.id)),
    [parts, enabled],
  );

  const inventory = useMemo(
    () => buildYccdInventory(pool, enabledParts, resolvers, excludeIds),
    [pool, enabledParts, resolvers, excludeIds],
  );

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

  const rows: MatrixRow[] = useMemo(() => {
    const out: MatrixRow[] = [];
    for (const ch of chapters) {
      for (const t of topicsOf(ch.id)) {
        if (selectedTopics.has(t.id)) {
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
  }, [chapters, selectedTopics, comps]);

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

  function toggleTopic(id: string) {
    setSelectedTopics((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function setCell(t: string, p: string, b: number, v: number) {
    setCells((prev) => ({ ...prev, [cellKey(t, p, b)]: v }));
  }

  const subject = subjects.find((s) => s.id === subjectId);
  const grade = gradeList.find((g) => g.id === gradeId);

  const canNext =
    step === 1
      ? selectedTopics.size > 0
      : step === 2
        ? true
        : step === 3
          ? validation.ok && totalQ > 0
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
              const reachable = s.n <= 3;
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
                outcomesOf={(tid) =>
                  comps
                    .filter((c) => c.kind === "outcome" && c.parentId === tid)
                    .sort((a, b) => (a.code ?? "").localeCompare(b.code ?? ""))
                }
                selectedTopics={selectedTopics}
                onToggle={toggleTopic}
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
                query={scopeQuery}
                onQuery={setScopeQuery}
              />
            )}
            {step === 2 && (
              <StepFrame
                rows={rows}
                pool={pool}
                resolvers={resolvers}
                excludeIds={excludeIds}
                onToggleExclude={(id) =>
                  setExcludeIds((prev) => {
                    const n = new Set(prev);
                    n.has(id) ? n.delete(id) : n.add(id);
                    return n;
                  })
                }
              />
            )}
            {step === 3 && (
              <StepMatrix
                parts={parts}
                enabled={enabled}
                onTogglePart={(id) =>
                  setEnabled((prev) => {
                    const n = new Set(prev);
                    if (n.has(id)) {
                      if (n.size > 1) n.delete(id);
                    } else n.add(id);
                    return n;
                  })
                }
                rows={rows}
                enabledParts={enabledParts}
                inventory={inventory}
                cells={cells}
                onCellChange={setCell}
                validation={validation}
                totalQ={totalQ}
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
            {step < 3 ? (
              <Button size="sm" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
                Tiếp tục
              </Button>
            ) : (
              <Button size="sm" disabled title="Bước ④–⑥ sẽ có ở đợt 3c">
                Bước ④ (sắp có)
              </Button>
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
  selectedTopics,
  onToggle,
  collapsed,
  onToggleCollapse,
  expandedTopics,
  onToggleTopicExpand,
  countByTopic,
  countByOutcome,
  query,
  onQuery,
}: {
  chapters: Competency[];
  topicsOf: (id: string) => Competency[];
  outcomesOf: (id: string) => Competency[];
  selectedTopics: Set<string>;
  onToggle: (id: string) => void;
  collapsed: Set<string>;
  onToggleCollapse: (id: string) => void;
  expandedTopics: Set<string>;
  onToggleTopicExpand: (id: string) => void;
  countByTopic: Record<string, number>;
  countByOutcome: Record<string, number>;
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
          Chọn các <span className="font-semibold">Bài</span> (hàng của ma
          trận); mở rộng để xem YCCĐ + mức Bloom + số câu.
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
                      const on = selectedTopics.has(t.id);
                      const cnt = countByTopic[t.id] ?? 0;
                      const outcomes = outcomesOf(t.id);
                      const exp = expandedTopics.has(t.id) || !!q;
                      return (
                        <li key={t.id}>
                          <div className="flex items-center gap-2 px-3 py-2 hover:bg-surface-2/40">
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => onToggle(t.id)}
                              className="h-4 w-4 accent-[var(--color-primary)]"
                            />
                            <button
                              type="button"
                              onClick={() => onToggleTopicExpand(t.id)}
                              className="flex flex-1 items-center gap-1.5 text-left"
                            >
                              {outcomes.length > 0 &&
                                (exp ? (
                                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                ))}
                              <span className="text-[12.5px]">{t.title}</span>
                              <span className="text-[10.5px] text-muted-foreground">
                                ({outcomes.length} YCCĐ)
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
                          {exp && outcomes.length > 0 && (
                            <ul className="space-y-0.5 border-t bg-surface-2/30 px-3 py-1.5">
                              {outcomes.filter(matchOutcome).map((o) => {
                                const bloom = bloomMeta(o.bloomLevel ?? null);
                                const oc = countByOutcome[o.id] ?? 0;
                                return (
                                  <li
                                    key={o.id}
                                    className="flex items-center gap-1.5 py-0.5 pl-6 text-[11.5px]"
                                  >
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
                                  </li>
                                );
                              })}
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
function StepFrame({
  rows,
  pool,
  resolvers,
  excludeIds,
  onToggleExclude,
}: {
  rows: MatrixRow[];
  pool: import("@/features/question-bank/data/seed-questions").Question[];
  resolvers: YccdResolvers;
  excludeIds: Set<string>;
  onToggleExclude: (id: string) => void;
}) {
  const topicIds = new Set(rows.map((r) => r.topicId));
  // Questions whose primary outcome's topic is a selected row.
  const inScope = useMemo(
    () =>
      pool.filter((q) => {
        const oc =
          q.competencyIds?.[0] ??
          (q.type === "multi-tf"
            ? q.subQuestions?.find((s) => s.competencyId)?.competencyId
            : undefined);
        const topicId = oc ? resolvers.topicOf[oc] : undefined;
        return topicId ? topicIds.has(topicId) : false;
      }),
    [pool, resolvers, rows],
  );

  return (
    <div className="space-y-2">
      <p className="text-[12.5px] text-muted-foreground">
        Bỏ tích các câu <span className="font-semibold">không</span> muốn đưa
        vào khung. Còn lại{" "}
        <span className="font-semibold text-foreground">
          {inScope.filter((q) => !excludeIds.has(q.id)).length}
        </span>
        /{inScope.length} câu.
      </p>
      {inScope.length === 0 ? (
        <EmptyHint text="Chưa có câu nào trong phạm vi đã chọn (kiểm tra gắn YCCĐ cho câu hỏi)." />
      ) : (
        <ul className="max-h-[440px] space-y-1 overflow-y-auto">
          {inScope.map((q) => {
            const kept = !excludeIds.has(q.id);
            return (
              <li
                key={q.id}
                className={cn(
                  "flex items-start gap-2 rounded-md border px-2.5 py-1.5",
                  kept ? "bg-card" : "bg-muted/30 opacity-60",
                )}
              >
                <input
                  type="checkbox"
                  checked={kept}
                  onChange={() => onToggleExclude(q.id)}
                  className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]"
                />
                <span className="rounded bg-slate-100 px-1 font-mono text-[10px] text-slate-600">
                  {q.id}
                </span>
                <div className="min-w-0 flex-1 text-[12px]">
                  <RenderedContent content={q.content} inline className="line-clamp-2" />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────── Step 3: matrix ─────────────────────────────
function StepMatrix({
  parts,
  enabled,
  onTogglePart,
  rows,
  enabledParts,
  inventory,
  cells,
  onCellChange,
  validation,
  totalQ,
}: {
  parts: YccdPart[];
  enabled: Set<string>;
  onTogglePart: (id: string) => void;
  rows: MatrixRow[];
  enabledParts: YccdPart[];
  inventory: Record<string, number>;
  cells: Record<string, number>;
  onCellChange: (t: string, p: string, b: number, v: number) => void;
  validation: { ok: boolean; exceeded: unknown[] };
  totalQ: number;
}) {
  const pointsByPart: Record<string, number> = {};
  for (const p of enabledParts) pointsByPart[p.id] = DEFAULT_POINTS[p.id] ?? 0.25;

  return (
    <div className="space-y-3">
      {/* Parts config */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
          Cấu phần đề:
        </span>
        {parts.map((p) => {
          const on = enabled.has(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onTogglePart(p.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-[12px] font-medium transition",
                on
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-accent/30",
              )}
            >
              {on ? "✓ " : ""}
              {p.label}
            </button>
          );
        })}
        <span className="text-[11px] text-muted-foreground">
          (bật/tắt 2–4 phần tuỳ môn / cấp)
        </span>
      </div>

      <p className="text-[12px] text-muted-foreground">
        Điền số câu mỗi ô — <span className="font-semibold">không vượt kho</span>{" "}
        (giữ tối đa theo tồn kho từng ô). Điểm/câu tạm thời; tinh chỉnh ở bước ④.
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
