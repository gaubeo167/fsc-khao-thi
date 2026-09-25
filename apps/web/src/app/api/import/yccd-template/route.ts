/**
 * GET /api/import/yccd-template — phát file Word mẫu cho kiểu soạn đề theo
 * mã YCCĐ. Nội dung tài liệu nằm ở `lib/template-yccd.ts` để ca hồi quy đọc
 * ngược được đúng file này.
 */
import { Packer } from "docx";
import { NextResponse } from "next/server";

import { buildYccdTemplate } from "@/features/question-bank/lib/template-yccd";
import { verifyCaller } from "@/lib/api-auth";

export async function GET(req: Request) {
  const gate = await verifyCaller(req, { staffOnly: true });
  if ("error" in gate) return gate.error;

  const buffer = await Packer.toBuffer(buildYccdTemplate());
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition":
        'attachment; filename="FSC-mau-soan-de-theo-YCCD.docx"',
    },
  });
}
