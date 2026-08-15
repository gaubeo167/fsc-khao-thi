/**
 * GET /api/import/yccd-template
 *
 * Sinh file Word MẪU cho kiểu soạn đề theo mã YCCĐ, kèm hướng dẫn viết ngay
 * trong file.
 *
 * Vì sao hướng dẫn nằm TRONG file chứ không phải một trang web riêng: giáo
 * viên tải file về, mở Word, và soạn ngay trên đó. Hướng dẫn ở nơi khác là
 * hướng dẫn không ai đọc. Phần hướng dẫn được đánh dấu rõ để xoá trước khi
 * nộp, và kể cả quên xoá thì parser cũng bỏ qua vì nó không khớp mốc câu nào.
 *
 * Nội dung TRUNG TÍNH: câu hỏi mẫu không thuộc môn nào, dùng chung cho mọi
 * môn. Mã YCCĐ trong mẫu là mã minh hoạ (XX10.01.01) — giáo viên thay bằng mã
 * thật của môn mình.
 */
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import { NextResponse } from "next/server";

import { verifyCaller } from "@/lib/api-auth";

function t(
  text: string,
  o: { bold?: boolean; underline?: boolean; italics?: boolean; color?: string } = {},
): TextRun {
  return new TextRun({
    text,
    bold: o.bold,
    italics: o.italics,
    color: o.color,
    underline: o.underline ? {} : undefined,
  });
}
const p = (children: TextRun[], spacing?: number) =>
  new Paragraph({ children, spacing: spacing ? { after: spacing } : undefined });
const plain = (text: string) => p([t(text)]);
const blank = () => new Paragraph({ children: [] });
const h = (text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]) =>
  new Paragraph({ text, heading: level, spacing: { before: 240, after: 120 } });

/** Ghi chú hướng dẫn — in nghiêng, màu xám, để phân biệt với nội dung đề. */
const note = (text: string) => p([t(text, { italics: true, color: "6B7280" })]);

export async function GET(req: Request) {
  const gate = await verifyCaller(req, { staffOnly: true });
  if ("error" in gate) return gate.error;

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [t("MẪU SOẠN ĐỀ THEO MÃ YCCĐ", { bold: true })],
            spacing: { after: 240 },
          }),

          // ── Hướng dẫn ────────────────────────────────────────────────
          h("HƯỚNG DẪN (xoá toàn bộ phần này trước khi nộp)", HeadingLevel.HEADING_1),
          note(
            "Không xoá cũng không sao — hệ thống chỉ đọc những dòng bắt đầu bằng “Câu N.”, phần còn lại bị bỏ qua.",
          ),
          blank(),

          h("1. Mỗi câu bắt đầu bằng một dòng “Câu N.”", HeadingLevel.HEADING_2),
          plain("Ví dụ:  Câu 1.   Câu 2.   Câu 15."),
          note("Viết “Câu 1:” hay “Câu 1)” đều được. Nội dung đề viết ngay sau đó."),
          blank(),

          h("2. Mã YCCĐ đặt trong ngoặc vuông, ngay sau số câu", HeadingLevel.HEADING_2),
          p([
            t("Câu 1. "),
            t("[XX10.01.01.D01]", { bold: true }),
            t(" Nội dung câu hỏi viết ở đây?"),
          ]),
          blank(),
          plain("Mã gồm bốn phần, ngăn nhau bằng dấu chấm:"),
          p([t("   XX10.01.01", { bold: true }), t("   mã YCCĐ trong khung năng lực của môn")]),
          p([t("   D", { bold: true }), t("            chữ LOẠI CÂU — xem bảng dưới")]),
          p([t("   01", { bold: true }), t("           số thứ tự câu trong YCCĐ đó")]),
          blank(),
          note(
            "Hệ thống dựa vào mã này để tự gắn chuyên đề VÀ tự suy mức độ (Nhận biết / Thông hiểu / Vận dụng) theo khung năng lực. Ghi đúng mã thì không phải chọn tay câu nào.",
          ),
          blank(),

          h("3. Bảng chữ LOẠI CÂU", HeadingLevel.HEADING_2),
          p([t("   D", { bold: true }), t("   Trắc nghiệm nhiều lựa chọn (A, B, C, D)")]),
          p([t("   F", { bold: true }), t("   Đúng/Sai nhiều ý (a, b, c, d)")]),
          p([t("   S", { bold: true }), t("   Trả lời ngắn")]),
          p([t("   E", { bold: true }), t("   Tự luận")]),
          blank(),

          h("4. Đáp án đúng: GẠCH CHÂN", HeadingLevel.HEADING_2),
          plain("Gạch chân chữ cái của phương án đúng, hoặc gạch chân cả dòng."),
          note(
            "Không gạch chân cũng nhập được — hệ thống sẽ để trống và bắt chọn đáp án ở màn kiểm tra trước khi lưu.",
          ),
          blank(),

          h("5. Lời giải (không bắt buộc)", HeadingLevel.HEADING_2),
          plain("Viết sau nhãn “Lời giải:” hoặc “Giải thích:” ở cuối câu."),
          blank(),

          h("6. Ảnh và công thức", HeadingLevel.HEADING_2),
          plain("Chèn ảnh và công thức Word (Equation) bình thường — hệ thống đọc được."),
          note(
            "KHÔNG đặt nội dung trong hộp văn bản (Text Box) hay ảnh chụp màn hình chữ: Word không xuất được phần đó và hệ thống sẽ đọc ra file rỗng.",
          ),
          blank(),
          blank(),

          // ── Ví dụ ────────────────────────────────────────────────────
          h("VÍ DỤ ĐỦ BỐN LOẠI CÂU (xoá và thay bằng đề của bạn)", HeadingLevel.HEADING_1),
          blank(),

          p([
            t("Câu 1. "),
            t("[XX10.01.01.D01]"),
            t(" Đâu là ví dụ của loại câu trắc nghiệm nhiều lựa chọn?"),
          ]),
          p([t("A", { underline: true }), t(". Phương án đúng, chữ cái được gạch chân.")]),
          plain("B. Phương án sai thứ nhất."),
          plain("C. Phương án sai thứ hai."),
          plain("D. Phương án sai thứ ba."),
          plain("Lời giải: Phương án A đúng vì chữ cái A đã được gạch chân."),
          blank(),

          p([
            t("Câu 2. "),
            t("[XX10.01.02.F01]"),
            t(" Xét các phát biểu sau, cho biết đúng hay sai:"),
          ]),
          plain("a) Phát biểu thứ nhất."),
          plain("b) Phát biểu thứ hai."),
          plain("c) Phát biểu thứ ba."),
          plain("d) Phát biểu thứ tư."),
          note("Chữ F trong mã cho biết đây là câu Đúng/Sai nhiều ý."),
          blank(),

          p([
            t("Câu 3. "),
            t("[XX10.01.03.S01]"),
            t(" Câu hỏi yêu cầu điền một đáp án ngắn?"),
          ]),
          plain("Đáp án: 42"),
          note("Chữ S cho biết đây là câu trả lời ngắn. Ghi đáp án sau nhãn “Đáp án:”."),
          blank(),

          p([
            t("Câu 4. "),
            t("[XX10.01.04.E01]"),
            t(" Trình bày quan điểm của em về vấn đề nêu trên."),
          ]),
          note("Chữ E cho biết đây là câu tự luận, giáo viên chấm tay."),
          blank(),
          blank(),

          note(
            "Hai phương án viết chung một dòng (cách nhau bằng phím Tab) cũng đọc được — kiểu trình bày tiết kiệm giấy.",
          ),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition":
        'attachment; filename="FSC-mau-soan-de-theo-YCCD.docx"',
    },
  });
}
