/**
 * AI: MỘT luật duy nhất cho điểm câu Đúng–Sai nhiều ý (multi-tf).
 *
 * ── Quy định ────────────────────────────────────────────────────────────
 *
 * Đề tốt nghiệp THPT từ 2025, Phần II Đúng–Sai, câu 1 điểm chấm LŨY TIẾN:
 *
 *      đúng 1 ý → 0,10đ · 2 ý → 0,25đ · 3 ý → 0,50đ · 4 ý → 1,00đ
 *
 * Không chia đều, và tuyệt đối không phải "sai một ý mất cả câu".
 *
 * ── Vì sao phải gom về một file ─────────────────────────────────────────
 *
 * Luật này từng nằm ở HAI chỗ — bộ chấm ca thi thật (`lib/exam/grade.ts`) và
 * bộ chấm thi thử (`features/exams/lib/grade.ts`) — với hai bản chép tay
 * gần giống nhau. Cả hai cùng mang một lỗi:
 *
 *   `full = table[số ý] ?? max(...)` và `table[số ý đúng] ?? 0`
 *
 * Với câu 5 ý: `table[5]` không có → `full` = 1, và người đúng CẢ 5 ý tra
 * `table[5]` cũng không có → 0 điểm. Trong khi người đúng 4/5 ý tra
 * `table[4]` = 1 → TRỌN ĐIỂM. Làm bài kém hơn thì được điểm cao hơn.
 *
 * Trình soạn câu không chặn số ý, nên 5 ý là chuyện soạn được ngay hôm nay.
 *
 * ── Ba bất biến, kiểm bằng test ─────────────────────────────────────────
 *
 *   1. Đúng HẾT ý → trọn điểm. Với mọi số ý, mọi bảng điểm. Không bàn.
 *   2. Không đúng ý nào → 0.
 *   3. Đúng nhiều ý hơn thì KHÔNG BAO GIỜ được ít điểm hơn (đơn điệu).
 *
 * ── Mặc định khi đề không cài cách chấm ─────────────────────────────────
 *
 * LŨY TIẾN, không phải trọn câu. Trước đây thiếu `scoringPolicy` là rơi về
 * "sai một ý mất cả câu" — nghiêm hơn quy định của Bộ, và im lặng. Đo trên
 * dữ liệu thật: 36/42 đề đang sống không có `scoringPolicy`, 13 đề trong số
 * đó có câu Đúng–Sai. Mặc định sai ở đây là hàng trăm lượt chấm sai.
 *
 * Muốn chấm trọn câu thì phải CHỌN `ds: "full"` — một quyết định có ý thức,
 * không phải hệ quả của việc quên cài.
 */

export interface DsPolicyLike {
  ds?: "graduated" | "weighted" | "full";
  dsGraduatedTable?: Record<number, number>;
}

/** Bảng của Bộ cho câu 4 ý, quy ra điểm tuyệt đối của câu 1 điểm. */
export const DEFAULT_DS_TABLE: Record<number, number> = {
  1: 0.1,
  2: 0.25,
  3: 0.5,
  4: 1,
};

/** Không cài gì = chấm theo quy định của Bộ. */
export const DEFAULT_DS_MODE = "graduated" as const;

/**
 * Tỉ lệ điểm (0..1) của một câu Đúng–Sai nhiều ý.
 *
 * @param subs  từng ý: đúng hay sai, kèm trọng số nếu chấm theo trọng số.
 */
export function dsRatio(
  subs: Array<{ right: boolean; weight?: number }>,
  policy?: DsPolicyLike | null,
): number {
  const n = subs.length;
  if (n === 0) return 0;
  const right = subs.filter((s) => s.right).length;

  // Bất biến 1 & 2 — áp TRƯỚC mọi bảng biểu, vì bảng là thứ có thể sai.
  if (right <= 0) return 0;
  if (right >= n) return 1;

  const mode = policy?.ds ?? DEFAULT_DS_MODE;

  if (mode === "full") return 0; // đã loại trường hợp đúng hết ở trên

  if (mode === "weighted") {
    const totalW = subs.reduce((acc, s) => acc + (s.weight ?? 1), 0);
    if (totalW <= 0) return 0;
    const gotW = subs.reduce((acc, s) => acc + (s.right ? s.weight ?? 1 : 0), 0);
    return clamp01(gotW / totalW);
  }

  // ── Lũy tiến ────────────────────────────────────────────────────────
  const table = policy?.dsGraduatedTable ?? DEFAULT_DS_TABLE;
  const full = table[n];
  // Bảng không phủ số ý này (vd. câu 5 ý, bảng của Bộ chỉ tới 4) → chia đều.
  // Chia đều đơn điệu và luôn cho đúng-hết = trọn điểm, nên nó là chỗ lùi an
  // toàn. Trước đây chỗ này rơi về 0, tức mất trắng câu.
  if (full == null || full <= 0) return clamp01(right / n);

  let cur = table[right];
  if (cur == null) {
    // Bảng thủng ở giữa → lấy bậc gần nhất KHÔNG vượt quá số ý đúng. Giữ
    // tính đơn điệu thay vì trả 0 cho một bậc chưa khai báo.
    cur = 0;
    for (const k of Object.keys(table)
      .map(Number)
      .sort((a, b) => a - b)) {
      if (k <= right) cur = table[k]!;
      else break;
    }
  }
  return clamp01(cur / full);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
