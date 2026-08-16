/**
 * Nội dung file Word MẪU cho đề KHÔNG dùng mã YCCĐ, kèm hướng dẫn viết ngay
 * trong file.
 *
 * Khác gì mẫu theo YCCĐ (`/api/import/yccd-template`): mẫu kia gắn câu hỏi
 * vào khung năng lực của môn, nên phải có khung đã nhập và phải tra cứu mã.
 * Mẫu này không đòi gì cả — người soạn chỉ ghi hai nhãn ngắn ngay sau số câu:
 *
 *     Câu 1. [NB][TN] Nội dung câu hỏi…
 *              │    └── dạng câu
 *              └── mức độ
 *
 * Vì sao cần nhãn DẠNG CÂU: không có mã YCCĐ thì hệ thống chỉ còn cách đếm
 * phương án để đoán dạng. Đếm được với trắc nghiệm, nhưng Đúng/Sai, điền
 * khuyết, ghép cặp, sắp xếp, kéo thả, gạch chân và tự luận đều không có
 * A/B/C/D nào để đếm — nên chúng luôn ra "chưa nhận ra dạng".
 *
 * Hướng dẫn nằm TRONG file vì giáo viên tải về rồi soạn thẳng trên đó;
 * hướng dẫn ở chỗ khác là hướng dẫn không ai đọc. Quên xoá cũng không sao —
 * parser chỉ đọc những dòng bắt đầu bằng "Câu N.".
 *
 * Nội dung TRUNG TÍNH, không thuộc môn nào, dùng chung cho mọi môn.
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

/**
 * Tách khỏi route để TEST được: `scripts/test-mau-co-ban.mjs` dựng đúng file
 * này rồi đọc ngược lại bằng chính đường nhập đề. Không tách thì muốn kiểm
 * file mẫu phải khởi động cả Next, và trên thực tế là không ai kiểm.
 */
/* ── Khuôn chữ ────────────────────────────────────────────────────────────
 * Times New Roman 13pt cho toàn văn bản (docx tính theo nửa point: 26).
 * Đề thi phổ thông ở Việt Nam dùng khuôn này, nên file mẫu phải giống hệt —
 * giáo viên gõ tiếp lên đây là ra đúng thể thức, không phải chỉnh lại font.
 */
const FONT = "Times New Roman";
const SIZE = 26;

function t(
  text: string,
  o: {
    bold?: boolean;
    underline?: boolean;
    italics?: boolean;
    color?: string;
    size?: number;
  } = {},
): TextRun {
  return new TextRun({
    text,
    font: FONT,
    size: o.size ?? SIZE,
    bold: o.bold,
    italics: o.italics,
    color: o.color,
    underline: o.underline ? {} : undefined,
  });
}
const p = (children: TextRun[]) => new Paragraph({ children });
const plain = (text: string) => p([t(text)]);
const blank = () => new Paragraph({ children: [] });

const h1 = (text: string) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 320, after: 140 },
    children: [t(text, { bold: true, size: 30 })],
  });
const h2 = (text: string) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 220, after: 100 },
    children: [t(text, { bold: true, size: 27 })],
  });

/** Ghi chú hướng dẫn — in nghiêng, xám, để phân biệt với nội dung đề. */
const note = (text: string) => p([t(text, { italics: true, color: "595959" })]);

/* ── Bảng ─────────────────────────────────────────────────────────────── */

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" };
const BORDERS = {
  top: BORDER,
  bottom: BORDER,
  left: BORDER,
  right: BORDER,
  insideHorizontal: BORDER,
  insideVertical: BORDER,
};

function cell(children: Paragraph[], opts: { head?: boolean; width: number }) {
  return new TableCell({
    width: { size: opts.width, type: WidthType.PERCENTAGE },
    margins: { top: 60, bottom: 60, left: 110, right: 110 },
    shading: opts.head
      ? { type: ShadingType.CLEAR, fill: "F2F2F2", color: "auto" }
      : undefined,
    children,
  });
}

/** Bảng tra: hàng đầu là tiêu đề, cột đầu là mã (in đậm). */
function table(
  widths: number[],
  head: string[],
  rows: string[][],
): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: BORDERS,
    rows: [
      new TableRow({
        tableHeader: true,
        children: head.map((x, i) =>
          cell([p([t(x, { bold: true })])], { head: true, width: widths[i]! }),
        ),
      }),
      ...rows.map(
        (r) =>
          new TableRow({
            children: r.map((x, i) =>
              cell([p([t(x, { bold: i === 0 })])], { width: widths[i]! }),
            ),
          }),
      ),
    ],
  });
}

/* ── Ví dụ ────────────────────────────────────────────────────────────── */

/** Dòng mở đầu một câu ví dụ: `Câu 1. [NB][TN] …` với nhãn in đậm. */
const viDu = (so: number, muc: string, dang: string, de: string) =>
  p([
    t(`Câu ${so}. `),
    t(`[${muc}][${dang}] `, { bold: true }),
    t(de),
  ]);

/** Dựng tài liệu Word mẫu. */
export function buildBasicTemplate(): Document {
  const doc = new Document({
    styles: {
      // Đặt ở cấp tài liệu để mọi đoạn giáo viên gõ THÊM cũng ra Times New
      // Roman, không chỉ những đoạn dựng sẵn dưới đây.
      default: {
        document: { run: { font: FONT, size: SIZE } },
        heading1: { run: { font: FONT, color: "000000" } },
        heading2: { run: { font: FONT, color: "000000" } },
      },
    },
    sections: [
      {
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 60 },
            children: [t("MẪU SOẠN ĐỀ CƠ BẢN", { bold: true, size: 32 })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
            children: [t("(không cần mã YCCĐ)", { italics: true, color: "595959" })],
          }),

          /* ── Hướng dẫn ──────────────────────────────────────────────── */
          h1("HƯỚNG DẪN (xoá phần này trước khi nộp)"),
          note(
            "Không xoá cũng không sao — hệ thống chỉ đọc những dòng bắt đầu bằng “Câu N.”, phần còn lại bị bỏ qua.",
          ),
          blank(),

          h2("1. Mỗi câu bắt đầu bằng một dòng “Câu N.”"),
          plain("Ví dụ:  Câu 1.    Câu 2.    Câu 15."),
          note("Viết “Câu 1:” hay “Câu 1)” đều được."),
          blank(),

          h2("2. Hai nhãn đặt ngay sau số câu"),
          // "Ví dụ:" ở đầu dòng KHÔNG phải để cho đẹp. Parser cắt câu tại mọi
          // dòng bắt đầu bằng "Câu N", nên dòng minh hoạ này mà viết trần thì
          // chính phần hướng dẫn sẽ bị đọc thành một câu hỏi thứ 12 — đúng
          // cái mà dòng chữ "phần còn lại bị bỏ qua" ở trên hứa là không xảy
          // ra.
          p([
            t("Ví dụ:  Câu 1. "),
            t("[NB][TN]", { bold: true }),
            t(" Nội dung câu hỏi viết ở đây?"),
          ]),
          plain("            Nhãn thứ nhất: MỨC ĐỘ.    Nhãn thứ hai: DẠNG CÂU."),
          note(
            "Viết gộp cũng được: [NB-TN], [NB/TN], [NB TN]. Đảo thứ tự cũng được. Thiếu một nhãn vẫn nhập được — hệ thống sẽ bắt chọn tay ở màn kiểm tra trước khi lưu.",
          ),
          blank(),

          h2("3. Bảng MỨC ĐỘ"),
          table(
            [12, 28, 60],
            ["Mã", "Mức độ", "Dùng khi nào"],
            [
              ["NB", "Nhận biết", "Nhớ lại, nêu tên, nhận ra kiến thức đã học"],
              ["TH", "Thông hiểu", "Giải thích, so sánh, phân biệt, mô tả"],
              ["VD", "Vận dụng", "Tính toán, phân tích, giải quyết tình huống"],
            ],
          ),
          note("Viết VDC (vận dụng cao) cũng được, hệ thống xếp chung vào Vận dụng."),
          blank(),

          h2("4. Bảng DẠNG CÂU"),
          table(
            [10, 30, 45, 15],
            ["Mã", "Dạng câu", "Đáp án viết thế nào", "Viết tắt"],
            [
              ["TN", "Trắc nghiệm 1 đáp án", "Gạch chân phương án đúng", "D"],
              ["TNN", "Trắc nghiệm nhiều đáp án", "Gạch chân từ 2 phương án", "M"],
              ["DS", "Đúng / Sai (một mệnh đề)", "Ghi dòng: Đáp án: Đúng", "—"],
              ["DSN", "Đúng / Sai nhiều ý", "Ý a) b) c) d), gạch chân ý ĐÚNG", "F"],
              ["TLN", "Trả lời ngắn", "Ghi <Key=đáp án>", "S"],
              ["DK", "Điền khuyết", "Đề để ___, ghi Đáp án 1: … cho từng ô", "—"],
              ["GC", "Ghép cặp", "Mỗi dòng: 1. Vế trái → Vế phải", "—"],
              ["SX", "Sắp xếp thứ tự", "Đánh số 1. 2. 3. theo ĐÚNG thứ tự", "—"],
              ["KT", "Kéo thả", "Ghi Vùng 1: … cho từng vùng, Nhiễu: …", "—"],
              ["GCH", "Gạch chân", "Gạch chân cụm đúng ngay trong đề bài", "—"],
              ["TL", "Tự luận", "Không có đáp án máy — giáo viên chấm tay", "E"],
            ],
          ),
          blank(),
          note(
            "Cột “Viết tắt” là chữ dùng chung với mã YCCĐ ([SI10.02.12.D08]). Ai quen mã đó thì gõ [NB][D] thay cho [NB][TN] cũng ra kết quả y hệt.",
          ),
          note(
            "Lưu ý phân biệt: DS là MỘT mệnh đề đúng hay sai; DSN là một câu có nhiều ý a) b) c) d), mỗi ý đúng hoặc sai riêng.",
          ),
          blank(),

          h2("5. Đáp án đúng đánh dấu bằng GẠCH CHÂN"),
          plain(
            "Với câu trắc nghiệm: gạch chân chữ cái của phương án đúng, hoặc gạch chân cả dòng.",
          ),
          plain("Với câu Đúng/Sai nhiều ý: gạch chân ý nào thì ý đó ĐÚNG."),
          plain("Với câu gạch chân: gạch chân đúng cụm từ mà học sinh phải chọn."),
          note(
            "Không gạch chân cũng nhập được — hệ thống để trống và bắt chọn đáp án ở màn kiểm tra. Hệ thống KHÔNG tự đoán đáp án.",
          ),
          blank(),

          h2("6. Lời giải (không bắt buộc)"),
          plain("Viết sau nhãn “Lời giải:” hoặc “Giải thích:” ở cuối câu."),
          blank(),

          h2("7. Ảnh và công thức"),
          plain(
            "Chèn ảnh và công thức Word (Equation) bình thường — hệ thống đọc được.",
          ),
          note(
            "KHÔNG đặt nội dung trong hộp văn bản (Text Box) hay ảnh chụp màn hình chữ: Word không xuất được phần đó và hệ thống sẽ đọc ra file rỗng.",
          ),
          blank(),

          /* ── Ví dụ ──────────────────────────────────────────────────────
           * KHÔNG chen tiêu đề hay ghi chú GIỮA các ví dụ.
           *
           * Parser cắt câu tại mỗi dòng "Câu N", nên mọi dòng nằm giữa hai
           * câu đều bị tính là phần đuôi của câu TRƯỚC. Một dòng nhãn
           * "GC — Ghép cặp" đặt xen vào sẽ dính vào đề bài câu liền trên,
           * và người soạn không hiểu chữ đó ở đâu ra. Ghi chú vì vậy nằm hết
           * trong hai bảng phía trên; dưới đây chỉ có câu hỏi thuần.
           */
          h1("VÍ DỤ CHO TỪNG DẠNG (xoá và thay bằng đề của bạn)"),
          note(
            "Mười một câu dưới đây theo đúng thứ tự bảng dạng câu ở trên, mỗi câu là một ví dụ hoàn chỉnh chép nguyên được.",
          ),
          blank(),

          viDu(1, "NB", "TN", "Thủ đô của Việt Nam là thành phố nào?"),
          p([t("A", { underline: true }), t(". Hà Nội")]),
          plain("B. Hải Phòng"),
          plain("C. Đà Nẵng"),
          plain("D. Cần Thơ"),
          plain("Lời giải: Hà Nội là thủ đô của Việt Nam."),
          blank(),

          viDu(2, "TH", "TNN", "Những số nào sau đây là số nguyên tố?"),
          p([t("A", { underline: true }), t(". 2")]),
          p([t("B", { underline: true }), t(". 3")]),
          plain("C. 4"),
          plain("D. 9"),
          blank(),

          viDu(3, "NB", "DS", "Tổng các góc trong một tam giác bằng 180°."),
          plain("Đáp án: Đúng"),
          blank(),

          viDu(4, "TH", "DSN", "Xét các phát biểu sau, cho biết đúng hay sai:"),
          p([t("a) "), t("Số 0 là số chẵn.", { underline: true })]),
          plain("b) Mọi số nguyên tố đều là số lẻ."),
          p([t("c) "), t("Số 1 không phải số nguyên tố.", { underline: true })]),
          plain("d) Tích hai số lẻ là một số chẵn."),
          blank(),

          viDu(5, "VD", "TLN", "Kết quả của phép tính 6 × 7 là bao nhiêu?"),
          plain("<Key=42>"),
          blank(),

          viDu(
            6,
            "NB",
            "DK",
            "Thủ đô của Việt Nam là ___. Quốc kỳ Việt Nam có ___ ngôi sao vàng.",
          ),
          plain("Đáp án 1: Hà Nội | Hanoi | HN"),
          plain("Đáp án 2: 1 | một"),
          blank(),

          viDu(7, "TH", "GC", "Ghép mỗi quốc gia với thủ đô tương ứng."),
          plain("1. Việt Nam → Hà Nội"),
          plain("2. Pháp → Paris"),
          plain("3. Nhật Bản → Tokyo"),
          plain("4. Anh → London"),
          blank(),

          viDu(8, "VD", "SX", "Sắp xếp các số sau theo thứ tự từ bé đến lớn."),
          plain("1. -5"),
          plain("2. -2"),
          plain("3. 0"),
          plain("4. 7"),
          blank(),

          viDu(
            9,
            "TH",
            "KT",
            "Kéo tên thủ đô vào đúng chỗ trống: Thủ đô Việt Nam là ___, thủ đô Nhật Bản là ___.",
          ),
          plain("Vùng 1: Hà Nội"),
          plain("Vùng 2: Tokyo"),
          plain("Nhiễu: Paris | Seoul"),
          blank(),

          viDu(10, "TH", "GCH", "Gạch chân các danh từ trong câu sau:"),
          p([
            t("Con "),
            t("mèo", { underline: true }),
            t(" nằm ngủ trên chiếc "),
            t("ghế", { underline: true }),
            t(" gỗ."),
          ]),
          blank(),

          viDu(
            11,
            "VD",
            "TL",
            "Trình bày suy nghĩ của em về vai trò của việc đọc sách.",
          ),
          blank(),
          blank(),

          note(
            "Hai phương án viết chung một dòng (cách nhau bằng phím Tab) cũng đọc được — kiểu trình bày tiết kiệm giấy.",
          ),
        ],
      },
    ],
  });
  return doc;
}
