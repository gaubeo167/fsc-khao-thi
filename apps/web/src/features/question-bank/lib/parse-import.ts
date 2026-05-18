/**
 * Parse the FSC import text format into an array of importable questions.
 *
 * Format spec (each question delimited by `# Câu N` or `=== CÂU N ===`):
 *
 * ```
 * # Câu 1
 * Dạng: MCQ-SINGLE
 * Độ khó: Dễ
 * Đề bài: Đạo hàm của $x^2$ bằng?
 *
 * A. x
 * B. 2x [đúng]
 * C. $x^2$
 * D. 0
 *
 * Giải thích: Áp dụng (x^n)' = n·x^(n-1).
 * ```
 *
 * Supported types: mcq-single, mcq-multi, true-false, fill-blank, matching,
 * ordering, essay. The parser is intentionally permissive — unrecognised
 * lines inside a question are appended to the question content so teachers
 * don't need to worry about exact spacing.
 */

export type ImportedQuestion =
  | ImportedMcqSingle
  | ImportedMcqMulti
  | ImportedTrueFalse
  | ImportedFillBlank
  | ImportedMatching
  | ImportedOrdering
  | ImportedEssay
  | ImportedUnderline;

export type ImportDifficulty = "easy" | "medium" | "hard";

interface ImportedBase {
  difficulty: ImportDifficulty;
  content: string;
  explanation?: string;
}

interface ImportedMcqSingle extends ImportedBase {
  type: "mcq-single";
  options: Array<{ content: string; isCorrect: boolean }>;
}
interface ImportedMcqMulti extends ImportedBase {
  type: "mcq-multi";
  options: Array<{ content: string; isCorrect: boolean }>;
}
interface ImportedTrueFalse extends ImportedBase {
  type: "true-false";
  correctAnswer: boolean;
}
interface ImportedFillBlank extends ImportedBase {
  type: "fill-blank";
  blanks: Array<{ acceptedAnswers: string[] }>;
}
interface ImportedMatching extends ImportedBase {
  type: "matching";
  pairs: Array<{ left: string; right: string }>;
}
interface ImportedOrdering extends ImportedBase {
  type: "ordering";
  items: string[];
}
interface ImportedEssay extends ImportedBase {
  type: "essay";
  rubric: Array<{ label: string; points: number }>;
  wordMin?: number;
  wordMax?: number;
}
interface ImportedUnderline extends ImportedBase {
  type: "underline";
}

export interface ParseResult {
  questions: ImportedQuestion[];
  warnings: string[];
}

/** Top-level entry. Splits into per-question blocks then parses each. */
export function parseImportText(raw: string): ParseResult {
  const blocks = splitIntoBlocks(raw);
  const questions: ImportedQuestion[] = [];
  const warnings: string[] = [];
  blocks.forEach((block, i) => {
    const parsed = parseBlock(block, i + 1);
    if (parsed.error) {
      warnings.push(`Câu ${i + 1}: ${parsed.error}`);
    }
    if (parsed.question) {
      questions.push(parsed.question);
    }
  });
  return { questions, warnings };
}

const BLOCK_HEADER_RE = /^\s*(?:#\s*Câu\s*\d+|={2,}\s*CÂU\s*\d+\s*={2,})/im;

function splitIntoBlocks(raw: string): string[] {
  const lines = raw.split(/\r?\n/);
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (BLOCK_HEADER_RE.test(line)) {
      if (current.length > 0) blocks.push(current);
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(current);
  return blocks
    .map((b) => b.join("\n").trim())
    .filter((s) => s.length > 0);
}

interface ParseOne {
  question?: ImportedQuestion;
  error?: string;
}

function parseBlock(block: string, index: number): ParseOne {
  const lines = block.split(/\r?\n/);
  const meta: Record<string, string> = {};
  const otherLines: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      otherLines.push("");
      continue;
    }
    const m = /^([A-Za-zÀ-ỹ\s]+):\s*(.+)$/.exec(line);
    if (m) {
      const key = normaliseKey(m[1]);
      const val = m[2].trim();
      // Only keys we recognise go into meta; others fall through into content
      if (RECOGNISED_KEYS.has(key)) {
        meta[key] = val;
        continue;
      }
    }
    otherLines.push(rawLine);
  }

  const typeRaw = meta["dang"] ?? meta["type"] ?? "";
  const type = normaliseType(typeRaw);
  if (!type) {
    return { error: `Không nhận diện được dạng câu hỏi ("Dạng: ${typeRaw || "—"}")` };
  }
  const difficulty = normaliseDifficulty(
    meta["dokho"] ?? meta["difficulty"] ?? "medium",
  );
  const content = (meta["debai"] ?? meta["content"] ?? "").trim();
  const explanation = meta["giaithich"] ?? meta["explanation"];

  switch (type) {
    case "mcq-single":
    case "mcq-multi":
      return parseMcq(type, difficulty, content, explanation, otherLines, index);
    case "true-false":
      return parseTrueFalse(difficulty, content, explanation, meta);
    case "fill-blank":
      return parseFillBlank(difficulty, content, explanation, meta);
    case "matching":
      return parseMatching(difficulty, content, explanation, otherLines);
    case "ordering":
      return parseOrdering(difficulty, content, explanation, otherLines);
    case "essay":
      return parseEssay(difficulty, content, explanation, meta);
    case "underline":
      return parseUnderline(difficulty, content, explanation);
  }
}

const RECOGNISED_KEYS = new Set([
  "dang",
  "type",
  "dokho",
  "difficulty",
  "debai",
  "content",
  "giaithich",
  "explanation",
  "dapan",
  "answer",
  "sotutoitihieu",
  "sotutoithieu",
  "sotutoida",
  "tieuchi",
  // Numbered keys like "Đáp án 1", "Tiêu chí 2", "Đáp án 1" — handled
  // separately during fill-blank/essay parsing.
]);

function normaliseKey(k: string): string {
  // Lowercase + strip diacritics + spaces
  return k
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, "");
}

function normaliseType(raw: string): ImportedQuestion["type"] | null {
  const k = normaliseKey(raw);
  const map: Record<string, ImportedQuestion["type"]> = {
    "mcq-single": "mcq-single",
    "mcqsingle": "mcq-single",
    "tracnghiem1dapan": "mcq-single",
    "tracnghiem1": "mcq-single",
    "trnnghiem1": "mcq-single",
    "tn1": "mcq-single",
    "single": "mcq-single",

    "mcq-multi": "mcq-multi",
    "mcqmulti": "mcq-multi",
    "tracnghiemnhieudapan": "mcq-multi",
    "tracnghiemnhieu": "mcq-multi",
    "tnnhieu": "mcq-multi",
    "multi": "mcq-multi",

    "true-false": "true-false",
    "truefalse": "true-false",
    "dungsai": "true-false",
    "ds": "true-false",
    "tf": "true-false",

    "fill-blank": "fill-blank",
    "fillblank": "fill-blank",
    "diendung": "fill-blank",
    "dienkhuyet": "fill-blank",
    "fb": "fill-blank",

    "matching": "matching",
    "ghepcap": "matching",
    "ghep": "matching",

    "ordering": "ordering",
    "sapxep": "ordering",
    "thutu": "ordering",

    "essay": "essay",
    "tuluan": "essay",

    "underline": "underline",
    "gachchan": "underline",
  };
  return map[k] ?? null;
}

function normaliseDifficulty(raw: string): ImportDifficulty {
  const k = normaliseKey(raw);
  if (k.includes("de") || k.includes("nhanbiet") || k === "easy") return "easy";
  if (k.includes("kho") || k.includes("vandung") || k === "hard") return "hard";
  return "medium";
}

/* ─────── per-type parsers ─────── */

function parseMcq(
  type: "mcq-single" | "mcq-multi",
  difficulty: ImportDifficulty,
  content: string,
  explanation: string | undefined,
  otherLines: string[],
  _index: number,
): ParseOne {
  if (!content) return { error: "Thiếu Đề bài" };
  const options: Array<{ content: string; isCorrect: boolean }> = [];
  for (const line of otherLines) {
    const m = /^([A-H])[\.\)]\s*(.+?)(\s*\[(đúng|dung|correct|true)\])?\s*$/i.exec(
      line.trim(),
    );
    if (m) {
      options.push({ content: m[2].trim(), isCorrect: Boolean(m[3]) });
    }
  }
  if (options.length < 2) {
    return { error: `Cần ít nhất 2 phương án (A. B. ...)` };
  }
  if (type === "mcq-single" && options.filter((o) => o.isCorrect).length !== 1) {
    return { error: `MCQ-SINGLE phải có đúng 1 phương án đánh dấu [đúng]` };
  }
  if (type === "mcq-multi" && options.filter((o) => o.isCorrect).length < 1) {
    return { error: `MCQ-MULTI phải có ít nhất 1 phương án đánh dấu [đúng]` };
  }
  return {
    question: { type, difficulty, content, explanation, options },
  };
}

function parseTrueFalse(
  difficulty: ImportDifficulty,
  content: string,
  explanation: string | undefined,
  meta: Record<string, string>,
): ParseOne {
  if (!content) return { error: "Thiếu Đề bài" };
  const ans = (meta["dapan"] ?? meta["answer"] ?? "").toLowerCase();
  const correct =
    ans.startsWith("đ") ||
    ans.startsWith("d") ||
    ans === "true" ||
    ans === "t" ||
    ans === "1";
  return {
    question: {
      type: "true-false",
      difficulty,
      content,
      explanation,
      correctAnswer: correct,
    },
  };
}

function parseFillBlank(
  difficulty: ImportDifficulty,
  content: string,
  explanation: string | undefined,
  meta: Record<string, string>,
): ParseOne {
  if (!content) return { error: "Thiếu Đề bài" };
  // Convert __ or [blank] markers to [blank:N]
  let n = 0;
  const normalisedContent = content.replace(/(_{3,}|\[blank\])/gi, () => {
    n += 1;
    return `[blank:${n}]`;
  });
  const expectedBlanks = n;
  // Find "Đáp án N: a | b | c" lines
  const blanks: Array<{ acceptedAnswers: string[] }> = [];
  for (const [k, v] of Object.entries(meta)) {
    const m = /^dapan(\d+)$/.exec(k);
    if (m) {
      const idx = Number(m[1]) - 1;
      const answers = v
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean);
      blanks[idx] = { acceptedAnswers: answers };
    }
  }
  for (let i = 0; i < expectedBlanks; i++) {
    if (!blanks[i]) blanks[i] = { acceptedAnswers: [] };
  }
  if (blanks.length === 0) {
    return { error: "Cần ít nhất 1 ô trống (dùng ___ hoặc [blank])" };
  }
  if (blanks.some((b) => b.acceptedAnswers.length === 0)) {
    return {
      error: "Mỗi ô trống cần ít nhất 1 đáp án (Đáp án 1: ...)",
    };
  }
  return {
    question: {
      type: "fill-blank",
      difficulty,
      content: normalisedContent,
      explanation,
      blanks,
    },
  };
}

function parseMatching(
  difficulty: ImportDifficulty,
  content: string,
  explanation: string | undefined,
  otherLines: string[],
): ParseOne {
  if (!content) return { error: "Thiếu Đề bài" };
  const pairs: Array<{ left: string; right: string }> = [];
  for (const line of otherLines) {
    const m = /^\d+\.\s*(.+?)\s*(?:→|->|↔|—|-)\s*(.+)$/.exec(line.trim());
    if (m) {
      pairs.push({ left: m[1].trim(), right: m[2].trim() });
    }
  }
  if (pairs.length < 2) return { error: "Cần ít nhất 2 cặp (1. A → B)" };
  return {
    question: { type: "matching", difficulty, content, explanation, pairs },
  };
}

function parseOrdering(
  difficulty: ImportDifficulty,
  content: string,
  explanation: string | undefined,
  otherLines: string[],
): ParseOne {
  if (!content) return { error: "Thiếu Đề bài" };
  const items: string[] = [];
  for (const line of otherLines) {
    const m = /^\d+\.\s*(.+)$/.exec(line.trim());
    if (m) items.push(m[1].trim());
  }
  if (items.length < 2) return { error: "Cần ít nhất 2 mục để sắp xếp" };
  return {
    question: { type: "ordering", difficulty, content, explanation, items },
  };
}

function parseEssay(
  difficulty: ImportDifficulty,
  content: string,
  explanation: string | undefined,
  meta: Record<string, string>,
): ParseOne {
  if (!content) return { error: "Thiếu Đề bài" };
  const rubric: Array<{ label: string; points: number }> = [];
  for (const [k, v] of Object.entries(meta)) {
    if (/^tieuchi/.test(k)) {
      // Format "Label | points"
      const m = /^(.+?)\s*\|\s*([\d.,]+)$/.exec(v);
      if (m) {
        rubric.push({
          label: m[1].trim(),
          points: Number(m[2].replace(",", ".")) || 1,
        });
      } else {
        rubric.push({ label: v.trim(), points: 1 });
      }
    }
  }
  if (rubric.length === 0) {
    rubric.push({ label: "Đáp án tổng quát", points: 10 });
  }
  return {
    question: {
      type: "essay",
      difficulty,
      content,
      explanation,
      rubric,
      wordMin: Number(meta["sotutoithieu"] ?? "0") || undefined,
      wordMax: Number(meta["sotutoida"] ?? "0") || undefined,
    },
  };
}

function parseUnderline(
  difficulty: ImportDifficulty,
  content: string,
  explanation: string | undefined,
): ParseOne {
  if (!content) return { error: "Thiếu Đề bài" };
  // Accept either `[...]` brackets or already-formatted `[u:...]` markers
  const normalised = content
    .replace(/\[u:([^\]]+)\]/g, "[u:$1]") // keep canonical form
    .replace(/(?<!\[u:)\[([^\]]+)\](?!:)/g, "[u:$1]");
  if (!/\[u:[^\]]+\]/.test(normalised)) {
    return { error: "Cần đánh dấu ít nhất 1 cụm gạch chân với cú pháp [cụm]" };
  }
  return {
    question: {
      type: "underline",
      difficulty,
      content: normalised,
      explanation,
    },
  };
}
