/**
 * GET /api/import/basic-template
 *
 * Trả file Word mẫu cho đề KHÔNG dùng mã YCCĐ. Nội dung file nằm ở
 * `template-co-ban.ts` để test dựng lại được mà không cần khởi động Next.
 */
import { Packer } from "docx";
import { NextResponse } from "next/server";

import { verifyCaller } from "@/lib/api-auth";
import { buildBasicTemplate } from "@/features/question-bank/lib/template-co-ban";

export async function GET(req: Request) {
  const gate = await verifyCaller(req, { staffOnly: true });
  if ("error" in gate) return gate.error;

  const buffer = await Packer.toBuffer(buildBasicTemplate());
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": 'attachment; filename="FSC-mau-soan-de-co-ban.docx"',
    },
  });
}
