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

import { U_CLOSE, U_OPEN } from "./parse-exam-bank";

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
  explanation: string;
  /** Mã chuyên đề đọc được ở bất kỳ đâu trong câu, `null` nếu không có. */
  chuyenDeCode: string | null;
  rawCode: string | null;
  /** Suy từ nhãn [NB]/[TH]/[VD], `null` nếu đề không ghi. */
  difficulty: "easy" | "medium" | "hard" | null;
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

/** Nhãn mức độ theo chuẩn Bộ, viết trong ngoặc vuông. */
const DIFFICULTY_RE = /\[\s*(NB|TH|VDC|VD)\s*\]/i;

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

/** Bỏ ký hiệu gạch chân, trả về text sạch + có được gạch chân hay không. */
function readUnderline(s: string): { text: string; underlined: boolean } {
  const underlined = s.includes(U_OPEN);
  return {
    text: s.split(U_OPEN).join("").split(U_CLOSE).join("").trim(),
    underlined,
  };
}

function toDifficulty(tag: string): "easy" | "medium" | "hard" {
  const t = tag.toUpperCase();
  if (t === "NB") return "easy";
  if (t === "TH") return "medium";
  return "hard"; // VD, VDC
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
  let difficulty: "easy" | "medium" | "hard" | null = null;

  const contentLines: string[] = [];
  const options: GenericOption[] = [];
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
      line = line.replace(CODE_ANYWHERE_RE, " ");
    }

    // Nhãn mức độ.
    const diffM = line.match(DIFFICULTY_RE);
    if (diffM && !difficulty) {
      difficulty = toDifficulty(diffM[1]);
      line = line.replace(DIFFICULTY_RE, " ");
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

    const opts = splitOptions(line);
    if (opts.length > 0) {
      for (const o of opts) {
        options.push({ label: o.label, content: o.text, isCorrect: o.underlined });
      }
      return;
    }

    // Dòng "Đề bài:" của mẫu nội bộ — bỏ nhãn, giữ nội dung.
    line = line.replace(/^\s*(Đề bài|Nội dung|Question)\s*[:.]\s*/i, "");
    const { text } = readUnderline(line);
    if (text) contentLines.push(text);
  });

  const content = contentLines.join("\n").trim();
  if (!content && options.length === 0) return null;

  if (options.length > 0 && !options.some((o) => o.isCorrect)) {
    // KHÔNG đoán. Đề thật thường không đánh dấu đáp án; người dùng sẽ chọn.
    w.push("Đề không đánh dấu đáp án đúng — cần chọn tay");
  }
  if (!difficulty) w.push("Đề không ghi mức độ — cần chọn tay");

  return {
    index,
    content,
    options,
    explanation: explanationLines.join("\n").trim(),
    chuyenDeCode,
    rawCode,
    difficulty,
    warnings: w,
  };
}
