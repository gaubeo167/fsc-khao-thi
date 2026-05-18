import { NextResponse } from "next/server";
import { z } from "zod";

import { aiComplete, AiProviderError } from "@/lib/ai/provider";

const Body = z.object({
  subject: z.string().optional(),
  grade: z.string().optional(),
  /** Path through the TOC tree (e.g. "Chương 1 · Đạo hàm · Hàm hợp"). */
  topic: z.string().optional(),
  /** Free-form additional tags / context. */
  freeTags: z.string().optional(),
  /** Description of what the AI should cover. */
  description: z.string().min(1).max(2000),
  count: z.coerce.number().min(1).max(15).default(5),
  /** Allowed types in the output. "mixed" lets the AI pick. */
  questionType: z
    .enum([
      "mixed",
      "mcq-single",
      "mcq-multi",
      "true-false",
      "fill-blank",
    ])
    .default("mixed"),
  /** Difficulty distribution. */
  distribution: z
    .enum(["even", "easy-heavy", "medium-heavy", "hard-heavy"])
    .default("even"),
});

interface AiQuestion {
  type: "mcq-single" | "mcq-multi" | "true-false" | "fill-blank";
  difficulty: "easy" | "medium" | "hard";
  content: string;
  explanation?: string;
  // type-specific:
  options?: Array<{ content: string; isCorrect: boolean }>;
  correctAnswer?: boolean;
  blanks?: Array<{ acceptedAnswers: string[] }>;
}

const SYSTEM_PROMPT = `Bạn là chuyên viên soạn đề thi của FPT Schools. Sinh CÂU HỎI cho học sinh phổ thông Việt Nam, bám sát SGK.

YÊU CẦU OUTPUT — TRẢ VỀ DUY NHẤT MỘT JSON OBJECT (không kèm markdown fence, không kèm preamble):

{
  "questions": [
    {
      "type": "mcq-single" | "mcq-multi" | "true-false" | "fill-blank",
      "difficulty": "easy" | "medium" | "hard",
      "content": "Đề bài (LaTeX inline qua $...$ nếu có toán)",
      "explanation": "Giải thích đáp án ngắn gọn",
      // theo type:
      "options": [{"content":"A","isCorrect":false}, ...]   // mcq-single, mcq-multi (đúng 1 hoặc nhiều true)
      "correctAnswer": true                                 // true-false
      "blanks": [{"acceptedAnswers":["Hà Nội","Hanoi"]}]   // fill-blank, content dùng dấu ___ cho mỗi blank
    },
    ...
  ]
}

QUY TẮC:
- Mỗi question là JSON hợp lệ, đúng type.
- Số lượng: ĐÚNG bằng "count" mà user yêu cầu.
- difficulty: easy (Nhận biết), medium (Thông hiểu), hard (Vận dụng).
- mcq-single: đúng 1 phương án "isCorrect": true; mcq-multi: ≥1.
- fill-blank: dùng "___" (3 gạch dưới) trong "content" cho từng ô. Số ô khớp số phần tử "blanks".
- KHÔNG kèm trường nào khác ngoài "questions".`;

export async function POST(request: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: "invalid_body",
        message: err instanceof Error ? err.message : "Body không hợp lệ",
      },
      { status: 400 },
    );
  }

  const userPrompt = buildUserPrompt(body);

  try {
    const { text, provider } = await aiComplete({
      system: SYSTEM_PROMPT,
      user: [{ type: "text", text: userPrompt }],
      maxTokens: 6000,
      expectJson: true,
    });

    const parsed = parseQuestions(text);
    if (!parsed) {
      return NextResponse.json(
        {
          error: "parse_failed",
          message: "AI không trả về JSON hợp lệ.",
          raw: text,
        },
        { status: 502 },
      );
    }
    return NextResponse.json({ questions: parsed, provider });
  } catch (err) {
    if (err instanceof AiProviderError) {
      return NextResponse.json(
        { error: "ai_failed", message: err.message, hint: err.hint },
        { status: err.status },
      );
    }
    return NextResponse.json(
      {
        error: "unknown",
        message: err instanceof Error ? err.message : "Không xác định",
      },
      { status: 500 },
    );
  }
}

function buildUserPrompt(body: z.infer<typeof Body>): string {
  const ctx: string[] = [];
  if (body.subject) ctx.push(`Môn: ${body.subject}`);
  if (body.grade) ctx.push(`Khối: ${body.grade}`);
  if (body.topic) ctx.push(`Mục lục: ${body.topic}`);
  if (body.freeTags) ctx.push(`Tag thêm: ${body.freeTags}`);

  const typeText =
    body.questionType === "mixed"
      ? "Trộn các dạng (mcq-single, mcq-multi, true-false, fill-blank). Ưu tiên mcq-single."
      : `Chỉ dùng dạng: ${body.questionType}`;

  const distText =
    body.distribution === "even"
      ? "Phân bố đều: 30% Nhận biết (easy) · 50% Thông hiểu (medium) · 20% Vận dụng (hard)"
      : body.distribution === "easy-heavy"
        ? "Phân bố thiên về Nhận biết: 60% easy · 30% medium · 10% hard"
        : body.distribution === "medium-heavy"
          ? "Phân bố thiên về Thông hiểu: 20% easy · 60% medium · 20% hard"
          : "Phân bố thiên về Vận dụng: 10% easy · 30% medium · 60% hard";

  return `${ctx.join(" · ")}

Mô tả chủ đề / kiến thức cần kiểm tra:
${body.description}

YÊU CẦU:
- Sinh chính xác ${body.count} câu hỏi.
- Loại câu hỏi: ${typeText}
- Độ khó: ${distText}`;
}

function parseQuestions(raw: string): AiQuestion[] | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  // AI often emits LaTeX commands like `\Delta`, `\frac` inside JSON strings
  // — but `\D` and `\f` aren't valid JSON escape sequences. Pre-pass: escape
  // any LONE backslash (not preceded or followed by a valid escape char).
  // The negative lookbehind avoids double-escaping `\\` pairs the AI already
  // wrote correctly.
  const repaired = raw
    .slice(start, end + 1)
    .replace(/(?<!\\)\\(?!["\\/bfnrtu])/g, "\\\\");
  try {
    const data = JSON.parse(repaired);
    if (!data || !Array.isArray(data.questions)) return null;
    const out: AiQuestion[] = [];
    for (const q of data.questions) {
      if (!q || typeof q !== "object") continue;
      if (typeof q.content !== "string" || !q.content.trim()) continue;
      const type = q.type;
      if (
        type !== "mcq-single" &&
        type !== "mcq-multi" &&
        type !== "true-false" &&
        type !== "fill-blank"
      )
        continue;
      const difficulty =
        q.difficulty === "easy" || q.difficulty === "medium" || q.difficulty === "hard"
          ? q.difficulty
          : "medium";
      const base: AiQuestion = {
        type,
        difficulty,
        content: String(q.content).trim().slice(0, 2000),
        explanation: typeof q.explanation === "string" ? q.explanation.trim() : "",
      };
      if (type === "mcq-single" || type === "mcq-multi") {
        if (!Array.isArray(q.options)) continue;
        const opts = q.options
          .filter((o: unknown) => o && typeof o === "object")
          .map((o: { content?: unknown; isCorrect?: unknown }) => ({
            content: typeof o.content === "string" ? o.content.trim() : "",
            isCorrect: Boolean(o.isCorrect),
          }))
          .filter((o: { content: string }) => o.content.length > 0);
        if (opts.length < 2) continue;
        base.options = opts;
      } else if (type === "true-false") {
        base.correctAnswer = Boolean(q.correctAnswer);
      } else if (type === "fill-blank") {
        if (!Array.isArray(q.blanks)) continue;
        const blanks = q.blanks
          .filter((b: unknown) => b && typeof b === "object")
          .map((b: { acceptedAnswers?: unknown }) => ({
            acceptedAnswers: Array.isArray(b.acceptedAnswers)
              ? b.acceptedAnswers
                  .filter((x: unknown): x is string => typeof x === "string")
                  .map((x: string) => x.trim())
                  .filter((x: string) => x.length > 0)
              : [],
          }))
          .filter((b: { acceptedAnswers: string[] }) => b.acceptedAnswers.length > 0);
        if (blanks.length === 0) continue;
        base.blanks = blanks;
      }
      out.push(base);
    }
    return out;
  } catch {
    return null;
  }
}
