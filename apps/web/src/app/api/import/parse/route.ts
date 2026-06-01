import JSZip from "jszip";
import mammoth from "mammoth";
import { NextResponse } from "next/server";

import { parseImportText } from "@/features/question-bank/lib/parse-import";

import { inlineOMathAsLatex } from "./omath-to-latex";

/**
 * POST /api/import/parse
 *
 * Accepts either:
 *   - multipart/form-data with a `file` field (.docx) — uses JSZip to
 *     extract document.xml, splices Office Math (OMath) blocks into
 *     `$LaTeX$` text runs so they aren't silently dropped, then hands
 *     to mammoth for HTML conversion (with inline base64 images).
 *     The HTML is then flattened to a text-with-markers form that the
 *     parser understands (`![alt](data:image/png;base64,...)` for
 *     images, **bold**, `# Câu N` headings preserved).
 *   - application/json with `{ text: string }` — uses the text directly
 *     (no preprocessing).
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
      text = await extractFromDocx(buf);
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

/**
 * Open the .docx, inline OMath as $...$ LaTeX text, then ask mammoth
 * for HTML with base64 data-URI images. Convert the resulting HTML to
 * the plain-text-with-markers format the FSC parser expects.
 */
async function extractFromDocx(buf: Buffer): Promise<string> {
  // 1) Inline OMath equations as $LaTeX$ before mammoth sees the file.
  let preprocessedBuf = buf;
  try {
    const zip = await JSZip.loadAsync(buf);
    const docFile = zip.file("word/document.xml");
    if (docFile) {
      const docXml = await docFile.async("string");
      if (docXml.includes("<m:oMath")) {
        const rewritten = inlineOMathAsLatex(docXml);
        zip.file("word/document.xml", rewritten);
        preprocessedBuf = await zip.generateAsync({ type: "nodebuffer" });
      }
    }
  } catch {
    // Preprocessing failure shouldn't kill the import — fall back to
    // raw buffer; teacher just loses math (same as before this fix).
    preprocessedBuf = buf;
  }

  // 2) mammoth: HTML + inline base64 images. Map common Vietnamese
  //    heading styles to markdown-ish heading prefixes so `# Câu N`
  //    headings make it into the output text.
  const result = await mammoth.convertToHtml(
    { buffer: preprocessedBuf },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const data = await image.readAsBase64String();
        return { src: `data:${image.contentType};base64,${data}` };
      }),
      // Keep Word heading styles → HTML headings so we can preserve
      // "# Câu N" lines verbatim. (mammoth defaults strip <h1>.)
      styleMap: [
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
        "p[style-name='Title'] => h1:fresh",
      ],
    },
  );

  return htmlToFscText(result.value ?? "");
}

/**
 * Flatten a mammoth-produced HTML string into the FSC import text
 * format:
 *   - `<h1>...</h1>` / `<h2>` → preserved as their own line
 *   - `<p>...</p>` → one line of text per paragraph
 *   - `<br>` → newline
 *   - `<img src="data:...">` → `![](data:...)` markdown
 *   - `<strong>X</strong>` → `**X**`
 *   - `<em>X</em>` → `*X*`
 *   - all other tags stripped
 *
 * Whitespace is normalised so empty paragraphs separate blocks the same
 * way they do in the user's Word file.
 */
function htmlToFscText(html: string): string {
  let out = html;

  // <img> → markdown image (preserve alt + src). dataUri-style src is
  // long but the parser only treats it as opaque content.
  out = out.replace(
    /<img\b[^>]*?src="([^"]+)"[^>]*?(?:alt="([^"]*)")?[^>]*?\/?>/gi,
    (_, src, alt) => `\n![${alt ?? ""}](${src})\n`,
  );

  // Bold / italic. mammoth wraps both meta-key labels AND incidental
  // emphasis in <strong>; the FSC parser is key/value-based and
  // doesn't care about formatting hints, so we drop the tags rather
  // than translate to markdown markers. Otherwise lines like
  // `<p><strong>Dạng: </strong>MCQ-SINGLE</p>` would arrive as
  // `**Dạng: **MCQ-SINGLE`, breaking the `key:` regex.
  out = out.replace(/<\/?strong\b[^>]*>/gi, "");
  out = out.replace(/<\/?b\b[^>]*>/gi, "");
  out = out.replace(/<\/?em\b[^>]*>/gi, "");
  out = out.replace(/<\/?i\b[^>]*>/gi, "");

  // Headings + paragraphs → newline boundaries. Strip the tags but
  // keep their text content with a leading/trailing newline so block
  // structure survives.
  out = out.replace(/<\/?h[1-6]\b[^>]*>/gi, "\n");
  out = out.replace(/<br\s*\/?>/gi, "\n");
  out = out.replace(/<\/p>/gi, "\n");
  out = out.replace(/<p\b[^>]*>/gi, "");

  // Lists — turn <li> into its own line.
  out = out.replace(/<\/?ul\b[^>]*>/gi, "\n");
  out = out.replace(/<\/?ol\b[^>]*>/gi, "\n");
  out = out.replace(/<li\b[^>]*>/gi, "");
  out = out.replace(/<\/li>/gi, "\n");

  // Table → flatten rows as lines (rare in question files but possible).
  out = out.replace(/<\/?table\b[^>]*>/gi, "\n");
  out = out.replace(/<\/?tbody\b[^>]*>/gi, "");
  out = out.replace(/<\/?thead\b[^>]*>/gi, "");
  out = out.replace(/<tr\b[^>]*>/gi, "");
  out = out.replace(/<\/tr>/gi, "\n");
  out = out.replace(/<td\b[^>]*>/gi, " ");
  out = out.replace(/<\/td>/gi, " ");
  out = out.replace(/<th\b[^>]*>/gi, " ");
  out = out.replace(/<\/th>/gi, " ");

  // Drop anything else.
  out = out.replace(/<[^>]+>/g, "");

  // Decode common entities.
  out = out
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");

  // Collapse 3+ blank lines, trim each line's right whitespace.
  out = out
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n");
  out = out.replace(/\n{3,}/g, "\n\n");

  return out.trim();
}
