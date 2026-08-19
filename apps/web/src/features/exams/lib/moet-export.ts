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

export interface MatrixRowOut {
  chapterName: string | null;
  topicName: string;
  /** partId → bloom → số đơn vị. */
  counts: Record<string, Record<number, number>>;
  total: number;
}

export interface MatrixTableOut {
  parts: YccdPart[];
  rows: MatrixRowOut[];
  /** Cộng theo cột: partId → bloom → tổng. */
  columnTotals: Record<string, Record<number, number>>;
  grandTotal: number;
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
): MatrixTableOut {
  const columnTotals: Record<string, Record<number, number>> = {};
  for (const p of matrix.parts) columnTotals[p.id] = { 1: 0, 2: 0, 3: 0 };

  const rows: MatrixRowOut[] = matrix.rows.map((r) => {
    const counts: Record<string, Record<number, number>> = {};
    let total = 0;
    for (const p of matrix.parts) {
      counts[p.id] = { 1: 0, 2: 0, 3: 0 };
      for (const b of BLOOM_ORDER) {
        const n =
          matrix.cells.find(
            (c) => c.topicId === r.topicId && c.partId === p.id && c.bloom === b,
          )?.count ?? 0;
        counts[p.id][b] = n;
        columnTotals[p.id][b] += n;
        total += n;
      }
    }
    return {
      chapterName: r.chapterId ? nameOfCompetency(r.chapterId) : null,
      topicName: nameOfCompetency(r.topicId),
      counts,
      total,
    };
  });

  const grandTotal = rows.reduce((s, r) => s + r.total, 0);
  return { parts: matrix.parts, rows, columnTotals, grandTotal };
}

export interface SpecRowOut {
  /** Mã YCCĐ, vd SI10.02.15.D01. */
  code: string;
  title: string;
  bloom: BloomLevel | null;
  /** Mã câu trong đề, vd "I.3" (phần I, câu 3). */
  questionRefs: string[];
}

/**
 * Bản đặc tả: mỗi YCCĐ ra những câu nào trong đề.
 *
 * Đây là thứ Sở đối chiếu — "đề này phủ những chuẩn đầu ra nào, mỗi chuẩn mấy
 * câu". Câu không gắn YCCĐ vẫn được liệt kê dưới nhóm "(chưa gắn YCCĐ)" thay
 * vì bỏ đi: một đề có câu chưa gắn chuẩn là điều người duyệt cần thấy.
 */
export function buildSpecRows(
  blocks: readonly ExamPartBlock[],
  competencyById: (id: string) => { code?: string | null; title: string; bloomLevel?: BloomLevel | null } | undefined,
): SpecRowOut[] {
  const byCompetency = new Map<string, SpecRowOut>();
  const chuaGan: string[] = [];

  blocks.forEach((block, bi) => {
    const partLabel = roman(bi + 1);
    for (const it of block.items) {
      const ref = `${partLabel}.${it.indexInPart}`;
      const ids = it.question.competencyIds ?? [];
      if (ids.length === 0) {
        chuaGan.push(ref);
        continue;
      }
      for (const id of ids) {
        const c = competencyById(id);
        const key = c?.code || id;
        const row =
          byCompetency.get(key) ??
          {
            code: c?.code || "(không có mã)",
            title: c?.title ?? id,
            bloom: c?.bloomLevel ?? null,
            questionRefs: [],
          };
        row.questionRefs.push(ref);
        byCompetency.set(key, row);
      }
    }
  });

  const rows = [...byCompetency.values()].sort((a, b) =>
    a.code.localeCompare(b.code, "vi"),
  );
  if (chuaGan.length > 0) {
    rows.push({
      code: "—",
      title: "(chưa gắn YCCĐ)",
      bloom: null,
      questionRefs: chuaGan,
    });
  }
  return rows;
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
