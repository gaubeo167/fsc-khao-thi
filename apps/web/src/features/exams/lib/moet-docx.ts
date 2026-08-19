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

import type { ScoringPolicy, YccdMatrix, YccdPart } from "../data/types";

import {
  BLOOM_LABEL,
  BLOOM_ORDER,
  buildMatrixTable,
  buildSpecTable,
  groupOfPart,
  optionLabel,
  roman,
  round2,
  examTitleParts,
  splitIntoParts,
  stripAnswerArtifacts,
  subLetter,
} from "./moet-export";

/**
 * Chỗ hệ thống KHÔNG có dữ liệu — in dấu chấm để đơn vị tự điền trong Word.
 *
 * Sở GD&ĐT và tổ chuyên môn khác nhau theo từng cơ sở và từng môn, hệ chưa
 * lưu. Hai lối xử lý tồi: bỏ hẳn dòng (người dùng phải tự nhớ thêm vào, và
 * quên thì file thiếu so với mẫu Sở), hoặc đoán bừa một giá trị (sai còn tệ
 * hơn thiếu). Để dấu chấm là nói rõ "chỗ này của bạn" ngay trên giấy.
 */
const DIEN_TAY = "..................................................";

/** Chữ đưa vào Word: cắt đáp án (`stripAnswerArtifacts`) rồi bỏ cú pháp nội bộ. */
function plainText(s: string): string {
  return stripAnswerArtifacts(s)
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

export interface ExamDocMeta {
  /** "SỞ GIÁO DỤC VÀ ĐÀO TẠO THÀNH PHỐ ĐÀ NẴNG" — bỏ trống thì không in. */
  departmentOfEducation?: string;
  schoolName: string;
  /** "KIỂM TRA GIỮA HỌC KÌ II" — lấy từ tên gói đề. */
  examTitle: string;
  schoolYear: string;
  subjectName: string;
  gradeName: string;
  durationMinutes: number;
  /** Mã đề in ở góc, vd "0401". */
  code: string;
}

/**
 * Câu dẫn của từng phần, viết theo đúng chữ trong đề mẫu SHOC 10.
 *
 * Mỗi dạng có một câu dẫn riêng và học sinh đã quen đọc đúng câu đó. Viết lại
 * cho "gọn hơn" là bắt cả phòng thi đọc một thứ lạ trong lúc tính giờ.
 */
function huongDan(part: YccdPart, soCau: number): string | null {
  const t = part.questionTypes ?? [];
  if (t.includes("multi-tf")) {
    return `Thí sinh trả lời từ câu 1 đến câu ${soCau}. Trong mỗi ý a), b), c), d) ở mỗi câu thí sinh chọn đúng hoặc sai.`;
  }
  if (t.includes("short-answer")) {
    return `Thí sinh trả lời từ câu 1 đến câu ${soCau}.`;
  }
  if (t.includes("mcq-single") || t.includes("mcq-multi")) {
    return `Thí sinh trả lời từ câu 1 đến câu ${soCau}. Mỗi câu hỏi thí sinh chỉ chọn 1 phương án.`;
  }
  return null;
}

/**
 * ĐỀ THI — dựng theo ĐÚNG đề mẫu `de-mau/1. SHOC 10 DE CHINH THUC_da gan ID.docx`,
 * nhưng KHÔNG kèm đáp án.
 *
 * Bố cục lấy từ file mẫu, không phải tôi tự nghĩ:
 *   · tiêu ngữ: Sở GD&ĐT · tên trường · "ĐỀ CHÍNH THỨC"
 *   · "KIỂM TRA <kỳ> NĂM HỌC <năm>" · "Môn: X, Lớp Y" · "Mã đề NNNN"
 *   · dòng Họ tên / Lớp / Phòng
 *   · phần trắc nghiệm đánh "I." "II." "III." kèm câu dẫn riêng từng dạng
 *   · tự luận tách riêng thành "PHẦN B: PHẦN TỰ LUẬN (N điểm)"
 *
 * ── Ba thứ trong file mẫu PHẢI bị bỏ ────────────────────────────────────
 *
 * File mẫu là bản soạn ("đã gắn ID"), không phải bản phát cho học sinh:
 *   · `[SI10.02.15.D01]` — mã YCCĐ gắn kèm mỗi câu
 *   · `<KEY=3>`          — đáp án câu trả lời ngắn
 *   · `Lời giải:` …      — lời giải câu tự luận
 *
 * Cả ba đều bị cắt ở đây. Phát đề kèm bất kỳ thứ nào trong đó là hỏng cả kỳ
 * thi, nên chúng bị chặn ngay tại chỗ dựng file chứ không dựa vào người soạn
 * nhớ xoá.
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
  const ctr = (text: string, o: Record<string, unknown> = {}) =>
    new d.Paragraph({
      alignment: d.AlignmentType.CENTER,
      children: [new d.TextRun({ text, ...o })],
    });
  const blank = () => new d.Paragraph({ children: [] });

  const m = args.meta;
  const lop = m.gradeName.replace(/\D/g, "") || m.gradeName;
  const body: InstanceType<typeof d.Paragraph>[] = [];
  // Dòng Sở GD&ĐT luôn có mặt — mẫu SHOC 10 mở đầu bằng nó. Chưa có dữ liệu
  // thì in dấu chấm chứ không bỏ dòng: bỏ đi là file thiếu so với mẫu Sở mà
  // người tải về không biết mình còn thiếu gì.
  body.push(
    ctr(
      m.departmentOfEducation
        ? m.departmentOfEducation.toUpperCase()
        : `SỞ GIÁO DỤC VÀ ĐÀO TẠO ${DIEN_TAY}`,
      { bold: true },
    ),
  );
  body.push(
    ctr(m.schoolName.toUpperCase(), { bold: true }),
    ctr("ĐỀ CHÍNH THỨC", { bold: true }),
    blank(),
    ctr(`${examTitleParts(m.examTitle).full.toUpperCase()} NĂM HỌC ${m.schoolYear}`, {
      bold: true,
      size: 26,
    }),
    ctr(`Môn: ${m.subjectName.toUpperCase()}, Lớp ${lop}`, { bold: true }),
    ctr(`Thời gian làm bài: ${m.durationMinutes} phút`, { italics: true }),
    ctr(`Mã đề ${m.code}`, { bold: true }),
    blank(),
    P(
      "Họ và tên thí sinh:................................................................ Số báo danh:...................",
    ),
    P(
      "Lớp:.................................................................................................. Phòng:...........",
    ),
    blank(),
  );

  // Trắc nghiệm đánh I./II./III.; tự luận tách sang PHẦN B như đề mẫu.
  const tn = blocks.filter((b) => groupOfPart(b.part) === "TNKQ" && b.items.length > 0);
  const tl = blocks.filter((b) => groupOfPart(b.part) === "Tự luận" && b.items.length > 0);

  const renderItems = (block: (typeof blocks)[number]) => {
    for (const it of block.items) {
      const q = it.question;
      body.push(P(`Câu ${it.indexInPart}. ${plainText(q.content)}`));
      if (q.type === "mcq-single" || q.type === "mcq-multi") {
        (q.options ?? []).forEach((o, i) =>
          body.push(P(`${optionLabel(i)}. ${plainText(o.content)}`)),
        );
      } else if (q.type === "multi-tf") {
        (q.subQuestions ?? []).forEach((sq, i) =>
          body.push(P(`${subLetter(i)}) ${plainText(sq.statement)}`)),
        );
      } else if (q.type === "short-answer") {
        body.push(P("Trả lời: ................................"));
      } else {
        body.push(P("................................................................"));
        body.push(P("................................................................"));
      }
      body.push(blank());
    }
  };

  tn.forEach((block, i) => {
    body.push(P(`${roman(i + 1)}.${block.part.label}`, { bold: true }));
    const hd = huongDan(block.part, block.items.length);
    if (hd) body.push(P(hd, { italics: true }));
    renderItems(block);
  });

  if (tl.length > 0) {
    const diem = round2(tl.reduce((s, b) => s + b.points, 0));
    body.push(P(`PHẦN B: PHẦN TỰ LUẬN (${diem} điểm)`, { bold: true }));
    tl.forEach((block) => renderItems(block));
  }

  if (leftover.length > 0) {
    body.push(
      P(
        `⚠ ${leftover.length} câu không thuộc phần nào trong cấu hình đề — kiểm lại cấu hình phần ở bước ④.`,
        { bold: true, color: "B91C1C" },
      ),
    );
  }
  body.push(ctr("--- HẾT ---", { bold: true }));

  const doc = new d.Document({ sections: [{ children: body }] });
  return d.Packer.toBlob(doc);
}

/**
 * MA TRẬN + BẢN ĐẶC TẢ — dựng theo ĐÚNG mẫu trường đang dùng
 * (xem "9. GDKTPL_10 Ma trận đặc tả đề kiểm tra giữa kì I.pdf").
 *
 * Bố cục mẫu, không phải bố cục tôi tự nghĩ:
 *   · tiêu ngữ hai cột: tên trường / CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM
 *   · bảng ma trận: TT · Chủ đề/Chương · Nội dung · [Mức Độ đánh giá] · [Tổng] · Tỉ lệ % điểm
 *     trong đó "Mức Độ đánh giá" gộp TNKQ (Nhiều lựa chọn · "Đúng - Sai") và Tự luận,
 *     mỗi phần chia ba cột Biết / Hiểu / Vận dụng
 *   · ba dòng chân: Tổng số lệnh hỏi · Tổng số điểm · Tỉ lệ %
 *   · bảng đặc tả: mỗi Bài tách ba dòng Biết/Hiểu/Vận dụng, cột YCCĐ là nội
 *     dung, các cột còn lại điền MÃ CÂU (C1, C2 · C1.a,b · C1.TL)
 *
 * Ô rỗng để TRỐNG, không in số 0 — mẫu để trống.
 */
export async function buildMatrixDocx(args: {
  meta: {
    schoolName: string;
    departmentName?: string;
    examTitle: string;
    schoolYear: string;
    subjectName: string;
    gradeName: string;
  };
  matrix: YccdMatrix;
  scoring: ScoringPolicy | null;
  nameOfCompetency: (id: string) => string;
  competencyById: (
    id: string,
  ) => { title: string; bloomLevel?: BloomLevel | null; parentId?: string | null } | undefined;
  topicOfCompetency: (id: string) => string | null;
  sampleQuestionIds: readonly string[];
  questionById: ReadonlyMap<string, Question>;
}): Promise<Blob> {
  const d = await import("docx");
  const maxScore = args.scoring?.maxScore ?? 10;
  const table = buildMatrixTable(args.matrix, args.nameOfCompetency, maxScore);
  const { blocks } = splitIntoParts(
    args.sampleQuestionIds,
    args.questionById,
    args.matrix.parts,
  );
  const specBlocks = buildSpecTable(blocks, args.matrix, {
    nameOf: args.nameOfCompetency,
    competencyById: args.competencyById,
    topicOf: args.topicOfCompetency,
  });

  const B = d.BorderStyle.SINGLE;
  const bd = {
    top: { style: B, size: 1 },
    bottom: { style: B, size: 1 },
    left: { style: B, size: 1 },
    right: { style: B, size: 1 },
  };
  const C = (
    text: string,
    o: { bold?: boolean; span?: number; rows?: number; italics?: boolean; left?: boolean } = {},
  ) =>
    new d.TableCell({
      borders: bd,
      columnSpan: o.span,
      rowSpan: o.rows,
      verticalAlign: d.VerticalAlign.CENTER,
      children: [
        new d.Paragraph({
          alignment: o.left ? d.AlignmentType.LEFT : d.AlignmentType.CENTER,
          children: [new d.TextRun({ text, bold: o.bold, italics: o.italics, size: 18 })],
        }),
      ],
    });
  const P = (text: string, o: Record<string, unknown> = {}) =>
    new d.Paragraph({ children: [new d.TextRun({ text, ...o })] });
  const ctr = (text: string, o: Record<string, unknown> = {}) =>
    new d.Paragraph({
      alignment: d.AlignmentType.CENTER,
      children: [new d.TextRun({ text, ...o })],
    });
  /** Ô rỗng in "" chứ không in 0 — mẫu để trống. */
  const num = (n: number, bold = false) => C(n > 0 ? String(n) : "", { bold });
  /**
   * Điểm ghi kiểu Việt: 3,0 · 0,25.
   *
   * KHÔNG ép về một chữ số thập phân: điểm mỗi lệnh hỏi thường là 0,25 và
   * `toFixed(1)` biến nó thành "0,3" — sai số nhìn thì nhỏ mà cộng cả cột lại
   * thì lệch, và người đối chiếu sẽ thấy tổng không khớp các ô.
   */
  const vn = (n: number) => {
    const r = round2(n);
    const s = Number.isInteger(r) ? r.toFixed(1) : String(r);
    return s.replace(".", ",");
  };
  /** Tỉ lệ % kiểu Việt. */
  const pctVn = (n: number) => String(round2(n)).replace(".", ",");

  const parts = table.parts;
  const tnkq = parts.filter((p) => groupOfPart(p) === "TNKQ");
  const tuluan = parts.filter((p) => groupOfPart(p) === "Tự luận");
  const ordered = [...tnkq, ...tuluan];

  // ── Tiêu ngữ hai cột ────────────────────────────────────────────────────
  const noBd = {
    top: { style: d.BorderStyle.NONE, size: 0 },
    bottom: { style: d.BorderStyle.NONE, size: 0 },
    left: { style: d.BorderStyle.NONE, size: 0 },
    right: { style: d.BorderStyle.NONE, size: 0 },
  };
  const headerCell = (lines: Array<{ t: string; bold?: boolean; underline?: boolean }>) =>
    new d.TableCell({
      borders: noBd,
      children: lines.map(
        (l) =>
          new d.Paragraph({
            alignment: d.AlignmentType.CENTER,
            children: [
              new d.TextRun({ text: l.t, bold: l.bold, underline: l.underline ? {} : undefined }),
            ],
          }),
      ),
    });
  const tieuNgu = new d.Table({
    width: { size: 100, type: d.WidthType.PERCENTAGE },
    rows: [
      new d.TableRow({
        children: [
          headerCell([
            { t: args.meta.schoolName.toUpperCase() },
            // Tổ chuyên môn: mẫu có dòng này, hệ chưa lưu → để đơn vị tự điền.
            {
              t: args.meta.departmentName
                ? `TỔ ${args.meta.departmentName.toUpperCase()}`
                : `TỔ ${DIEN_TAY}`,
              bold: true,
              underline: true,
            },
          ]),
          headerCell([
            { t: "CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM", bold: true },
            { t: "Độc lập - Tự do - Hạnh phúc", bold: true, underline: true },
          ]),
        ],
      }),
    ],
  });

  // ── Bảng ma trận: 4 dòng tiêu đề ────────────────────────────────────────
  const h1 = new d.TableRow({
    children: [
      C("TT", { bold: true, rows: 4 }),
      C("Chủ đề/\nChương", { bold: true, rows: 4 }),
      C("Nội dung/đơn vị kiến thức", { bold: true, rows: 4 }),
      C("Mức Độ đánh giá", { bold: true, span: ordered.length * 3 }),
      C("Tổng", { bold: true, span: 3 }),
      C("Tỉ lệ % điểm", { bold: true, rows: 4 }),
    ],
  });
  const h2 = new d.TableRow({
    children: [
      ...(tnkq.length > 0 ? [C("TNKQ", { bold: true, span: tnkq.length * 3 })] : []),
      ...(tuluan.length > 0 ? [C("Tự luận", { bold: true, span: tuluan.length * 3 })] : []),
      C("", { rows: 3, span: 3 }),
    ],
  });
  const h3 = new d.TableRow({
    children: ordered.map((p) => C(p.label, { bold: true, italics: true, span: 3 })),
  });
  const h4 = new d.TableRow({
    children: [
      ...ordered.flatMap(() => BLOOM_ORDER.map((b) => C(BLOOM_LABEL[b], { bold: true }))),
      ...BLOOM_ORDER.map((b) => C(BLOOM_LABEL[b], { bold: true })),
    ],
  });

  const bodyRows = table.rows.map(
    (r, i) =>
      new d.TableRow({
        children: [
          C(String(i + 1)),
          C(r.chapterName ?? "", { left: true }),
          C(r.topicName, { left: true }),
          ...ordered.flatMap((p) => BLOOM_ORDER.map((b) => num(r.counts[p.id]?.[b] ?? 0))),
          ...BLOOM_ORDER.map((b) => num(r.bloomTotals[b] ?? 0)),
          C(pctVn(r.percent), { bold: true }),
        ],
      }),
  );

  const footLenhHoi = new d.TableRow({
    children: [
      C("Tổng số lệnh hỏi", { bold: true, span: 3 }),
      ...ordered.flatMap((p) => BLOOM_ORDER.map((b) => C(String(table.columnTotals[p.id]?.[b] ?? 0), { bold: true }))),
      ...BLOOM_ORDER.map((b) => C(String(table.bloomTotals[b] ?? 0), { bold: true })),
      C(String(table.grandTotal), { bold: true }),
    ],
  });
  const footDiem = new d.TableRow({
    children: [
      C("Tổng số điểm", { bold: true, span: 3 }),
      ...ordered.map((p) => C(vn(table.pointsByPart[p.id] ?? 0), { bold: true, span: 3 })),
      ...BLOOM_ORDER.map((b) => C(vn(table.pointsByBloom[b] ?? 0), { bold: true })),
      C(vn(table.totalPoints), { bold: true }),
    ],
  });
  const footTiLe = new d.TableRow({
    children: [
      C("Tỉ lệ %", { bold: true, span: 3 }),
      ...ordered.map((p) => C(pctVn(table.percentByPart[p.id] ?? 0), { bold: true, span: 3 })),
      ...BLOOM_ORDER.map((b) => C(pctVn(table.percentByBloom[b] ?? 0), { bold: true })),
      // KHÔNG đóng cứng 100: ma trận chưa phủ hết tổng điểm thì ghi 100 là nói
      // dối người đối chiếu. Ghi số thật để thấy ngay ma trận còn thiếu.
      C(pctVn(maxScore > 0 ? (table.totalPoints / maxScore) * 100 : 0), { bold: true }),
    ],
  });

  // ── Bảng đặc tả ─────────────────────────────────────────────────────────
  const specHead = [
    new d.TableRow({
      children: [
        C("TT", { bold: true, rows: 3 }),
        C("Chủ đề/Chương", { bold: true, rows: 3 }),
        C("Nội dung/đơn vị kiến thức", { bold: true, rows: 3 }),
        C("Yêu cầu cần đạt", { bold: true, rows: 3 }),
        C("Số câu hỏi ở các mức độ đánh giá", { bold: true, span: ordered.length * 3 }),
      ],
    }),
    new d.TableRow({
      children: [
        ...(tnkq.length > 0 ? [C("TNKQ", { bold: true, span: tnkq.length * 3 })] : []),
        ...(tuluan.length > 0 ? [C("Tự luận", { bold: true, span: tuluan.length * 3 })] : []),
      ],
    }),
    new d.TableRow({
      children: ordered.flatMap((p) => [
        C(p.label, { bold: true, italics: true, span: 3 }),
      ]),
    }),
    new d.TableRow({
      children: ordered.flatMap(() => BLOOM_ORDER.map((b) => C(BLOOM_LABEL[b], { bold: true }))),
    }),
  ];
  const specBody: InstanceType<typeof d.TableRow>[] = [];
  specBlocks.forEach((blk, bi) => {
    blk.levels.forEach((lvl, li) => {
      const yccd =
        lvl.outcomes.length > 0
          ? `- ${BLOOM_LABEL[lvl.bloom]}: ${lvl.outcomes.join("; ")}`
          : `- ${BLOOM_LABEL[lvl.bloom]}:`;
      specBody.push(
        new d.TableRow({
          children: [
            ...(li === 0
              ? [
                  C(String(bi + 1), { rows: 3 }),
                  C(blk.chapterName ?? "", { rows: 3, left: true }),
                  C(blk.topicName, { rows: 3, left: true }),
                ]
              : []),
            C(yccd, { left: true }),
            ...ordered.flatMap((p) =>
              BLOOM_ORDER.map((b) =>
                C(b === lvl.bloom ? (lvl.refs[p.id]?.[b] ?? []).join(", ") : ""),
              ),
            ),
          ],
        }),
      );
    });
  });

  const children: Array<InstanceType<typeof d.Paragraph> | InstanceType<typeof d.Table>> = [
    tieuNgu,
    new d.Paragraph({ children: [] }),
    ctr(`MA TRẬN ĐỀ KIỂM TRA ${examTitleParts(args.meta.examTitle).ky.toUpperCase()}; NĂM HỌC ${args.meta.schoolYear}`, {
      bold: true,
      size: 26,
    }),
    ctr(`MÔN: ${args.meta.subjectName.toUpperCase()}; KHỐI: ${args.meta.gradeName.replace(/\D/g, "") || args.meta.gradeName}`, {
      bold: true,
      size: 26,
    }),
    new d.Paragraph({ children: [] }),
    new d.Table({
      width: { size: 100, type: d.WidthType.PERCENTAGE },
      rows: [h1, h2, h3, h4, ...bodyRows, footLenhHoi, footDiem, footTiLe],
    }),
    P(
      "Ghi chú: Phần “Đúng – Sai” đếm theo Ý (một câu 4 ý tính 4 lệnh hỏi).",
      { italics: true, size: 18 },
    ),
    new d.Paragraph({ children: [], pageBreakBefore: true }),
    ctr(`BẢN ĐẶC TẢ ĐỀ KIỂM TRA ${examTitleParts(args.meta.examTitle).ky.toUpperCase()}; NĂM HỌC ${args.meta.schoolYear}`, {
      bold: true,
      size: 26,
    }),
    ctr(`MÔN: ${args.meta.subjectName.toUpperCase()}; KHỐI: ${args.meta.gradeName.replace(/\D/g, "") || args.meta.gradeName}`, {
      bold: true,
      size: 26,
    }),
    new d.Paragraph({ children: [] }),
    new d.Table({
      width: { size: 100, type: d.WidthType.PERCENTAGE },
      rows: [...specHead, ...specBody],
    }),
  ];

  const s = args.scoring;
  if (s) {
    children.push(new d.Paragraph({ children: [] }));
    children.push(P("QUY ĐỊNH ĐIỂM", { bold: true }));
    children.push(P(`Tổng điểm toàn bài: ${s.maxScore}`));
    for (const p of ordered) {
      children.push(P(`${p.label}: ${p.pointsPerQuestion ?? 0} điểm/${groupOfPart(p) === "Tự luận" ? "câu" : "lệnh hỏi"}`));
    }
    const dsLabel =
      s.ds === "graduated"
        ? "lũy tiến theo số ý đúng"
        : s.ds === "weighted"
          ? "theo trọng số từng ý"
          : "đúng hết mới có điểm";
    children.push(P(`Cách chấm Đúng – Sai: ${dsLabel}`));
  }

  const doc = new d.Document({
    sections: [{ properties: { page: { size: { orientation: d.PageOrientation.LANDSCAPE } } }, children }],
  });
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
