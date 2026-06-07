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

/** Top-level entry — picks a provider, returns text completion.
 *
 *  Strategy:
 *    1. Try Anthropic (if key set) with 2 retries on transient 429/529
 *       (overloaded) errors using exponential backoff (1s, 2s).
 *    2. If Anthropic is permanently unavailable (overloaded after all
 *       retries, or any other failure) AND a Gemini key is configured,
 *       fall back to Gemini automatically. Surfaces a hint in the error
 *       message so the UI can show "đang tự chuyển sang Gemini" or
 *       similar.
 *    3. If only Gemini key set, use Gemini.
 *    4. If no keys, fail with config hint.
 */
export async function aiComplete(req: AiCompletionRequest): Promise<AiCompletionResult> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (anthropicKey) {
    try {
      return await runAnthropicWithRetry(anthropicKey, req);
    } catch (err) {
      // Only fall back to Gemini for transient/overload errors.
      // Auth / quota / config errors should surface directly.
      if (
        err instanceof AiProviderError &&
        geminiKey &&
        (err.status === 529 ||
          err.status === 503 ||
          err.status === 429 ||
          /overload/i.test(err.message) ||
          /high demand/i.test(err.message))
      ) {
        return runGeminiWithRetry(geminiKey, req);
      }
      throw err;
    }
  }
  if (geminiKey) {
    return runGeminiWithRetry(geminiKey, req);
  }

  throw new AiProviderError(
    "Chưa cấu hình AI provider. Đặt một trong: ANTHROPIC_API_KEY hoặc GEMINI_API_KEY vào apps/web/.env.local.",
    503,
    "Lấy key Gemini miễn phí tại https://aistudio.google.com/app/apikey (1500 request/ngày).",
  );
}

/** Generic exponential-backoff retry for any provider runner. Retries
 *  on transient overload / rate-limit signals only — auth / quota /
 *  validation errors short-circuit so the caller can fix them. */
function isTransientAiError(err: unknown): boolean {
  if (!(err instanceof AiProviderError)) return false;
  return (
    err.status === 529 ||
    err.status === 503 ||
    err.status === 429 ||
    /overload/i.test(err.message) ||
    /high demand/i.test(err.message) ||
    /UNAVAILABLE/i.test(err.message) ||
    /try again later/i.test(err.message)
  );
}

async function runWithRetry<T>(
  fn: () => Promise<T>,
  delays: number[] = [1000, 2000],
): Promise<T> {
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isTransientAiError(err) || attempt === delays.length) throw err;
      await new Promise((r) => setTimeout(r, delays[attempt]!));
    }
  }
  // Unreachable — loop exits via return or throw.
  throw new AiProviderError("Retry loop exited unexpectedly.", 500);
}

async function runAnthropicWithRetry(
  apiKey: string,
  req: AiCompletionRequest,
): Promise<AiCompletionResult> {
  return runWithRetry(() => runAnthropic(apiKey, req));
}

async function runGeminiWithRetry(
  apiKey: string,
  req: AiCompletionRequest,
): Promise<AiCompletionResult> {
  return runWithRetry(() => runGemini(apiKey, req));
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
    // Anthropic SDK error has `.status` (HTTP status code). Preserve it
    // so the retry-with-fallback logic upstream can distinguish 529
    // (overloaded — retry) from 401 (auth — fail fast).
    const errAny = err as { status?: number; message?: string };
    const status =
      typeof errAny?.status === "number" ? errAny.status : 502;
    const message =
      errAny?.message ?? (err instanceof Error ? err.message : "Không gọi được Anthropic API.");
    throw new AiProviderError(message, status);
  }
}

/* ─────────────────────────── Gemini ─────────────────────────── */

/** Ordered fallback list — when the primary model returns overload /
 *  rate-limit, try the next one. Older models often have separate quota
 *  pools so they survive a 2.5-flash overload event. */
const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
] as const;

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
  // Try the model list in order. On a transient (overload / rate-limit)
  // error, fall through to the next model — each model has its own
  // quota pool so a 2.5-flash spike doesn't take down 2.0-flash or
  // 1.5-flash. On any non-transient error (400, 401, content block)
  // surface immediately.
  let lastErr: AiProviderError | null = null;
  for (const model of GEMINI_MODELS) {
    try {
      return await runGeminiOnce(apiKey, req, model);
    } catch (err) {
      if (err instanceof AiProviderError && isTransientAiError(err)) {
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  throw lastErr ?? new AiProviderError("Gemini không phản hồi.", 503);
}

async function runGeminiOnce(
  apiKey: string,
  req: AiCompletionRequest,
  model: string,
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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
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
    const msg = data.error?.message ?? `Gemini trả về ${res.status}.`;
    const inferredStatus =
      /overload|high demand|UNAVAILABLE/i.test(msg)
        ? 503
        : /quota|rate.?limit|RESOURCE_EXHAUSTED/i.test(msg)
          ? 429
          : res.ok
            ? 502
            : res.status;
    throw new AiProviderError(msg, inferredStatus);
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
