import { NextResponse } from "next/server";
import { z } from "zod";

const Body = z.object({
  prompt: z.string().min(1).max(2000),
  context: z
    .object({
      subject: z.string().optional(),
      grade: z.string().optional(),
      topic: z.string().optional(),
    })
    .optional(),
  size: z.enum(["1024x1024", "1536x1024", "1024x1536", "auto"]).default("1024x1024"),
  quality: z.enum(["low", "medium", "high", "auto"]).default("medium"),
});

type Body = z.infer<typeof Body>;

/**
 * POST /api/ai/generate-image — image generation with provider fallback.
 *
 * 1) `OPENAI_API_KEY` set → OpenAI gpt-image-1 (paid).
 * 2) Otherwise `GEMINI_API_KEY` set → Gemini image (needs billing-enabled key).
 * 3) Fallback → Pollinations.ai, but FIRST translate the Vietnamese
 *    description into a structured English prompt via free Gemini text —
 *    this is what fixes "image doesn't match description": image models are
 *    overwhelmingly trained on English and respond much better to detailed
 *    English prompts.
 */
export async function POST(request: Request) {
  let body: Body;
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

  const rawPrompt = buildPrompt(body);

  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  // 1) OpenAI image (paid)
  if (openaiKey) {
    const result = await runOpenAI(openaiKey, body, rawPrompt);
    if (result.status === 200) return result;
  }

  // 2) Gemini image (needs billing) — most users won't have it
  if (geminiKey) {
    const result = await runGemini(geminiKey, rawPrompt);
    if (result.status === 200) return result;
  }

  // 3) Pollinations fallback — enhance prompt via Gemini text first for
  //    accuracy. Falls back to raw prompt if Gemini text is unavailable.
  let enhancedPrompt = rawPrompt;
  let promptSource: "raw" | "gemini-enhanced" = "raw";
  if (geminiKey) {
    const enhanced = await enhancePromptWithGemini(geminiKey, body);
    if (enhanced) {
      enhancedPrompt = enhanced;
      promptSource = "gemini-enhanced";
    }
  }
  return runPollinations(enhancedPrompt, promptSource);
}

/**
 * Use free Gemini text to translate the Vietnamese description into a
 * detailed English image-generation prompt. Returns null if the call fails
 * — caller falls back to the raw prompt.
 */
async function enhancePromptWithGemini(
  apiKey: string,
  body: Body,
): Promise<string | null> {
  const ctxBits: string[] = [];
  if (body.context?.subject) ctxBits.push(`Subject: ${body.context.subject}`);
  if (body.context?.grade) ctxBits.push(`Grade: ${body.context.grade}`);
  if (body.context?.topic) ctxBits.push(`Topic: ${body.context.topic}`);

  const system = `You translate Vietnamese descriptions of educational illustrations into detailed English prompts for image generation models (Flux / Stable Diffusion).

Rules:
- Output ONLY the English prompt — no preamble, no quotes.
- Be specific and visual: name colors, shapes, composition, style.
- Keep it textbook-illustration style: clean linework, white background, no embedded text in the image, suitable for Vietnamese K-12 students.
- 50-100 words max.
- If the description has math/science notation, describe it visually (e.g. "right triangle with legs labeled a and b, hypotenuse c, right-angle square marker").`;

  const user = `${ctxBits.join(" · ")}

Vietnamese description:
${body.prompt}

Output the English image prompt now:`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: user }] }],
          systemInstruction: { parts: [{ text: system }] },
          generationConfig: { maxOutputTokens: 400, temperature: 0.3 },
        }),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("")
      .trim();
    if (!text) return null;
    // Strip surrounding quotes if Gemini added them
    return text.replace(/^["'`]+|["'`]+$/g, "");
  } catch {
    return null;
  }
}

async function runOpenAI(apiKey: string, body: Body, prompt: string) {
  try {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt,
        n: 1,
        size: body.size,
        quality: body.quality,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      let message = `OpenAI trả về ${res.status}.`;
      try {
        const parsed = JSON.parse(text);
        if (parsed?.error?.message) message = parsed.error.message;
      } catch {
        /* not JSON */
      }
      return NextResponse.json(
        {
          error: "openai_failed",
          message,
          hint:
            res.status === 400 && message.includes("billing")
              ? "Nâng billing limit ở platform.openai.com/settings/organization/limits, hoặc xoá OPENAI_API_KEY để fallback sang Gemini."
              : undefined,
        },
        { status: 502 },
      );
    }

    const json = (await res.json()) as {
      data: Array<{ b64_json?: string; revised_prompt?: string }>;
    };
    const first = json.data?.[0];
    if (!first?.b64_json) {
      return NextResponse.json(
        { error: "openai_failed", message: "OpenAI không trả về ảnh." },
        { status: 502 },
      );
    }

    return NextResponse.json({
      dataUrl: `data:image/png;base64,${first.b64_json}`,
      revisedPrompt: first.revised_prompt ?? null,
      provider: "openai",
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "openai_failed",
        message: err instanceof Error ? err.message : "Không gọi được OpenAI API.",
      },
      { status: 502 },
    );
  }
}

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  inline_data?: { mime_type: string; data: string };
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }>;
  error?: { message: string };
  promptFeedback?: { blockReason?: string };
}

const GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";

async function runGemini(apiKey: string, prompt: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`;

  let res: Response;
  try {
    res = await fetch(`${url}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["IMAGE", "TEXT"],
        },
      }),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "gemini_failed",
        message:
          err instanceof Error ? err.message : "Không kết nối được tới Gemini.",
      },
      { status: 502 },
    );
  }

  let data: GeminiResponse;
  try {
    data = (await res.json()) as GeminiResponse;
  } catch {
    return NextResponse.json(
      {
        error: "gemini_failed",
        message: `Gemini trả về phản hồi không phải JSON (${res.status}).`,
      },
      { status: 502 },
    );
  }

  if (!res.ok || data.error) {
    return NextResponse.json(
      {
        error: "gemini_failed",
        message: data.error?.message ?? `Gemini trả về ${res.status}.`,
      },
      { status: 502 },
    );
  }

  if (data.promptFeedback?.blockReason) {
    return NextResponse.json(
      {
        error: "gemini_failed",
        message: `Gemini từ chối nội dung: ${data.promptFeedback.blockReason}.`,
      },
      { status: 502 },
    );
  }

  const parts = data.candidates?.[0]?.content?.parts ?? [];
  let imageData: string | null = null;
  let mimeType = "image/png";
  let revisedPrompt: string | null = null;

  for (const part of parts) {
    const inline = part.inlineData ?? part.inline_data;
    if (inline?.data) {
      imageData = inline.data;
      mimeType = (inline as { mimeType?: string }).mimeType ?? (inline as { mime_type?: string }).mime_type ?? "image/png";
    } else if (part.text) {
      revisedPrompt = part.text;
    }
  }

  if (!imageData) {
    return NextResponse.json(
      {
        error: "gemini_failed",
        message: "Gemini không trả về ảnh — có thể do giới hạn free tier hoặc nội dung bị chặn.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    dataUrl: `data:${mimeType};base64,${imageData}`,
    revisedPrompt,
    provider: "gemini",
  });
}

/**
 * Pollinations.ai — public image generation gateway, no auth required.
 * Quality is reasonable (uses Flux underneath) and there's no quota for
 * casual use. We hit it server-side so the client receives a data URL,
 * consistent with the OpenAI / Gemini code paths.
 */
async function runPollinations(
  prompt: string,
  promptSource: "raw" | "gemini-enhanced" = "raw",
) {
  // Pollinations caches by URL hash — without a seed, identical prompts
  // (or even slightly similar ones after caching) always return the same
  // image. Adding a random seed per request forces a fresh generation.
  // `model=flux` gives the best detail/quality.
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true&model=flux&seed=${seed}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json(
        {
          error: "pollinations_failed",
          message: `Pollinations trả về ${res.status}.`,
        },
        { status: 502 },
      );
    }
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const mime = contentType.split(";")[0].trim() || "image/jpeg";
    const buf = await res.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    return NextResponse.json({
      dataUrl: `data:${mime};base64,${base64}`,
      revisedPrompt: promptSource === "gemini-enhanced" ? prompt : null,
      provider:
        promptSource === "gemini-enhanced"
          ? "pollinations (Gemini-enhanced prompt)"
          : "pollinations",
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "pollinations_failed",
        message:
          err instanceof Error
            ? err.message
            : "Không gọi được Pollinations.ai.",
      },
      { status: 502 },
    );
  }
}

function buildPrompt(body: Body): string {
  // User description leads — image models weight earlier tokens more heavily.
  // Guidance trails as a stylistic suffix so it doesn't drown the request.
  const userPrompt = body.prompt.trim();
  const ctx = body.context;
  const ctxBits: string[] = [];
  if (ctx?.subject) ctxBits.push(ctx.subject);
  if (ctx?.grade) ctxBits.push(ctx.grade);
  if (ctx?.topic) ctxBits.push(ctx.topic);
  const ctxSuffix = ctxBits.length > 0 ? ` (${ctxBits.join(", ")})` : "";

  const style =
    "clean textbook-style educational illustration, white background, clear linework, no embedded text";

  return `${userPrompt}${ctxSuffix}. Style: ${style}.`;
}
