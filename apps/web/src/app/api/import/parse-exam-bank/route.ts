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
  try {
    return await handle(req);
  } catch (err) {
    // Guarantee a JSON body — an unhandled throw would return an empty
    // response and the client would see "Unexpected end of JSON input".
    return NextResponse.json(
      {
        error: "server_error",
        message: "Lỗi máy chủ khi đọc đề.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}

async function handle(req: Request) {
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
    // Chiều ngược của cảnh báo trong /api/import/parse: file soạn theo mẫu
    // FSC (`# Câu N`) tải nhầm vào đây thì chỉ sang đúng nút thay vì báo
    // chung chung "không tìm thấy câu hỏi nào".
    const looksLikeFscTemplate = /^\s*(#\s*Câu\s*\d|===\s*CÂU\s*\d)/im.test(marked);
    // Word KHÔNG xuất được chữ nằm trong hộp văn bản (text box) / hình vẽ /
    // ảnh chụp — file nhìn đầy chữ nhưng server đọc ra gần như rỗng. Đây là
    // ngõ cụt hay gặp nhất, nên gọi tên thẳng thay vì báo "sai mẫu".
    const extractedTooLittle = marked.replace(/\s/g, "").length < 40;
    return NextResponse.json(
      {
        error: looksLikeFscTemplate
          ? "wrong_template"
          : extractedTooLittle
            ? "no_text"
            : "no_questions",
        message: looksLikeFscTemplate
          ? 'File này soạn theo mẫu FSC (# Câu 1 · Dạng: …). Đóng hộp thoại này và dùng nút "Import từ Word" ở màn Ngân hàng câu hỏi.'
          : extractedTooLittle
            ? "Không đọc được chữ nào trong file. Thường do nội dung nằm trong hộp văn bản (text box), khung hình vẽ hoặc ảnh chụp — Word không xuất được các phần này. Hãy dán nội dung ra đoạn văn thường rồi lưu lại .docx."
            : "Không tìm thấy câu hỏi nào. File cần theo mẫu, mỗi câu bắt đầu bằng mã dạng [SI10.02.2.D05.a].",
        warnings,
        // Vài dòng đầu server ĐỌC ĐƯỢC từ file. Không có cái này thì lỗi là
        // ngõ cụt: người dùng nhìn file thấy mã đúng, còn server lại đọc ra
        // thứ khác (bảng, hộp văn bản, ảnh chụp, mã sai dấu…) mà không ai
        // biết. Hiển thị luôn trong hộp thoại.
        preview: previewLines(marked),
      },
      { status: 422 },
    );
  }

  return NextResponse.json({ questions, warnings, count: questions.length });
}

/** 12 dòng đầu có nội dung, cắt ngắn — đủ để thấy mã câu có tới server không. */
function previewLines(marked: string): string[] {
  return marked
    .split(/\r?\n/)
    .map((l) => l.replace(/⟦\/?U⟧/g, "").trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((l) => (l.length > 120 ? `${l.slice(0, 120)}…` : l));
}
