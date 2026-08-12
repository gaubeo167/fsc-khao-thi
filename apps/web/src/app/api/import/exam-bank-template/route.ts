/**
 * GET /api/import/exam-bank-template — generates a sample .docx for the
 * question-bank upload feature, in the FSC "đề mẫu" format: each question
 * prefixed with [mãChuyênĐề.Loại+số] (độ khó tuỳ chọn), correct answers UNDERLINED,
 * short-answer keys as <Key=…>.
 */
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** A plain paragraph. */
function p(children: TextRun[]): Paragraph {
  return new Paragraph({ children });
}
function t(text: string, opts: { bold?: boolean; underline?: boolean } = {}): TextRun {
  return new TextRun({
    text,
    bold: opts.bold,
    ...(opts.underline ? { underline: {} } : {}),
  });
}

export async function GET() {
  const doc = new Document({
    creator: "FSC Exam Platform",
    title: "Mẫu upload ngân hàng câu hỏi — FSC",
    description: "File mẫu soạn câu hỏi theo mã để upload vào ngân hàng.",
    sections: [
      {
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [t("MẪU UPLOAD NGÂN HÀNG CÂU HỎI", { bold: true })],
          }),
          p([t("HƯỚNG DẪN:", { bold: true })]),
          p([
            t(
              "• Mỗi câu bắt đầu bằng mã trong ngoặc vuông: [mãChuyênĐề.Loại+số]. Ví dụ [SI10.02.2.D05].",
            ),
          ]),
          p([
            t(
              "• Loại: D = Trắc nghiệm, F = Đúng/Sai, S = Trả lời ngắn, E = Tự luận.",
            ),
          ]),
          p([
            t("• Độ khó: KHÔNG cần ghi — hệ lấy theo mã trong khung YCCĐ (a = Nhận biết, b = Thông hiểu, c = Vận dụng). Muốn đè thì ghi ở cuối mã: [SI10.02.2.D05.a]."),
          ]),
          p([
            t("• Đáp án ĐÚNG được "),
            t("GẠCH CHÂN", { underline: true, bold: true }),
            t(
              ". Câu trắc nghiệm: gạch chân ≥2 phương án = chọn nhiều đáp án. Câu Đúng/Sai: ý gạch chân = Đúng.",
            ),
          ]),
          p([
            t("• Câu Trả lời ngắn: ghi đáp án trong <Key=…> ngay dưới câu hỏi."),
          ]),
          p([
            t(
              "• Mã (phần đầu) PHẢI khớp mã YCCĐ trong khung năng lực đã tạo cho Môn + Khối. Thay các mã dưới đây bằng mã của bạn.",
            ),
          ]),
          p([t("")]),

          // D — trắc nghiệm 1 đáp án
          p([
            t("[SI10.02.2.D01] ", { bold: true }),
            t("Loại nucleotide nào sau đây KHÔNG có trong phân tử DNA?"),
          ]),
          p([t("A. Adenine.")]),
          p([t("B. Thymine.")]),
          p([t("C. "), t("Uracil.", { underline: true })]),
          p([t("D. Guanine.")]),
          p([t("")]),

          // D — trắc nghiệm nhiều đáp án (≥2 gạch chân)
          p([
            t("[SI10.02.2.D02] ", { bold: true }),
            t("Những chất nào sau đây là carbohydrate? (chọn nhiều đáp án)"),
          ]),
          p([t("A. "), t("Glucose.", { underline: true })]),
          p([t("B. "), t("Cellulose.", { underline: true })]),
          p([t("C. Protein.")]),
          p([t("D. Lipid.")]),
          p([t("")]),

          // F — đúng/sai
          p([
            t("[SI10.02.1.F01] ", { bold: true }),
            t("Cho các nhận định về nước trong tế bào, đúng hay sai?"),
          ]),
          p([t("a) "), t("Nước là dung môi hòa tan nhiều chất trong tế bào.", { underline: true })]),
          p([t("b) Nước không phân cực.")]),
          p([t("c) "), t("Nước tham gia điều hòa nhiệt độ cơ thể.", { underline: true })]),
          p([t("d) Nước chiếm tỉ lệ rất nhỏ trong cơ thể sinh vật.")]),
          p([t("")]),

          // S — trả lời ngắn
          p([
            t("[SI10.01.1.S01] ", { bold: true }),
            t("Có bao nhiêu cấp độ tổ chức sống cơ bản trong ví dụ đã cho?"),
          ]),
          p([t("<Key=3>")]),
          p([t("")]),

          // E — tự luận (kèm lời giải: cơ sở cho chấm theo rubric sau này)
          p([
            t("[SI10.01.1.E01.c] " /* .c = đè độ khó, tuỳ chọn */, { bold: true }),
            t("Trình bày vai trò của sinh học đối với phát triển bền vững."),
          ]),
          p([t("Lời giải:", { bold: true })]),
          p([
            t(
              "- Sinh học cung cấp cơ sở khoa học cho bảo tồn đa dạng sinh học.",
            ),
          ]),
          p([
            t(
              "- Ứng dụng công nghệ sinh học giúp tăng năng suất mà giảm tác động môi trường.",
            ),
          ]),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": 'attachment; filename="FSC-mau-upload-ngan-hang.docx"',
    },
  });
}
