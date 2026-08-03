/**
 * GET /api/subjects/framework-template — sample .docx for the "khung kiến
 * thức" import (mục lục môn học). Uses the flat, code-anchored form the
 * parser accepts: chương "[MÃ]: tên", chuyên đề "x.y Tên", chỉ báo "[MÃ]"
 * followed by its description line.
 */
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function line(text: string, bold = false): Paragraph {
  return new Paragraph({ children: [new TextRun({ text, bold })] });
}

export async function GET() {
  const doc = new Document({
    creator: "FSC Exam Platform",
    title: "Mẫu khung kiến thức — FSC",
    description: "File mẫu tạo mục lục môn học theo mã.",
    sections: [
      {
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: "MẪU KHUNG KIẾN THỨC", bold: true })],
          }),
          line("HƯỚNG DẪN:", true),
          line("• Mã có dạng [MÔN+KHỐI.Chương.ChuyênĐề.D<số>]. Ví dụ SI10 = Sinh Khối 10."),
          line("• Chương: dòng \"[SI10.01]: 1. Tên chương\"."),
          line("• Chuyên đề: dòng \"1.1. Tên chuyên đề\" (số chương.số chuyên đề)."),
          line("• Chỉ báo: dòng mã \"[SI10.01.1.D01]\" và dòng ngay dưới là nội dung chỉ báo."),
          line("• Đổi SI10 và các mã bên dưới thành mã môn/khối của bạn rồi thêm nội dung thật."),
          line(""),

          line("[SI10.01]: 1. Phần mở đầu", true),
          line("1.1. Giới thiệu khái quát chương trình môn học"),
          line("[SI10.01.1.D01]"),
          line("a. Nêu được đối tượng và lĩnh vực nghiên cứu."),
          line("[SI10.01.1.D02]"),
          line("b. Phân tích được vai trò của môn học với đời sống."),
          line("1.2. Các phương pháp nghiên cứu"),
          line("[SI10.01.2.D01]"),
          line("a. Nêu được một số phương pháp nghiên cứu."),
          line("[SI10.01.2.D02]"),
          line("c. Vận dụng được phương pháp vào tình huống thực tế."),
          line(""),

          line("[SI10.02]: 2. Chương thứ hai", true),
          line("2.1. Chuyên đề đầu tiên của chương 2"),
          line("[SI10.02.1.D01]"),
          line("a. Trình bày được khái niệm cơ bản."),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": 'attachment; filename="FSC-mau-khung-kien-thuc.docx"',
    },
  });
}
