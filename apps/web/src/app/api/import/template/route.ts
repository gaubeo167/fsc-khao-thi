import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  Math,
  Packer,
  Paragraph,
  ShadingType,
  TextRun,
  type ParagraphChild,
} from "docx";
import { NextResponse } from "next/server";

import { latexToDocxMath } from "./latex-to-docx-math";

/**
 * GET /api/import/template — generates a fresh .docx template on demand.
 *
 * Math is rendered as real Office Math (OMath) elements (the same engine
 * Word uses for equations). When the teacher edits the file and re-uploads,
 * the import parser still relies on `$...$` LaTeX markers in plain text —
 * Word's Equation Editor output WILL be flattened by mammoth. The template
 * instructs teachers to keep math in `$...$` form when editing.
 */
export async function GET() {
  const doc = new Document({
    creator: "FSC Exam Platform",
    title: "Mẫu import câu hỏi",
    description: "File mẫu chuẩn để soạn câu hỏi import vào hệ thống FSC.",
    sections: [
      {
        properties: {},
        children: [
          // ───────── Cover / instructions ─────────
          heading("FSC EXAM PLATFORM — MẪU IMPORT CÂU HỎI", 1),
          gap(),
          body(
            "File này chứa các câu hỏi mẫu ở tất cả 8 dạng được hỗ trợ. " +
              "Mở trong Word / Google Docs để chỉnh sửa nội dung rồi lưu lại " +
              "thành .docx → upload vào dialog Import câu hỏi từ Word.",
          ),
          gap(),

          heading("⚠ QUY TẮC SOẠN — đọc trước khi bắt đầu", 2),
          bullet("Mỗi câu hỏi bắt đầu bằng tiêu đề `# Câu N`."),
          bullet(
            'Trường meta cố định: `Dạng: ...`, `Độ khó: ...`, `Đề bài: ...`, ' +
              '`Giải thích: ...` — đặt mỗi trường trên một dòng riêng.',
          ),
          bullet(
            "Công thức toán: file mẫu hiển thị bằng OMath cho dễ nhìn, nhưng " +
              "khi BẠN soạn câu mới, hãy gõ LaTeX trong $...$ (vd: " +
              '"$x^2 - 5x + 6 = 0$"). Parser chỉ đọc được LaTeX.',
          ),
          bullet(
            "Ảnh trong câu hỏi: dán trực tiếp vào Word (sẽ kèm theo khi " +
              "upload, hệ thống tự convert thành ảnh trong câu).",
          ),
          bullet(
            "Đáp án đúng trong MCQ: đánh dấu [đúng] sau phương án. Có thể " +
              "không đánh dấu cho câu sai.",
          ),
          gap(),

          heading("Vài công thức tham khảo (render bằng OMath)", 3),
          mathBlock("Phương trình bậc 2:", "x^2 - 5x + 6 = 0"),
          mathBlock("Định lý Pythagoras:", "a^2 + b^2 = c^2"),
          mathBlock("Phân số:", "\\frac{a}{b}"),
          mathBlock("Căn bậc 2:", "\\sqrt{a^2 + b^2}"),
          mathBlock("Tổng:", "\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}"),
          mathBlock("Định lý Vi-ét:", "x_1 + x_2 = -\\frac{b}{a}"),

          pageBreak(),

          // ───────── Sample questions ─────────
          ...sampleQuestions(),

          gap(),
          divider(),
          body(
            "✅ Hết file mẫu. Sau khi sửa nội dung, lưu file (.docx) rồi " +
              "upload trong dialog Import. Chúc bạn soạn đề vui!",
            { italics: true },
          ),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition":
        'attachment; filename="FSC-mau-cau-hoi.docx"',
      "Cache-Control": "no-store",
    },
  });
}

/* ────────────────── Generic helpers ────────────────── */

function heading(text: string, level: 1 | 2 | 3): Paragraph {
  const map: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
    1: HeadingLevel.HEADING_1,
    2: HeadingLevel.HEADING_2,
    3: HeadingLevel.HEADING_3,
  };
  return new Paragraph({
    heading: map[level],
    spacing: { before: 240, after: 120 },
    children: [
      new TextRun({
        text,
        bold: true,
        color: level === 1 ? "1D4ED8" : level === 2 ? "0F172A" : "475569",
      }),
    ],
  });
}

function body(text: string, opts?: { italics?: boolean }): Paragraph {
  return new Paragraph({
    spacing: { after: 100 },
    children: [
      new TextRun({ text, italics: opts?.italics, color: "0F172A" }),
    ],
  });
}

function bullet(text: string): Paragraph {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 80 },
    children: [new TextRun({ text, color: "0F172A" })],
  });
}

function gap(): Paragraph {
  return new Paragraph({ children: [new TextRun({ text: "" })] });
}

function divider(): Paragraph {
  return new Paragraph({
    border: {
      top: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1" },
    },
    children: [new TextRun({ text: "" })],
  });
}

function pageBreak(): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: "", break: 1 })],
    pageBreakBefore: true,
  });
}

/* ────────────────── Math helpers ────────────────── */

/** Render a single labeled math equation block. */
function mathBlock(label: string, latex: string): Paragraph {
  return new Paragraph({
    spacing: { after: 100 },
    indent: { left: 240 },
    children: [
      new TextRun({ text: label + "  ", bold: true, color: "0F172A" }),
      new Math({ children: latexToDocxMath(latex) }),
      new TextRun({ text: `   ·   gõ trong file là  `, color: "94A3B8" }),
      new TextRun({
        text: `$${latex}$`,
        font: "Consolas",
        color: "64748B",
        size: 18,
      }),
    ],
  });
}

/**
 * Convert a Vietnamese sentence with inline `$...$` LaTeX into a sequence of
 * paragraph children. Plain text becomes TextRun; each `$...$` becomes a
 * Math element rendered via the latex2docx converter.
 */
function inlineMixed(text: string, baseStyle?: { bold?: boolean }): ParagraphChild[] {
  const out: ParagraphChild[] = [];
  const re = /\$([^$\n]+)\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      out.push(
        new TextRun({
          text: text.slice(last, m.index),
          color: "0F172A",
          bold: baseStyle?.bold,
        }),
      );
    }
    out.push(new Math({ children: latexToDocxMath(m[1]) }));
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    out.push(
      new TextRun({
        text: text.slice(last),
        color: "0F172A",
        bold: baseStyle?.bold,
      }),
    );
  }
  return out;
}

/* ────────────────── Question samples ────────────────── */

function sampleQuestions(): Paragraph[] {
  const out: Paragraph[] = [];

  // 1. MCQ Single
  out.push(
    qHeader(1),
    meta("Dạng", "MCQ-SINGLE"),
    meta("Độ khó", "Dễ"),
    metaWithMath("Đề bài", "Đạo hàm của $f(x) = x^2$ bằng?"),
    optMath("A.", "$x$"),
    optMath("B.", "$2x$", true),
    optMath("C.", "$x^2$"),
    optMath("D.", "$0$"),
    metaWithMath(
      "Giải thích",
      "Áp dụng $(x^n)' = n \\cdot x^{n-1}$ → $(x^2)' = 2x$.",
    ),
    gap(),
  );

  // 2. MCQ Multi
  out.push(
    qHeader(2),
    meta("Dạng", "MCQ-MULTI"),
    meta("Độ khó", "Trung bình"),
    metaWithMath("Đề bài", "Các số nào sau đây là số nguyên tố?"),
    optMath("A.", "2", true),
    optMath("B.", "3", true),
    optMath("C.", "4"),
    optMath("D.", "5", true),
    optMath("E.", "6"),
    optMath("F.", "9"),
    meta(
      "Giải thích",
      "Số nguyên tố là số tự nhiên > 1, chỉ chia hết cho 1 và chính nó.",
    ),
    gap(),
  );

  // 3. True / False
  out.push(
    qHeader(3),
    meta("Dạng", "TRUE-FALSE"),
    meta("Độ khó", "Dễ"),
    metaWithMath("Đề bài", "Đạo hàm của một hằng số luôn bằng 0."),
    meta("Đáp án", "Đúng"),
    meta(
      "Giải thích",
      "Hằng số không thay đổi theo biến nên đạo hàm bằng 0.",
    ),
    gap(),
  );

  // 4. True / False — sai
  out.push(
    qHeader(4),
    meta("Dạng", "TRUE-FALSE"),
    meta("Độ khó", "Trung bình"),
    metaWithMath("Đề bài", "Tổng các góc trong tam giác bằng 360°."),
    meta("Đáp án", "Sai"),
    meta("Giải thích", "Tổng các góc trong tam giác bằng 180°."),
    gap(),
  );

  // 5. Fill blank
  out.push(
    qHeader(5),
    meta("Dạng", "FILL-BLANK"),
    meta("Độ khó", "Dễ"),
    metaWithMath(
      "Đề bài",
      "Thủ đô của Việt Nam là ___. Quốc kỳ Việt Nam có ___ ngôi sao vàng. (Dùng dấu ___ ở vị trí cần điền.)",
    ),
    meta("Đáp án 1", "Hà Nội | Hanoi | HN"),
    meta("Đáp án 2", "1 | một"),
    gap(),
  );

  // 6. Fill blank with math
  out.push(
    qHeader(6),
    meta("Dạng", "FILL-BLANK"),
    meta("Độ khó", "Trung bình"),
    metaWithMath(
      "Đề bài",
      "Phương trình $x^2 - 5x + 6 = 0$ có nghiệm $x_1 = $ ___ và $x_2 = $ ___.",
    ),
    meta("Đáp án 1", "2"),
    meta("Đáp án 2", "3"),
    gap(),
  );

  // 7. Matching
  out.push(
    qHeader(7),
    meta("Dạng", "MATCHING"),
    meta("Độ khó", "Dễ"),
    metaWithMath("Đề bài", "Ghép cặp quốc gia với thủ đô tương ứng."),
    pair(1, "Việt Nam", "Hà Nội"),
    pair(2, "Pháp", "Paris"),
    pair(3, "Nhật Bản", "Tokyo"),
    pair(4, "Anh", "London"),
    gap(),
  );

  // 8. Matching — chemistry
  out.push(
    qHeader(8),
    meta("Dạng", "MATCHING"),
    meta("Độ khó", "Trung bình"),
    metaWithMath(
      "Đề bài",
      "Ghép cặp axit với muối được tạo ra khi tác dụng với NaOH.",
    ),
    pair(1, "HCl", "NaCl"),
    pair(2, "H₂SO₄", "Na₂SO₄"),
    pair(3, "HNO₃", "NaNO₃"),
    pair(4, "H₃PO₄", "Na₃PO₄"),
    gap(),
  );

  // 9. Ordering
  out.push(
    qHeader(9),
    meta("Dạng", "ORDERING"),
    meta("Độ khó", "Dễ"),
    metaWithMath("Đề bài", "Sắp xếp các số sau theo thứ tự từ bé đến lớn."),
    orderItem(1, "-5"),
    orderItem(2, "-2"),
    orderItem(3, "0"),
    orderItem(4, "3"),
    orderItem(5, "7"),
    gap(),
  );

  // 10. Ordering — process
  out.push(
    qHeader(10),
    meta("Dạng", "ORDERING"),
    meta("Độ khó", "Trung bình"),
    metaWithMath("Đề bài", "Sắp xếp các bước của vòng đời nước theo thứ tự."),
    orderItem(1, "Bốc hơi"),
    orderItem(2, "Ngưng tụ"),
    orderItem(3, "Mưa"),
    orderItem(4, "Chảy ra biển"),
    gap(),
  );

  // 11. Underline
  out.push(
    qHeader(11),
    meta("Dạng", "UNDERLINE"),
    meta("Độ khó", "Dễ"),
    metaWithMath(
      "Đề bài",
      "Gạch chân các động từ trong câu sau: Cô bé [đang đi] đến trường [bằng xe đạp]. (Dùng dấu [...] để đánh dấu cụm cần gạch chân.)",
    ),
    gap(),
  );

  // 12. Underline — adjectives
  out.push(
    qHeader(12),
    meta("Dạng", "UNDERLINE"),
    meta("Độ khó", "Trung bình"),
    metaWithMath(
      "Đề bài",
      "Gạch chân các tính từ: Hôm nay trời rất [đẹp], gió thổi [nhẹ nhàng], hoa nở [rực rỡ].",
    ),
    gap(),
  );

  // 13. Essay
  out.push(
    qHeader(13),
    meta("Dạng", "ESSAY"),
    meta("Độ khó", "Khó"),
    metaWithMath(
      "Đề bài",
      'Phân tích bài thơ "Tây Tiến" của Quang Dũng.',
    ),
    meta("Số từ tối thiểu", "300"),
    meta("Số từ tối đa", "800"),
    meta("Tiêu chí 1", "Mở bài giới thiệu tác giả + bối cảnh | 2"),
    meta("Tiêu chí 2", "Phân tích hình tượng người lính | 4"),
    meta("Tiêu chí 3", "Nghệ thuật ngôn từ | 2"),
    meta("Tiêu chí 4", "Liên hệ thực tiễn | 2"),
    meta(
      "Giải thích",
      "Tổng 10 điểm. Học sinh viết bài tự luận, giáo viên chấm tay theo rubric.",
    ),
    gap(),
  );

  // 14. Essay — descriptive
  out.push(
    qHeader(14),
    meta("Dạng", "ESSAY"),
    meta("Độ khó", "Trung bình"),
    metaWithMath("Đề bài", "Hãy miêu tả cảnh làng quê em vào buổi sáng."),
    meta("Số từ tối thiểu", "150"),
    meta("Số từ tối đa", "400"),
    meta("Tiêu chí 1", "Bố cục bài viết | 2"),
    meta("Tiêu chí 2", "Hình ảnh sinh động | 4"),
    meta("Tiêu chí 3", "Ngữ pháp & chính tả | 2"),
    meta("Tiêu chí 4", "Cảm xúc | 2"),
    gap(),
  );

  return out;
}

function qHeader(n: number): Paragraph {
  return new Paragraph({
    spacing: { before: 240, after: 80 },
    shading: { type: ShadingType.CLEAR, color: "auto", fill: "EFF6FF" },
    children: [
      new TextRun({
        text: `# Câu ${n}`,
        bold: true,
        size: 26,
        color: "1D4ED8",
      }),
    ],
  });
}

/** Meta with no math — pure text key:value. */
function meta(key: string, value: string): Paragraph {
  return new Paragraph({
    spacing: { after: 40 },
    children: [
      new TextRun({ text: `${key}: `, bold: true, color: "0F172A" }),
      new TextRun({ text: value, color: "0F172A" }),
    ],
  });
}

/** Meta whose value may contain `$...$` LaTeX → renders math inline. */
function metaWithMath(key: string, value: string): Paragraph {
  return new Paragraph({
    spacing: { after: 40 },
    children: [
      new TextRun({ text: `${key}: `, bold: true, color: "0F172A" }),
      ...inlineMixed(value),
    ],
  });
}

/** MCQ option, content may contain `$...$` LaTeX. */
function optMath(letter: string, content: string, correct: boolean = false): Paragraph {
  const children: ParagraphChild[] = [
    new TextRun({ text: `${letter} `, bold: true, color: "0F172A" }),
    ...inlineMixed(content),
  ];
  if (correct) {
    children.push(
      new TextRun({ text: "  [đúng]", bold: true, color: "16A34A" }),
    );
  }
  return new Paragraph({
    spacing: { after: 30 },
    indent: { left: 360 },
    children,
  });
}

function pair(n: number, left: string, right: string): Paragraph {
  return new Paragraph({
    spacing: { after: 30 },
    indent: { left: 360 },
    children: [
      new TextRun({ text: `${n}. `, bold: true, color: "0F172A" }),
      new TextRun({ text: left, color: "0F172A" }),
      new TextRun({ text: "  →  ", color: "64748B" }),
      new TextRun({ text: right, color: "0F172A" }),
    ],
  });
}

function orderItem(n: number, content: string): Paragraph {
  return new Paragraph({
    spacing: { after: 30 },
    indent: { left: 360 },
    children: [
      new TextRun({ text: `${n}. `, bold: true, color: "0F172A" }),
      new TextRun({ text: content, color: "0F172A" }),
    ],
  });
}

// Silence "imported but unused"
void ImageRun;
void AlignmentType;
