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

const SYSTEM_TEACHER = `Bạn là cố vấn học vụ. Bạn nhận số liệu tổng quan về 1 học sinh và viết phân tích NGẮN GỌN bằng tiếng Việt cho GIÁO VIÊN tham khảo.

TRẢ VỀ DUY NHẤT 1 JSON OBJECT, không kèm prose hay markdown:

{
  "verdict": "1 câu kết luận xu hướng (≤ 25 từ). Bắt đầu bằng 1 emoji: 📈 đang tiến bộ · 📉 đang sụt giảm · 📊 ổn định · ⚠️ ít dữ liệu",
  "observations": ["3-4 quan sát cụ thể, mỗi dòng ≤ 30 từ, trích dẫn số liệu (vd: 'TB điểm thi 6.5/10, dưới chuẩn lớp')"],
  "suggestions": ["2-3 hành động giáo viên có thể làm, mỗi dòng ≤ 30 từ, cụ thể, có thể thực thi"]
}

Phong cách: khách quan, không phán xét HS; ưu tiên chỉ ra nguyên nhân khả năng cao + can thiệp nhẹ trước.`;

const SYSTEM_STUDENT = `Bạn là người bạn đồng hành học tập của 1 học sinh. Bạn nhận số liệu tổng quan của EM và viết phản hồi NGẮN GỌN bằng tiếng Việt cho EM tự đọc.

TRẢ VỀ DUY NHẤT 1 JSON OBJECT, không kèm prose hay markdown:

{
  "verdict": "1 câu khích lệ kết luận xu hướng (≤ 25 từ). Bắt đầu bằng 1 emoji phù hợp",
  "observations": ["3-4 điều EM đã làm tốt + cần cải thiện, mỗi dòng ≤ 30 từ, dùng từ EM/bạn"],
  "suggestions": ["2-3 hành động EM tự làm tuần này, mỗi dòng ≤ 30 từ, hành động cụ thể"]
}

Phong cách: ấm áp, khích lệ, không trách móc. Tập trung vào điều EM kiểm soát được.`;

export async function POST(req: Request) {
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
      maxTokens: 800,
      expectJson: true,
    });

    const parsed = parseJsonObject(aiText);
    if (!parsed) {
      return NextResponse.json(
        {
          error: "parse_failed",
          message: "AI không trả về JSON hợp lệ.",
          raw: aiText,
        },
        { status: 502 },
      );
    }

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
  const startIdx = raw.indexOf("{");
  const endIdx = raw.lastIndexOf("}");
  if (startIdx < 0 || endIdx <= startIdx) return null;
  try {
    return JSON.parse(raw.slice(startIdx, endIdx + 1));
  } catch {
    return null;
  }
}
