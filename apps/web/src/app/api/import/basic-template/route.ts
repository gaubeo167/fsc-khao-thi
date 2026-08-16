/**
 * GET /api/import/basic-template
 *
 * Sinh file Word MẪU cho đề KHÔNG dùng mã YCCĐ, kèm hướng dẫn viết ngay
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
 * phương án để đoán dạng. Đếm được với trắc nghiệm, nhưng câu Đúng/Sai, trả
 * lời ngắn và tự luận đều không có A/B/C/D nào để đếm — nên trước đây chúng
 * luôn ra "chưa nhận ra dạng" và người soạn phải chọn tay từng câu.
 *
 * Hướng dẫn nằm TRONG file vì giáo viên tải về rồi soạn thẳng trên đó;
 * hướng dẫn ở chỗ khác là hướng dẫn không ai đọc. Quên xoá cũng không sao —
 * parser chỉ đọc những dòng bắt đầu bằng "Câu N.".
 *
 * Nội dung TRUNG TÍNH, không thuộc môn nào, dùng chung cho mọi môn.
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
const p = (children: TextRun[]) => new Paragraph({ children });
const plain = (text: string) => p([t(text)]);
const blank = () => new Paragraph({ children: [] });
const h = (text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]) =>
  new Paragraph({ text, heading: level, spacing: { before: 240, after: 120 } });

/** Ghi chú hướng dẫn — in nghiêng, màu xám, để phân biệt với nội dung đề. */
const note = (text: string) => p([t(text, { italics: true, color: "6B7280" })]);

/** Một dòng của bảng tra: mã in đậm, nghĩa theo sau. */
const row = (code: string, meaning: string) =>
  p([t(`   ${code.padEnd(6)}`, { bold: true }), t(meaning)]);

export async function GET(req: Request) {
  const gate = await verifyCaller(req, { staffOnly: true });
  if ("error" in gate) return gate.error;

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [t("MẪU SOẠN ĐỀ CƠ BẢN", { bold: true })],
            spacing: { after: 60 },
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [t("(không cần mã YCCĐ)", { italics: true, color: "6B7280" })],
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
          note("Viết “Câu 1:” hay “Câu 1)” đều được."),
          blank(),

          h("2. Hai nhãn đặt ngay sau số câu", HeadingLevel.HEADING_2),
          p([
            t("Câu 1. "),
            t("[NB]", { bold: true }),
            t("["),
            t("TN", { bold: true }),
            t("] Nội dung câu hỏi viết ở đây?"),
          ]),
          blank(),
          plain("   Nhãn thứ nhất: MỨC ĐỘ.   Nhãn thứ hai: DẠNG CÂU."),
          note(
            "Viết gộp cũng được: [NB-TN], [NB/TN], [NB TN]. Thiếu một nhãn cũng nhập được — hệ thống sẽ bắt chọn tay ở màn kiểm tra trước khi lưu.",
          ),
          blank(),

          h("3. Bảng MỨC ĐỘ", HeadingLevel.HEADING_2),
          row("NB", "Nhận biết"),
          row("TH", "Thông hiểu"),
          row("VD", "Vận dụng"),
          note("Viết VDC (vận dụng cao) cũng được, hệ thống xếp chung vào Vận dụng."),
          blank(),

          h("4. Bảng DẠNG CÂU", HeadingLevel.HEADING_2),
          row("TN", "Trắc nghiệm — chỉ MỘT phương án đúng"),
          row("TNN", "Trắc nghiệm — NHIỀU phương án đúng"),
          row("DS", "Đúng/Sai nhiều ý (a, b, c, d)"),
          row("TLN", "Trả lời ngắn"),
          row("TL", "Tự luận (giáo viên chấm tay)"),
          blank(),
          note(
            "Nếu quen mã YCCĐ thì viết chữ tắt một ký tự cũng được, cùng nghĩa: D = TN, M = TNN, F = DS, S = TLN, E = TL.",
          ),
          blank(),

          h("5. Đáp án đúng: GẠCH CHÂN", HeadingLevel.HEADING_2),
          plain("Gạch chân chữ cái của phương án đúng, hoặc gạch chân cả dòng."),
          plain("Câu Đúng/Sai: gạch chân ý nào thì ý đó ĐÚNG, không gạch là SAI."),
          note(
            "Không gạch chân cũng nhập được — hệ thống để trống và bắt chọn đáp án ở màn kiểm tra. Hệ thống KHÔNG tự đoán đáp án.",
          ),
          blank(),

          h("6. Đáp án câu trả lời ngắn", HeadingLevel.HEADING_2),
          p([t("Viết trong ngoặc nhọn: "), t("<Key=42>", { bold: true })]),
          p([
            t("Cho điểm một phần và kèm lời nhắc: "),
            t("<Key=4,2|50%|Thiếu đơn vị>", { bold: true }),
          ]),
          note("Nhiều đáp án chấp nhận được thì viết nhiều <Key=…> liền nhau."),
          blank(),

          h("7. Lời giải (không bắt buộc)", HeadingLevel.HEADING_2),
          plain("Viết sau nhãn “Lời giải:” hoặc “Giải thích:” ở cuối câu."),
          blank(),

          h("8. Ảnh và công thức", HeadingLevel.HEADING_2),
          plain("Chèn ảnh và công thức Word (Equation) bình thường — hệ thống đọc được."),
          note(
            "KHÔNG đặt nội dung trong hộp văn bản (Text Box) hay ảnh chụp màn hình chữ: Word không xuất được phần đó và hệ thống sẽ đọc ra file rỗng.",
          ),
          blank(),
          blank(),

          // ── Ví dụ ────────────────────────────────────────────────────
          h("VÍ DỤ ĐỦ NĂM DẠNG (xoá và thay bằng đề của bạn)", HeadingLevel.HEADING_1),
          blank(),

          p([t("Câu 1. [NB][TN] Đâu là ví dụ của câu trắc nghiệm một đáp án?")]),
          p([t("A", { underline: true }), t(". Phương án đúng, chữ cái được gạch chân.")]),
          plain("B. Phương án sai thứ nhất."),
          plain("C. Phương án sai thứ hai."),
          plain("D. Phương án sai thứ ba."),
          plain("Lời giải: Phương án A đúng vì chữ cái A đã được gạch chân."),
          blank(),

          p([t("Câu 2. [TH][TNN] Những phương án nào sau đây là đúng?")]),
          p([t("A", { underline: true }), t(". Phương án đúng thứ nhất.")]),
          p([t("B", { underline: true }), t(". Phương án đúng thứ hai.")]),
          plain("C. Phương án sai thứ nhất."),
          plain("D. Phương án sai thứ hai."),
          note("TNN = nhiều đáp án đúng, nên gạch chân từ hai phương án trở lên."),
          blank(),

          p([t("Câu 3. [TH][DS] Xét các phát biểu sau, cho biết đúng hay sai:")]),
          p([t("a) "), t("Phát biểu này ĐÚNG nên được gạch chân.", { underline: true })]),
          plain("b) Phát biểu này sai nên để nguyên."),
          plain("c) Phát biểu thứ ba."),
          plain("d) Phát biểu thứ tư."),
          blank(),

          p([t("Câu 4. [VD][TLN] Một phép tính cho kết quả là bao nhiêu?")]),
          plain("<Key=42>"),
          blank(),

          p([t("Câu 5. [VD][TL] Trình bày quan điểm của em về vấn đề nêu trên.")]),
          note("Câu tự luận không có đáp án chấm máy — giáo viên chấm tay."),
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
      "content-disposition": 'attachment; filename="FSC-mau-soan-de-co-ban.docx"',
    },
  });
}
