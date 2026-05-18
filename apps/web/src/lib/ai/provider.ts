/**
 * Provider-agnostic AI completion.
 *
 * Tries Anthropic (Claude) first when `ANTHROPIC_API_KEY` is set; otherwise
 * falls back to Google Gemini's free tier when `GEMINI_API_KEY` is set.
 * Both providers handle text and vision (base64 image) input.
 *
 * Get a free Gemini key at: https://aistudio.google.com/app/apikey
 *   (1500 requests/day, 15 RPM, supports gemini-2.5-flash with vision)
 */

import Anthropic from "@anthropic-ai/sdk";

export interface AiTextPart {
  type: "text";
  text: string;
}

export interface AiImagePart {
  type: "image";
  /** Full data URL — `data:image/png;base64,...` */
  dataUrl: string;
}

export type AiContentPart = AiTextPart | AiImagePart;

export interface AiCompletionRequest {
  system: string;
  user: AiContentPart[];
  maxTokens?: number;
  /** Hint that the model should return JSON only (no prose). */
  expectJson?: boolean;
}

export interface AiCompletionResult {
  provider: "anthropic" | "gemini";
  text: string;
}

export class AiProviderError extends Error {
  status: number;
  hint?: string;
  constructor(message: string, status = 502, hint?: string) {
    super(message);
    this.status = status;
    this.hint = hint;
  }
}

const ANTHROPIC_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

/** Top-level entry — picks a provider, returns text completion. */
export async function aiComplete(req: AiCompletionRequest): Promise<AiCompletionResult> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (anthropicKey) {
    return runAnthropic(anthropicKey, req);
  }
  if (geminiKey) {
    return runGemini(geminiKey, req);
  }

  throw new AiProviderError(
    "Chưa cấu hình AI provider. Đặt một trong: ANTHROPIC_API_KEY hoặc GEMINI_API_KEY vào apps/web/.env.local.",
    503,
    "Lấy key Gemini miễn phí tại https://aistudio.google.com/app/apikey (1500 request/ngày).",
  );
}

/* ─────────────────────────── Anthropic ─────────────────────────── */

async function runAnthropic(
  apiKey: string,
  req: AiCompletionRequest,
): Promise<AiCompletionResult> {
  const blocks: Anthropic.ContentBlockParam[] = req.user.map((part) => {
    if (part.type === "text") return { type: "text", text: part.text };
    const m = /^data:(image\/[^;]+);base64,(.+)$/.exec(part.dataUrl);
    if (!m) throw new AiProviderError("Ảnh không hợp lệ (không phải data URL).", 400);
    const mime = ANTHROPIC_MEDIA_TYPES.has(m[1].toLowerCase())
      ? (m[1].toLowerCase() as "image/jpeg" | "image/png" | "image/gif" | "image/webp")
      : "image/png";
    return {
      type: "image",
      source: { type: "base64", media_type: mime, data: m[2] },
    };
  });

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: req.maxTokens ?? 2000,
      system: req.system,
      messages: [{ role: "user", content: blocks }],
    });
    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("\n")
      .trim();
    return { provider: "anthropic", text };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Không gọi được Anthropic API.";
    throw new AiProviderError(message, 502);
  }
}

/* ─────────────────────────── Gemini ─────────────────────────── */

const GEMINI_MODEL = "gemini-2.5-flash";

interface GeminiPart {
  text?: string;
  inline_data?: { mime_type: string; data: string };
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  error?: { message: string };
  promptFeedback?: { blockReason?: string };
}

async function runGemini(
  apiKey: string,
  req: AiCompletionRequest,
): Promise<AiCompletionResult> {
  const parts: GeminiPart[] = req.user.map((part) => {
    if (part.type === "text") return { text: part.text };
    const m = /^data:(image\/[^;]+);base64,(.+)$/.exec(part.dataUrl);
    if (!m) throw new AiProviderError("Ảnh không hợp lệ (không phải data URL).", 400);
    return { inline_data: { mime_type: m[1], data: m[2] } };
  });

  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts }],
    systemInstruction: { parts: [{ text: req.system }] },
    generationConfig: {
      maxOutputTokens: req.maxTokens ?? 2000,
      temperature: 0.4,
      ...(req.expectJson ? { responseMimeType: "application/json" } : {}),
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  let res: Response;
  try {
    res = await fetch(`${url}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new AiProviderError(
      err instanceof Error ? err.message : "Không kết nối được tới Gemini.",
      502,
    );
  }

  let data: GeminiResponse;
  try {
    data = (await res.json()) as GeminiResponse;
  } catch {
    throw new AiProviderError(`Gemini trả về phản hồi không phải JSON (${res.status}).`, 502);
  }

  if (!res.ok || data.error) {
    throw new AiProviderError(
      data.error?.message ?? `Gemini trả về ${res.status}.`,
      502,
    );
  }
  if (data.promptFeedback?.blockReason) {
    throw new AiProviderError(
      `Gemini từ chối nội dung: ${data.promptFeedback.blockReason}.`,
      502,
    );
  }

  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new AiProviderError("Gemini không trả về text.", 502);
  }
  return { provider: "gemini", text };
}

/** Convenience: report which provider would handle a request right now. */
export function activeProvider(): "anthropic" | "gemini" | "none" {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return "none";
}
