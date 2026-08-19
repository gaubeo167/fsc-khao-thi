/**
 * Deterministic parser for the school's "khung kiến thức cần đạt" template
 * (see docs sample ChDe10_SI.docx). The template is fully code-regular, so
 * we DON'T use AI — we anchor on the bracketed indicator codes and rebuild
 * a 3-level tree:
 *
 *   Chương        SI10.01            "Phần mở đầu"
 *     Chuyên đề     SI10.01.1          "Giới thiệu khái quát…"
 *       Chỉ báo       SI10.01.1.D01      "a. Nêu được đối tượng…"
 *
 * The parser works on plain text extracted from the .docx (any extractor
 * that yields the table cells as text). It is whitespace-robust: it treats
 * tabs as line breaks and accepts the indicator description either on the
 * same line as its code or on the following line.
 */

export interface FrameworkNode {
  name: string;
  /** Standardised code (chương / chuyên đề / chỉ báo). */
  code: string;
  children?: FrameworkNode[];
}

export interface FrameworkParseResult {
  tree: FrameworkNode[];
  counts: { chapters: number; topics: number; indicators: number };
  /**
   * Dòng trông như mã chỉ báo nhưng bộ đọc không hiểu — nêu ra để màn nhập
   * khung nói được "N dòng bị bỏ", thay vì lặng lẽ thiếu lá.
   *
   * Thiếu một lá ở đây KHÔNG dừng lại ở "khung thiếu": đề trích dẫn đúng mã
   * đó sẽ tụt xuống đường khớp theo số chỉ báo và gắn vào lá KHÁC, mà giao
   * diện vẫn báo khớp bình thường. Im lặng ở bước nhập khung là nguồn của
   * một câu hỏi gắn sai chuẩn đầu ra ở tận cuối luồng.
   */
  skipped: string[];
}

// SI10.01.1.D01  → prefix=SI10 chapter=01 topic=1 chữ=D indicator=01
//
// Chữ trước số nhận MỌI chữ cái chứ không chỉ `D`. Khung mẫu của trường đánh
// toàn `D`, nhưng khung môn khác dùng chữ khác thì trước đây regex trượt và
// những chỉ báo đó bị BỎ IM LẶNG — khung nhập vào thiếu lá, đề trích dẫn mã
// đó thành ra "không khớp YCCĐ" mà không ai lần ra vì sao.
//
// Bộ này phải đọc được ĐÚNG những gì `match-competency.ts::splitCode` đọc
// được, nếu không thì hai đầu lệch nhau và lệch về phía tệ nhất: khung MẤT lá,
// còn đề vẫn trích dẫn mã đó. Lúc ấy `matchOutcome` không tìm ra mã đầy đủ nên
// tụt xuống đường "cùng số chỉ báo, khác chữ" và gắn câu vào MỘT LÁ KHÁC —
// giao diện báo "khớp theo số chỉ báo" như bình thường, không ai biết là sai.
// Hai chỗ từng lệch:
//
//   [SI10.02.15.EE1]    chỉ báo hai chữ   → trước đây rơi mất
//   [SI10.02.15.E01.a]  có đuôi độ khó    → trước đây rơi mất
//
// `splitCode` nhận cả hai (đuôi độ khó có test riêng), nên ở đây cũng phải
// nhận. Mã nào vẫn không đọc được thì đi vào `skipped` để báo lên màn nhập,
// KHÔNG rơi im lặng nữa.
const INDICATOR_RE =
  /\[([A-Za-z]+\d+)\.(\d+)\.(\d+)\.([A-Za-z]+)(\d+)(?:\.[A-Za-z])?\]/;
/** Dòng có dấu [...] trông như mã chỉ báo (≥ 4 đoạn) nhưng không đọc được. */
const CODE_LIKE_RE = /\[[A-Za-z0-9]+(?:\.[A-Za-z0-9]+){3,}\]/;
// [SI10.01]: 1. Phần mở đầu
const CHAPTER_COLON_RE = /^\[([A-Za-z]+\d+\.\d+)\]\s*:\s*(.+)$/;
// bare chapter code on its own line: [SI10.01]
const CHAPTER_BARE_RE = /^\[([A-Za-z]+\d+\.\d+)\]$/;
// 1.1. Giới thiệu…  /  2.10 Khái quát…
const TOPIC_TITLE_RE = /^(\d+)\.(\d+)\.?\s+(.+)$/;
// 1. Phần mở đầu
const CHAPTER_TITLE_RE = /^(\d+)\.\s+(.+)$/;

function stripNumbering(s: string, re: RegExp): string {
  return s.replace(re, "").trim();
}

export function parseFrameworkText(raw: string): FrameworkParseResult {
  const lines = raw
    .replace(/\t/g, "\n")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // ── Pass 1: collect chapter names + chuyên đề titles ──────────────────
  const chapterNames = new Map<string, string>(); // "SI10.01" -> "Phần mở đầu"
  const topicTitles = new Map<string, string>(); // "1.1" (numeric) -> title

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    const colon = CHAPTER_COLON_RE.exec(line);
    if (colon) {
      chapterNames.set(colon[1]!, stripNumbering(colon[2]!.trim(), /^\d+\.\s*/));
      continue;
    }
    // Header-table form: "[SI10.01]" then next non-empty line is the name.
    const bare = CHAPTER_BARE_RE.exec(line);
    if (bare) {
      const next = lines[i + 1];
      if (next && !INDICATOR_RE.test(next) && CHAPTER_TITLE_RE.test(next)) {
        if (!chapterNames.has(bare[1]!)) {
          chapterNames.set(
            bare[1]!,
            stripNumbering(next, /^\d+\.\s*/),
          );
        }
      }
      continue;
    }
    // Chuyên đề title line (not an indicator row).
    if (!INDICATOR_RE.test(line)) {
      const tm = TOPIC_TITLE_RE.exec(line);
      if (tm) {
        const key = `${Number.parseInt(tm[1]!, 10)}.${Number.parseInt(tm[2]!, 10)}`;
        if (!topicTitles.has(key)) {
          topicTitles.set(key, stripNumbering(line, /^\d+\.\d+\.?\s*/));
        }
      }
    }
  }

  // ── Pass 2: build the tree from indicator codes, in document order ────
  const chapters: FrameworkNode[] = [];
  const chapterByCode = new Map<string, FrameworkNode>();
  const topicByCode = new Map<string, FrameworkNode>();
  const seenIndicator = new Set<string>();
  const skipped: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const m = INDICATOR_RE.exec(line);
    if (!m) {
      // Trông như mã chỉ báo mà đọc không ra: ghi lại để báo lên, đừng bỏ im.
      if (CODE_LIKE_RE.test(line)) skipped.push(line);
      continue;
    }

    const prefix = m[1]!; // SI10
    const ch = m[2]!; // 01
    const tp = m[3]!; // 1
    const letter = m[4]!.toUpperCase(); // D
    const dnum = m[5]!; // 01
    const chapterCode = `${prefix}.${ch}`;
    const topicCode = `${prefix}.${ch}.${tp}`;
    const indicatorCode = `${prefix}.${ch}.${tp}.${letter}${dnum}`;
    if (seenIndicator.has(indicatorCode)) continue;
    seenIndicator.add(indicatorCode);

    // Description: rest of this line after the code, else the next line
    // that is neither a bare number (the topic index cell) nor a code.
    let desc = line.slice(m.index + m[0].length).trim();
    if (!desc) {
      for (let j = i + 1; j < lines.length; j++) {
        const nx = lines[j]!;
        if (/^\d+$/.test(nx)) continue;
        if (INDICATOR_RE.test(nx)) break;
        desc = nx;
        break;
      }
    }

    let chapter = chapterByCode.get(chapterCode);
    if (!chapter) {
      chapter = {
        name: chapterNames.get(chapterCode) ?? `Chương ${Number.parseInt(ch, 10)}`,
        code: chapterCode,
        children: [],
      };
      chapterByCode.set(chapterCode, chapter);
      chapters.push(chapter);
    }

    let topic = topicByCode.get(topicCode);
    if (!topic) {
      const key = `${Number.parseInt(ch, 10)}.${Number.parseInt(tp, 10)}`;
      topic = {
        name:
          topicTitles.get(key) ??
          `Chuyên đề ${Number.parseInt(ch, 10)}.${Number.parseInt(tp, 10)}`,
        code: topicCode,
        children: [],
      };
      topicByCode.set(topicCode, topic);
      chapter.children!.push(topic);
    }

    topic.children!.push({ name: desc || indicatorCode, code: indicatorCode });
  }

  return {
    tree: chapters,
    counts: {
      chapters: chapters.length,
      topics: topicByCode.size,
      indicators: seenIndicator.size,
    },
    skipped,
  };
}
