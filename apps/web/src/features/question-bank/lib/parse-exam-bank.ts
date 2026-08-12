/**
 * Parser for the FSC "đề mẫu" question-bank template (see De_Mau.docx).
 *
 * Each question is prefixed with a bracketed code that encodes everything
 * the bank needs:
 *
 *   [SI10.02.2.D05.a]  →  chuyên đề = SI10.02.2
 *                          loại      = D  (D trắc nghiệm / F đúng-sai /
 *                                          S trả lời ngắn / E tự luận)
 *                          số thứ tự = 05
 *                          độ khó    = a  (a nhận biết → easy,
 *                                          b thông hiểu → medium,
 *                                          c vận dụng   → hard)
 *
 * Đáp án được đánh dấu bằng GẠCH CHÂN trong file Word:
 *   - D: phương án gạch chân là đúng. 1 gạch chân → mcq-single, ≥2 → mcq-multi.
 *   - F: mỗi ý a/b/c/d, gạch chân = Đúng, không gạch = Sai (→ multi-tf).
 *   - S: đáp án ở <Key=...>.
 *   - E: không có đáp án (chấm tay).
 *
 * The parser works on a "marked text" produced by `htmlToMarkedText`:
 * underlined spans are wrapped in ⟦U⟧…⟦/U⟧, everything else is plain text
 * with one line per Word paragraph / table cell / option.
 */

export const U_OPEN = "\u27E6U\u27E7"; // ⟦U⟧
export const U_CLOSE = "\u27E6/U\u27E7"; // ⟦/U⟧

export type BankDifficulty = "easy" | "medium" | "hard";
export type BankQType =
  | "mcq-single"
  | "mcq-multi"
  | "multi-tf"
  | "short-answer"
  | "essay";

export interface ParsedBankQuestion {
  /** Full bracket code as written, e.g. "SI10.02.2.D05.a". */
  rawCode: string;
  /** Chuyên đề code to match against the TOC, e.g. "SI10.02.2". */
  chuyenDeCode: string;
  typeLetter: "D" | "F" | "S" | "E";
  seq: string;
  difficulty: BankDifficulty;
  qType: BankQType;
  /** Question stem (markers stripped). */
  content: string;
  /** mcq-single / mcq-multi. */
  options: Array<{ content: string; isCorrect: boolean }>;
  /** multi-tf (đúng-sai). */
  subQuestions: Array<{ statement: string; correctAnswer: boolean }>;
  /** short-answer accepted answers (from <Key=…>). */
  acceptedAnswers: string[];
  /** Lời giải / hướng dẫn giải / đáp án viết dưới câu hỏi. Với câu tự luận
   *  đây là đáp án mẫu — về sau làm cơ sở cho chấm AI theo rubric. */
  explanation: string;
  /** `false` khi mã KHÔNG ghi độ khó — `difficulty` chỉ là mặc định, phía
   *  client nên suy lại từ tiền tố "a./b./c." của node mục lục khớp mã. */
  difficultyFromCode: boolean;
  /** Per-question issues the reviewer must fix (missing answer, etc.). */
  warnings: string[];
}

export interface ExamBankParseResult {
  questions: ParsedBankQuestion[];
  /** File-level issues (malformed codes that couldn't be parsed at all). */
  warnings: string[];
}

// Độ khó (.a/.b/.c) là TUỲ CHỌN: mã chuyên đề trong mục lục đã mang sẵn
// tiền tố "a. / b. / c." nên độ khó suy ra được từ node khớp — bắt người
// soạn gõ thêm chỉ tổ làm hỏng cả file vì một dấu chấm. Chữ loại nhận cả
// chữ thường (d01 = D01).
const CODE_RE =
  /^\[\s*([A-Za-z]+\d+(?:\.\d+)+)\.([DFSEdfse])(\d+)(?:\.([abcABC]))?\s*\]\s*(.*)$/;
/** "Câu 12." viết ngay sau mã — nhãn của đề gốc, không phải nội dung. */
const LEADING_CAU_RE = /^Câu\s*\d+\s*[.:)]?\s*/i;
// A bracket that looks like an attempt at a code but doesn't match.
const BAD_CODE_RE = /^\[\s*[A-Za-z0-9.\s]+\]/;
const OPTION_RE = /^([A-Z])[.)]\s*(.*)$/; // A. …  /  B) …
const SUBITEM_RE = /^([a-d])\)\s*(.*)$/; // a) …
const KEY_RE = /<Key\s*=\s*([^>]*)>/i;
/** Mở đầu phần lời giải viết dưới câu hỏi (hay gặp nhất ở câu tự luận).
 *  Mọi dòng sau đó thuộc về lời giải, tới khi gặp câu kế tiếp. */
const EXPLANATION_RE =
  /^(?:\+\s*)?(lời giải|hướng dẫn giải|hướng dẫn chấm|đáp án(?:\s*mẫu)?|giải thích|gợi ý(?:\s*trả lời)?)\s*[:.]?\s*(.*)$/i;

const DIFFICULTY: Record<string, BankDifficulty> = {
  a: "easy",
  b: "medium",
  c: "hard",
};

function hasUnderline(s: string): boolean {
  return s.includes(U_OPEN);
}
function stripMarkers(s: string): string {
  return s.split(U_OPEN).join("").split(U_CLOSE).join("").trim();
}

/** Lines that are exam scaffolding, not questions — flush + skip. */
function isSectionLine(line: string): boolean {
  return (
    /^PHẦN\b/i.test(line) ||
    /^(A|B|C|D)\.\s+[A-ZÀ-ỸĐ][A-ZÀ-ỸĐ\s]{3,}$/.test(line) || // A. TRẮC NGHIỆM
    /^Mã đề\b/i.test(line) ||
    /^TRƯỜNG\b/i.test(line) ||
    /^KIỂM TRA\b/i.test(line) ||
    /^Môn:/i.test(line) ||
    /^Thời gian/i.test(line) ||
    /^Họ,?\s*tên/i.test(line) ||
    /^Số báo danh/i.test(line) ||
    /^ĐỀ CHÍNH THỨC/i.test(line) ||
    /^Câu\s+\d+\.?\s*$/i.test(line)
  );
}

export function parseExamBank(marked: string): ExamBankParseResult {
  const lines = marked
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const questions: ParsedBankQuestion[] = [];
  const warnings: string[] = [];
  let cur: ParsedBankQuestion | null = null;
  const contentLines: string[] = [];
  const explanationLines: string[] = [];
  // Từ khi gặp "Lời giải:" tới hết câu, mọi dòng thuộc lời giải chứ không
  // phải đề bài — kể cả dòng nhìn giống phương án (A. …) trong bài giải.
  let inExplanation = false;

  const flush = () => {
    if (!cur) return;
    cur.content = stripMarkers(contentLines.join("\n")).trim();
    cur.explanation = stripMarkers(explanationLines.join("\n")).trim();
    finalizeQuestion(cur);
    questions.push(cur);
    cur = null;
    contentLines.length = 0;
    explanationLines.length = 0;
    inExplanation = false;
  };

  for (const line of lines) {
    const code = CODE_RE.exec(line);
    if (code) {
      flush();
      const chuyenDeCode = code[1]!;
      const typeLetter = code[2]!.toUpperCase() as "D" | "F" | "S" | "E";
      const seq = code[3]!;
      const diffLetter = code[4]?.toLowerCase();
      cur = {
        rawCode: `${chuyenDeCode}.${typeLetter}${seq}${diffLetter ? `.${diffLetter}` : ""}`,
        chuyenDeCode,
        typeLetter,
        seq,
        // Không ghi độ khó → tạm "thông hiểu"; client suy lại từ mục lục.
        difficulty: diffLetter ? DIFFICULTY[diffLetter]! : "medium",
        difficultyFromCode: Boolean(diffLetter),
        qType:
          typeLetter === "F"
            ? "multi-tf"
            : typeLetter === "S"
              ? "short-answer"
              : typeLetter === "E"
                ? "essay"
                : "mcq-single", // D — may become mcq-multi in finalize
        content: "",
        options: [],
        subQuestions: [],
        acceptedAnswers: [],
        explanation: "",
        warnings: [],
      };
      inExplanation = false;
      // Bỏ nhãn "Câu 5." dính ngay sau mã — số thứ tự của đề gốc, không
      // phải nội dung câu hỏi trong kho.
      const rest = code[5]!.replace(LEADING_CAU_RE, "");
      if (rest.trim()) contentLines.push(rest);
      continue;
    }

    if (!cur) {
      // Before the first question: only flag a malformed bracket.
      if (BAD_CODE_RE.test(line) && !isSectionLine(line)) {
        warnings.push(`Dòng có mã sai định dạng, bỏ qua: "${stripMarkers(line).slice(0, 60)}"`);
      }
      continue;
    }

    if (isSectionLine(line)) {
      flush();
      continue;
    }

    // The underline (đáp án) may wrap the option LETTER / sub-item label
    // (e.g. "⟦U⟧C⟦/U⟧. Uracil"), so detect it on the raw line but match
    // the option/sub-item pattern on a marker-free copy.
    const underlined = hasUnderline(line);
    const clean = stripMarkers(line);

    // Short-answer key — xét TRƯỚC lời giải để `<Key=…>` viết lẫn trong
    // phần lời giải vẫn được nhận là đáp án chấm máy.
    const key = KEY_RE.exec(clean);
    if (key && cur.typeLetter === "S") {
      cur.acceptedAnswers.push(key[1]!.trim());
      continue;
    }

    // "Lời giải: …" / "Hướng dẫn giải:" / "Đáp án:" — mở phần lời giải.
    const expl = EXPLANATION_RE.exec(clean);
    if (expl) {
      inExplanation = true;
      if (expl[2]!.trim()) explanationLines.push(expl[2]!);
      continue;
    }
    if (inExplanation) {
      explanationLines.push(line);
      continue;
    }

    // Đúng-sai sub-items.
    if (cur.typeLetter === "F") {
      const sub = SUBITEM_RE.exec(clean);
      if (sub) {
        cur.subQuestions.push({
          statement: sub[2]!.trim(),
          correctAnswer: underlined,
        });
        continue;
      }
    }

    // MCQ options.
    if (cur.typeLetter === "D") {
      const opt = OPTION_RE.exec(clean);
      if (opt) {
        cur.options.push({
          content: opt[2]!.trim(),
          isCorrect: underlined,
        });
        continue;
      }
    }

    // Otherwise part of the stem.
    contentLines.push(line);
  }
  flush();

  return { questions, warnings };
}

function finalizeQuestion(q: ParsedBankQuestion): void {
  if (q.typeLetter === "D") {
    const correct = q.options.filter((o) => o.isCorrect).length;
    q.qType = correct >= 2 ? "mcq-multi" : "mcq-single";
    if (q.options.length < 2) {
      q.warnings.push("Câu trắc nghiệm thiếu phương án (cần ≥2).");
    }
    if (correct === 0) {
      q.warnings.push("Chưa gạch chân đáp án đúng cho câu trắc nghiệm.");
    }
  } else if (q.typeLetter === "F") {
    if (q.subQuestions.length === 0) {
      q.warnings.push("Câu đúng-sai không có ý a/b/c/d.");
    }
    if (q.subQuestions.length > 0 && q.subQuestions.every((s) => !s.correctAnswer)) {
      q.warnings.push("Không có ý nào gạch chân — kiểm tra lại đáp án Đúng/Sai.");
    }
  } else if (q.typeLetter === "S") {
    if (q.acceptedAnswers.length === 0) {
      q.warnings.push("Câu trả lời ngắn thiếu <Key=…> đáp án.");
    }
  }
  if (!q.content.trim()) {
    q.warnings.push("Thiếu nội dung câu hỏi.");
  }
}

/**
 * Flatten mammoth HTML (converted with the `u => u` style map so underline
 * survives) into the marked text `parseExamBank` expects: underline →
 * ⟦U⟧…⟦/U⟧, one line per paragraph / cell / option, `<Key=…>` preserved.
 */
export function htmlToMarkedText(html: string): string {
  let out = html;

  // Underline → sentinel markers (before any tag stripping).
  out = out.replace(/<u\b[^>]*>/gi, U_OPEN).replace(/<\/u>/gi, U_CLOSE);

  // Images → markdown `![](data:…)` on their own line so RenderedContent
  // shows them. (mammoth is asked to inline images as base64 data URIs.)
  out = out.replace(
    /<img\b[^>]*?src="([^"]+)"[^>]*?\/?>/gi,
    (_m, src) => `\n![](${src})\n`,
  );

  // Tabs split 2-per-line options into separate lines.
  out = out.replace(/\t/g, "\n");

  // Block boundaries → newlines.
  out = out.replace(/<\/?h[1-6]\b[^>]*>/gi, "\n");
  out = out.replace(/<br\s*\/?>/gi, "\n");
  out = out.replace(/<\/p>/gi, "\n").replace(/<p\b[^>]*>/gi, "");
  out = out.replace(/<\/?[ou]l\b[^>]*>/gi, "\n");
  out = out.replace(/<li\b[^>]*>/gi, "").replace(/<\/li>/gi, "\n");
  out = out.replace(/<\/tr>/gi, "\n").replace(/<\/?(table|tbody|thead|tr)\b[^>]*>/gi, "");
  out = out.replace(/<\/?(td|th)\b[^>]*>/gi, " ");

  // Drop emphasis + every remaining REAL html tag. (Author-typed "<Key=3>"
  // is entity-escaped as &lt;…&gt; in the HTML, so it is NOT matched here.)
  out = out.replace(/<\/?(strong|b|em|i|span)\b[^>]*>/gi, "");
  out = out.replace(/<[^>]+>/g, "");

  // Decode entities LAST so a real <Key=3> surfaces intact.
  out = out
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");

  return out
    .split(/\r?\n/)
    .map((l) => l.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
