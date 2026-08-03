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
}

// SI10.01.1.D01  → prefix=SI10 chapter=01 topic=1 indicator=01
const INDICATOR_RE = /\[([A-Za-z]+\d+)\.(\d+)\.(\d+)\.D(\d+)\]/;
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

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const m = INDICATOR_RE.exec(line);
    if (!m) continue;

    const prefix = m[1]!; // SI10
    const ch = m[2]!; // 01
    const tp = m[3]!; // 1
    const dnum = m[4]!; // 01
    const chapterCode = `${prefix}.${ch}`;
    const topicCode = `${prefix}.${ch}.${tp}`;
    const indicatorCode = `${prefix}.${ch}.${tp}.D${dnum}`;
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
  };
}
