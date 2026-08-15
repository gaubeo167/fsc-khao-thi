/**
 * POST /api/import/parse-questions
 *
 * MỘT cửa vào cho mọi file câu hỏi .docx. Thay cho hai route cũ
 * (`/api/import/parse` + `/api/import/parse-exam-bank`) vốn buộc giáo viên
 * phải tự biết file của mình thuộc mẫu nào TRƯỚC khi tải lên.
 *
 * Luồng: trích xuất một lần → nhận dạng khuôn → gọi đúng parser → chuẩn hoá
 * về `DraftQuestion`.
 *
 * Điểm kỹ thuật đáng lưu ý: hai route cũ trích xuất KHÁC nhau và không thể
 * dùng lẫn — bản của "Import từ Word" giữ heading (`# Câu N`) và chuyển công
 * thức OMath thành LaTeX nhưng vứt gạch chân; bản của "Upload đề theo mã"
 * giữ gạch chân (đáp án đúng) nhưng mất heading và công thức. Vì phải nhận
 * dạng TRƯỚC khi biết dùng parser nào, ở đây trích một lần giữ CẢ BA, rồi
 * kết xuất ra hai dạng văn bản từ cùng một HTML.
 *
 * Trả về: { format, questions: DraftQuestion[], warnings, detect }
 * Chỉ nhân viên (staff) được gọi.
 */
import JSZip from "jszip";
import mammoth from "mammoth";
import { NextResponse } from "next/server";

import { verifyCaller } from "@/lib/api-auth";
import {
  detectImportFormat,
  FORMAT_LABEL,
} from "@/features/question-bank/lib/import-detect";
import {
  draftFromFsc,
  draftFromMaDe,
  type DraftQuestion,
} from "@/features/question-bank/lib/import-draft";
import { parseImportText } from "@/features/question-bank/lib/parse-import";
import {
  htmlToMarkedText,
  parseExamBank,
} from "@/features/question-bank/lib/parse-exam-bank";

import { inlineOMathAsLatex } from "../parse/omath-to-latex";
import { htmlToFscText } from "@/features/question-bank/lib/html-to-fsc-text";

const MAX_BYTES = 12 * 1024 * 1024;

export async function POST(req: Request) {
  const gate = await verifyCaller(req, { staffOnly: true });
  if ("error" in gate) return gate.error;

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return bad("bad_request", "Không đọc được dữ liệu tải lên.");
  }
  if (!file) return bad("no_file", "Chưa chọn file.");
  if (!/\.docx$/i.test(file.name)) {
    return bad(
      "bad_type",
      "Hiện chỉ đọc được file Word .docx. File .doc cũ cần mở bằng Word rồi Lưu thành .docx.",
    );
  }
  if (file.size > MAX_BYTES) {
    return bad("too_large", "File quá lớn (tối đa 12MB).");
  }

  let html: string;
  try {
    html = await extractHtml(Buffer.from(await file.arrayBuffer()));
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

  // Hai kết xuất từ CÙNG một HTML: bản FSC bỏ mọi thẻ, bản "marked" giữ dấu
  // gạch chân thành ký hiệu mà parser mã đề đọc được.
  const fscText = htmlToFscText(html);
  const markedText = htmlToMarkedText(html);

  const detect = detectImportFormat(fscText);

  if (detect.format == null) {
    // Word KHÔNG xuất được chữ nằm trong hộp văn bản / hình vẽ / ảnh chụp:
    // file nhìn đầy chữ nhưng server đọc ra gần như rỗng. Đây là ngõ cụt hay
    // gặp nhất nên gọi tên thẳng, kèm vài dòng server ĐỌC ĐƯỢC để người dùng
    // tự đối chiếu — báo "sai mẫu" chung chung thì không ai sửa được.
    const doc = fscText.trim();
    return NextResponse.json(
      {
        error: "unknown_format",
        message:
          doc.length < 40
            ? "Đọc được rất ít chữ từ file. Thường là do nội dung nằm trong hộp văn bản (text box), hình vẽ hoặc ảnh chụp — Word không xuất được phần đó. Hãy dán nội dung ra ngoài dưới dạng chữ thường."
            : "Không nhận ra cấu trúc câu hỏi trong file. Cần mỗi câu bắt đầu bằng một dòng “Câu 1”, hoặc bằng mã chuyên đề dạng [SI10.02.2.D05].",
        detect,
        preview: previewLines(fscText),
      },
      { status: 422 },
    );
  }

  let questions: DraftQuestion[] = [];
  let warnings: string[] = [];

  if (detect.format === "ma-de") {
    const r = parseExamBank(markedText);
    warnings = r.warnings;
    questions = r.questions.map((q, i) => draftFromMaDe(q, i + 1));
  } else {
    const r = parseImportText(fscText);
    warnings = r.warnings;
    questions = r.questions.map((q, i) => draftFromFsc(q, i + 1));
  }

  if (questions.length === 0) {
    return NextResponse.json(
      {
        error: "no_questions",
        message: `Nhận ra file theo ${FORMAT_LABEL[detect.format]} nhưng không tách được câu hỏi nào.`,
        detect,
        warnings,
        preview: previewLines(fscText),
      },
      { status: 422 },
    );
  }

  return NextResponse.json({
    format: detect.format,
    formatLabel: FORMAT_LABEL[detect.format],
    detect,
    questions,
    warnings,
    count: questions.length,
  });
}

function bad(error: string, message: string) {
  return NextResponse.json({ error, message }, { status: 400 });
}

/** 12 dòng đầu có nội dung — đủ để người dùng thấy server đọc ra cái gì. */
function previewLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((l) => (l.length > 120 ? `${l.slice(0, 120)}…` : l));
}

/**
 * Trích HTML một lần, giữ đủ ba thứ mà hai route cũ mỗi bên chỉ giữ một
 * phần: công thức OMath (→ $LaTeX$), heading (`# Câu N`), và gạch chân
 * (đáp án đúng của khuôn mã đề).
 */
async function extractHtml(buf: Buffer): Promise<string> {
  // OMath → $LaTeX$ trước khi mammoth nhìn thấy file. Hỏng bước này thì bỏ
  // qua chứ không làm chết cả lần nhập — cùng lắm là mất công thức.
  let pre = buf;
  try {
    const zip = await JSZip.loadAsync(buf);
    const docFile = zip.file("word/document.xml");
    if (docFile) {
      const docXml = await docFile.async("string");
      if (docXml.includes("<m:oMath")) {
        zip.file("word/document.xml", inlineOMathAsLatex(docXml));
        pre = await zip.generateAsync({ type: "nodebuffer" });
      }
    }
  } catch {
    pre = buf;
  }

  const result = await mammoth.convertToHtml(
    { buffer: pre },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const data = await image.readAsBase64String();
        return { src: `data:${image.contentType};base64,${data}` };
      }),
      styleMap: [
        // Heading → giữ `# Câu N` của khuôn FSC (mammoth mặc định bỏ <h1>).
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
        "p[style-name='Title'] => h1:fresh",
        // Gạch chân = đáp án đúng của khuôn mã đề.
        "u => u",
      ],
    },
  );
  return result.value ?? "";
}
