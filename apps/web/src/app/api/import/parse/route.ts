import mammoth from "mammoth";
import { NextResponse } from "next/server";

import { parseImportText } from "@/features/question-bank/lib/parse-import";

/**
 * POST /api/import/parse
 *
 * Accepts either:
 *   - multipart/form-data with a `file` field (.docx) — uses mammoth to
 *     extract plain text
 *   - application/json with `{ text: string }` — uses the text directly
 *
 * Returns `{ questions, warnings }` from the parser.
 */
export async function POST(request: Request) {
  let text = "";

  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const body = await request.json();
      text = typeof body?.text === "string" ? body.text : "";
    } else {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json(
          { error: "no_file", message: "Không tìm thấy file." },
          { status: 400 },
        );
      }
      const buf = Buffer.from(await file.arrayBuffer());
      // mammoth gives us the text content from .docx, stripping styling
      const result = await mammoth.extractRawText({ buffer: buf });
      text = result.value ?? "";
    }
  } catch (err) {
    return NextResponse.json(
      {
        error: "read_failed",
        message: err instanceof Error ? err.message : "Không đọc được file.",
      },
      { status: 400 },
    );
  }

  if (!text.trim()) {
    return NextResponse.json(
      { error: "empty", message: "File rỗng hoặc không có nội dung." },
      { status: 400 },
    );
  }

  const { questions, warnings } = parseImportText(text);
  return NextResponse.json({ questions, warnings, count: questions.length });
}
