/**
 * Đổ dữ liệu MOET ra file Word.
 *
 * Phần TÍNH số liệu nằm ở `moet-export.ts` (thuần, có test). File này chỉ lo
 * bày lên giấy — tách vậy để lỗi số liệu không lẫn với lỗi định dạng.
 *
 * `docx` được nạp ĐỘNG (`await import`) ngay trong hàm: thư viện nặng vài trăm
 * KB và chỉ dùng lúc người ta bấm Tải về. Nạp tĩnh là bắt mọi người vào trang
 * đều tải nó, kể cả người không bao giờ xuất file.
 */

import type { BloomLevel } from "@/features/competencies/data/types";
import type { Question } from "@/features/question-bank/data/seed-questions";

import type { ScoringPolicy, YccdMatrix } from "../data/types";

import {
  BLOOM_LABEL,
  BLOOM_ORDER,
  buildMatrixTable,
  buildSpecRows,
  optionLabel,
  roman,
  round2,
  splitIntoParts,
  unitsOf,
  type ExamPartBlock,
} from "./moet-export";

export interface ExamDocMeta {
  schoolName: string;
  examName: string;
  subjectName: string;
  gradeName: string;
  durationMinutes: number;
  /** Mã đề in ở góc, vd "Đề 001". */
  code: string;
}

/** Bỏ cú pháp nội bộ để chữ trong Word đọc được như người soạn nhìn thấy. */
function plainText(s: string): string {
  return String(s ?? "")
    .replace(/\$\$([\s\S]*?)\$\$/g, "$1")
    .replace(/\$([^$\n]+)\$/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "[hình]")
    .replace(/\[(video|audio):[^\]]+\]/g, "[$1]")
    .replace(/\[u:([^\]]*)\]/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * ĐỀ THI — bố cục Phần I / II / III theo cấu hình phần của gói đề.
 *
 * Không in đáp án. Đề phát cho học sinh mà kèm đáp án là hỏng cả kỳ thi, nên
 * đây là mặc định và không có tuỳ chọn nào bật nó lên ở đây.
 */
export async function buildExamDocx(args: {
  meta: ExamDocMeta;
  questionIds: readonly string[];
  questionById: ReadonlyMap<string, Question>;
  matrix: YccdMatrix;
}): Promise<Blob> {
  const d = await import("docx");
  const { blocks, leftover } = splitIntoParts(
    args.questionIds,
    args.questionById,
    args.matrix.parts,
  );

  const P = (text: string, o: Record<string, unknown> = {}) =>
    new d.Paragraph({ children: [new d.TextRun({ text, ...o })] });
  const center = (text: string, o: Record<string, unknown> = {}) =>
    new d.Paragraph({
      alignment: d.AlignmentType.CENTER,
      children: [new d.TextRun({ text, ...o })],
    });

  const body: InstanceType<typeof d.Paragraph>[] = [
    center(args.meta.schoolName.toUpperCase(), { bold: true }),
    center("ĐỀ KIỂM TRA", { bold: true, size: 28 }),
    center(`${args.meta.subjectName} — ${args.meta.gradeName}`, { bold: true }),
    center(`Thời gian làm bài: ${args.meta.durationMinutes} phút`, { italics: true }),
    center(`Mã đề: ${args.meta.code}`, { bold: true }),
    new d.Paragraph({ children: [] }),
    P("Họ và tên thí sinh: ......................................................  Số báo danh: ....................."),
    new d.Paragraph({ children: [] }),
  ];

  blocks.forEach((block, bi) => {
    if (block.items.length === 0) return;
    const donVi = block.items.reduce((s, it) => s + unitsOf(it.question), 0);
    body.push(
      P(
        `PHẦN ${roman(bi + 1)}. ${block.part.label.toUpperCase()} ` +
          `(${block.items.length} câu — ${round2(block.points)} điểm)`,
        { bold: true },
      ),
    );
    if (block.part.questionTypes.includes("multi-tf")) {
      body.push(
        P(
          `Thí sinh trả lời từ câu 1 đến câu ${block.items.length}. ` +
            `Trong mỗi ý a), b), c), d) chọn đúng hoặc sai. (${donVi} ý)`,
          { italics: true },
        ),
      );
    }
    body.push(new d.Paragraph({ children: [] }));

    for (const it of block.items) {
      const q = it.question;
      body.push(P(`Câu ${it.indexInPart}. ${plainText(q.content)}`, { bold: false }));
      if (q.type === "mcq-single" || q.type === "mcq-multi") {
        (q.options ?? []).forEach((o, i) =>
          body.push(P(`   ${optionLabel(i)}. ${plainText(o.content)}`)),
        );
      } else if (q.type === "multi-tf") {
        (q.subQuestions ?? []).forEach((sq, i) =>
          body.push(P(`   ${String.fromCharCode(97 + i)}) ${plainText(sq.statement)}`)),
        );
      } else if (q.type === "short-answer") {
        body.push(P("   Trả lời: ......................................................"));
      } else {
        body.push(P("   ......................................................"));
      }
      body.push(new d.Paragraph({ children: [] }));
    }
  });

  if (leftover.length > 0) {
    // Không im lặng bỏ câu. Đề in thiếu là thứ phải thấy TRƯỚC khi phát đề.
    body.push(
      P(
        `⚠ ${leftover.length} câu không thuộc phần nào trong cấu hình đề — kiểm lại cấu hình phần ở bước ④.`,
        { bold: true, color: "B91C1C" },
      ),
    );
  }
  body.push(center("--- HẾT ---", { bold: true }));

  const doc = new d.Document({ sections: [{ children: body }] });
  return d.Packer.toBlob(doc);
}

/**
 * MA TRẬN + BẢN ĐẶC TẢ + QUY ĐỊNH ĐIỂM — ba bảng trong một file.
 *
 * Đây là bộ Sở đối chiếu, và `FSC_TaoDe_YCCD_SPEC.md` chốt đúng ba phần này.
 */
export async function buildMatrixDocx(args: {
  meta: Omit<ExamDocMeta, "code" | "durationMinutes"> & { durationMinutes: number };
  matrix: YccdMatrix;
  scoring: ScoringPolicy | null;
  nameOfCompetency: (id: string) => string;
  competencyById: (
    id: string,
  ) => { code?: string | null; title: string; bloomLevel?: BloomLevel | null } | undefined;
  /** Mã đề mẫu để dựng bản đặc tả — thường lấy mã đề đầu tiên của gói. */
  sampleQuestionIds: readonly string[];
  questionById: ReadonlyMap<string, Question>;
}): Promise<Blob> {
  const d = await import("docx");
  const table = buildMatrixTable(args.matrix, args.nameOfCompetency);
  const { blocks } = splitIntoParts(
    args.sampleQuestionIds,
    args.questionById,
    args.matrix.parts,
  );
  const specRows = buildSpecRows(blocks, args.competencyById);

  const cell = (text: string, o: { bold?: boolean; span?: number } = {}) =>
    new d.TableCell({
      columnSpan: o.span,
      children: [
        new d.Paragraph({
          alignment: d.AlignmentType.CENTER,
          children: [new d.TextRun({ text, bold: o.bold })],
        }),
      ],
    });
  const cellL = (text: string, o: { bold?: boolean } = {}) =>
    new d.TableCell({
      children: [new d.Paragraph({ children: [new d.TextRun({ text, bold: o.bold })] })],
    });
  const center = (text: string, o: Record<string, unknown> = {}) =>
    new d.Paragraph({
      alignment: d.AlignmentType.CENTER,
      children: [new d.TextRun({ text, ...o })],
    });
  const P = (text: string, o: Record<string, unknown> = {}) =>
    new d.Paragraph({ children: [new d.TextRun({ text, ...o })] });

  // ── Bảng 1: ma trận ─────────────────────────────────────────────────────
  const head1 = new d.TableRow({
    children: [
      cell("TT", { bold: true }),
      cell("Chương / Chủ đề", { bold: true }),
      cell("Bài / Nội dung", { bold: true }),
      ...table.parts.map((p) => cell(p.label, { bold: true, span: 3 })),
      cell("Tổng", { bold: true }),
    ],
  });
  const head2 = new d.TableRow({
    children: [
      cell(""),
      cell(""),
      cell(""),
      ...table.parts.flatMap(() =>
        BLOOM_ORDER.map((b) => cell(BLOOM_LABEL[b], { bold: true })),
      ),
      cell(""),
    ],
  });
  const bodyRows = table.rows.map(
    (r, i) =>
      new d.TableRow({
        children: [
          cell(String(i + 1)),
          cellL(r.chapterName ?? "—"),
          cellL(r.topicName),
          ...table.parts.flatMap((p) =>
            BLOOM_ORDER.map((b) => cell(String(r.counts[p.id]?.[b] ?? 0))),
          ),
          cell(String(r.total), { bold: true }),
        ],
      }),
  );
  const totalRow = new d.TableRow({
    children: [
      cell("", { bold: true }),
      cell("TỔNG", { bold: true, span: 2 }),
      ...table.parts.flatMap((p) =>
        BLOOM_ORDER.map((b) => cell(String(table.columnTotals[p.id]?.[b] ?? 0), { bold: true })),
      ),
      cell(String(table.grandTotal), { bold: true }),
    ],
  });

  // ── Bảng 2: bản đặc tả ──────────────────────────────────────────────────
  const specTable = new d.Table({
    width: { size: 100, type: d.WidthType.PERCENTAGE },
    rows: [
      new d.TableRow({
        children: [
          cell("Mã YCCĐ", { bold: true }),
          cell("Yêu cầu cần đạt", { bold: true }),
          cell("Mức độ", { bold: true }),
          cell("Câu trong đề", { bold: true }),
          cell("Số câu", { bold: true }),
        ],
      }),
      ...specRows.map(
        (r) =>
          new d.TableRow({
            children: [
              cellL(r.code),
              cellL(r.title),
              cell(r.bloom ? BLOOM_LABEL[r.bloom] : "—"),
              cellL(r.questionRefs.join(", ")),
              cell(String(r.questionRefs.length)),
            ],
          }),
      ),
    ],
  });

  const children: Array<InstanceType<typeof d.Paragraph> | InstanceType<typeof d.Table>> = [
    center(args.meta.schoolName.toUpperCase(), { bold: true }),
    center("MA TRẬN VÀ BẢN ĐẶC TẢ ĐỀ KIỂM TRA", { bold: true, size: 28 }),
    center(`${args.meta.subjectName} — ${args.meta.gradeName}`, { bold: true }),
    center(`Thời gian làm bài: ${args.meta.durationMinutes} phút`, { italics: true }),
    new d.Paragraph({ children: [] }),
    P("I. MA TRẬN ĐỀ KIỂM TRA", { bold: true }),
    P(
      "Đơn vị đếm: câu. Riêng phần Đúng – Sai đếm theo Ý (một câu 4 ý tính 4 đơn vị).",
      { italics: true },
    ),
    new d.Table({
      width: { size: 100, type: d.WidthType.PERCENTAGE },
      rows: [head1, head2, ...bodyRows, totalRow],
    }),
    new d.Paragraph({ children: [] }),
    P("II. BẢN ĐẶC TẢ (YÊU CẦU CẦN ĐẠT ↔ CÂU HỎI)", { bold: true }),
    specTable,
    new d.Paragraph({ children: [] }),
    P("III. QUY ĐỊNH ĐIỂM", { bold: true }),
  ];

  const s = args.scoring;
  if (s) {
    children.push(P(`Tổng điểm toàn bài: ${s.maxScore}`));
    children.push(
      P(
        `Trắc nghiệm nhiều đáp án: ${
          s.mcqMulti === "full" ? "toàn phần (đúng hết mới có điểm)" : "từng phần"
        }`,
      ),
    );
    const dsLabel =
      s.ds === "graduated"
        ? "lũy tiến theo số ý đúng"
        : s.ds === "weighted"
          ? "theo trọng số từng ý"
          : "đúng hết mới có điểm";
    children.push(P(`Đúng – Sai: ${dsLabel}`));
    if (s.ds === "graduated" && s.dsGraduatedTable) {
      const t = Object.entries(s.dsGraduatedTable)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([k, v]) => `${k} ý đúng → ${v}`)
        .join(" · ");
      children.push(P(`   Bảng lũy tiến: ${t}`, { italics: true }));
    }
    for (const p of args.matrix.parts) {
      children.push(P(`${p.label}: ${p.pointsPerQuestion ?? 0} điểm/câu`));
    }
  } else {
    children.push(P("(Gói đề chưa chốt quy định điểm.)", { italics: true }));
  }

  const doc = new d.Document({ sections: [{ children }] });
  return d.Packer.toBlob(doc);
}

/** Đẩy Blob xuống máy người dùng. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
