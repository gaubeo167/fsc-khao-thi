/**
 * Display the tier (cấp học) for a grade based on its level number.
 * Tiểu học = 1–5, THCS = 6–9, THPT = 10–12.
 *
 * `id` follows the seed convention `grade-N` so we just parse the number.
 */
export function tierForGrade(gradeId: string): "Tiểu học" | "THCS" | "THPT" | "" {
  const m = /^grade-(\d+)$/.exec(gradeId);
  if (!m) return "";
  const n = Number.parseInt(m[1]!, 10);
  if (n >= 1 && n <= 5) return "Tiểu học";
  if (n >= 6 && n <= 9) return "THCS";
  if (n >= 10 && n <= 12) return "THPT";
  return "";
}

export function gradeNumber(gradeId: string): number | null {
  const m = /^grade-(\d+)$/.exec(gradeId);
  return m ? Number.parseInt(m[1]!, 10) : null;
}
