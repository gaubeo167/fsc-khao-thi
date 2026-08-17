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
import {
  partConfigId,
  usePartConfigsStore,
} from "@/features/exams/state/part-config-store";
import { RenderedContent } from "@/features/question-bank/components/rendered-content";
import { ViewQuestionDialog } from "@/features/question-bank/dialogs/view-question-dialog";
import type { Question } from "@/features/question-bank/data/seed-questions";
import type { QuestionType } from "@/features/question-bank/data/question-types";
import { cn } from "@/lib/utils";

import {
  DEFAULT_DS_GRADUATED,
  MOET_DEFAULT_PARTS,
  type ExamPackage,
  type ScoringPolicy,
  type YccdMatrix,
  type YccdPart,
} from "../../data/types";
import type { DraftExam } from "../../lib/generate";
import {
  cellKey,
  checkYccdInvariants,
  generateYccdExams,
  partIdForType,
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

export function YccdWizard({
  editing = null,
  onExit,
}: {
  /** Sửa đề YCCĐ đã tạo — nạp lại toàn bộ 6 bước. null = tạo mới. */
  editing?: ExamPackage | null;
  /** Quay lại danh sách đề. */
  onExit?: () => void;
} = {}) {
  const subjects = useSubjectsStore((s) => s.subjects);
  const tocNodes = useSubjectsStore((s) => s.tocNodes);
  const gradeList = useGradesStore((s) => s.grades);
  const activeCampusId = useCampusStore((s) => s.activeCampusId);
  const allComps = useCompetenciesStore((s) => s.competencies);
  const allQuestions = useQuestionsStore((s) => s.questions);
  const session = useAuthStore((s) => s.session);
  const createBlueprint = useBlueprintsStore((s) => s.create);
  const updateBlueprint = useBlueprintsStore((s) => s.update);
  const blueprintsAll = useBlueprintsStore((s) => s.blueprints);
  const createPackage = usePackagesStore((s) => s.create);
  const updatePackage = usePackagesStore((s) => s.update);
  const addBatch = useGeneratedStore((s) => s.addBatch);
  const generatedAll = useGeneratedStore((s) => s.generated);
  const removeGeneratedByPackage = useGeneratedStore((s) => s.removeByPackage);
  const partConfigs = usePartConfigsStore((s) => s.configs);
  const partConfigsHydrated = usePartConfigsStore((s) => s.hydrated);
  const upsertPartConfig = usePartConfigsStore((s) => s.upsert);

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
  const [parts, setParts] = useState<YccdPart[]>(() => MOET_DEFAULT_PARTS.map((p) => ({ ...p })));
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

  // Reset downstream state when scope changes. Bỏ qua ở chế độ SỬA — state
  // đã được nạp từ đề đang sửa, không được xoá.
  useEffect(() => {
    if (editing) return;
    setSelected(new Set());
    setExcludeIds(new Set());
    setCells({});
    setStep(1);
  }, [subjectId, gradeId, editing]);

  // Chế độ SỬA: nạp lại toàn bộ 6 bước từ đề đã tạo (blueprint + yccdMatrix +
  // scoringPolicy + yccdDraft) MỘT LẦN khi blueprint sẵn sàng. Môn/Khối bị
  // khoá nên các effect theo scope ở trên không chạy lại sau khi nạp.
  const editHydratedRef = useRef(false);
  useEffect(() => {
    if (!editing || editHydratedRef.current) return;
    const bp = blueprintsAll.find((b) => b.id === editing.blueprintId);
    if (!bp) return; // chờ blueprint hydrate
    editHydratedRef.current = true;
    const m = editing.yccdMatrix;
    const sp = editing.scoringPolicy;
    const draft = editing.yccdDraft;
    setSubjectId(bp.subjectId);
    setGradeId(bp.gradeId);
    setPkgName(editing.name);
    setDuration(editing.duration || bp.duration || 45);
    if (m) {
      setParts(m.parts.map((p) => ({ ...p, questionTypes: [...p.questionTypes] })));
      const pbp: Record<string, number> = {};
      for (const p of m.parts) if (p.pointsPerQuestion != null) pbp[p.id] = p.pointsPerQuestion;
      setPointsByPart(pbp);
      // Ô ma trận (cells) nạp ở effect riêng SAU khi scopedPool sẵn sàng (xem
      // dưới) — nếu nạp sớm, auto-clamp sẽ xoá vì tồn kho chưa tính kịp.
    }
    if (sp) {
      setMcqMultiMode(sp.mcqMulti);
      setDsMode(sp.ds);
      setDsTable(sp.dsGraduatedTable ?? { ...DEFAULT_DS_GRADUATED });
    }
    if (draft) {
      // Đề mới: nạp chính xác lựa chọn thô đã lưu.
      setSelected(new Set(draft.selectedIds));
      setExcludeIds(new Set(draft.excludeIds));
    }
    // Đề cũ (chưa có yccdDraft): scope được dựng lại từ blueprint ở effect
    // riêng bên dưới (cần `pool` đã sẵn sàng).
    setOrderStrategy(draft?.orderStrategy ?? "by-section");
    setVariantCount(
      draft?.variantCount ??
        Math.max(1, generatedAll.filter((g) => g.packageId === editing.id).length || 4),
    );
  }, [editing, blueprintsAll, generatedAll]);


  // Nạp cấu hình phần đã lưu cho (Môn + Khối) MỘT LẦN mỗi phạm vi — tên phần,
  // dạng câu, điểm/câu, cách chấm, thứ tự, thời gian. Không có bản lưu → mặc
  // định MOET. Chỉ áp một lần/khoá (guard bằng ref) để không đè lên chỉnh tay,
  // và chờ store hydrate trước khi commit mặc định (tránh ghi đè bản lưu tới muộn).
  const appliedConfigKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (editing) return; // chế độ SỬA nạp cấu hình từ chính đề, không từ template
    if (!subjectId) return;
    const key = `${subjectId}|${gradeId}`;
    if (appliedConfigKeyRef.current === key) return;
    const cfg = partConfigs.find((c) => c.id === partConfigId(subjectId, gradeId));
    if (!cfg && !partConfigsHydrated) return;
    appliedConfigKeyRef.current = key;
    if (cfg) {
      setParts(cfg.parts.map((p) => ({ ...p, questionTypes: [...p.questionTypes] })));
      const pbp: Record<string, number> = {};
      for (const p of cfg.parts) if (p.pointsPerQuestion != null) pbp[p.id] = p.pointsPerQuestion;
      setPointsByPart(pbp);
      setMcqMultiMode(cfg.mcqMulti);
      setDsMode(cfg.ds);
      setDsTable(cfg.dsGraduatedTable ?? { ...DEFAULT_DS_GRADUATED });
      setOrderStrategy(cfg.orderStrategy);
      setDuration(cfg.durationMinutes);
    } else {
      setParts(MOET_DEFAULT_PARTS.map((p) => ({ ...p })));
      setPointsByPart({});
      setMcqMultiMode("partial");
      setDsMode("graduated");
      setDsTable({ ...DEFAULT_DS_GRADUATED });
      setOrderStrategy("by-section");
      setDuration(45);
    }
  }, [subjectId, gradeId, partConfigs, partConfigsHydrated]);

  // Competency scope (subject + grade, with all-grade fallback).
  const comps = useMemo(() => {
    if (!subjectId) return [] as Competency[];
    let c = allComps.filter(
      (x) => x.subjectId === subjectId && (x.gradeId === gradeId || x.gradeId == null),
    );
    // KHÔNG lùi về khung của khối khác: gắn câu lớp 1 vào chuẩn đầu ra lớp
    // 10 là hỏng dữ liệu lặng lẽ. Khối chưa có khung thì hiện rỗng.
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

  /**
   * Mở SỬA một đề đã sinh mã: nạp lại chính các mã đề đó làm bản nháp, thay vì
   * bắt sinh lại từ đầu (sinh lại = đổi toàn bộ câu của mọi mã đề, và bước ⑥
   * trước đây bị khoá vì `drafts` rỗng). Chờ `pool` để dựng lại `sections`
   * (nhóm câu theo phần) — thiếu nó thì bảng mã đề hiện 0 câu / 0đ.
   */
  const draftsHydratedRef = useRef(false);
  useEffect(() => {
    if (!editing || draftsHydratedRef.current) return;
    if (pool.length === 0) return;
    const existing = generatedAll
      .filter((g) => g.packageId === editing.id)
      .sort((a, b) => a.id.localeCompare(b.id));
    if (existing.length === 0) return;
    draftsHydratedRef.current = true;
    const typeById = new Map(pool.map((q) => [q.id, q.type]));
    const partList = editing.yccdMatrix?.parts ?? parts;
    setDrafts(
      existing.map((g) => {
        const byPart = new Map<string, string[]>();
        for (const qid of g.questionIds) {
          const t = typeById.get(qid);
          const pid = t ? partIdForType(partList, t) : null;
          if (!pid) continue;
          const list = byPart.get(pid) ?? [];
          list.push(qid);
          byPart.set(pid, list);
        }
        return {
          questionIds: [...g.questionIds],
          sections: partList
            .filter((p) => (byPart.get(p.id)?.length ?? 0) > 0)
            .map((p) => ({
              topicId: p.id,
              name: p.label,
              questionIds: byPart.get(p.id) ?? [],
            })),
        };
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, pool, generatedAll]);

  // Đề CŨ (chưa có yccdDraft): dựng lại phạm vi ① từ câu đã chốt trong
  // blueprint — YCCĐ/Bài của các câu picked = selected; câu cùng scope nhưng
  // không picked = excludeIds. Chạy MỘT LẦN khi `pool` sẵn sàng.
  const scopeReconstructedRef = useRef(false);
  useEffect(() => {
    if (!editing || editing.yccdDraft) return;
    if (!editHydratedRef.current || scopeReconstructedRef.current) return;
    if (!subjectId || pool.length === 0) return;
    const bp = blueprintsAll.find((b) => b.id === editing.blueprintId);
    if (!bp) return;
    const pickedIds = new Set(bp.topics.flatMap((t) => t.pickedQuestionIds));
    const sel = new Set<string>();
    for (const q of pool) {
      if (!pickedIds.has(q.id)) continue;
      const c = q.competencyIds?.[0];
      if (!c) continue;
      sel.add(c);
      const t = resolvers.topicOf[c];
      if (t) sel.add(t);
    }
    const excl = new Set<string>();
    for (const q of pool) {
      const c = q.competencyIds?.[0];
      if (c && sel.has(c) && !pickedIds.has(q.id)) excl.add(q.id);
    }
    setSelected(sel);
    setExcludeIds(excl);
    scopeReconstructedRef.current = true;
  }, [editing, subjectId, pool, resolvers, blueprintsAll]);

  // Nạp ô ma trận (cells) từ đề đang sửa — CHỈ khi phạm vi đã dựng xong
  // (scopedPool > 0) để tồn kho đã đúng, auto-clamp không xoá. Chạy một lần.
  const cellsHydratedRef = useRef(false);
  useEffect(() => {
    if (!editing || cellsHydratedRef.current) return;
    if (scopedPool.length === 0) return;
    cellsHydratedRef.current = true;
    const m = editing.yccdMatrix;
    if (!m) return;
    const cs: Record<string, number> = {};
    for (const c of m.cells) cs[cellKey(c.topicId, c.partId, c.bloom)] = c.count;
    setCells(cs);
  }, [editing, scopedPool.length]);

  // Dạng câu KHUNG ĐỀ đang giữ (đã trừ câu bỏ ra ở bước ②).
  const frameTypes = useMemo(() => {
    const s = new Set<QuestionType>();
    for (const q of scopedPool) if (!excludeIds.has(q.id)) s.add(q.type);
    return s;
  }, [scopedPool, excludeIds]);

  /**
   * Dạng câu CÓ trong khung nhưng KHÔNG phần nào nhận. Cấu hình phần lưu theo
   * Môn+Khối có thể thiếu dạng (bản lưu Sinh học·K10 chỉ có Đúng–Sai + Trả
   * lời ngắn), khi đó câu nhiều lựa chọn trong khung biến mất khỏi ma trận mà
   * không báo gì.
   */
  const missingParts = useMemo(() => {
    const covered = new Set(parts.flatMap((p) => p.questionTypes));
    return MOET_DEFAULT_PARTS.filter(
      (d) =>
        !parts.some((p) => p.id === d.id) &&
        d.questionTypes.some((t) => frameTypes.has(t) && !covered.has(t)),
    );
  }, [parts, frameTypes]);

  // Ma trận phải phủ HẾT dạng câu có trong khung, đúng mẫu Bộ. Thiếu dạng nào
  // thì bổ sung thẳng vào CẤU TRÚC PHẦN (không chỉ vá ở bảng) để bước ④ đặt
  // tên/điểm/thứ tự được và "Lưu cấu hình cho Môn+Khối" ghi lại bản đầy đủ.
  const [autoAddedPartIds, setAutoAddedPartIds] = useState<string[]>([]);
  /** Phần người dùng tự xoá ở bước ④ — không tự thêm lại. */
  const [droppedPartIds, setDroppedPartIds] = useState<string[]>([]);
  const toAddParts = useMemo(
    () => missingParts.filter((p) => !droppedPartIds.includes(p.id)),
    [missingParts, droppedPartIds],
  );
  useEffect(() => {
    if (toAddParts.length === 0) return;
    setAutoAddedPartIds((prev) => [
      ...prev,
      ...toAddParts.map((p) => p.id).filter((id) => !prev.includes(id)),
    ]);
    setParts((prev) => {
      const next = [
        ...prev,
        ...toAddParts
          .filter((m) => !prev.some((p) => p.id === m.id))
          .map((p) => ({ ...p, questionTypes: [...p.questionTypes] })),
      ];
      // Chỉ sắp lại khi VỪA bổ sung — cấu hình đủ dạng thì giữ nguyên thứ tự
      // người dùng đã đặt. Phần tự đặt (id lạ) xuống cuối, giữ thứ tự cũ.
      const order = MOET_DEFAULT_PARTS.map((p) => p.id);
      const rank = (id: string) => (order.indexOf(id) === -1 ? 99 : order.indexOf(id));
      return next.sort((a, b) => rank(a.id) - rank(b.id));
    });
  }, [missingParts]);

  // Cấu phần đề tự suy theo LOẠI CÂU có trong khung — chỉ hiện phần nào thực
  // sự có câu, không bắt người dùng bật/tắt tay.
  const enabledParts = useMemo(
    () => parts.filter((p) => scopedPool.some((q) => p.questionTypes.includes(q.type))),
    [parts, scopedPool],
  );
  const autoParts = useMemo(
    () => enabledParts.filter((p) => autoAddedPartIds.includes(p.id)),
    [enabledParts, autoAddedPartIds],
  );
  /** Dạng có câu trong khung mà KHÔNG phần nào nhận (vì người dùng đã xoá
   *  phần đó ở bước ④) — những câu này không vào được đề, phải nói rõ. */
  const uncoveredParts = useMemo(
    () => missingParts.filter((p) => droppedPartIds.includes(p.id)),
    [missingParts, droppedPartIds],
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
  // QUAN TRỌNG (chế độ SỬA): khi vừa nạp lại đề, `cells` được set TRƯỚC khi
  // `pool`/phạm vi kịp tải → `inventory` tạm thời rỗng. Nếu clamp chạy lúc này
  // sẽ xoá sạch ô ma trận vừa khôi phục (chỉ clamp xuống, không hồi lại). Vì
  // vậy hoãn clamp cho tới khi scopedPool đã dựng xong.
  useEffect(() => {
    if (editing && scopedPool.length === 0) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventory, editing, scopedPool.length]);

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
    const topics = rows.map((r) => ({
      id: r.topicId,
      name: r.topicName,
      pickedQuestionIds: byTopic[r.topicId] ?? [],
    }));
    const yccdDraft = {
      selectedIds: [...selected],
      excludeIds: [...excludeIds],
      orderStrategy,
      variantCount,
    };
    // MỌI đề YCCĐ đều phải qua duyệt mới dùng được cho ca thi — kể cả đề do
    // tổ trưởng/admin tạo (trước đây họ tự duyệt, đề dùng được ngay). Sửa một
    // đề đã duyệt cũng đưa về "Chờ duyệt": duyệt xong rồi sửa nội dung mà vẫn
    // giữ trạng thái đã duyệt thì cửa duyệt coi như không có.
    const status = "pending" as const;
    let pkgId: string;
    if (editing) {
      // SỬA tại chỗ: cập nhật blueprint + package + sinh lại mã đề.
      updateBlueprint(editing.blueprintId, { name, duration, topics });
      updatePackage(editing.id, {
        name,
        duration,
        yccdMatrix,
        scoringPolicy,
        yccdDraft,
        status,
        approvedBy: null,
        rejectionNote: null,
      });
      removeGeneratedByPackage(editing.id);
      pkgId = editing.id;
    } else {
      const bp = createBlueprint({
        name,
        subjectId,
        gradeId,
        duration,
        campusId,
        ownerId: session.userId,
        ownerName: session.name ?? "—",
        topics,
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
        yccdDraft,
        status,
      });
      pkgId = pkg.id;
    }
    addBatch(
      drafts.map((d) => ({ packageId: pkgId, questionIds: d.questionIds, duration })),
      (i) => `${name} · Đề ${String(i).padStart(3, "0")}`,
    );
    // Ghi lại cấu hình phần làm mặc định cho Môn+Khối (khoá theo cài đặt cho
    // ca thi sau này; Package cũng đã ôm bản sao qua yccdMatrix.parts).
    saveConfig();
    setSavedPkgId(pkgId);
  }

  // Các dạng câu thực sự có trong phạm vi đã chọn — để gợi ý "kho trống".
  const poolTypes = useMemo(() => {
    const s = new Set<QuestionType>();
    for (const q of scopedPool) s.add(q.type);
    return s;
  }, [scopedPool]);

  // Đổi cấu trúc phần: dọn luôn ô ma trận trỏ tới phần đã xoá / phần rỗng dạng
  // (tránh cộng nhầm tổng điểm), và làm mới mã đề đã sinh.
  function handlePartsChange(next: YccdPart[]) {
    const activeIds = new Set(next.filter((p) => p.questionTypes.length > 0).map((p) => p.id));
    // Người dùng chủ động bỏ một phần ở bước ④ thì đừng tự thêm lại (nếu
    // không nút Xoá sẽ như hỏng). Bước ③ vẫn cảnh báo câu thuộc dạng đó
    // không vào đề được.
    const removed = parts.filter((p) => !next.some((n) => n.id === p.id)).map((p) => p.id);
    if (removed.length > 0) setDroppedPartIds((prev) => [...new Set([...prev, ...removed])]);
    setParts(next);
    setCells((prev) => {
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(prev)) {
        const partId = k.split("|")[1];
        if (partId && activeIds.has(partId)) out[k] = v;
      }
      return out;
    });
    setDrafts([]);
    setSavedPkgId(null);
  }

  // Lưu cấu hình phần hiện tại làm mặc định cho Môn + Khối.
  function saveConfig() {
    if (!subjectId) return;
    upsertPartConfig({
      subjectId,
      gradeId,
      parts: parts.map((p) => ({ ...p, pointsPerQuestion: getPoints(p.id) })),
      mcqMulti: mcqMultiMode,
      ds: dsMode,
      dsGraduatedTable: dsTable,
      orderStrategy,
      durationMinutes: duration,
      updatedBy: session?.userId,
    });
  }
  const savedConfig = partConfigs.find(
    (c) => subjectId && c.id === partConfigId(subjectId, gradeId),
  );

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
      {onExit && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onExit}
            className="inline-flex items-center gap-1 rounded-md border bg-card px-2.5 py-1 text-[12.5px] font-medium text-muted-foreground hover:bg-surface-2"
          >
            ← Danh sách đề
          </button>
          {editing && (
            <span className="rounded-md bg-amber-50 px-2 py-1 text-[11.5px] font-semibold text-amber-700">
              Đang sửa: {editing.name}
              {(editing.version ?? 1) > 1 ? ` · v${editing.version}` : ""}
            </span>
          )}
        </div>
      )}
      {/* Context bar */}
      <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-card px-4 py-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
            Môn học
          </span>
          <Select
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            disabled={!!editing}
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
            disabled={!!editing}
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
            href="/admin/subjects?tab=competency"
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
                autoParts={autoParts}
                uncoveredParts={uncoveredParts}
              />
            )}
            {step === 4 && (
              <StepStructure
                parts={parts}
                onPartsChange={handlePartsChange}
                poolTypes={poolTypes}
                onSaveConfig={saveConfig}
                savedConfigAt={savedConfig?.updatedAt ?? null}
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
            <div key={r.topicId} className="overflow-hidden rounded-lg border">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b bg-surface-2 px-3 py-2">
                <span className="text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
                  {r.chapterName}
                </span>
                <span className="text-muted-foreground/50">›</span>
                <span className="text-[13px] font-bold">{r.topicName}</span>
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {groups.reduce((s, g) => s + keptCount(g.questions), 0)}/
                  {groups.reduce((s, g) => s + g.questions.length, 0)} câu · {groups.length} mục
                </span>
              </div>
              <ul className="divide-y">
                {groups.map((g) => {
                  const total = g.questions.length;
                  const n = keptCount(g.questions);
                  const exp = expanded.has(g.id);
                  const bloom = g.bloom ? bloomMeta(g.bloom) : null;
                  const partsOfGroup = partitionByPart(g.questions);
                  // Vạch màu bên trái = mức Bloom của YCCĐ. Vừa tách các YCCĐ
                  // liền nhau ra khỏi nhau, vừa đọc được mức độ mà không phải
                  // dò chữ NB/TH/VD. Câu chung của Bài dùng màu trung tính.
                  const accent = !bloom
                    ? "border-l-slate-300"
                    : bloom.level === 1
                      ? "border-l-emerald-400"
                      : bloom.level === 2
                        ? "border-l-amber-400"
                        : "border-l-rose-400";
                  return (
                    <li key={g.id} className={cn("border-l-[3px]", accent)}>
                      <div className="flex flex-wrap items-start gap-x-4 gap-y-2 px-3 py-2.5 transition-colors hover:bg-surface-2/40">
                        {/* TRÁI — danh tính YCCĐ: mã, mức Bloom, nội dung */}
                        <div className="min-w-[240px] flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {g.code && (
                              <span className="shrink-0 rounded bg-slate-700/90 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-tight text-white">
                                {g.code}
                              </span>
                            )}
                            {bloom ? (
                              <span
                                className={cn(
                                  "shrink-0 rounded px-1.5 py-0.5 text-[9.5px] font-bold",
                                  bloom.chipBg,
                                  bloom.chipFg,
                                )}
                                title={bloom.full}
                              >
                                {bloom.short}
                              </span>
                            ) : (
                              <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[9.5px] font-bold text-slate-500">
                                CHUNG
                              </span>
                            )}
                          </div>
                          <p
                            className={cn(
                              "mt-1 text-[12.5px] font-medium leading-snug",
                              !bloom && "italic text-muted-foreground",
                            )}
                          >
                            {g.label}
                          </p>
                        </div>

                        {/* PHẢI — chọn bao nhiêu câu vào khung, cùng hàng */}
                        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5">
                          {partsOfGroup.map(({ partId, questions }) => {
                            const kept = keptCount(questions);
                            const cap = questions.length;
                            return (
                              <div
                                key={partId}
                                className="flex items-center gap-1.5 rounded-md border bg-card px-1.5 py-1"
                                title={`Có ${cap} câu dạng ${PART_SHORT[partId] ?? partId} — chọn tối đa ${cap}`}
                              >
                                <span className="text-[10.5px] font-medium text-muted-foreground">
                                  {PART_SHORT[partId] ?? partId}
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
                                  className={cn(
                                    "h-7 w-12 rounded border bg-card px-1 text-center text-[12.5px] font-semibold tabular-nums",
                                    kept === 0 && "text-muted-foreground",
                                  )}
                                />
                                <span className="text-[11px] font-semibold text-emerald-700">
                                  /{cap}
                                </span>
                              </div>
                            );
                          })}
                          <span
                            className={cn(
                              "shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                              n === 0
                                ? "bg-muted text-muted-foreground"
                                : n === total
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-amber-50 text-amber-700",
                            )}
                            title="Số câu vào khung / tổng số câu trong kho"
                          >
                            {n}/{total}
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
                            Xem {total}
                          </button>
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
  autoParts,
  uncoveredParts,
}: {
  rows: MatrixRow[];
  enabledParts: YccdPart[];
  inventory: Record<string, number>;
  cells: Record<string, number>;
  pointsByPart: Record<string, number>;
  onCellChange: (t: string, p: string, b: number, v: number) => void;
  validation: { ok: boolean; exceeded: unknown[] };
  totalQ: number;
  autoParts: YccdPart[];
  uncoveredParts: YccdPart[];
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
          enabledParts.map((p) => {
            const auto = autoParts.some((a) => a.id === p.id);
            return (
              <span
                key={p.id}
                title={
                  auto
                    ? "Phần này chưa có trong cấu hình đã lưu — tự thêm vì khung đề có dạng câu đó."
                    : undefined
                }
                className={cn(
                  "rounded-full border px-3 py-1 text-[12px] font-medium",
                  auto
                    ? "border-amber-300 bg-amber-50 text-amber-800"
                    : "border-primary bg-primary/10 text-primary",
                )}
              >
                {auto ? "+ " : "✓ "}
                {p.label}
              </span>
            );
          })
        )}
      </div>

      {/* Cấu hình phần lưu theo Môn+Khối có thể thiếu dạng câu đang có trong
          khung. Trước đây những câu đó rơi khỏi ma trận không một lời nào. */}
      {autoParts.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Khung đề có dạng câu chưa được gán vào phần nào trong cấu hình đã lưu
            của Môn + Khối này:{" "}
            <b>{autoParts.map((p) => p.label).join(", ")}</b>. Đã tự thêm phần
            tương ứng để những câu này không bị rơi khỏi đề — sang{" "}
            <b>bước ④</b> nếu muốn đổi tên phần, thứ tự hoặc điểm/câu, rồi bấm
            “Lưu cấu hình cho Môn+Khối”.
          </span>
        </div>
      )}

      {/* Người dùng đã tự xoá phần ở bước ④ — tôn trọng, nhưng nói rõ hậu quả. */}
      {uncoveredParts.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-[12px] text-rose-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Khung đề đang có câu dạng{" "}
            <b>{uncoveredParts.map((p) => p.label).join(", ")}</b> nhưng không
            phần nào nhận dạng này — những câu đó <b>sẽ không vào đề</b>. Thêm
            lại phần ở <b>bước ④</b>, hoặc bỏ các câu đó ra ở <b>bước ②</b>.
          </span>
        </div>
      )}

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
/**
 * Dạng câu (question-type categories) — đơn vị kéo–thả vào từng Phần. Mỗi dạng
 * gộp các QuestionType tương đương; một dạng chỉ thuộc đúng một Phần.
 */
const DANG_CATEGORIES: { key: string; label: string; types: QuestionType[] }[] = [
  { key: "mcq", label: "Nhiều lựa chọn", types: ["mcq-single", "mcq-multi"] },
  { key: "ds", label: "Đúng – Sai", types: ["multi-tf"] },
  { key: "short", label: "Trả lời ngắn", types: ["short-answer"] },
  { key: "tl", label: "Tự luận", types: ["essay", "ai-generated"] },
];
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
const romanOf = (i: number) => ROMAN[i] ?? String(i + 1);

/**
 * Trình biên tập cấu trúc phần: đặt tên Phần I/II/…, kéo–thả (hoặc bấm) dạng
 * câu vào từng phần, thêm/xoá/đổi thứ tự. Mỗi dạng thuộc đúng một phần.
 */
function PartStructureEditor({
  parts,
  onChange,
  poolTypes,
}: {
  parts: YccdPart[];
  onChange: (parts: YccdPart[]) => void;
  poolTypes: Set<QuestionType>;
}) {
  const [dragCat, setDragCat] = useState<string | null>(null);
  const [dragOverPart, setDragOverPart] = useState<string | null>(null);

  const catInPart = (p: YccdPart, cat: (typeof DANG_CATEGORIES)[number]) =>
    cat.types.some((t) => p.questionTypes.includes(t));
  const assignedCats = (p: YccdPart) => DANG_CATEGORIES.filter((c) => catInPart(p, c));
  const unassigned = DANG_CATEGORIES.filter((c) => !parts.some((p) => catInPart(p, c)));

  const assign = (catKey: string, partId: string) => {
    const cat = DANG_CATEGORIES.find((c) => c.key === catKey);
    if (!cat) return;
    onChange(
      parts.map((p) => {
        let qts = p.questionTypes.filter((t) => !cat.types.includes(t));
        if (p.id === partId) qts = [...qts, ...cat.types];
        return { ...p, questionTypes: qts };
      }),
    );
  };
  const unassign = (catKey: string) => {
    const cat = DANG_CATEGORIES.find((c) => c.key === catKey);
    if (!cat) return;
    onChange(
      parts.map((p) => ({
        ...p,
        questionTypes: p.questionTypes.filter((t) => !cat.types.includes(t)),
      })),
    );
  };
  const rename = (partId: string, label: string) =>
    onChange(parts.map((p) => (p.id === partId ? { ...p, label } : p)));
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= parts.length) return;
    const next = [...parts];
    [next[idx], next[j]] = [next[j]!, next[idx]!];
    onChange(next);
  };
  const remove = (partId: string) => onChange(parts.filter((p) => p.id !== partId));
  const add = () => {
    const nums = parts.map((p) => Number(/^p-(\d+)$/.exec(p.id)?.[1] ?? 0));
    const id = `p-${Math.max(0, ...nums) + 1}`;
    onChange([...parts, { id, label: `Phần ${romanOf(parts.length)}`, questionTypes: [] }]);
  };

  const catChip = (
    c: (typeof DANG_CATEGORIES)[number],
    opts: { onRemove?: () => void },
  ) => (
    <span
      key={c.key}
      draggable
      onDragStart={() => setDragCat(c.key)}
      onDragEnd={() => {
        setDragCat(null);
        setDragOverPart(null);
      }}
      className="inline-flex cursor-grab items-center gap-1 rounded-md border bg-slate-50 px-2 py-0.5 text-[11.5px] font-medium text-slate-700 active:cursor-grabbing"
      title="Kéo sang phần khác"
    >
      {c.label}
      {c.types.some((t) => poolTypes.has(t)) ? null : (
        <span className="text-[9.5px] text-muted-foreground/70">· kho trống</span>
      )}
      {opts.onRemove && (
        <button
          type="button"
          onClick={opts.onRemove}
          className="ml-0.5 text-muted-foreground hover:text-red-600"
          title="Gỡ khỏi phần"
        >
          ×
        </button>
      )}
    </span>
  );

  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between border-b bg-surface-2 px-3 py-2">
        <span className="text-[12px] font-semibold">
          Cấu trúc phần (Phần I/II/…) — kéo hoặc bấm gán dạng câu
        </span>
        <button
          type="button"
          onClick={add}
          className="rounded-md border bg-card px-2 py-1 text-[11.5px] font-semibold text-primary hover:bg-surface-2"
        >
          + Thêm phần
        </button>
      </div>
      <div className="space-y-2 p-3">
        {parts.map((p, idx) => (
          <div
            key={p.id}
            onDragOver={(e) => {
              if (dragCat) {
                e.preventDefault();
                setDragOverPart(p.id);
              }
            }}
            onDragLeave={() => setDragOverPart((cur) => (cur === p.id ? null : cur))}
            onDrop={() => {
              if (dragCat) assign(dragCat, p.id);
              setDragCat(null);
              setDragOverPart(null);
            }}
            className={cn(
              "rounded-md border bg-card p-2 transition",
              dragOverPart === p.id && "border-primary ring-2 ring-primary/30",
            )}
          >
            <div className="flex items-center gap-2">
              <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                Phần {romanOf(idx)}
              </span>
              <input
                value={p.label}
                onChange={(e) => rename(p.id, e.target.value)}
                placeholder={`Phần ${romanOf(idx)}`}
                className="h-8 flex-1 rounded-md border bg-card px-2 text-[12.5px]"
              />
              <button
                type="button"
                onClick={() => move(idx, -1)}
                disabled={idx === 0}
                className="rounded border bg-card px-1.5 py-1 text-[11px] disabled:opacity-30"
                title="Lên"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(idx, 1)}
                disabled={idx === parts.length - 1}
                className="rounded border bg-card px-1.5 py-1 text-[11px] disabled:opacity-30"
                title="Xuống"
              >
                ↓
              </button>
              {parts.length > 1 && (
                <button
                  type="button"
                  onClick={() => remove(p.id)}
                  className="rounded border bg-card px-2 py-1 text-[11px] text-red-600 hover:bg-red-50"
                >
                  Xoá
                </button>
              )}
            </div>
            <div className="mt-2 flex min-h-[30px] flex-wrap items-center gap-1.5 rounded-md border border-dashed bg-surface-2/30 px-2 py-1.5">
              {assignedCats(p).length === 0 ? (
                <span className="text-[11px] italic text-muted-foreground">
                  Kéo/bấm dạng câu vào phần này…
                </span>
              ) : (
                assignedCats(p).map((c) => catChip(c, { onRemove: () => unassign(c.key) }))
              )}
              {unassigned.length > 0 && (
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) assign(e.target.value, p.id);
                  }}
                  className="h-6 rounded border bg-card px-1 text-[11px] text-primary"
                  title="Thêm dạng câu vào phần"
                >
                  <option value="">+ dạng…</option>
                  {unassigned.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        ))}
      </div>
      {unassigned.length > 0 && (
        <div
          className="border-t px-3 py-2"
          onDragOver={(e) => {
            if (dragCat) e.preventDefault();
          }}
          onDrop={() => {
            if (dragCat) unassign(dragCat);
            setDragCat(null);
            setDragOverPart(null);
          }}
        >
          <p className="mb-1 text-[11px] text-muted-foreground">
            Dạng câu chưa xếp phần (kéo vào phần ở trên hoặc dùng “+ dạng…”):
          </p>
          <div className="flex flex-wrap gap-1.5">
            {unassigned.map((c) => catChip(c, {}))}
          </div>
        </div>
      )}
    </div>
  );
}

function StepStructure({
  parts,
  onPartsChange,
  poolTypes,
  onSaveConfig,
  savedConfigAt,
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
  parts: YccdPart[];
  onPartsChange: (next: YccdPart[]) => void;
  poolTypes: Set<QuestionType>;
  onSaveConfig: () => void;
  savedConfigAt: string | null;
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
  // Chế độ chấm theo dạng câu THỰC SỰ có trong phần (không theo id phần cứng).
  const hasType = (t: QuestionType) =>
    enabledParts.some((p) => p.questionTypes.includes(t));
  const [savedTick, setSavedTick] = useState(false);
  // Chỉnh gì đó sau khi lưu → tắt dấu "đã lưu" để nhắc lưu lại.
  useEffect(() => {
    setSavedTick(false);
  }, [parts, pointsByPart, mcqMultiMode, dsMode, dsTable, orderStrategy, duration]);
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

      {/* Cấu trúc phần (tuỳ biến Phần I/II/…) */}
      <PartStructureEditor parts={parts} onChange={onPartsChange} poolTypes={poolTypes} />

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed bg-surface-2/40 px-3 py-2">
        <button
          type="button"
          onClick={() => {
            onSaveConfig();
            setSavedTick(true);
          }}
          className="rounded-md bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground hover:opacity-90"
        >
          Lưu cấu hình cho Môn + Khối
        </button>
        <span className="text-[11.5px] text-muted-foreground">
          {savedTick
            ? "✓ Đã lưu — lần sau mở wizard sẽ tự nạp lại; ca thi khoá theo cài đặt này."
            : savedConfigAt
              ? `Đã có bản lưu (cập nhật ${new Date(savedConfigAt).toLocaleString("vi-VN")}). Lưu để cập nhật.`
              : "Chưa có bản lưu cho Môn+Khối này — cấu hình tên phần, dạng câu, điểm & cách chấm rồi bấm Lưu."}
        </span>
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
      {hasType("mcq-multi") && (
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
      {hasType("multi-tf") && (
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
          <p className="text-[15px] font-bold text-emerald-800">
            ✓ Đã lưu &amp; gửi duyệt
          </p>
          <p className="mt-1 text-[12.5px] text-emerald-700">
            {drafts.length} mã đề đã vào kho “Đề đã sinh”.
          </p>
          <p className="mt-1 text-[12.5px] font-medium text-amber-700">
            Đề đang ở trạng thái <span className="font-bold">Chờ duyệt</span> —
            phải được duyệt thì ca thi mới chọn được.
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <Link
              href="/admin/approvals"
              className="rounded-md border bg-card px-3 py-1.5 text-[12.5px] font-semibold text-primary hover:bg-surface-2"
            >
              → Duyệt đề
            </Link>
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
