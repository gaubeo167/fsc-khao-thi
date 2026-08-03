/**
 * GET /api/subjects/framework-template — sample .docx for the "khung kiến
 * thức" import (mục lục môn học).
 *
 * Contains a HƯỚNG DẪN section at the top, then the full real sample
 * (Sinh học 10 — 3 chương / 24 chuyên đề / 158 chỉ báo) taken from the
 * school's own file, re-emitted in the flat, code-anchored form the parser
 * accepts. Teachers copy this, swap the SI10 codes for their subject, and
 * edit the content.
 */
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import { NextResponse } from "next/server";

import type { FrameworkNode } from "@/lib/toc/parse-framework";

import { KHUNG_MAU_TREE } from "./khung-mau-data";

export const runtime = "nodejs";

function line(text: string, bold = false): Paragraph {
  return new Paragraph({ children: [new TextRun({ text, bold })] });
}

/** Last numeric segment of a code, e.g. "SI10.01" → 1, "SI10.01.1" → 1. */
function lastNum(code: string): number {
  const seg = code.split(".").pop() ?? "";
  return Number.parseInt(seg, 10) || 0;
}
/** "SI10.01.1" → "1.1" (chương.chuyên đề, display form). */
function topicDisplay(code: string): string {
  const parts = code.split(".");
  const chap = Number.parseInt(parts[1] ?? "0", 10) || 0;
  const topic = Number.parseInt(parts[2] ?? "0", 10) || 0;
  return `${chap}.${topic}`;
}

function emit(nodes: FrameworkNode[], depth: number, out: Paragraph[]): void {
  for (const n of nodes) {
    if (depth === 0) {
      out.push(line("")); // blank between chương
      out.push(line(`[${n.code}]: ${lastNum(n.code)}. ${n.name}`, true));
    } else if (depth === 1) {
      out.push(line(`${topicDisplay(n.code)}. ${n.name}`));
    } else {
      // chỉ báo: code line then its content line
      out.push(line(`[${n.code}]`));
      out.push(line(n.name));
    }
    if (n.children && n.children.length > 0) emit(n.children, depth + 1, out);
  }
}

export async function GET() {
  const body: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: "MẪU KHUNG KIẾN THỨC", bold: true })],
    }),
    line("HƯỚNG DẪN (đọc trước khi dùng):", true),
    line("• Mã có dạng [MÔN+KHỐI.Chương.ChuyênĐề.D<số>]. Ví dụ SI10 = Sinh Khối 10; MA11 = Toán Khối 11."),
    line("• Chương: dòng \"[SI10.01]: 1. Tên chương\"."),
    line("• Chuyên đề: dòng \"1.1. Tên chuyên đề\" (số chương . số chuyên đề)."),
    line("• Chỉ báo (yêu cầu cần đạt): dòng mã \"[SI10.01.1.D01]\" và dòng NGAY DƯỚI là nội dung."),
    line("• a. / b. / c. ở đầu nội dung chỉ báo = mức độ Nhận biết / Thông hiểu / Vận dụng."),
    line("• Cách dùng: đổi SI10 và toàn bộ mã bên dưới thành mã môn/khối của bạn, sửa tên chương/chuyên đề/nội dung cho đúng, rồi tải lên ở tab \"Mục lục môn học\"."),
    line("• Bên dưới là VÍ DỤ ĐẦY ĐỦ môn Sinh học 10 (3 chương, 24 chuyên đề, 158 chỉ báo) để bạn dễ hình dung."),
    line(""),
    line("───────── VÍ DỤ ĐẦY ĐỦ (SINH HỌC 10) ─────────", true),
  ];
  emit(KHUNG_MAU_TREE, 0, body);

  const doc = new Document({
    creator: "FSC Exam Platform",
    title: "Mẫu khung kiến thức — FSC",
    description: "File mẫu tạo mục lục môn học theo mã (kèm ví dụ đầy đủ).",
    sections: [{ children: body }],
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
