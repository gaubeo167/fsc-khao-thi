/**
 * MOET scoring (Axis-B) — pure functions used by thi thử (Đợt 3d) and, later,
 * the real grader (Đợt 4). Independent of any store / runtime.
 */
import { DEFAULT_DS_GRADUATED, type ScoringPolicy } from "../data/types";

/**
 * MCQ nhiều đáp án.
 *   - "full":    đúng hết & không thừa → pts, ngược lại 0.
 *   - "partial": max(0, (#đúng-đã-chọn − #sai-đã-chọn) / #đáp-án-đúng) × pts.
 */
export function scoreMcqMulti(
  chosenIds: string[],
  correctIds: string[],
  pts: number,
  mode: "full" | "partial",
): number {
  const correct = new Set(correctIds);
  const chosen = new Set(chosenIds);
  if (mode === "full") {
    const exact =
      chosen.size === correct.size && [...chosen].every((id) => correct.has(id));
    return exact ? pts : 0;
  }
  let right = 0;
  let wrong = 0;
  for (const id of chosen) {
    if (correct.has(id)) right++;
    else wrong++;
  }
  const nCorrect = correct.size || 1;
  return Math.max(0, (right - wrong) / nCorrect) * pts;
}

/**
 * Đúng–Sai nhiều ý. `results[i]` = học sinh trả lời đúng ý i hay không.
 *   - "full":       đúng hết → pts, ngược lại 0.
 *   - "graduated":  bảng lũy tiến theo số ý đúng (mặc định MOET THPT).
 *   - "weighted":   Σ weight của các ý đúng × pts (weights là phần 0..1).
 */
export function scoreDs(
  results: boolean[],
  pts: number,
  policy: Pick<ScoringPolicy, "ds" | "dsGraduatedTable">,
  weights?: number[],
): number {
  const rightCount = results.filter(Boolean).length;
  const total = results.length || 1;

  if (policy.ds === "full") {
    return results.length > 0 && results.every(Boolean) ? pts : 0;
  }

  if (policy.ds === "weighted") {
    if (!weights || weights.length === 0) {
      return (rightCount / total) * pts; // fallback: chia đều
    }
    let sum = 0;
    for (let i = 0; i < results.length; i++) {
      if (results[i]) sum += weights[i] ?? 0;
    }
    return sum * pts;
  }

  // graduated
  //
  // Bảng lũy tiến đọc theo TỈ LỆ VỚI DÒNG CUỐI, không phải phần 0..1 cứng:
  // 0,25 / 0,5 / 0,75 / 1 và 0,5 / 1 / 1,5 / 2 là cùng một cách chấm, chỉ
  // khác đơn vị giáo viên gõ vào. Chia cho `table[số ý]` nên bảng ghi bằng
  // điểm tuyệt đối (câu 2 điểm) không làm câu đó vọt quá `pts`. Bảng cũ có
  // dòng cuối bằng 1 nên chia cho 1 — kết quả không đổi.
  //
  // Đây cũng là cách `lib/exam/ds-score.ts` đọc bảng. Hai bộ chấm đọc khác
  // nhau thì cùng một đề ra hai điểm, và ca kiểm thử test-multi-tf-grade.mjs
  // tồn tại vì chuyện đó đã xảy ra một lần.
  const table = policy.dsGraduatedTable ?? DEFAULT_DS_GRADUATED;
  if (rightCount <= 0) return 0;
  const full = table[results.length];
  if (full == null || full <= 0) {
    // Bảng không phủ số ý này → chia đều, vẫn đơn điệu và đúng-hết = trọn điểm.
    return (rightCount / total) * pts;
  }
  const cur = table[rightCount] ?? (rightCount >= results.length ? full : 0);
  return Math.min(1, cur / full) * pts;
}
