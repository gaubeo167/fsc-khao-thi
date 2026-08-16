/**
 * Soát xem khung YCCĐ sắp nhập có ĐÚNG môn / khối đang chọn hay không.
 *
 * ── Vì sao cần ──────────────────────────────────────────────────────────
 *
 * Màn nhập khung ghi thẳng vào môn + khối đang chọn trên màn hình, không hỏi
 * lại và không đối chiếu gì với nội dung file. Chọn nhầm một lần là cả khung
 * của môn khác nằm im trong môn này, và về sau nó hiện ra ở ô chọn YCCĐ của
 * môn đó — người dùng thấy "chọn Toán khối 1 mà ra khung Sinh khối 10" và
 * không có cách nào lần ra vì sao, vì màn hình nào cũng lọc đúng theo môn.
 *
 * May là mã YCCĐ tự mang thông tin: `SI10.01.1.D01` có `SI` (môn) và `10`
 * (khối). Đối chiếu được thì bắt được nhầm lẫn NGAY LÚC NHẬP, chỗ duy nhất
 * người dùng còn nhớ mình vừa chọn gì.
 *
 * Nguyên tắc: CẢNH BÁO, không chặn. Quy ước đặt mã là của trường, không phải
 * của hệ thống — một môn hoàn toàn có thể đánh mã kiểu khác. Chặn cứng là
 * lấy phán đoán của mình đè lên nghiệp vụ của người dùng.
 */

/** Đầu mã: chữ = môn, số = khối. `SI10.01.1.D01` → `{ letters: "SI", grade: 10 }`. */
export interface CodePrefix {
  letters: string;
  grade: number | null;
  /** Nguyên văn đoạn đầu, vd "SI10". */
  raw: string;
}

const PREFIX_RE = /^([A-Za-z]+)(\d*)/;

export function codePrefix(code: string): CodePrefix | null {
  const first = code.trim().split(".")[0];
  if (!first) return null;
  const m = PREFIX_RE.exec(first);
  if (!m || !m[1]) return null;
  return {
    letters: m[1].toUpperCase(),
    grade: m[2] ? Number(m[2]) : null,
    raw: first.toUpperCase(),
  };
}

/** Số khối đọc từ tên khối ("Khối 10" → 10). `null` nếu tên không có số. */
export function gradeNumber(gradeName: string | null | undefined): number | null {
  const m = /(\d+)/.exec(gradeName ?? "");
  return m ? Number(m[1]) : null;
}

/** Đầu mã xuất hiện nhiều nhất trong một danh sách mã. */
function dominantPrefix(codes: string[]): CodePrefix | null {
  const count = new Map<string, { p: CodePrefix; n: number }>();
  for (const c of codes) {
    const p = codePrefix(c);
    if (!p) continue;
    const cur = count.get(p.raw);
    if (cur) cur.n += 1;
    else count.set(p.raw, { p, n: 1 });
  }
  let best: { p: CodePrefix; n: number } | null = null;
  for (const v of count.values()) if (!best || v.n > best.n) best = v;
  return best?.p ?? null;
}

export interface ScopeWarning {
  kind: "khac-khoi" | "khac-mon";
  message: string;
}

/**
 * So mã trong file với môn / khối đang chọn.
 *
 * `existingCodes` là mã của khung HIỆN CÓ trong đúng môn đang chọn (mọi
 * khối) — dùng để phát hiện "môn này vốn đánh mã TO…, file lại toàn SI…".
 */
export function checkFrameworkScope(input: {
  codes: string[];
  existingCodes: string[];
  gradeName: string | null | undefined;
  subjectName: string | null | undefined;
}): ScopeWarning[] {
  const out: ScopeWarning[] = [];
  const file = dominantPrefix(input.codes);
  if (!file) return out;

  const wantGrade = gradeNumber(input.gradeName);
  if (file.grade != null && wantGrade != null && file.grade !== wantGrade) {
    out.push({
      kind: "khac-khoi",
      message:
        `Mã trong file là ${file.raw} — theo quy ước là khối ${file.grade}, ` +
        `nhưng bạn đang nhập vào ${input.gradeName}.`,
    });
  }

  const have = dominantPrefix(input.existingCodes);
  if (have && have.letters !== file.letters) {
    out.push({
      kind: "khac-mon",
      message:
        `Khung hiện có của ${input.subjectName ?? "môn này"} đánh mã ${have.raw}, ` +
        `còn file này đánh mã ${file.raw} — nhiều khả năng đây là khung của môn khác.`,
    });
  }
  return out;
}
