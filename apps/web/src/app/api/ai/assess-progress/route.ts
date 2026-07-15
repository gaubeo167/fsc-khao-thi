/**
 * POST /api/ai/assess-progress
 *
 * Body: { summary: StudentProgressSummary, studentName?: string,
 *         audience: "teacher" | "student" }
 *
 * Takes a numeric progress summary (already computed client-side by
 * computeStudentProgress) and asks the AI provider for a short,
 * actionable verdict.
 *
 * Returns: { verdict, observations[], suggestions[], provider }
 *
 * The audience flag controls the persona — teacher gets a clinical
 * read with classroom suggestions, student gets a coaching tone with
 * concrete next steps they can act on themselves.
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { verifyCaller } from "@/lib/api-auth";

import { aiComplete, AiProviderError } from "@/lib/ai/provider";

const SummarySchema = z
  .object({
    kpis: z.object({
      totalShifts: z.number(),
      totalShiftsSubmitted: z.number(),
      totalHomework: z.number(),
      totalHomeworkSubmitted: z.number(),
      avgExamScore: z.number().nullable(),
      avgHomeworkPercent: z.number().nullable(),
      examPassRate: z.number().nullable(),
      homeworkPassRate: z.number().nullable(),
    }),
    examTrend: z.object({
      verdict: z.string(),
      delta: z.number().nullable(),
      recentAvg: z.number().nullable(),
      priorAvg: z.number().nullable(),
    }),
    homeworkTrend: z.object({
      verdict: z.string(),
      delta: z.number().nullable(),
      recentAvg: z.number().nullable(),
      priorAvg: z.number().nullable(),
    }),
    recentScores: z
      .object({
        examTimeline: z
          .array(
            z.object({
              at: z.string(),
              score: z.number(),
              label: z.string(),
            }),
          )
          .max(20),
        homeworkTimeline: z
          .array(
            z.object({
              at: z.string(),
              score: z.number(),
              label: z.string(),
            }),
          )
          .max(20),
      })
      .optional(),
  })
  .passthrough();

const Body = z.object({
  summary: SummarySchema,
  studentName: z.string().optional(),
  audience: z.enum(["teacher", "student"]).default("teacher"),
});

const SYSTEM_TEACHER = `Bạn là cố vấn học vụ. Bạn nhận số liệu tổng quan về 1 học sinh và viết phân tích chuyên sâu cho GIÁO VIÊN bằng tiếng Việt.

Phong cách:
- Khách quan, dẫn số liệu cụ thể (vd: "điểm thi TB 6.5/10 — dưới chuẩn lớp 7.0", "tỉ lệ nộp BTVN 60% — thấp hơn kỳ trước 80%")
- Phân tích cả mặt mạnh + mặt yếu, không phán xét HS
- Đưa nguyên nhân khả năng cao trước khi đề xuất can thiệp
- Tránh chung chung, mỗi câu phải có thông tin riêng

OUTPUT BẮT BUỘC: chỉ 1 JSON object duy nhất, đúng schema sau. KHÔNG markdown fence, KHÔNG prose trước/sau, KHÔNG xuống dòng giữa các key:

{"verdict": string (1-2 câu kết luận xu hướng + dẫn 1 số liệu, ≤40 từ, bắt đầu bằng 1 emoji 📈📉📊⚠️), "observations": string[] (4-5 quan sát có dẫn chứng, mỗi dòng 15-40 từ; ít nhất 1 mặt tích cực + 1 mặt cần lưu ý + 1 so sánh xu hướng), "suggestions": string[] (3-4 hành động GV có thể làm ngay, mỗi dòng 15-35 từ, cụ thể bao gồm phương pháp/thời điểm/cách đo lường)}`;

const SYSTEM_STUDENT = `Bạn là người bạn đồng hành học tập của 1 học sinh. Bạn nhận số liệu của EM và viết phản hồi cho EM bằng tiếng Việt.

Phong cách:
- Ấm áp, khích lệ, không trách móc. Dùng từ EM / bạn.
- Dẫn số liệu cụ thể từ bài làm thật (vd: "điểm thi gần nhất 7.0 — tăng 1 điểm so với 4 tuần trước")
- Tập trung điều EM kiểm soát được; gợi ý hành động khả thi trong 1 tuần
- Mỗi câu phải có thông tin riêng, không lặp ý

OUTPUT BẮT BUỘC: chỉ 1 JSON object duy nhất, đúng schema sau. KHÔNG markdown fence, KHÔNG prose trước/sau:

{"verdict": string (1-2 câu khích lệ + dẫn 1 số liệu, ≤40 từ, bắt đầu bằng 1 emoji phù hợp), "observations": string[] (4-5 điều EM đã làm tốt + cần cải thiện, mỗi dòng 15-40 từ; xen kẽ tích cực và cải thiện), "suggestions": string[] (3-4 hành động EM tự làm tuần này, mỗi dòng 15-35 từ, cụ thể bao gồm thời điểm/cách làm/mục tiêu đo được)}`;

export async function POST(req: Request) {
  const gate = await verifyCaller(req, {});
  if ("error" in gate) return gate.error;

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: "invalid_body",
        message: err instanceof Error ? err.message : "Body không hợp lệ",
      },
      { status: 400 },
    );
  }

  const { summary, audience, studentName } = body;

  const lines: string[] = [];
  if (studentName) lines.push(`Học sinh: ${studentName}`);
  lines.push(
    `Số ca thi được giao: ${summary.kpis.totalShifts}, đã nộp: ${summary.kpis.totalShiftsSubmitted}`,
  );
  lines.push(
    `Số BTVN được giao: ${summary.kpis.totalHomework}, đã nộp: ${summary.kpis.totalHomeworkSubmitted}`,
  );
  if (summary.kpis.avgExamScore != null) {
    lines.push(
      `Điểm thi trung bình: ${summary.kpis.avgExamScore}/10 · Tỉ lệ đạt (≥5): ${
        summary.kpis.examPassRate != null
          ? Math.round(summary.kpis.examPassRate * 100) + "%"
          : "—"
      }`,
    );
  } else {
    lines.push("Điểm thi trung bình: chưa có dữ liệu");
  }
  if (summary.kpis.avgHomeworkPercent != null) {
    lines.push(
      `BTVN trung bình đúng: ${summary.kpis.avgHomeworkPercent}% · Tỉ lệ đạt (≥50%): ${
        summary.kpis.homeworkPassRate != null
          ? Math.round(summary.kpis.homeworkPassRate * 100) + "%"
          : "—"
      }`,
    );
  } else {
    lines.push("BTVN: chưa có dữ liệu");
  }
  lines.push(
    `Xu hướng điểm thi: ${summary.examTrend.verdict}` +
      (summary.examTrend.recentAvg != null
        ? ` (gần đây ${summary.examTrend.recentAvg} vs trước ${summary.examTrend.priorAvg})`
        : ""),
  );
  lines.push(
    `Xu hướng BTVN: ${summary.homeworkTrend.verdict}` +
      (summary.homeworkTrend.recentAvg != null
        ? ` (gần đây ${summary.homeworkTrend.recentAvg}% vs trước ${summary.homeworkTrend.priorAvg}%)`
        : ""),
  );
  if (summary.recentScores) {
    const e = summary.recentScores.examTimeline.slice(-5);
    const h = summary.recentScores.homeworkTimeline.slice(-5);
    if (e.length > 0) {
      lines.push(
        `5 ca thi gần nhất: ${e
          .map((x) => `${x.score}/10`)
          .join(", ")}`,
      );
    }
    if (h.length > 0) {
      lines.push(
        `5 BTVN gần nhất: ${h.map((x) => `${x.score}%`).join(", ")}`,
      );
    }
  }

  const prompt = lines.join("\n");

  try {
    const { text: aiText, provider } = await aiComplete({
      system: audience === "student" ? SYSTEM_STUDENT : SYSTEM_TEACHER,
      user: [{ type: "text", text: prompt }],
      // Bumped from 800 → 2000 because Gemini was occasionally getting
      // truncated mid-string with 4-5 observations + 3-4 suggestions,
      // each up to 40 từ. A typical valid response is ~600-900 tokens;
      // the headroom protects against verbose models.
      maxTokens: 2000,
      expectJson: true,
    });

    const parsed = parseJsonObject(aiText);
    if (parsed) {
      return NextResponse.json({
        verdict: String(parsed.verdict ?? ""),
        observations: Array.isArray(parsed.observations)
          ? parsed.observations.map(String).slice(0, 5)
          : [],
        suggestions: Array.isArray(parsed.suggestions)
          ? parsed.suggestions.map(String).slice(0, 5)
          : [],
        provider,
      });
    }
    // Fallback: AI ignored the JSON format instruction. Best-effort
    // extract bullet lines as observations + suggestions so the user
    // still sees actionable content instead of an opaque error.
    const fallback = bestEffortFromProse(aiText);
    return NextResponse.json({
      ...fallback,
      provider,
    });
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

function parseJsonObject(raw: string): Record<string, unknown> | null {
  if (!raw) return null;
  // 1) Strip common markdown fences first — ```json ... ``` or just ``` ... ```
  const cleaned = raw
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  // 2) Try to parse the cleaned blob as-is.
  const parsed = tryParse(cleaned);
  if (parsed) return parsed;

  // 3) Find balanced { … } substrings (handles AI that wraps JSON in
  //    explanatory prose like "Đây là kết quả: { ... }").
  const candidates = extractBalancedObjects(cleaned);
  for (const c of candidates) {
    const p = tryParse(c);
    if (p) return p;
  }

  // 4) Repair common issues (trailing commas, smart quotes) on the
  //    longest candidate, then retry.
  const longest = candidates.sort((a, b) => b.length - a.length)[0];
  if (longest) {
    const repaired = repairJsonString(longest);
    const p = tryParse(repaired);
    if (p) return p;
  }

  // 5) Truncated response — Gemini hit max_tokens mid-string. Find
  //    the largest UNCLOSED { … } prefix and synthesize a closing for
  //    the open string + open array + open object so we can salvage
  //    whatever was already written.
  const truncated = repairTruncatedJson(cleaned);
  if (truncated) {
    const p = tryParse(truncated);
    if (p) return p;
  }
  return null;
}

function repairJsonString(s: string): string {
  return s
    .replace(/,\s*([}\]])/g, "$1") // trailing commas
    .replace(/[“”]/g, '"') // smart double quotes
    .replace(/[‘’]/g, "'"); // smart single quotes
}

/** Best-effort recovery for truncated JSON produced when Gemini hits
 *  max_tokens mid-string. Walks the cleaned text from the first `{`,
 *  tracks string-literal + nesting state, and emits a closing sequence
 *  that turns the open prefix into syntactically valid JSON. Drops the
 *  in-progress last value (the truncated tail after the final complete
 *  key:value pair) so we don't keep half a sentence. */
function repairTruncatedJson(s: string): string | null {
  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  // Track the last position where we were at depth 1 and NOT inside a
  // string — that's a safe truncation point right after a comma. We
  // backtrack to here if the tail is broken.
  let lastSafeAfterComma = -1;
  for (let i = start; i < s.length; i++) {
    const ch = s[i]!;
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") depth--;
    else if (ch === "," && depth === 1) lastSafeAfterComma = i;
  }
  if (lastSafeAfterComma < 0) return null;
  // Take prefix up to (but not including) the comma, then close the
  // top-level object. Anything after `lastSafeAfterComma` is discarded
  // (likely a half-written value).
  const head = s.slice(0, lastSafeAfterComma);
  return head + "}";
}

function tryParse(s: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(s);
    if (v && typeof v === "object" && !Array.isArray(v)) return v;
    return null;
  } catch {
    return null;
  }
}

/** Walk the string and extract every top-level balanced `{…}` substring
 *  ignoring braces that appear inside string literals. Returns longest-
 *  first so the caller tries the biggest one first. */
function extractBalancedObjects(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        out.push(s.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return out.sort((a, b) => b.length - a.length);
}

/** When the model writes prose instead of JSON, salvage as much as we
 *  can: the first non-empty line becomes the verdict, bullet/numbered
 *  lines become observations + suggestions. The split is heuristic —
 *  prose under a "Gợi ý" / "Khuyến nghị" / "Hành động" header is
 *  treated as suggestions; the rest is observations. */
function bestEffortFromProse(raw: string): {
  verdict: string;
  observations: string[];
  suggestions: string[];
} {
  const text = raw.trim();
  if (!text) {
    return {
      verdict: "AI tạm thời chưa phản hồi được — thử lại sau.",
      observations: [],
      suggestions: [],
    };
  }
  const lines = text
    .split(/\r?\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    // Drop JSON syntax noise so a half-parsed response doesn't surface
    // bare braces as the verdict. Also drop empty / structure-only lines.
    .filter(
      (l) =>
        l !== "{" &&
        l !== "}" &&
        l !== "[" &&
        l !== "]" &&
        !/^"?(verdict|observations|suggestions)"?\s*:?\s*\[?\s*$/i.test(l),
    );

  // Try to lift the verdict out of a `"verdict": "..."` pattern first
  // (handles truncated JSON where the structural parser couldn't
  // recover but the verdict string was already written).
  const verdictMatch = /"verdict"\s*:\s*"([^"]+)/.exec(text);
  const verdictFromJson = verdictMatch?.[1]?.trim() ?? null;

  // Otherwise: verdict = first non-bullet non-JSON-key sentence.
  const verdict =
    verdictFromJson ??
    lines.find(
      (l) =>
        !/^[-•*\d+.)\s]+/.test(l) &&
        !/^[{}\[\]]/.test(l) &&
        !/^"[a-z]+"\s*:/i.test(l),
    ) ??
    lines[0] ??
    "";

  const observations: string[] = [];
  const suggestions: string[] = [];
  let bucket: "obs" | "sug" = "obs";
  for (const l of lines) {
    if (/gợi ý|khuyến nghị|hành động|đề xuất|next ?step/i.test(l)) {
      bucket = "sug";
      continue;
    }
    if (l === verdict) continue;
    const clean = l
      .replace(/^[-•*]\s+|^\d+[.)]\s+/, "")
      // Strip leftover JSON quote chars at edges.
      .replace(/^["']+/, "")
      .replace(/[",]+$/, "")
      .trim();
    if (!clean) continue;
    // Skip residual JSON-shaped lines.
    if (/^[{}\[\]]+$/.test(clean)) continue;
    (bucket === "obs" ? observations : suggestions).push(clean);
  }
  return {
    verdict,
    observations: observations.slice(0, 5),
    suggestions: suggestions.slice(0, 5),
  };
}
