/**
 * Dựng dữ liệu cho hai file Word theo mẫu Bộ GD&ĐT:
 *
 *   1. ĐỀ THI          — Phần I / II / III theo cấu hình phần của gói đề.
 *   2. MA TRẬN + BẢN ĐẶC TẢ — bảng ma trận (Bài × Phần × mức Bloom) kèm bản
 *      đặc tả YCCĐ ↔ mã câu và quy định điểm.
 *
 * ── Vì sao tách khỏi chỗ dựng file ──────────────────────────────────────
 *
 * Phần khó của việc xuất Word KHÔNG phải là API của `docx` — mà là gom đúng
 * số liệu: câu nào thuộc phần nào, Đúng–Sai đếm theo Ý chứ không theo câu,
 * cột Bloom cộng lại phải khớp tổng, YCCĐ nào ra câu nào.
 *
 * Sai một chỗ ở đó thì file Word vẫn mở được, vẫn đẹp, và vẫn sai — không ai
 * phát hiện cho tới lúc đối chiếu với Sở. Nên phần tính toán nằm ở đây, thuần
 * và test được; `moet-docx.ts` chỉ đổ ra giấy.
 *
 * ── Đúng–Sai đếm theo Ý ─────────────────────────────────────────────────
 *
 * Ma trận MOET đếm câu Đúng–Sai nhiều ý theo Ý, không theo câu — một câu 4 ý
 * là 4 đơn vị. Đây là điều `FSC_TaoDe_YCCD_SPEC.md` nhấn mạnh và cũng là chỗ
 * dễ lệch nhất giữa "số câu trong đề" và "số ô trong ma trận".
 */

import type { BloomLevel } from "@/features/competencies/data/types";
import type { Question } from "@/features/question-bank/data/seed-questions";

import type { YccdMatrix, YccdPart } from "../data/types";

/** Nhãn mức nhận thức theo cách Bộ gọi. */
export const BLOOM_LABEL: Record<BloomLevel, string> = {
  1: "Biết",
  2: "Hiểu",
  3: "Vận dụng",
};
export const BLOOM_ORDER: BloomLevel[] = [1, 2, 3];

/** Một câu trong đề, đã gắn về đúng phần. */
export interface ExamItem {
  /** Số thứ tự TRONG PHẦN, bắt đầu từ 1 — đề in ra đánh số lại theo phần. */
  indexInPart: number;
  question: Question;
}

export interface ExamPartBlock {
  part: YccdPart;
  items: ExamItem[];
  /** Tổng điểm của phần = số đơn vị tính điểm × điểm mỗi câu. */
  points: number;
}

/**
 * Chia câu của một mã đề về đúng các phần.
 *
 * Câu nào không khớp phần nào (dạng câu không nằm trong `questionTypes` của
 * phần nào) rơi vào `leftover` — NÊU RA chứ không nhét bừa vào phần cuối. Đề
 * in thiếu câu là chuyện phải thấy ngay, không phải phát hiện lúc phát đề.
 */
export function splitIntoParts(
  questionIds: readonly string[],
  byId: ReadonlyMap<string, Question>,
  parts: readonly YccdPart[],
): { blocks: ExamPartBlock[]; leftover: Question[] } {
  const taken = new Set<string>();
  const blocks: ExamPartBlock[] = parts.map((part) => {
    const allowed = new Set(part.questionTypes ?? []);
    const items: ExamItem[] = [];
    for (const id of questionIds) {
      if (taken.has(id)) continue;
      const q = byId.get(id);
      if (!q || !allowed.has(q.type)) continue;
      taken.add(id);
      items.push({ indexInPart: items.length + 1, question: q });
    }
    return {
      part,
      items,
      points: round2(items.reduce((s, it) => s + unitsOf(it.question) * (part.pointsPerQuestion ?? 0), 0)),
    };
  });
  const leftover: Question[] = [];
  for (const id of questionIds) {
    if (taken.has(id)) continue;
    const q = byId.get(id);
    if (q) leftover.push(q);
  }
  return { blocks, leftover };
}

/**
 * Số ĐƠN VỊ tính của một câu.
 *
 * Đúng–Sai nhiều ý tính theo số ý; mọi dạng khác tính 1. Dùng chung cho cả
 * cộng điểm lẫn đếm ô ma trận, để hai chỗ không thể lệch nhau.
 */
export function unitsOf(q: Question): number {
  if (q.type === "multi-tf") return q.subQuestions?.length ?? 0;
  return 1;
}

/** Làm tròn 2 chữ số — điểm MOET hay ra 0.25 / 0.33. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Nhóm cột cấp trên của bảng ma trận: TNKQ và Tự luận.
 *
 * Mẫu của trường xếp "Nhiều lựa chọn" và "Đúng – Sai" nằm dưới một ô gộp
 * TNKQ, còn Tự luận đứng riêng. Ta suy nhóm từ dạng câu của phần chứ không
 * bắt người dùng khai thêm: phần nào chứa dạng tự luận thì thuộc nhóm Tự
 * luận, còn lại là TNKQ.
 */
export function groupOfPart(part: YccdPart): "TNKQ" | "Tự luận" {
  const types = part.questionTypes ?? [];
  return types.includes("essay") || types.includes("ai-generated")
    ? "Tự luận"
    : "TNKQ";
}

/** Điểm mỗi ĐƠN VỊ của phần (Đúng–Sai tính theo ý, nên đây là điểm mỗi ý). */
export function pointsPerUnit(part: YccdPart): number {
  return part.pointsPerQuestion ?? 0;
}

export interface MatrixRowOut {
  chapterName: string | null;
  topicName: string;
  /** partId → bloom → số đơn vị. */
  counts: Record<string, Record<number, number>>;
  /** Cộng ngang theo mức: bloom → tổng đơn vị của dòng (cột "Tổng" của mẫu). */
  bloomTotals: Record<number, number>;
  total: number;
  /** Điểm của dòng và tỉ lệ % trên tổng điểm toàn bài (cột cuối của mẫu). */
  points: number;
  percent: number;
}

export interface MatrixTableOut {
  parts: YccdPart[];
  rows: MatrixRowOut[];
  /** Cộng theo cột: partId → bloom → tổng. Dòng "Tổng số lệnh hỏi". */
  columnTotals: Record<string, Record<number, number>>;
  /** Tổng số lệnh hỏi theo mức, cộng ngang mọi phần. */
  bloomTotals: Record<number, number>;
  /** Điểm của từng phần — dòng "Tổng số điểm", ô gộp theo phần. */
  pointsByPart: Record<string, number>;
  /** Điểm theo mức, cộng mọi phần. */
  pointsByBloom: Record<number, number>;
  /** Tỉ lệ % theo phần và theo mức — dòng "Tỉ lệ %". */
  percentByPart: Record<string, number>;
  percentByBloom: Record<number, number>;
  grandTotal: number;
  totalPoints: number;
}

/**
 * Bảng ma trận để in.
 *
 * Đọc thẳng `matrix.cells` (số đã chốt lúc tạo gói) chứ không đếm lại từ câu
 * trong mã đề: ma trận là CAM KẾT của gói đề, mọi mã đề sinh ra phải khớp nó.
 * In lại từ câu thực tế thì mỗi mã đề ra một ma trận khác nhau, mà đó đúng là
 * thứ ma trận sinh ra để ngăn.
 */
export function buildMatrixTable(
  matrix: YccdMatrix,
  nameOfCompetency: (id: string) => string,
  /** Tổng điểm toàn bài — để tính cột "Tỉ lệ % điểm". Mặc định 10 như MOET. */
  maxScore = 10,
): MatrixTableOut {
  const columnTotals: Record<string, Record<number, number>> = {};
  const pointsByPart: Record<string, number> = {};
  for (const p of matrix.parts) {
    columnTotals[p.id] = { 1: 0, 2: 0, 3: 0 };
    pointsByPart[p.id] = 0;
  }
  const bloomTotals: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
  const pointsByBloom: Record<number, number> = { 1: 0, 2: 0, 3: 0 };

  const rows: MatrixRowOut[] = matrix.rows.map((r) => {
    const counts: Record<string, Record<number, number>> = {};
    const rowBloom: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
    let total = 0;
    let points = 0;
    for (const p of matrix.parts) {
      counts[p.id] = { 1: 0, 2: 0, 3: 0 };
      const per = pointsPerUnit(p);
      for (const b of BLOOM_ORDER) {
        const n =
          matrix.cells.find(
            (c) => c.topicId === r.topicId && c.partId === p.id && c.bloom === b,
          )?.count ?? 0;
        counts[p.id][b] = n;
        columnTotals[p.id][b] += n;
        bloomTotals[b] += n;
        rowBloom[b] += n;
        total += n;
        points += n * per;
        pointsByPart[p.id] += n * per;
        pointsByBloom[b] += n * per;
      }
    }
    return {
      chapterName: r.chapterId ? nameOfCompetency(r.chapterId) : null,
      topicName: nameOfCompetency(r.topicId),
      counts,
      bloomTotals: rowBloom,
      total,
      points: round2(points),
      percent: maxScore > 0 ? round2((points / maxScore) * 100) : 0,
    };
  });

  const totalPoints = round2(
    Object.values(pointsByPart).reduce((s, v) => s + v, 0),
  );
  const pct = (v: number) => (maxScore > 0 ? round2((v / maxScore) * 100) : 0);
  const percentByPart: Record<string, number> = {};
  for (const p of matrix.parts) {
    pointsByPart[p.id] = round2(pointsByPart[p.id]);
    percentByPart[p.id] = pct(pointsByPart[p.id]);
  }
  const percentByBloom: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
  for (const b of BLOOM_ORDER) {
    pointsByBloom[b] = round2(pointsByBloom[b]);
    percentByBloom[b] = pct(pointsByBloom[b]);
  }

  return {
    parts: matrix.parts,
    rows,
    columnTotals,
    bloomTotals,
    pointsByPart,
    pointsByBloom,
    percentByPart,
    percentByBloom,
    grandTotal: rows.reduce((s, r) => s + r.total, 0),
    totalPoints,
  };
}

/**
 * Mã câu theo cách mẫu của trường ghi.
 *
 *   Nhiều lựa chọn : C1, C2        (số thứ tự câu trong phần)
 *   Đúng – Sai     : C1.a,b        (số câu + chữ cái của Ý)
 *   Tự luận        : C1.TL
 *
 * Ý của một câu Đúng–Sai có thể nằm ở BA mức khác nhau (a,b ở Biết; c ở Hiểu;
 * d ở Vận dụng) — mẫu ghi đúng như vậy. Nên mã câu phải xuống được tới từng ý,
 * không dừng ở cấp câu.
 */
export function refOfQuestion(
  part: YccdPart,
  indexInPart: number,
  subLetters?: string[],
): string {
  const g = groupOfPart(part);
  if (g === "Tự luận") return `C${indexInPart}.TL`;
  if (subLetters && subLetters.length > 0) {
    return `C${indexInPart}.${subLetters.join(",")}`;
  }
  return `C${indexInPart}`;
}

/** Chữ cái của ý thứ i: a, b, c, d… */
export function subLetter(i: number): string {
  return String.fromCharCode(97 + i);
}

/** Một ô trong bảng đặc tả: partId + bloom → những mã câu nằm ở đó. */
export interface SpecCellRefs {
  [partId: string]: { [bloom: number]: string[] };
}

export interface SpecBlockOut {
  chapterName: string | null;
  topicName: string;
  /** Ba dòng con: Biết / Hiểu / Vận dụng. */
  levels: Array<{
    bloom: BloomLevel;
    /** Nội dung YCCĐ ở mức này, mỗi dòng một yêu cầu. */
    outcomes: string[];
    refs: SpecCellRefs;
  }>;
}

/**
 * Bảng ĐẶC TẢ theo mẫu: mỗi Bài một khối, trong khối tách ba mức Biết / Hiểu /
 * Vận dụng; cột "Yêu cầu cần đạt" là nội dung YCCĐ ở mức đó, các cột còn lại
 * điền MÃ CÂU.
 *
 * Mức của một ô lấy theo mức của YCCĐ mà câu (hoặc ý) gắn vào — không lấy theo
 * `difficulty` của câu. Hai trục đó khác nhau: `difficulty` là độ khó, còn ma
 * trận MOET đi theo mức nhận thức. Nhầm hai cái là bản đặc tả lệch khỏi ma
 * trận mà nhìn vẫn hợp lý.
 */
export function buildSpecTable(
  blocks: readonly ExamPartBlock[],
  matrix: YccdMatrix,
  ctx: {
    nameOf: (id: string) => string;
    competencyById: (
      id: string,
    ) => { title: string; bloomLevel?: BloomLevel | null; parentId?: string | null } | undefined;
    /** Bài (topic) chứa một YCCĐ — lần theo parentId tới node có trong matrix.rows. */
    topicOf: (competencyId: string) => string | null;
  },
): SpecBlockOut[] {
  const topicIds = matrix.rows.map((r) => r.topicId);
  const emptyRefs = (): SpecCellRefs => {
    const o: SpecCellRefs = {};
    for (const p of matrix.parts) o[p.id] = { 1: [], 2: [], 3: [] };
    return o;
  };

  const byTopic = new Map<string, SpecBlockOut>();
  for (const r of matrix.rows) {
    byTopic.set(r.topicId, {
      chapterName: r.chapterId ? ctx.nameOf(r.chapterId) : null,
      topicName: ctx.nameOf(r.topicId),
      levels: BLOOM_ORDER.map((b) => ({ bloom: b, outcomes: [], refs: emptyRefs() })),
    });
  }

  const addOutcome = (topicId: string, bloom: BloomLevel, text: string) => {
    const lvl = byTopic.get(topicId)?.levels.find((l) => l.bloom === bloom);
    if (lvl && text && !lvl.outcomes.includes(text)) lvl.outcomes.push(text);
  };
  const addRef = (
    topicId: string,
    bloom: BloomLevel,
    partId: string,
    ref: string,
  ) => {
    const lvl = byTopic.get(topicId)?.levels.find((l) => l.bloom === bloom);
    if (lvl && !lvl.refs[partId]?.[bloom].includes(ref)) lvl.refs[partId]?.[bloom].push(ref);
  };

  for (const block of blocks) {
    for (const it of block.items) {
      const q = it.question;
      // Đúng–Sai: từng Ý có thể gắn YCCĐ riêng và nằm ở mức khác nhau.
      if (q.type === "multi-tf" && (q.subQuestions?.length ?? 0) > 0) {
        const byKey = new Map<string, { topicId: string; bloom: BloomLevel; letters: string[] }>();
        (q.subQuestions ?? []).forEach((sq, i) => {
          const cid = sq.competencyId ?? q.competencyIds?.[0] ?? null;
          const c = cid ? ctx.competencyById(cid) : undefined;
          const topicId = cid ? ctx.topicOf(cid) : null;
          if (!topicId || !topicIds.includes(topicId)) return;
          const bloom = (c?.bloomLevel ?? 1) as BloomLevel;
          if (c?.title) addOutcome(topicId, bloom, c.title);
          const key = `${topicId}|${bloom}`;
          const acc = byKey.get(key) ?? { topicId, bloom, letters: [] };
          acc.letters.push(subLetter(i));
          byKey.set(key, acc);
        });
        for (const { topicId, bloom, letters } of byKey.values()) {
          addRef(topicId, bloom, block.part.id, refOfQuestion(block.part, it.indexInPart, letters));
        }
        continue;
      }
      for (const cid of q.competencyIds ?? []) {
        const c = ctx.competencyById(cid);
        const topicId = ctx.topicOf(cid);
        if (!topicId || !topicIds.includes(topicId)) continue;
        const bloom = (c?.bloomLevel ?? 1) as BloomLevel;
        if (c?.title) addOutcome(topicId, bloom, c.title);
        addRef(topicId, bloom, block.part.id, refOfQuestion(block.part, it.indexInPart));
      }
    }
  }
  return matrix.rows.map((r) => byTopic.get(r.topicId)!).filter(Boolean);
}

/** Số La Mã cho nhãn phần: I, II, III… */
export function roman(n: number): string {
  const map: Array<[number, string]> = [
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let out = "";
  let left = n;
  for (const [v, s] of map) {
    while (left >= v) {
      out += s;
      left -= v;
    }
  }
  return out || "I";
}

/** Nhãn A/B/C/D cho phương án trắc nghiệm. */
export function optionLabel(i: number): string {
  return String.fromCharCode(65 + i);
}
