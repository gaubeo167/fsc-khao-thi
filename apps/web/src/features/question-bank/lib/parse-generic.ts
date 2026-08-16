/**
 * Parser cho đề KHÔNG theo mẫu nào của hệ thống.
 *
 * Vì sao cần: đưa ba file đề thật vào hai parser cũ thì cả ba ra 0 câu, dù cả
 * ba đều có cấu trúc rõ ràng. Chúng chỉ không trùng khuôn mà parser đòi:
 *
 *   SHOC   `Câu 1. [SI10.02.15.D01] Thành tựu nào…`
 *          → parser mã đề đòi mã ĐẦU DÒNG, parser FSC đòi `Câu 1` ĐỨNG MỘT MÌNH
 *          → thêm nữa hai phương án nằm CHUNG một dòng, cách nhau bằng tab
 *
 *   AIMO   không có chữ "Câu" nào; ranh giới giữa các câu là khối `Solution:`
 *          → phương án viết `A:` chứ không phải `A.`
 *
 *   Đề mẫu `Câu 1 [NB]` + `Đề bài:` — parser FSC lại đi tìm dòng `Dạng:`
 *
 * Nguyên tắc: THÀ ĐỂ TRỐNG CÒN HƠN ĐOÁN. Đề thật hay không đánh dấu đáp án
 * đúng (file AIMO chỉ có 3 dấu gạch chân cho 20 câu), nên khi không có dấu
 * thì để trống hết và bắt người dùng chọn ở màn sửa — đoán bừa một phương án
 * là gieo đáp án sai vào ngân hàng, không ai phát hiện.
 */

import { parseAnswerKey, U_CLOSE, U_OPEN } from "./parse-exam-bank";
import type { ShortAnswerKey } from "@/lib/exam/short-answer-match";

export type GenericStrategy = "cau-n" | "ma-de-inline" | "solution-block";

export interface GenericOption {
  label: string;
  content: string;
  isCorrect: boolean;
}

export interface GenericQuestion {
  index: number;
  content: string;
  options: GenericOption[];
  /** Ý con của câu Đúng/Sai (mã .F) — gạch chân = Đúng. */
  subQuestions: Array<{ statement: string; correctAnswer: boolean }>;
  /** Đáp án câu trả lời ngắn (mã .S), đọc từ `<Key=…>`. */
  acceptedAnswers: ShortAnswerKey[];
  /** Đúng/Sai MỘT mệnh đề (mã DS): `Đáp án: Đúng`. */
  correctAnswer: boolean | null;
  /** Điền khuyết (DK): mỗi ô trống một nhóm đáp án chấp nhận. */
  blanks: Array<{ acceptedAnswers: string[] }>;
  /** Ghép cặp (GC). */
  pairs: Array<{ left: string; right: string }>;
  /** Sắp xếp (SX) — theo đúng thứ tự đúng. */
  items: string[];
  /** Kéo thả (KT): đáp án đúng của từng vùng thả. */
  zones: string[];
  /** Kéo thả (KT): mảnh gây nhiễu, không thuộc vùng nào. */
  distractors: string[];
  explanation: string;
  /** Mã chuyên đề đọc được ở bất kỳ đâu trong câu, `null` nếu không có. */
  chuyenDeCode: string | null;
  rawCode: string | null;
  /** Suy từ nhãn [NB]/[TH]/[VD], `null` nếu đề không ghi. */
  difficulty: "easy" | "medium" | "hard" | null;
  /**
   * Chữ LOẠI CÂU trong mã YCCĐ — đoạn thứ ba, vd `D` của [SI10.02.15.D01]:
   *   D = trắc nghiệm · F = Đúng/Sai nhiều ý · S = trả lời ngắn · E = tự luận
   *
   * Đây là nguồn đáng tin hơn việc đếm phương án: câu Đúng/Sai và trả lời
   * ngắn KHÔNG có A/B/C/D nào để đếm, nên nếu bỏ chữ này thì đúng những câu
   * đó ra "chưa nhận ra dạng" dù đề đã ghi rõ loại ngay trong mã.
   */
  typeLetter: "D" | "F" | "S" | "E" | null;
  /**
   * Dạng câu đọc từ nhãn `[TN]` / `[DS]` / `[TLN]` / `[TL]` — dành cho đề
   * KHÔNG có mã YCCĐ. Xem bảng nhãn ở `TYPE_TOKENS`.
   */
  typeTag: GenericTypeTag | null;
  warnings: string[];
}

export interface GenericParseResult {
  questions: GenericQuestion[];
  warnings: string[];
  strategy: GenericStrategy | null;
}

/** `Câu 12.` / `Câu 12:` / `# Câu 12` — nội dung có thể nằm ngay sau. */
const CAU_N_RE = /^\s*(?:#\s*)?C[âa]u\s*(\d+)\s*[.:)\]]?\s*(.*)$/i;

/** Mã chuyên đề `[SI10.02.15.D01]`, đứng ở BẤT KỲ đâu trong dòng. */
const CODE_ANYWHERE_RE =
  /\[\s*([A-Za-z]+\d+(?:\.\d+)+\.[DFSEdfse]\d+(?:\.[abcABC])?)\s*\]/;

/** Dòng mở đầu bằng mã — khuôn "mã đề" nhưng không có chữ Câu. */
const CODE_AT_START_RE = /^\s*\[\s*[A-Za-z]+\d+(?:\.\d+)+\.[DFSEdfse]\d+/;

/** Khối lời giải: kết thúc câu hiện tại. */
const SOLUTION_RE = /^\s*(Solution|Lời giải|Hướng dẫn giải|Giải thích|Đáp án)\s*[:.]/i;

/** Ý con của câu Đúng/Sai: `a) …` `b) …`. Cùng quy ước với parser mã đề. */
const SUBITEM_RE = /^\s*([a-dA-D])\)\s*(.*)$/;

/** Đáp án trả lời ngắn: `<Key=42>` hoặc `<Key=42|50%|gợi ý>`. */
const KEY_RE = /<Key\s*=\s*([^>]*)>/i;

/* ── Dòng dữ liệu của các dạng câu có cấu trúc ────────────────────────────
 *
 * Cùng quy ước với mẫu FSC nội bộ (`parse-import.ts`) chứ không đặt kiểu
 * mới: người soạn đã quen `Đáp án 1:` và `1. A → B` thì đừng bắt học lại.
 */

/** Đúng/Sai một mệnh đề (DS): `Đáp án: Đúng`. */
const TF_ANSWER_RE = /^\s*Đáp\s*án\s*[:.]\s*(Đúng|Sai|True|False)\s*$/i;

/** Điền khuyết (DK): `Đáp án 1: Hà Nội | Hanoi | HN` — mỗi ô trống một dòng. */
const BLANK_RE = /^\s*Đáp\s*án\s*(\d+)\s*[:.]\s*(.+)$/i;

/** Kéo thả (KT): `Vùng 1: Hà Nội` và `Nhiễu: Tokyo | London`. */
const ZONE_RE = /^\s*(?:Vùng|Ô)\s*(\d+)\s*[:.]\s*(.+)$/i;
const DISTRACTOR_RE = /^\s*(?:Nhiễu|Gây nhiễu|Mồi)\s*[:.]\s*(.+)$/i;

/** Ghép cặp (GC): `1. Việt Nam → Hà Nội`. Nhận mọi kiểu mũi tên hay gạch nối. */
const PAIR_RE = /^\s*\d+\s*[.)]\s*(.+?)\s*(?:→|->|=>|↔|—|–|-)\s*(.+)$/;

/** Sắp xếp (SX): `1. -5` — viết theo ĐÚNG thứ tự đúng. */
const ITEM_RE = /^\s*\d+\s*[.)]\s*(.+)$/;

/** Dạng câu KHÔNG có phương án A/B/C/D. */
const NO_OPTION_TYPES = new Set<GenericTypeTag | null>([
  "true-false",
  "short-answer",
  "fill-blank",
  "matching",
  "ordering",
  "drag-drop",
  "underline",
  "essay",
]);

/** Tách danh sách viết chung một dòng, ngăn bằng `|`. */
const splitPipes = (s: string): string[] =>
  s
    .split("|")
    .map((x) => x.trim())
    .filter(Boolean);

/**
 * Đổi vùng gạch chân của Word thành mốc `[u:…]` mà câu GẠCH CHÂN dùng.
 *
 * Người soạn gạch chân thẳng trong Word là xong — không phải gõ mốc bằng
 * tay. Ai đã gõ sẵn `[u:…]` thì cũng chạy, vì mốc đó đi qua nguyên vẹn.
 */
function markUnderline(line: string): string {
  let out = "";
  let buf = "";
  let depth = 0;
  for (let i = 0; i < line.length; ) {
    if (line.startsWith(U_OPEN, i)) {
      depth += 1;
      i += U_OPEN.length;
      continue;
    }
    if (line.startsWith(U_CLOSE, i)) {
      depth = Math.max(0, depth - 1);
      if (depth === 0 && buf.trim()) {
        out += `[u:${buf.trim()}]`;
        buf = "";
      }
      i += U_CLOSE.length;
      continue;
    }
    if (depth > 0) buf += line[i];
    else out += line[i];
    i += 1;
  }
  return (out + buf).trim();
}

/**
 * Nhãn trong ngoặc vuông của đề KHÔNG theo mã YCCĐ.
 *
 * Hai trục, viết chung một kiểu, đặt sau số câu:
 *
 *     Câu 1. [NB][TN] Nội dung câu hỏi…     ← mức độ + dạng câu
 *     Câu 2. [VD-TL] …                       ← viết gộp cũng được
 *
 * Vì sao có trục DẠNG CÂU: đề không theo YCCĐ thì hệ thống chỉ còn cách ĐẾM
 * phương án để đoán dạng. Đếm được với trắc nghiệm, nhưng câu Đúng/Sai, trả
 * lời ngắn và tự luận đều không có A/B/C/D nào để đếm — nên chúng luôn ra
 * "chưa nhận ra dạng" và người soạn phải chọn tay từng câu. Một nhãn hai chữ
 * xoá hẳn việc đó.
 *
 * Chữ một ký tự (D/M/F/S/E) dùng chung bảng với mã YCCĐ để cả hệ thống chỉ
 * có MỘT quy ước; chữ tiếng Việt (TN/TNN/DS/TLN/TL) là lối viết tự nhiên hơn
 * cho người soạn. Nhận cả hai.
 */
const DIFF_TOKENS: Record<string, "easy" | "medium" | "hard"> = {
  NB: "easy",
  TH: "medium",
  VD: "hard",
  VDC: "hard",
};

/** Dạng câu suy từ nhãn — cùng tên với `QuestionType` của kho câu hỏi. */
export type GenericTypeTag =
  | "mcq-single"
  | "mcq-multi"
  | "true-false"
  | "multi-tf"
  | "short-answer"
  | "fill-blank"
  | "matching"
  | "ordering"
  | "drag-drop"
  | "underline"
  | "essay";

const TYPE_TOKENS: Record<string, GenericTypeTag> = {
  // Trắc nghiệm
  TN: "mcq-single",
  D: "mcq-single",
  TNN: "mcq-multi",
  M: "mcq-multi",
  // Đúng/Sai: MỘT mệnh đề (DS) khác NHIỀU ý a/b/c/d (DSN). Hai dạng khác
  // nhau ở cách chấm nên không gộp mã.
  DS: "true-false",
  DSN: "multi-tf",
  F: "multi-tf",
  // Học sinh tự gõ đáp án
  TLN: "short-answer",
  S: "short-answer",
  DK: "fill-blank",
  // Thao tác trên các mảnh cho sẵn
  GC: "matching",
  SX: "ordering",
  KT: "drag-drop",
  GCH: "underline",
  // Chấm tay
  TL: "essay",
  E: "essay",
};

/** Một cụm ngoặc vuông bất kỳ, ngắn — đủ dài cho `[NB-TLN]`, không nuốt cả câu. */
const TAG_GROUP_RE = /\[([^[\]]{1,24})\]/g;

/** `Đ` → `D` để `[ĐS]` và `[DS]` là một. */
function normTag(s: string): string {
  return s.toUpperCase().replace(/Đ/g, "D");
}

/**
 * Đọc nhãn mức độ / dạng câu trên một dòng và gỡ chúng khỏi nội dung.
 *
 * CHỈ tiêu thụ cụm ngoặc mà MỌI chữ bên trong đều nằm trong hai bảng trên.
 * Cụm lạ — `[1]`, `[Hình 2]`, `[SGK tr.45]` — để nguyên trong đề bài, vì
 * đoán ở đây là lặng lẽ ăn mất chữ của người soạn.
 */
export function readTags(line: string): {
  line: string;
  difficulty: "easy" | "medium" | "hard" | null;
  typeTag: GenericTypeTag | null;
} {
  let difficulty: "easy" | "medium" | "hard" | null = null;
  let typeTag: GenericTypeTag | null = null;
  const out = line.replace(TAG_GROUP_RE, (whole, inner: string) => {
    const tokens = normTag(inner)
      .split(/[-/,;+\s]+/)
      .filter(Boolean);
    if (tokens.length === 0) return whole;
    if (!tokens.every((t) => t in DIFF_TOKENS || t in TYPE_TOKENS)) return whole;
    for (const t of tokens) {
      if (t in DIFF_TOKENS && !difficulty) difficulty = DIFF_TOKENS[t]!;
      if (t in TYPE_TOKENS && !typeTag) typeTag = TYPE_TOKENS[t]!;
    }
    return " ";
  });
  return { line: out, difficulty, typeTag };
}

/** Dòng tiêu đề phần đề thi — bỏ qua, không phải câu hỏi. */
const SECTION_RE =
  /^\s*(Section\s+[A-Z]\b|Ph[ầa]n\s+[IVX\d]|I{1,3}\.\s|Time allowed|Thí sinh trả lời)/i;

/**
 * Tìm các phương án trong MỘT dòng. Trả mảng rỗng nếu dòng không phải dòng
 * phương án.
 *
 * Chấp nhận `A.` `A:` `A)` và NHIỀU phương án chung một dòng (file SHOC xếp
 * A–B trên một dòng, C–D dòng dưới, cách nhau bằng tab). Chỉ nhận chữ cái
 * đứng ĐẦU DÒNG hoặc sau tab / 2 dấu cách trở lên — nếu không thì câu văn
 * kiểu "…theo A. Einstein" cũng bị cắt thành phương án.
 */
/**
 * Gỡ ký hiệu gạch chân khỏi chuỗi, đồng thời giữ bản đồ "ký tự thứ i của
 * chuỗi sạch có nằm trong vùng gạch chân không".
 *
 * Cần bản đồ này vì ký hiệu chen vào giữa nhãn phương án: người soạn gạch
 * chân đúng CHỮ CÁI đáp án, nên chuỗi ra là "⟦U⟧A⟦/U⟧. Sản xuất…" — dấu chấm
 * nằm NGOÀI ký hiệu. Mọi cách dò bằng regex trên chuỗi còn ký hiệu đều vỡ ở
 * đây; dò trên chuỗi sạch rồi tra ngược bản đồ thì không.
 */
function stripUnderline(line: string): { clean: string; marked: boolean[] } {
  let out = "";
  const marked: boolean[] = [];
  let depth = 0;
  for (let i = 0; i < line.length; ) {
    if (line.startsWith(U_OPEN, i)) { depth += 1; i += U_OPEN.length; continue; }
    if (line.startsWith(U_CLOSE, i)) { depth = Math.max(0, depth - 1); i += U_CLOSE.length; continue; }
    out += line[i];
    marked.push(depth > 0);
    i += 1;
  }
  return { clean: out, marked };
}

/**
 * Tìm các phương án trong MỘT dòng đã gỡ ký hiệu.
 *
 * Chấp nhận `A.` `A:` `A)` và NHIỀU phương án chung một dòng — file SHOC xếp
 * A–B trên một dòng, C–D dòng dưới, cách nhau bằng tab.
 *
 * `^\s*` chứ không phải `^`: file AIMO thụt phương án A đúng MỘT dấu cách còn
 * B/C/D hai dấu, nên bản đòi "đầu dòng hoặc 2+ dấu cách" làm A trượt ở mọi câu.
 *
 * `\s*` ở cuối chứ không phải `\s+`: khi nội dung phương án nằm trong công
 * thức OMath, mammoth trả về đúng chuỗi "A." rỗng.
 */
function splitOptions(
  rawLine: string,
): Array<{ label: string; text: string; underlined: boolean }> {
  const { clean, marked } = stripUnderline(rawLine);
  const scan = (src: string) => {
    const hits: Array<{ label: string; start: number; end: number }> = [];
    let m: RegExpExecArray | null;
    const r = new RegExp(src, "g");
    while ((m = r.exec(clean)) != null) {
      hits.push({ label: m[1].toUpperCase(), start: m.index, end: r.lastIndex });
    }
    return hits;
  };
  let hits = scan("(?:^\\s*|\\t\\s*|\\s{2,})([A-H])\\s*[.:)]\\s*");
  if (hits.length > 0 && hits[0].label !== "A") {
    // Word hay gộp đề bài với phương án A vào chung một đoạn, cách nhau đúng
    // một dấu cách — bản chặt trả về B,C,D còn A trôi vào đề bài. Chỉ nới khi
    // nhãn thu được KHÔNG bắt đầu từ A, tức chắc chắn đang thiếu đầu.
    const loose = scan("(?:^\\s*|\\t\\s*|\\s+)([A-H])\\s*[.:)]\\s*");
    // Nhãn phải ra đúng dãy A, B, C… — dãy liền mạch là bằng chứng đây là
    // danh sách phương án thật, không phải chữ cái lẻ trong câu văn.
    const seq = loose.every((h, i) => h.label === String.fromCharCode(65 + i));
    if (seq && loose.length > hits.length) hits = loose;
  }
  if (hits.length === 0) return [];
  return hits.map((h, i) => {
    const segEnd = i + 1 < hits.length ? hits[i + 1].start : clean.length;
    return {
      label: h.label,
      // Gạch chân ở BẤT KỲ đâu trong đoạn của phương án — nhãn hay nội dung —
      // đều tính là đánh dấu đáp án đúng.
      underlined: marked.slice(h.start, segEnd).some(Boolean),
      text: clean.slice(h.end, segEnd).trim(),
    };
  });
}

/** Gỡ ký hiệu gạch chân, chỉ để kiểm tra dòng có chữ thật hay không. */
function stripMarks(s: string): string {
  return s.split(U_OPEN).join("").split(U_CLOSE).join("");
}

/** Bỏ ký hiệu gạch chân, trả về text sạch + có được gạch chân hay không. */
function readUnderline(s: string): { text: string; underlined: boolean } {
  const underlined = s.includes(U_OPEN);
  return {
    text: s.split(U_OPEN).join("").split(U_CLOSE).join("").trim(),
    underlined,
  };
}

/** Chọn cách chia câu dựa trên bằng chứng trong file, không theo thứ tự ưu tiên. */
export function pickStrategy(lines: string[]): GenericStrategy | null {
  let cauN = 0;
  let codeStart = 0;
  let solution = 0;
  for (const l of lines) {
    if (CAU_N_RE.test(l)) cauN += 1;
    if (CODE_AT_START_RE.test(l)) codeStart += 1;
    if (SOLUTION_RE.test(l)) solution += 1;
  }
  const best = [
    { s: "cau-n" as const, n: cauN },
    { s: "ma-de-inline" as const, n: codeStart },
    // Khối lời giải là dấu hiệu YẾU NHẤT: nó chỉ dùng khi không có mốc nào
    // khác, vì "Đáp án:" cũng xuất hiện trong đề có mốc `Câu N` mà không
    // hề là ranh giới câu.
    { s: "solution-block" as const, n: solution > 0 ? 1 : 0 },
  ].sort((a, b) => b.n - a.n);
  return best[0].n > 0 ? best[0].s : null;
}

/**
 * Phần đầu đề: tên sở/trường, tên kỳ thi, thời gian làm bài… Không phải câu
 * hỏi, nhưng ở chế độ solution-block thì chúng đứng trước câu 1 và bị gom vào
 * đề bài câu 1 (đã thấy ở file AIMO: cả khối tiêu đề tổ chức trôi vào câu 1).
 */
function isFrontMatter(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (/^(Time allowed|Thời gian|Họ và tên|Mã đề|Lớp\s*:|SBD|Điểm)/i.test(t)) return true;
  // Dòng VIẾT HOA toàn bộ và không có dấu chấm hỏi — tên tổ chức / kỳ thi.
  const letters = t.replace(/[^A-Za-zÀ-ỹ]/g, "");
  if (letters.length > 8 && letters === letters.toUpperCase() && !t.includes("?")) {
    return true;
  }
  return false;
}

export function parseGeneric(marked: string): GenericParseResult {
  const lines = marked.split(/\r?\n/);
  const strategy = pickStrategy(lines);
  if (!strategy) return { questions: [], warnings: [], strategy: null };

  // ─── Chia thành khối câu ───
  // Nếu đề có dòng tiêu đề phần ("Section A", "Phần I"), mọi thứ TRƯỚC dòng
  // đầu tiên đó là đầu đề (tên tổ chức, kỳ thi, thời gian) — không phải câu
  // hỏi. Cắt phăng thay vì dựa vào bộ lọc đoán từng dòng.
  const bareOf = (l: string) =>
    l.split(U_OPEN).join("").split(U_CLOSE).join("").trim();
  const firstSection = lines.findIndex((l) => SECTION_RE.test(bareOf(l)));
  const body = firstSection >= 0 ? lines.slice(firstSection + 1) : lines;

  const blocks: string[][] = [];
  let cur: string[] | null = null;
  const push = (b: string[] | null) => {
    if (b && b.some((l) => l.trim())) blocks.push(b);
  };
  let sawSolution = false;

  const step = (raw: string) => {
    const line = raw.trimEnd();
    // Bộ lọc tiêu đề / phần phải nhìn chữ THẬT: dòng "Section A" trong file
    // AIMO bị bọc ⟦U⟧…⟦/U⟧ nên bản cũ không nhận ra nó là tiêu đề phần và
    // gom cả khối đầu đề vào câu 1.
    const bare = line.split(U_OPEN).join("").split(U_CLOSE).join("").trim();
    if (!line.trim()) {
      if (cur) cur.push("");
      return;
    }
    let starts = false;
    if (strategy === "cau-n") starts = CAU_N_RE.test(line);
    else if (strategy === "ma-de-inline") starts = CODE_AT_START_RE.test(line);
    else {
      // Đề không có mốc "Câu N": ranh giới câu là khối lời giải. Nhưng THÂN
      // lời giải nằm ngay sau chữ "Solution:", nên KHÔNG thể lấy dòng kế tiếp
      // làm câu mới — làm vậy thì lời giải câu trước trôi thành đề bài câu
      // sau. Đã thấy đúng lỗi đó ở file AIMO: câu 2 mở đầu bằng
      // "The original price of the jacket is: …" tức lời giải của câu 1.
      //
      // Mốc đáng tin duy nhất còn lại là DÒNG PHƯƠNG ÁN. Sau khi gặp lời
      // giải, câu mới bắt đầu khi thấy dòng phương án kế tiếp, và đề bài của
      // nó là mấy dòng ngay trước đó — nên phải kéo ngược chúng ra khỏi khối
      // lời giải.
      if (SOLUTION_RE.test(line)) {
        sawSolution = true;
      } else if (sawSolution && splitOptions(line).length > 0) {
        const stem: string[] = [];
        while (cur && cur.length > 0) {
          const last = cur[cur.length - 1] ?? "";
          if (!last.trim() || SOLUTION_RE.test(last)) break;
          stem.unshift(cur.pop() as string);
        }
        push(cur);
        cur = [...stem, line];
        sawSolution = false;
        return;
      } else if (!cur && !SECTION_RE.test(bare) && !isFrontMatter(bare)) {
        starts = true;
      }
    }
    if (starts) {
      push(cur);
      cur = [line];
    } else if (cur) {
      cur.push(line);
    }
    // Dòng trước câu đầu tiên (tiêu đề trường, tên kỳ thi…) bị bỏ — đó là
    // phần đầu đề, không phải câu hỏi.
  };
  for (const raw of body) step(raw);
  push(cur);

  // ─── Đọc từng khối ───
  const questions: GenericQuestion[] = [];
  const warnings: string[] = [];

  blocks.forEach((block, i) => {
    const q = parseBlock(block, i + 1, strategy);
    if (q) questions.push(q);
  });

  return { questions, warnings, strategy };
}

function parseBlock(
  block: string[],
  index: number,
  strategy: GenericStrategy,
): GenericQuestion | null {
  const w: string[] = [];
  let chuyenDeCode: string | null = null;
  let rawCode: string | null = null;
  let typeLetter: GenericQuestion["typeLetter"] = null;
  let typeTag: GenericTypeTag | null = null;
  let difficulty: "easy" | "medium" | "hard" | null = null;

  const contentLines: string[] = [];
  const options: GenericOption[] = [];
  const subQuestions: GenericQuestion["subQuestions"] = [];
  /** Chỉ số ý Đúng/Sai đang chờ nội dung ở dòng kế tiếp. */
  let pendingSub: number | null = null;
  const acceptedAnswers: ShortAnswerKey[] = [];
  /** Đúng/Sai một mệnh đề. */
  let correctAnswer: boolean | null = null;
  const blanks: GenericQuestion["blanks"] = [];
  const pairs: GenericQuestion["pairs"] = [];
  const items: string[] = [];
  const zones: string[] = [];
  const distractors: string[] = [];
  const explanationLines: string[] = [];
  let inExplanation = false;

  block.forEach((raw, li) => {
    let line = raw;

    // Dòng mở câu: gỡ mốc `Câu N` để không lẫn vào đề bài.
    if (li === 0 && strategy === "cau-n") {
      const m = line.match(CAU_N_RE);
      if (m) line = m[2] ?? "";
    }

    // Mã chuyên đề: đọc ở bất kỳ đâu rồi gỡ khỏi đề bài.
    const codeM = line.match(CODE_ANYWHERE_RE);
    if (codeM && !rawCode) {
      rawCode = codeM[1];
      chuyenDeCode = codeM[1].replace(/\.[DFSEdfse]\d+(?:\.[abcABC])?$/, "");
      const lm = codeM[1].match(/\.([DFSEdfse])\d+(?:\.[abcABC])?$/);
      if (lm) {
        typeLetter = lm[1].toUpperCase() as GenericQuestion["typeLetter"];
      }
      line = line.replace(CODE_ANYWHERE_RE, " ");
    }

    // Nhãn mức độ + dạng câu, vd `Câu 1. [NB][TN]`.
    //
    // Ngừng dò khi đã biết dạng câu: câu GẠCH CHÂN dùng chính dấu ngoặc vuông
    // để đánh mốc `[u:…]`, dò tiếp là có ngày ăn mất mốc của người soạn.
    if (!typeTag) {
      const tags = readTags(line);
      if (tags.difficulty || tags.typeTag) {
        line = tags.line;
        if (!difficulty) difficulty = tags.difficulty;
        typeTag = tags.typeTag;
      }
    }

    // ── Dòng dữ liệu của các dạng có cấu trúc ──
    // Xét TRƯỚC khối lời giải vì `Đáp án:` vừa là nhãn lời giải vừa là nhãn
    // đáp án của Đúng/Sai và Điền khuyết.
    if (typeTag === "true-false") {
      const m = TF_ANSWER_RE.exec(stripMarks(line));
      if (m) {
        correctAnswer = /^(Đúng|True)$/i.test(m[1]!);
        return;
      }
    }
    if (typeTag === "fill-blank") {
      const m = BLANK_RE.exec(stripMarks(line));
      if (m) {
        blanks.push({ acceptedAnswers: splitPipes(m[2]!) });
        return;
      }
    }
    if (typeTag === "drag-drop") {
      const z = ZONE_RE.exec(stripMarks(line));
      if (z) {
        zones.push(z[2]!.trim());
        return;
      }
      const d = DISTRACTOR_RE.exec(stripMarks(line));
      if (d) {
        distractors.push(...splitPipes(d[1]!));
        return;
      }
    }
    if (typeTag === "matching") {
      const m = PAIR_RE.exec(stripMarks(line));
      if (m) {
        pairs.push({ left: m[1]!.trim(), right: m[2]!.trim() });
        return;
      }
    }
    if (typeTag === "ordering") {
      const m = ITEM_RE.exec(stripMarks(line));
      if (m) {
        items.push(m[1]!.trim());
        return;
      }
    }

    if (SOLUTION_RE.test(line)) {
      inExplanation = true;
      explanationLines.push(line.replace(SOLUTION_RE, "").trim());
      return;
    }
    if (inExplanation) {
      explanationLines.push(line);
      return;
    }

    // Đáp án trả lời ngắn: xét TRƯỚC lời giải, để `<Key=…>` viết lẫn trong
    // phần giải thích vẫn được nhận là đáp án chấm máy.
    const keyM = line.match(KEY_RE);
    if (keyM) {
      acceptedAnswers.push(parseAnswerKey(keyM[1] ?? ""));
      line = line.replace(KEY_RE, " ");
      // Dòng chỉ có mỗi <Key=…> thì bỏ luôn, đừng để "<KEY=3>" nằm trong đề.
      if (!stripMarks(line).trim()) return;
    }

    // Câu Đúng/Sai (mã .F): các dòng `a) …` là Ý CON, không phải phương án.
    // Bản trước không tách nên chúng trôi hết vào đề bài và câu nào cũng báo
    // "Cần ít nhất 2 ý Đúng/Sai" dù đề viết đủ.
    if (typeLetter === "F" || typeTag === "multi-tf") {
      const { clean, marked } = stripUnderline(line);
      const sub = SUBITEM_RE.exec(clean);
      if (sub) {
        const text = (sub[2] ?? "").trim();
        subQuestions.push({
          statement: text,
          // Gạch chân = Đúng, đúng quy ước của khuôn mã đề.
          correctAnswer: marked.some(Boolean),
        });
        // Nhãn `a)` đứng MỘT MÌNH, câu chữ nằm dòng dưới — kiểu trình bày
        // rất phổ biến trong đề Word. Không xử lý thì mọi ý ra rỗng và câu
        // nào cũng báo "Cần ít nhất 2 ý Đúng/Sai" dù đề viết đủ.
        if (!text) pendingSub = subQuestions.length - 1;
        return;
      }
      // Dòng ngay sau một nhãn ý rỗng chính là nội dung của ý đó.
      if (pendingSub != null) {
        const target = subQuestions[pendingSub];
        if (target) {
          target.statement = clean.trim();
          // Gạch chân có thể nằm ở dòng nội dung thay vì ở nhãn.
          if (marked.some(Boolean)) target.correctAnswer = true;
        }
        pendingSub = null;
        return;
      }
    }

    // Chỉ trắc nghiệm mới có phương án A/B/C/D. Các dạng còn lại mà đi cắt
    // phương án thì câu văn "…theo A. Einstein" hay dòng "D. Nam" của một
    // cặp ghép sẽ bị xén thành phương án.
    if (typeLetter !== "S" && typeLetter !== "E" && !NO_OPTION_TYPES.has(typeTag)) {
      const opts = splitOptions(line);
      if (opts.length > 0) {
        for (const o of opts) {
          options.push({ label: o.label, content: o.text, isCorrect: o.underlined });
        }
        return;
      }
    }

    // Dòng "Đề bài:" của mẫu nội bộ — bỏ nhãn, giữ nội dung.
    line = line.replace(/^\s*(Đề bài|Nội dung|Question)\s*[:.]\s*/i, "");
    // Câu GẠCH CHÂN: vùng gạch chân trong Word CHÍNH LÀ đáp án, nên giữ lại
    // thành mốc thay vì gỡ bỏ như mọi dạng khác.
    if (typeTag === "underline") {
      const marked = markUnderline(line);
      if (marked) contentLines.push(marked);
      return;
    }
    const { text } = readUnderline(line);
    if (text) contentLines.push(text);
  });

  const content = contentLines.join("\n").trim();
  const hasAnyData =
    options.length > 0 ||
    subQuestions.length > 0 ||
    blanks.length > 0 ||
    pairs.length > 0 ||
    items.length > 0 ||
    zones.length > 0;
  if (!content && !hasAnyData) return null;

  if (options.length > 0 && !options.some((o) => o.isCorrect)) {
    // KHÔNG đoán. Đề thật thường không đánh dấu đáp án; người dùng sẽ chọn.
    w.push("Đề không đánh dấu đáp án đúng — cần chọn tay");
  }
  if (!difficulty) w.push("Đề không ghi mức độ — cần chọn tay");

  return {
    index,
    content,
    options,
    subQuestions,
    acceptedAnswers,
    correctAnswer,
    blanks,
    pairs,
    items,
    zones,
    distractors,
    explanation: explanationLines.join("\n").trim(),
    chuyenDeCode,
    rawCode,
    typeLetter,
    typeTag,
    difficulty,
    warnings: w,
  };
}
