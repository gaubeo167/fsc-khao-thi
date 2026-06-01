/**
 * Office Math (OMath) XML → LaTeX converter.
 *
 * Word's Equation Editor / MathType (when "Insert as Math" is used)
 * produces `<m:oMath>` blocks inside `word/document.xml`. mammoth's
 * default HTML/text conversion silently drops them, which is why a
 * teacher's question reads "2x + 3 = " on import even though they wrote
 * "2x + 3 = 7" with the "7" inside an equation.
 *
 * This converter handles the subset of OMath that shows up in K-12
 * Vietnamese math/physics/chem question banks:
 *
 *   - <m:r><m:t>...</m:t></m:r>   plain run
 *   - <m:f>num/den</m:f>          fraction          → \frac{...}{...}
 *   - <m:sSup>base + sup</m:sSup> superscript       → ...^{...}
 *   - <m:sSub>base + sub</m:sSub> subscript         → ..._{...}
 *   - <m:sSubSup>base + sub + sup>                  → ..._{...}^{...}
 *   - <m:rad>e (+ deg)</m:rad>    radical           → \sqrt[n]{...}
 *   - <m:nary> sum / int / prod                     → \sum_{...}^{...}{...}
 *   - <m:d>(grouped)</m:d>        delimiter         → \left(...\right)
 *   - <m:bar> overline / underline                  → \overline{...} / \underline{...}
 *   - <m:m> matrix                                  → \begin{matrix}...\end{matrix}
 *   - <m:limLow> / <m:limUpp>                       → ..._{...} / ..^{...}
 *
 * Anything not recognised falls through to its text content (best
 * effort — the teacher's equation still surfaces as plain text rather
 * than disappearing entirely).
 *
 * The input is the inner XML of one `<m:oMath>` block (no namespace
 * decls needed; we strip `m:` prefixes during tag matching).
 */

const SYMBOL_MAP: Record<string, string> = {
  "·": "\\cdot ",
  "×": "\\times ",
  "÷": "\\div ",
  "±": "\\pm ",
  "≤": "\\leq ",
  "≥": "\\geq ",
  "≠": "\\neq ",
  "≈": "\\approx ",
  "→": "\\to ",
  "⇒": "\\Rightarrow ",
  "⇔": "\\Leftrightarrow ",
  "∞": "\\infty ",
  "∑": "\\sum ",
  "∫": "\\int ",
  "∏": "\\prod ",
  "√": "\\sqrt ",
  "π": "\\pi ",
  "α": "\\alpha ",
  "β": "\\beta ",
  "γ": "\\gamma ",
  "δ": "\\delta ",
  "θ": "\\theta ",
  "λ": "\\lambda ",
  "μ": "\\mu ",
  "σ": "\\sigma ",
  "φ": "\\phi ",
  "ω": "\\omega ",
  "Δ": "\\Delta ",
  "Σ": "\\Sigma ",
  "Π": "\\Pi ",
  "Ω": "\\Omega ",
};

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function mapSymbols(s: string): string {
  let out = "";
  for (const ch of s) {
    out += SYMBOL_MAP[ch] ?? ch;
  }
  return out;
}

/**
 * Minimal SAX-ish walker. We don't need a full XML parser — OMath is
 * regular enough that string scans + indexOf give the right shape.
 * Each helper returns `{ text, end }` where `end` is the cursor
 * position just past the matching close tag.
 */

interface ParseFrame {
  text: string;
  end: number;
}

function findClose(xml: string, tag: string, openEnd: number): number {
  const close = `</${tag}>`;
  // Account for nested tags of the same name (e.g. nested <m:e>).
  let depth = 1;
  let i = openEnd;
  const openRe = new RegExp(`<${tag}(\\s[^>]*)?>`, "g");
  const closeStr = close;
  while (i < xml.length) {
    const nextClose = xml.indexOf(closeStr, i);
    if (nextClose < 0) return xml.length;
    openRe.lastIndex = i;
    const openMatch = openRe.exec(xml);
    if (openMatch && openMatch.index < nextClose) {
      depth++;
      i = openMatch.index + openMatch[0].length;
      continue;
    }
    depth--;
    if (depth === 0) return nextClose;
    i = nextClose + closeStr.length;
  }
  return xml.length;
}

/** Parse one OMath child element starting at `start` (which points to
 *  `<`). Recurses into nested elements. */
function parseElement(xml: string, start: number): ParseFrame {
  // Self-closing or open?
  const headerEnd = xml.indexOf(">", start);
  if (headerEnd < 0) return { text: "", end: xml.length };
  const header = xml.slice(start + 1, headerEnd);
  const selfClose = header.endsWith("/");
  // Strip namespace prefix (m:) and read tag name.
  const cleaned = selfClose ? header.slice(0, -1).trim() : header.trim();
  const tag = cleaned.split(/[\s/]/)[0]!;
  const localTag = tag.includes(":") ? tag.split(":")[1]! : tag;
  if (selfClose) {
    return { text: "", end: headerEnd + 1 };
  }
  const closeIdx = findClose(xml, tag, headerEnd + 1);
  const inner = xml.slice(headerEnd + 1, closeIdx);
  const innerText = walkInner(inner, localTag);
  return { text: innerText, end: closeIdx + tag.length + 3 };
}

/** Convert children of a known OMath element into LaTeX. */
function walkInner(inner: string, parentTag: string): string {
  switch (parentTag) {
    case "t":
      // Plain math text — preserve as-is, but map common Unicode → LaTeX.
      return mapSymbols(decodeXmlEntities(inner));
    case "r":
      // Run wraps <m:t> (and rPr / aln noise). Concatenate child texts.
      return concatChildren(inner);
    case "f": {
      // Fraction: <m:num>...</m:num><m:den>...</m:den>
      const num = pickChild(inner, "num");
      const den = pickChild(inner, "den");
      return `\\frac{${num}}{${den}}`;
    }
    case "sSup": {
      const base = pickChild(inner, "e");
      const sup = pickChild(inner, "sup");
      return `${base}^{${sup}}`;
    }
    case "sSub": {
      const base = pickChild(inner, "e");
      const sub = pickChild(inner, "sub");
      return `${base}_{${sub}}`;
    }
    case "sSubSup": {
      const base = pickChild(inner, "e");
      const sub = pickChild(inner, "sub");
      const sup = pickChild(inner, "sup");
      return `${base}_{${sub}}^{${sup}}`;
    }
    case "rad": {
      const e = pickChild(inner, "e");
      const deg = pickChild(inner, "deg");
      return deg ? `\\sqrt[${deg}]{${e}}` : `\\sqrt{${e}}`;
    }
    case "nary": {
      // Big operator: chr in <m:naryPr><m:chr m:val="∑"/></m:naryPr>
      const chrMatch = /<m:chr[^>]*\sm:val="([^"]+)"/.exec(inner) ||
        /<m:chr[^>]*\sval="([^"]+)"/.exec(inner);
      const op = chrMatch ? mapSymbols(chrMatch[1]) : "\\sum ";
      const sub = pickChild(inner, "sub");
      const sup = pickChild(inner, "sup");
      const e = pickChild(inner, "e");
      let head = op.trim();
      if (sub) head += `_{${sub}}`;
      if (sup) head += `^{${sup}}`;
      return `${head}{${e}}`;
    }
    case "d": {
      // Delimited group — defaults to parentheses.
      // <m:dPr><m:begChr m:val="("/><m:endChr m:val=")"/></m:dPr>
      const beg = /<m:begChr[^>]*\sm:val="([^"]+)"/.exec(inner) ||
        /<m:begChr[^>]*\sval="([^"]+)"/.exec(inner);
      const end = /<m:endChr[^>]*\sm:val="([^"]+)"/.exec(inner) ||
        /<m:endChr[^>]*\sval="([^"]+)"/.exec(inner);
      const lhs = beg ? beg[1] : "(";
      const rhs = end ? end[1] : ")";
      const e = pickChild(inner, "e");
      return `\\left${lhs}${e}\\right${rhs}`;
    }
    case "bar": {
      // <m:barPr><m:pos m:val="top|bot"/></m:barPr>
      const posMatch = /<m:pos[^>]*\sm:val="([^"]+)"/.exec(inner) ||
        /<m:pos[^>]*\sval="([^"]+)"/.exec(inner);
      const pos = posMatch ? posMatch[1] : "top";
      const e = pickChild(inner, "e");
      return pos === "bot" ? `\\underline{${e}}` : `\\overline{${e}}`;
    }
    case "limLow": {
      // base with subscript lim (e.g. lim_{x→0})
      const e = pickChild(inner, "e");
      const lim = pickChild(inner, "lim");
      return `${e}_{${lim}}`;
    }
    case "limUpp": {
      const e = pickChild(inner, "e");
      const lim = pickChild(inner, "lim");
      return `${e}^{${lim}}`;
    }
    case "func": {
      // Function application — e.g. sin x. fName + e.
      const fName = pickChild(inner, "fName");
      const e = pickChild(inner, "e");
      const fn = fName.trim();
      // Wrap known function names with backslash for LaTeX.
      const KNOWN = new Set([
        "sin", "cos", "tan", "cot", "sec", "csc", "log", "ln",
        "min", "max", "lim", "exp",
      ]);
      const ltx = KNOWN.has(fn) ? `\\${fn}` : fn;
      return `${ltx}\\left(${e}\\right)`;
    }
    case "e":
    case "num":
    case "den":
    case "sup":
    case "sub":
    case "deg":
    case "lim":
    case "fName":
    case "oMath":
    case "oMathPara":
      return concatChildren(inner);
    default:
      // Unknown / ignored container — try to recurse so nested text
      // doesn't disappear.
      return concatChildren(inner);
  }
}

function concatChildren(inner: string): string {
  let i = 0;
  let out = "";
  while (i < inner.length) {
    const lt = inner.indexOf("<", i);
    if (lt < 0) break;
    // Any literal text between tags (rare in math XML; usually it's
    // all wrapped in elements) — preserve.
    if (lt > i) {
      const between = inner.slice(i, lt).trim();
      if (between) out += mapSymbols(decodeXmlEntities(between));
    }
    // Skip closing tags + comments.
    if (inner[lt + 1] === "/" || inner[lt + 1] === "!" || inner[lt + 1] === "?") {
      const gt = inner.indexOf(">", lt);
      i = gt < 0 ? inner.length : gt + 1;
      continue;
    }
    const frame = parseElement(inner, lt);
    out += frame.text;
    i = frame.end;
  }
  return out;
}

/** Pull the first child element with the given local tag name and
 *  recursively convert it. Returns "" if no such child exists. */
function pickChild(parentInner: string, childLocalName: string): string {
  const re = new RegExp(`<m:${childLocalName}(\\s[^>]*)?>`, "g");
  const match = re.exec(parentInner);
  if (!match) return "";
  const headerEnd = match.index + match[0].length;
  const closeIdx = findClose(parentInner, `m:${childLocalName}`, headerEnd);
  const inner = parentInner.slice(headerEnd, closeIdx);
  return walkInner(inner, childLocalName);
}

/** Public: convert the inner XML of a `<m:oMath>` block to LaTeX. */
export function omathInnerToLatex(innerXml: string): string {
  // Strip <m:oMathPara> wrapper if present (display math).
  const stripped = innerXml.replace(
    /<\/?m:oMathPara(\s[^>]*)?>/g,
    "",
  );
  const latex = walkInner(stripped, "oMath").trim();
  // Tidy up: collapse double spaces, strip trailing whitespace.
  return latex.replace(/\s+/g, " ").trim();
}

/** Find every `<m:oMath>...</m:oMath>` in the document XML and replace
 *  it with a plain `<w:r><w:t>$LATEX$</w:t></w:r>` text run so the
 *  downstream extractor (mammoth) sees the equation as text instead of
 *  silently dropping it. Returns the rewritten XML. */
export function inlineOMathAsLatex(docXml: string): string {
  return docXml.replace(
    /<m:oMath\b[^>]*>([\s\S]*?)<\/m:oMath>/g,
    (_, inner) => {
      try {
        const latex = omathInnerToLatex(inner);
        if (!latex) return "";
        const escaped = latex
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        return `<w:r><w:t xml:space="preserve">$${escaped}$</w:t></w:r>`;
      } catch {
        return "";
      }
    },
  );
}
