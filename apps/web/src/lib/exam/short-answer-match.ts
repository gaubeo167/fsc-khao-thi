/**
 * So khớp đáp án của câu TRẢ LỜI NGẮN — dùng chung cho bộ chấm thật
 * (`lib/exam/grade.ts`) và bộ chấm thi thử (`features/exams/lib/grade.ts`).
 *
 * Một module duy nhất là có chủ ý: dự án từng có hai bộ chấm song song và
 * chúng đã lạc nhau (mcq-multi tính điểm khác nhau ở hai bên). Sửa ở đây là
 * cả hai đường cùng đổi.
 *
 * Ba lớp so khớp, theo thứ tự:
 *
 * 1. SỐ — chuẩn hoá rồi so bằng giá trị. Học sinh Việt gõ "0,25" trong khi
 *    giáo viên soạn "0.25" là chuyện xảy ra hằng ngày; so chuỗi thuần sẽ
 *    chấm sai một câu trả lời đúng. Cũng quy về nhau: "5" = "5,0" = "5.00",
 *    "1 000" = "1000", "1/4" = "0,25", "-,5" = "-0.5".
 * 2. KÝ TỰ ĐẠI DIỆN — `*` khớp mọi chuỗi, đúng như Moodle short answer
 *    (`ran*ing` khớp "running"). `\*` để khớp dấu sao thật.
 * 3. CHỮ — trim + gộp khoảng trắng, hạ chữ nếu không phân biệt hoa/thường.
 *
 * Chấm theo Moodle: duyệt đáp án TỪ TRÊN XUỐNG, khớp cái đầu tiên thì dừng
 * và lấy % điểm của chính nó. Nhờ vậy đặt `*` ở cuối làm lưới hứng (0% kèm
 * lời giải thích) hoạt động đúng như tài liệu Moodle khuyến nghị.
 */

/** Một đáp án chấp nhận. Chuỗi trần = 100% điểm, không phản hồi — đúng dạng
 *  dữ liệu cũ, nên câu hỏi đã lưu chạy nguyên không cần migration. */
export type ShortAnswerKey =
  | string
  | {
      text: string;
      /** 0..100. Thiếu = 100. */
      grade?: number;
      /** Hiện cho học sinh khi khớp chính đáp án này. */
      feedback?: string;
    };

export interface ShortAnswerMatch {
  /** 0..1 — phần điểm của câu. */
  ratio: number;
  /** Vị trí đáp án khớp trong danh sách, -1 nếu không khớp cái nào. */
  index: number;
  feedback?: string;
}

export function keyText(k: ShortAnswerKey): string {
  return typeof k === "string" ? k : k.text;
}

function keyGrade(k: ShortAnswerKey): number {
  if (typeof k === "string") return 100;
  const g = k.grade;
  if (typeof g !== "number" || !Number.isFinite(g)) return 100;
  return Math.min(100, Math.max(0, g));
}

/** Gộp khoảng trắng thừa; luôn áp dụng trước mọi phép so. */
function squash(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

/**
 * Đổi một chuỗi thành số nếu nó THỰC SỰ là số, kể cả các biến thể tiếng
 * Việt. Trả `null` khi không phải số — khi đó không so bằng giá trị nữa để
 * tránh biến "một phần tư" thành 0,25 một cách bừa bãi.
 */
export function parseVnNumber(raw: string): number | null {
  let s = squash(raw).replace(/\s/g, "");
  if (!s) return null;

  // Phân số "1/4", "-3/8" — Moodle nói shortanswer nhận cả 1/4.
  const frac = /^([+-]?\d+(?:[.,]\d+)?)\/(\d+(?:[.,]\d+)?)$/.exec(s);
  if (frac) {
    const a = Number(frac[1]!.replace(",", "."));
    const b = Number(frac[2]!.replace(",", "."));
    if (Number.isFinite(a) && Number.isFinite(b) && b !== 0) return a / b;
    return null;
  }

  // Bỏ dấu phân nhóm hàng nghìn, quy dấu thập phân về dấu chấm.
  // "1.234,5" (kiểu VN) → 1234.5 ; "1,234.5" (kiểu Anh) → 1234.5
  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  if (hasDot && hasComma) {
    const decimalIsComma = s.lastIndexOf(",") > s.lastIndexOf(".");
    s = decimalIsComma
      ? s.replace(/\./g, "").replace(",", ".")
      : s.replace(/,/g, "");
  } else if (hasComma) {
    // Nhiều dấu phẩy = phân nhóm hàng nghìn ("1,000,000"); một dấu = thập phân.
    s = s.split(",").length > 2 ? s.replace(/,/g, "") : s.replace(",", ".");
  }

  // ",5" / "-,5" → "0.5" / "-0.5"
  s = s.replace(/^([+-]?)\.(\d)/, "$10.$2");
  if (!/^[+-]?\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Khớp mẫu có ký tự đại diện bằng hai con trỏ, KHÔNG dùng regex.
 *
 * Bản đầu tôi dịch `*` thành `[\s\S]*` rồi ném cho RegExp. Đo thử: mẫu
 * `*a*a*a*a*a*a*a*a*a*a*b` gặp câu trả lời 2000 ký tự "aaaa…" chạy QUÁ 2 PHÚT
 * — regex backtracking bùng nổ theo hàm mũ. Trên route nộp bài (Node đơn
 * luồng) là đóng băng cả function, mọi học sinh đang nộp cùng lúc đều kẹt.
 * Giữa kỳ thi thì đó là hỏng thật, không phải rủi ro lý thuyết.
 *
 * Thuật toán dưới là khớp glob kinh điển: mỗi lần gặp `*` thì nhớ mốc, sai
 * thì lùi về mốc + 1. Độ phức tạp O(n×m) chặn trên, không có đường bùng nổ.
 * `\*` khớp dấu sao thật.
 */
function tokenizePattern(pattern: string): Array<{ star: true } | { ch: string }> {
  const out: Array<{ star: true } | { ch: string }> = [];
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;
    if (c === "\\" && pattern[i + 1] === "*") {
      out.push({ ch: "*" });
      i++;
    } else if (c === "*") {
      // Gộp `**` thành một sao — không đổi ngữ nghĩa, bớt việc.
      if (out.length === 0 || !("star" in out[out.length - 1]!)) out.push({ star: true });
    } else {
      out.push({ ch: c });
    }
  }
  return out;
}

function globMatch(text: string, pattern: string, caseSensitive: boolean): boolean {
  const s = caseSensitive ? text : text.toLowerCase();
  const toks = tokenizePattern(caseSensitive ? pattern : pattern.toLowerCase());
  let si = 0;
  let ti = 0;
  let starTok = -1;
  let starStr = 0;
  while (si < s.length) {
    const t = toks[ti];
    if (t && "ch" in t && t.ch === s[si]) {
      si++;
      ti++;
    } else if (t && "star" in t) {
      starTok = ti++;
      starStr = si;
    } else if (starTok !== -1) {
      ti = starTok + 1;
      si = ++starStr;
    } else {
      return false;
    }
  }
  while (ti < toks.length && "star" in toks[ti]!) ti++;
  return ti === toks.length;
}

function matchesOne(
  studentRaw: string,
  keyRaw: string,
  caseSensitive: boolean,
): boolean {
  const student = squash(studentRaw);
  const key = squash(keyRaw);
  if (!key) return false;

  // 1. So bằng GIÁ TRỊ SỐ khi cả hai bên đều là số. Chỉ khi đáp án không
  //    chứa ký tự đại diện — có `*` thì người soạn đang cố ý so theo mẫu.
  if (!key.includes("*")) {
    const a = parseVnNumber(student);
    const b = parseVnNumber(key);
    if (a !== null && b !== null) return a === b;
  }

  // 2. Ký tự đại diện.
  if (key.includes("*")) return globMatch(student, key, caseSensitive);

  // 3. So chữ.
  return caseSensitive
    ? student === key
    : student.toLowerCase() === key.toLowerCase();
}

/**
 * Chấm một câu trả lời ngắn. Duyệt từ trên xuống, dừng ở đáp án khớp đầu
 * tiên (quy tắc Moodle) nên thứ tự đáp án là có ý nghĩa.
 */
export function matchShortAnswer(
  studentText: string,
  keys: readonly ShortAnswerKey[] | undefined,
  caseSensitive = false,
): ShortAnswerMatch {
  if (!keys || keys.length === 0) return { ratio: 0, index: -1 };
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]!;
    if (matchesOne(studentText, keyText(k), caseSensitive)) {
      return {
        ratio: keyGrade(k) / 100,
        index: i,
        feedback: typeof k === "string" ? undefined : k.feedback,
      };
    }
  }
  return { ratio: 0, index: -1 };
}
