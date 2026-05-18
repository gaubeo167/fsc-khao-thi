/**
 * Rule-based "AI" insight generator for shift reports.
 *
 * Each insight is a piece of actionable feedback the teacher should pay
 * attention to (a hard question that nobody got, a class average that's
 * suspiciously high, a wave of anti-cheat violations, etc). When the
 * real LLM is wired in later, swap `generateInsights()` for an API call
 * that returns the same shape.
 */

import type { ShiftReport } from "./compute-stats";

export type InsightSeverity = "info" | "warn" | "critical" | "positive";

export interface Insight {
  id: string;
  severity: InsightSeverity;
  title: string;
  detail: string;
  /** Optional: a question id this insight is anchored to. */
  questionId?: string;
}

export function generateInsights(report: ShiftReport): Insight[] {
  const out: Insight[] = [];
  const r = report;
  const submitted = r.totals.submitted;
  if (submitted === 0) {
    out.push({
      id: "no-submission",
      severity: "warn",
      title: "Chưa có HS nào nộp bài",
      detail:
        "Không có dữ liệu để phân tích. Kiểm tra lại có thực sự đã có HS vào thi không.",
    });
    return out;
  }

  // 1. Attendance — absent rate.
  const absentRate =
    r.totals.eligible > 0
      ? Math.round((r.totals.absent / r.totals.eligible) * 100)
      : 0;
  if (absentRate >= 30 && r.totals.absent > 0) {
    out.push({
      id: "high-absent",
      severity: "critical",
      title: `${r.totals.absent}/${r.totals.eligible} HS vắng (${absentRate}%)`,
      detail: `Tỉ lệ vắng cao bất thường. Kiểm tra với GVCN xem có vấn đề kỹ thuật, lịch học chồng chéo, hay HS không nhận được thông báo.`,
    });
  } else if (absentRate >= 15 && r.totals.absent > 0) {
    out.push({
      id: "moderate-absent",
      severity: "warn",
      title: `${r.totals.absent} HS không vào thi`,
      detail: `${absentRate}% HS bỏ thi — đáng theo dõi nhưng nằm trong ngưỡng bình thường.`,
    });
  }

  // 2. Pass rate signals.
  if (r.totals.passRate < 30) {
    out.push({
      id: "low-pass-rate",
      severity: "critical",
      title: `Tỉ lệ đạt thấp: ${r.totals.passRate}%`,
      detail: `Chỉ ${r.totals.passRate}% HS đạt ≥ 50/100. Đề có thể quá khó so với mức độ hiện tại — xem xét review lại nội dung dạy hoặc điều chỉnh ma trận khó-dễ.`,
    });
  } else if (r.totals.passRate >= 90 && r.totals.avgPercent >= 85) {
    out.push({
      id: "high-pass-rate",
      severity: "warn",
      title: `Tỉ lệ đạt rất cao: ${r.totals.passRate}%`,
      detail: `${r.totals.passRate}% HS đạt và TB ${r.totals.avgPercent}/100 — đề có thể quá dễ. Tăng tỉ lệ câu khó ở ca sau để đo lường chính xác năng lực.`,
    });
  } else if (r.totals.passRate >= 70 && r.totals.passRate < 90) {
    out.push({
      id: "healthy-pass-rate",
      severity: "positive",
      title: `Tỉ lệ đạt khoẻ mạnh: ${r.totals.passRate}%`,
      detail: `${r.totals.passRate}% HS đạt, TB ${r.totals.avgPercent}/100 — đề có độ phân loại tốt.`,
    });
  }

  // 3. Per-question outliers.
  const autoGraded = r.perQuestion.filter(
    (q) => !q.isManual && q.totalAssigned > 0 && q.correctPercent != null,
  );
  if (autoGraded.length > 0) {
    // Hardest questions — bottom of correct%.
    const sorted = [...autoGraded].sort(
      (a, b) => (a.correctPercent ?? 0) - (b.correctPercent ?? 0),
    );
    for (const row of sorted.slice(0, 3)) {
      const pct = row.correctPercent ?? 0;
      if (pct < 20 && row.totalAssigned >= 3) {
        out.push({
          id: `hard-q-${row.question.id}`,
          severity: "critical",
          title: `Câu "${truncate(row.question.content, 60)}" — chỉ ${pct}% đúng`,
          detail: `${row.correct}/${row.totalAssigned} HS chọn đúng. Có thể đề bài chưa rõ hoặc kiến thức HS chưa nắm. Xem lại lời giải và xem có nên loại câu này khỏi tính điểm không.`,
          questionId: row.question.id,
        });
      } else if (pct < 40 && row.totalAssigned >= 3) {
        out.push({
          id: `tough-q-${row.question.id}`,
          severity: "warn",
          title: `Câu "${truncate(row.question.content, 60)}" — ${pct}% đúng`,
          detail: `Câu khó hơn dự kiến (${row.correct}/${row.totalAssigned} đúng). Đáng review trong buổi chữa bài.`,
          questionId: row.question.id,
        });
      }
    }
    // Easiest questions — possible giveaways.
    const easy = autoGraded.filter(
      (q) => (q.correctPercent ?? 0) === 100 && q.totalAssigned >= 5,
    );
    if (easy.length >= 3) {
      out.push({
        id: "many-100pct",
        severity: "info",
        title: `${easy.length} câu 100% đúng`,
        detail: `Có ${easy.length} câu mọi HS đều làm đúng. Cân nhắc thay bằng câu khó hơn để tăng phân biệt năng lực.`,
      });
    }
  }

  // 4. Time analysis.
  if (r.totals.avgDurationMin != null) {
    const pkgDuration =
      // The shift's package duration isn't directly on the shift type;
      // we approximate from `(shift.endAt - shift.startAt)` if needed.
      Math.max(
        1,
        Math.round(
          (new Date(r.shift.endAt).getTime() -
            new Date(r.shift.startAt).getTime()) /
            60_000,
        ),
      );
    const ratio = r.totals.avgDurationMin / pkgDuration;
    if (ratio < 0.3 && submitted >= 3) {
      out.push({
        id: "too-fast",
        severity: "warn",
        title: `HS làm nhanh bất thường (TB ${r.totals.avgDurationMin}p / ${pkgDuration}p)`,
        detail: `Trung bình chỉ dùng ${Math.round(ratio * 100)}% thời gian — có thể HS chưa đọc kỹ đề hoặc đoán đáp án. Đáng review case-by-case.`,
      });
    } else if (ratio > 0.95 && submitted >= 3) {
      out.push({
        id: "time-pressure",
        severity: "warn",
        title: `HS sát giờ (TB ${r.totals.avgDurationMin}p / ${pkgDuration}p)`,
        detail: `Đa số HS dùng > 95% thời gian. Đề có thể quá dài — cân nhắc giảm số câu hoặc tăng thời lượng.`,
      });
    }
  }

  // 5. Violation outliers.
  if (r.totals.totalViolations >= submitted * 3) {
    out.push({
      id: "many-violations",
      severity: "critical",
      title: `${r.totals.totalViolations} lượt vi phạm anti-cheat`,
      detail: `Trung bình ${Math.round(r.totals.totalViolations / Math.max(1, submitted))} lượt / HS — cao bất thường. Đề nghị xem log vi phạm để xác định case nghi gian lận.`,
    });
  }

  // 6. Pending essay grading.
  if (r.totals.pendingEssayCount > 0) {
    out.push({
      id: "pending-essay",
      severity: "info",
      title: `Còn ${r.totals.pendingEssayCount} câu tự luận chưa chấm`,
      detail: `Điểm tổng của các HS có câu tự luận sẽ cập nhật khi GV được phân công chấm xong. Phân công thêm GV ở danh sách ca thi nếu cần.`,
    });
  }

  // 7. Score distribution — bimodal / single-band concentration.
  const heavy = r.distribution.find((d) => d.percent >= 70);
  if (heavy && submitted >= 5) {
    out.push({
      id: "concentrated-band",
      severity: heavy.band === "Chưa đạt" ? "critical" : "info",
      title: `${heavy.percent}% HS thuộc nhóm "${heavy.band}"`,
      detail: `Phân bố điểm tập trung mạnh vào một band. ${
        heavy.band === "Chưa đạt"
          ? "Đáng báo động — review lại nội dung dạy."
          : "Đề có thể chưa phân loại đủ rõ giữa các nhóm năng lực."
      }`,
    });
  }

  // 8. Common wrong answers for MCQ-single (distractor analysis).
  for (const row of autoGraded) {
    const q = row.question;
    if (q.type !== "mcq-single" || row.totalAssigned < 5) continue;
    // Count chosen options.
    const optionCounts = new Map<string, number>();
    // We don't have per-attempt access here; this is a stub. The detail
    // page can hover into individual attempts for case-by-case views.
    void optionCounts;
  }

  return out;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trim() + "…";
}

export const SEVERITY_META: Record<
  InsightSeverity,
  { label: string; icon: string; tone: string }
> = {
  positive: {
    label: "Tốt",
    icon: "✨",
    tone: "border-emerald-300 bg-emerald-50 text-emerald-900",
  },
  info: {
    label: "Theo dõi",
    icon: "ℹ️",
    tone: "border-blue-200 bg-blue-50 text-blue-900",
  },
  warn: {
    label: "Cảnh báo",
    icon: "⚠",
    tone: "border-amber-300 bg-amber-50 text-amber-900",
  },
  critical: {
    label: "Khẩn",
    icon: "🚨",
    tone: "border-rose-300 bg-rose-50 text-rose-900",
  },
};
