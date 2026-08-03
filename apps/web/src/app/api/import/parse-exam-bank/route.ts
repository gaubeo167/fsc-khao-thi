/**
 * POST /api/import/parse-exam-bank
 *
 * Parses an FSC "đề mẫu" .docx (see De_Mau template) into bank questions.
 * Extracts HTML with underline PRESERVED (style map u => u) so the parser
 * can read the đáp án (gạch chân = đúng), then hands to `parseExamBank`.
 *
 * Returns: { questions, warnings } — chuyên-đề matching + review happen
 * client-side (the TOC lives in the browser store). Staff-only.
 */
import mammoth from "mammoth";
import { NextResponse } from "next/server";

import {
  htmlToMarkedText,
  parseExamBank,
} from "@/features/question-bank/lib/parse-exam-bank";
import { verifyCaller } from "@/lib/api-auth";

export const runtime = "nodejs";

const MAX_BYTES = 12_000_000; // 12MB

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
      { error: "too_large", message: "File quá lớn (tối đa 12MB)." },
      { status: 400 },
    );
  }

  let marked: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { value: html } = await mammoth.convertToHtml(
      { buffer },
      {
        styleMap: ["u => u"], // preserve underline = đáp án
        // Inline images as base64 data URIs so câu hỏi có ảnh hiển thị đủ.
        convertImage: mammoth.images.imgElement(async (image) => {
          const data = await image.readAsBase64String();
          return { src: `data:${image.contentType};base64,${data}` };
        }),
      },
    );
    marked = htmlToMarkedText(html);
  } catch (err) {
    return NextResponse.json(
      {
        error: "extract_failed",
        message: "Không đọc được nội dung file .docx.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 422 },
    );
  }

  const { questions, warnings } = parseExamBank(marked);
  if (questions.length === 0) {
    return NextResponse.json(
      {
        error: "no_questions",
        message:
          "Không tìm thấy câu hỏi nào. File cần theo mẫu, mỗi câu bắt đầu bằng mã dạng [SI10.02.2.D05.a].",
        warnings,
      },
      { status: 422 },
    );
  }

  return NextResponse.json({ questions, warnings, count: questions.length });
}
