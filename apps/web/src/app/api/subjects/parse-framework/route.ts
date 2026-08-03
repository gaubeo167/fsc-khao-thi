/**
 * POST /api/subjects/parse-framework
 *
 * Accepts a .docx "khung kiến thức cần đạt" (multipart, field `file`),
 * extracts its text with mammoth, and parses the standardised template into
 * a 3-level tree (Chương → Chuyên đề → Chỉ báo) with codes. Deterministic —
 * no AI. Staff-only.
 *
 * Returns: { tree, counts }
 */
import mammoth from "mammoth";
import { NextResponse } from "next/server";

import { verifyCaller } from "@/lib/api-auth";
import { parseFrameworkText } from "@/lib/toc/parse-framework";

export const runtime = "nodejs";

const MAX_BYTES = 8_000_000; // 8MB

export async function POST(req: Request) {
  const gate = await verifyCaller(req, { staffOnly: true });
  if ("error" in gate) return gate.error;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "bad_request", message: "Cần gửi file dạng multipart/form-data." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "no_file", message: "Thiếu file (field `file`)." },
      { status: 400 },
    );
  }
  if (!/\.docx$/i.test(file.name)) {
    return NextResponse.json(
      { error: "bad_type", message: "Chỉ hỗ trợ file Word .docx." },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "too_large", message: "File quá lớn (tối đa 8MB)." },
      { status: 400 },
    );
  }

  let text: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { value } = await mammoth.extractRawText({ buffer });
    text = value;
  } catch (err) {
    return NextResponse.json(
      {
        error: "extract_failed",
        message:
          "Không đọc được nội dung file .docx. Kiểm tra lại file có đúng định dạng Word không.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 422 },
    );
  }

  const { tree, counts } = parseFrameworkText(text);
  if (counts.chapters === 0) {
    return NextResponse.json(
      {
        error: "no_structure",
        message:
          "Không nhận ra khung kiến thức trong file. File cần theo đúng mẫu có mã dạng [SI10.01.1.D01].",
      },
      { status: 422 },
    );
  }

  return NextResponse.json({ tree, counts });
}
