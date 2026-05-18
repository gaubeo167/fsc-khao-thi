/**
 * Rule-based "AI" anomaly detector for the live monitor. We deliberately
 * keep this stand-alone from any real ML/LLM call so the demo stays
 * deterministic and offline. When a real model is wired in later, just
 * swap `detectAnomalies()` to call the model and return the same shape.
 *
 * Severity scale:
 *   - "info"   — worth noting, no action needed (e.g. "Tiến độ chậm hơn bạn cùng phòng").
 *   - "warn"   — proctor should look (e.g. "3 lần chuyển tab trong 5 phút").
 *   - "critical" — proctor should intervene immediately (e.g. "10 vi phạm liên tiếp").
 */

import type { StudentAttempt } from "../state/attempts-store";

export type AnomalySeverity = "info" | "warn" | "critical";

export interface Anomaly {
  /** Stable id within the attempt — used to dedupe / acknowledge later. */
  code: string;
  severity: AnomalySeverity;
  title: string;
  hint?: string;
}

interface DetectContext {
  /** Attempt for the student we're scoring. */
  attempt: StudentAttempt;
  /** Wall clock used for time-based heuristics. */
  now: number;
  /** Number of questions in this exam (snapshot at attempt start). */
  totalQuestions: number;
  /** Median progress % across the room — used to flag slow / fast students. */
  roomMedianProgress?: number;
}

export function detectAnomalies({
  attempt,
  now,
  totalQuestions,
  roomMedianProgress,
}: DetectContext): Anomaly[] {
  const out: Anomaly[] = [];

  const totalViolations =
    attempt.violations.tabSwitches +
    attempt.violations.fullscreenExits +
    attempt.violations.pasteAttempts;

  // 1. Critical mass of anti-cheat violations.
  if (totalViolations >= 8) {
    out.push({
      code: "violations-high",
      severity: "critical",
      title: `${totalViolations} vi phạm anti-cheat`,
      hint: "Số lượt vi phạm rất cao — đề nghị giám thị tới tận nơi kiểm tra.",
    });
  } else if (totalViolations >= 4) {
    out.push({
      code: "violations-medium",
      severity: "warn",
      title: `${totalViolations} vi phạm anti-cheat`,
      hint: "Học sinh có nhiều lượt vi phạm liên tiếp.",
    });
  } else if (totalViolations >= 1) {
    out.push({
      code: "violations-low",
      severity: "info",
      title: `${totalViolations} vi phạm`,
      hint: "Mức bình thường nhưng nên để mắt.",
    });
  }

  // 2. Tab-switch burst — many switches in a short window suggest external help.
  if (attempt.violations.tabSwitches >= 5) {
    out.push({
      code: "tab-burst",
      severity: "warn",
      title: `Chuyển tab ${attempt.violations.tabSwitches} lần`,
      hint: "Có thể đang tham khảo nguồn ngoài.",
    });
  }

  // 3. Paste attempts — any paste during exam is suspicious.
  if (attempt.violations.pasteAttempts >= 2) {
    out.push({
      code: "paste-attempt",
      severity: "warn",
      title: `${attempt.violations.pasteAttempts} lần thử paste`,
      hint: "Học sinh cố paste nội dung bên ngoài vào bài làm.",
    });
  }

  // 4. Progress comparison vs room median.
  if (roomMedianProgress != null && totalQuestions > 0) {
    const answered = Object.keys(attempt.answers).length;
    const myProgress = (answered / totalQuestions) * 100;
    const elapsedMs = now - new Date(attempt.startedAt).getTime();
    const elapsedMin = elapsedMs / 60_000;

    if (myProgress + 30 < roomMedianProgress && elapsedMin > 10) {
      out.push({
        code: "slow-progress",
        severity: "info",
        title: "Tiến độ chậm hơn lớp",
        hint: `Mới làm ${Math.round(myProgress)}% trong khi lớp ~${Math.round(
          roomMedianProgress,
        )}%.`,
      });
    } else if (myProgress > roomMedianProgress + 50 && elapsedMin < 5) {
      out.push({
        code: "suspicious-speed",
        severity: "warn",
        title: "Tiến độ nhanh bất thường",
        hint: `Đã làm ${Math.round(myProgress)}% chỉ sau ${Math.round(
          elapsedMin,
        )} phút — kiểm tra có sao chép đáp án không.`,
      });
    }
  }

  // 5. Inactivity — answered nothing recently. Use submittedAt as a sanity guard.
  if (!attempt.submittedAt) {
    const startedMs = new Date(attempt.startedAt).getTime();
    const elapsedMin = (now - startedMs) / 60_000;
    const answered = Object.keys(attempt.answers).length;
    if (elapsedMin > 5 && answered === 0) {
      out.push({
        code: "inactive",
        severity: "warn",
        title: "Chưa làm câu nào",
        hint: `Đã ${Math.round(elapsedMin)} phút trôi qua mà chưa trả lời.`,
      });
    }
  }

  return out;
}

export const SEVERITY_TONE: Record<AnomalySeverity, string> = {
  info: "border-blue-200 bg-blue-50 text-blue-900",
  warn: "border-amber-200 bg-amber-50 text-amber-900",
  critical: "border-rose-300 bg-rose-50 text-rose-900",
};

export const SEVERITY_LABEL: Record<AnomalySeverity, string> = {
  info: "Theo dõi",
  warn: "Cảnh báo",
  critical: "Khẩn",
};
