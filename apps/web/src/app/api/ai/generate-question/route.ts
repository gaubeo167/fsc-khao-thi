import { NextResponse } from "next/server";
import { z } from "zod";

import { aiComplete, AiProviderError } from "@/lib/ai/provider";
import { verifyCaller } from "@/lib/api-auth";

const Body = z.object({
  intent: z.enum(["question-content", "answer", "explanation"]),
  prompt: z.string().min(1).max(4000),
  context: z
    .object({
      questionType: z.string().optional(),
      subject: z.string().optional(),
      grade: z.string().optional(),
      difficulty: z.string().optional(),
    })
    .optional(),
});

const SYSTEM_PROMPTS: Record<z.infer<typeof Body>["intent"], string> = {
  "question-content": `Bạn là chuyên viên soạn đề thi của FPT Schools. Viết đề bài câu hỏi bằng tiếng Việt, phù hợp với học sinh phổ thông Việt Nam.

YÊU CẦU OUTPUT:
- CHỈ trả về phần nội dung đề bài, KHÔNG kèm preamble (không "Đây là...", "Tôi sẽ...").
- KHÔNG kèm các phương án A/B/C/D — chỉ phần đề.
- Dùng cú pháp LaTeX trong dấu $...$ cho công thức inline, $$...$$ cho công thức block. Ví dụ: "Đạo hàm của $f(x) = x^2$ bằng?"
- Markdown nhẹ: **đậm** cho từ khoá, *nghiêng* cho thuật ngữ. Không dùng heading.
- Súc tích, đúng ngữ pháp, rõ ràng cho học sinh.`,

  answer: `Bạn là chuyên viên soạn đề thi của FPT Schools. Đề xuất phương án trả lời cho câu hỏi trắc nghiệm.

YÊU CẦU OUTPUT:
- Trả về 4 phương án theo định dạng:
A. <nội dung>
B. <nội dung>
C. <nội dung>
D. <nội dung>
Đáp án đúng: <chữ cái>
Giải thích: <1-2 câu>
- Dùng $...$ cho công thức LaTeX inline khi cần.
- Phương án nhiễu hợp lý, không quá dễ loại trừ.`,

  explanation: `Bạn là chuyên viên giải đáp đề thi của FPT Schools. Viết phần giải thích đáp án rõ ràng, từng bước.

YÊU CẦU OUTPUT:
- Tiếng Việt, ngôn ngữ học thuật phổ thông.
- Dùng $...$ cho LaTeX, $$...$$ cho công thức block khi cần.
- Súc tích 2-4 câu hoặc 3-5 bullet •
- KHÔNG kèm preamble.`,
};

export async function POST(request: Request) {
  const gate = await verifyCaller(request, { staffOnly: true });
  if ("error" in gate) return gate.error;

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

  const system = SYSTEM_PROMPTS[body.intent];
  const userPrompt = buildUserPrompt(body);

  try {
    const { text, provider } = await aiComplete({
      system,
      user: [{ type: "text", text: userPrompt }],
      maxTokens: 1500,
    });
    return NextResponse.json({ text, provider });
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
  const ctx = body.context;
  const ctxLines: string[] = [];
  if (ctx?.subject) ctxLines.push(`Môn học: ${ctx.subject}`);
  if (ctx?.grade) ctxLines.push(`Khối: ${ctx.grade}`);
  if (ctx?.difficulty) ctxLines.push(`Độ khó: ${ctx.difficulty}`);
  if (ctx?.questionType) ctxLines.push(`Loại câu hỏi: ${ctx.questionType}`);

  if (ctxLines.length === 0) return body.prompt;
  return `${ctxLines.join(" · ")}\n\n${body.prompt}`;
}
