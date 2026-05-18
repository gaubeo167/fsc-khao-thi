/**
 * Clipboard → LaTeX converter.
 *
 * Handles math formulas pasted from external sources (Word, Google Docs,
 * Wikipedia, LaTeX editors). Strategy:
 *
 * 1. If clipboard HTML contains `<math>` MathML — convert each to `$...$`.
 * 2. If clipboard HTML contains Word's `m:oMath` OMML — best-effort convert.
 * 3. Otherwise fall through to plain text, which may already have `$...$`
 *    delimiters from a LaTeX source (e.g., Overleaf, Wikipedia raw markup).
 *
 * The result is a single source string with `$...$` and `$$...$$` markers
 * that the WYSIWYG editor will turn into math chips on insertion.
 */

/* ─────────────────────────── MathML → LaTeX ─────────────────────────── */

const SYMBOL_MAP: Record<string, string> = {
  "·": "\\cdot ",
  "×": "\\times ",
  "÷": "\\div ",
  "±": "\\pm ",
  "∓": "\\mp ",
  "∞": "\\infty ",
  "≤": "\\le ",
  "≥": "\\ge ",
  "≠": "\\ne ",
  "≈": "\\approx ",
  "≡": "\\equiv ",
  "→": "\\to ",
  "←": "\\leftarrow ",
  "↔": "\\leftrightarrow ",
  "⇒": "\\Rightarrow ",
  "⇐": "\\Leftarrow ",
  "⇔": "\\Leftrightarrow ",
  "∫": "\\int ",
  "∑": "\\sum ",
  "∏": "\\prod ",
  "√": "\\sqrt",
  "∂": "\\partial ",
  "∆": "\\Delta ",
  "∇": "\\nabla ",
  "∈": "\\in ",
  "∉": "\\notin ",
  "∋": "\\ni ",
  "⊂": "\\subset ",
  "⊆": "\\subseteq ",
  "⊃": "\\supset ",
  "⊇": "\\supseteq ",
  "∪": "\\cup ",
  "∩": "\\cap ",
  "∅": "\\emptyset ",
  "∀": "\\forall ",
  "∃": "\\exists ",
  "¬": "\\neg ",
  "∧": "\\land ",
  "∨": "\\lor ",
  α: "\\alpha ",
  β: "\\beta ",
  γ: "\\gamma ",
  δ: "\\delta ",
  ε: "\\varepsilon ",
  ζ: "\\zeta ",
  η: "\\eta ",
  θ: "\\theta ",
  ι: "\\iota ",
  κ: "\\kappa ",
  λ: "\\lambda ",
  μ: "\\mu ",
  ν: "\\nu ",
  ξ: "\\xi ",
  π: "\\pi ",
  ρ: "\\rho ",
  σ: "\\sigma ",
  τ: "\\tau ",
  υ: "\\upsilon ",
  φ: "\\varphi ",
  χ: "\\chi ",
  ψ: "\\psi ",
  ω: "\\omega ",
  Α: "A",
  Β: "B",
  Γ: "\\Gamma ",
  Δ: "\\Delta ",
  Θ: "\\Theta ",
  Λ: "\\Lambda ",
  Ξ: "\\Xi ",
  Π: "\\Pi ",
  Σ: "\\Sigma ",
  Φ: "\\Phi ",
  Ψ: "\\Psi ",
  Ω: "\\Omega ",
};

const SUP_MAP: Record<string, string> = {
  "⁰": "0",
  "¹": "1",
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9",
  "⁺": "+",
  "⁻": "-",
  "⁼": "=",
  "⁽": "(",
  "⁾": ")",
  ⁿ: "n",
};

const SUB_MAP: Record<string, string> = {
  "₀": "0",
  "₁": "1",
  "₂": "2",
  "₃": "3",
  "₄": "4",
  "₅": "5",
  "₆": "6",
  "₇": "7",
  "₈": "8",
  "₉": "9",
  "₊": "+",
  "₋": "-",
  "₌": "=",
  "₍": "(",
  "₎": ")",
};

function mapSymbols(s: string): string {
  let out = "";
  for (const ch of s) out += SYMBOL_MAP[ch] ?? ch;
  return out;
}

function localName(el: Element): string {
  // Strip namespace prefix (eg "mml:mfrac" → "mfrac", "m:f" → "f")
  return el.tagName.toLowerCase().replace(/^[a-z]+:/, "");
}

function elementChildren(el: Element): Element[] {
  return Array.from(el.children) as Element[];
}

/** Convert a MathML element (or Word OMath element) to LaTeX source. */
function mathmlToLatex(el: Element): string {
  const tag = localName(el);

  // ─── Standard MathML ─────────────────────────────────────────
  switch (tag) {
    case "math":
    case "mrow":
    case "mstyle":
    case "semantics":
    case "mpadded":
    case "merror":
      return childrenToLatex(el);
    case "annotation":
    case "annotation-xml":
      return ""; // skip — these carry source code, not display data
    case "mi":
    case "mn":
    case "mtext":
    case "ms":
      return mapSymbols(el.textContent ?? "");
    case "mo": {
      const text = el.textContent?.trim() ?? "";
      // Some operators get special LaTeX
      if (text === "(") return "(";
      if (text === ")") return ")";
      if (text === "[") return "[";
      if (text === "]") return "]";
      if (text === "{") return "\\{";
      if (text === "}") return "\\}";
      return mapSymbols(text);
    }
    case "mspace":
      return " ";
    case "mfrac": {
      const kids = elementChildren(el);
      return `\\frac{${kids[0] ? mathmlToLatex(kids[0]) : ""}}{${kids[1] ? mathmlToLatex(kids[1]) : ""}}`;
    }
    case "msup": {
      const kids = elementChildren(el);
      return `${wrapIfMulti(kids[0])}^{${kids[1] ? mathmlToLatex(kids[1]) : ""}}`;
    }
    case "msub": {
      const kids = elementChildren(el);
      return `${wrapIfMulti(kids[0])}_{${kids[1] ? mathmlToLatex(kids[1]) : ""}}`;
    }
    case "msubsup": {
      const kids = elementChildren(el);
      return `${wrapIfMulti(kids[0])}_{${kids[1] ? mathmlToLatex(kids[1]) : ""}}^{${kids[2] ? mathmlToLatex(kids[2]) : ""}}`;
    }
    case "munder": {
      const kids = elementChildren(el);
      return `${kids[0] ? mathmlToLatex(kids[0]) : ""}_{${kids[1] ? mathmlToLatex(kids[1]) : ""}}`;
    }
    case "mover": {
      const kids = elementChildren(el);
      const over = kids[1] ? mathmlToLatex(kids[1]) : "";
      // Common: \overline, \overrightarrow, \hat
      if (over === "‾" || over === "¯") return `\\overline{${kids[0] ? mathmlToLatex(kids[0]) : ""}}`;
      if (over === "→" || over === "\\to") return `\\overrightarrow{${kids[0] ? mathmlToLatex(kids[0]) : ""}}`;
      return `${kids[0] ? mathmlToLatex(kids[0]) : ""}^{${over}}`;
    }
    case "munderover": {
      const kids = elementChildren(el);
      return `${kids[0] ? mathmlToLatex(kids[0]) : ""}_{${kids[1] ? mathmlToLatex(kids[1]) : ""}}^{${kids[2] ? mathmlToLatex(kids[2]) : ""}}`;
    }
    case "msqrt":
      return `\\sqrt{${childrenToLatex(el)}}`;
    case "mroot": {
      const kids = elementChildren(el);
      return `\\sqrt[${kids[1] ? mathmlToLatex(kids[1]) : ""}]{${kids[0] ? mathmlToLatex(kids[0]) : ""}}`;
    }
    case "mfenced": {
      const open = el.getAttribute("open") ?? "(";
      const close = el.getAttribute("close") ?? ")";
      const sep = el.getAttribute("separators") ?? ",";
      const parts = elementChildren(el).map(mathmlToLatex);
      return open + parts.join(sep) + close;
    }
    case "mtable": {
      const rows = elementChildren(el)
        .map((row) => elementChildren(row).map(mathmlToLatex).join(" & "))
        .join(" \\\\ ");
      return `\\begin{pmatrix} ${rows} \\end{pmatrix}`;
    }
    case "mtr":
    case "mtd":
      return childrenToLatex(el);
  }

  // ─── Word OMML (m:* namespace) ───────────────────────────────
  switch (tag) {
    case "omath":
    case "omathpara":
    case "r": // run — wraps text
    case "rpr":
    case "ctrlpr":
      return childrenToLatex(el);
    case "t": // text inside run
      return mapSymbols(el.textContent ?? "");
    case "f": {
      // fraction: <m:f><m:fPr/><m:num>…</m:num><m:den>…</m:den></m:f>
      const num = findChildByLocalName(el, "num");
      const den = findChildByLocalName(el, "den");
      return `\\frac{${num ? childrenToLatex(num) : ""}}{${den ? childrenToLatex(den) : ""}}`;
    }
    case "sup": {
      // superscript: <m:sSup><m:e>base</m:e><m:sup>exp</m:sup></m:sSup>
      return childrenToLatex(el);
    }
    case "ssup": {
      const base = findChildByLocalName(el, "e");
      const sup = findChildByLocalName(el, "sup");
      return `${base ? wrapIfMultiText(childrenToLatex(base)) : ""}^{${sup ? childrenToLatex(sup) : ""}}`;
    }
    case "ssub": {
      const base = findChildByLocalName(el, "e");
      const sub = findChildByLocalName(el, "sub");
      return `${base ? wrapIfMultiText(childrenToLatex(base)) : ""}_{${sub ? childrenToLatex(sub) : ""}}`;
    }
    case "ssubsup": {
      const base = findChildByLocalName(el, "e");
      const sub = findChildByLocalName(el, "sub");
      const sup = findChildByLocalName(el, "sup");
      return `${base ? wrapIfMultiText(childrenToLatex(base)) : ""}_{${sub ? childrenToLatex(sub) : ""}}^{${sup ? childrenToLatex(sup) : ""}}`;
    }
    case "rad": {
      // radical: <m:rad><m:radPr/><m:deg>n</m:deg><m:e>base</m:e></m:rad>
      const deg = findChildByLocalName(el, "deg");
      const base = findChildByLocalName(el, "e");
      const degText = deg ? childrenToLatex(deg).trim() : "";
      const baseText = base ? childrenToLatex(base) : "";
      return degText
        ? `\\sqrt[${degText}]{${baseText}}`
        : `\\sqrt{${baseText}}`;
    }
    case "d": {
      // delimiter (parens): <m:d><m:dPr/><m:e>content</m:e></m:d>
      const e = findChildByLocalName(el, "e");
      return `(${e ? childrenToLatex(e) : ""})`;
    }
    case "e":
    case "num":
    case "den":
    case "sub":
    case "deg":
      return childrenToLatex(el);
    case "nary": {
      // ∑ ∫ ∏ etc.
      const naryPr = findChildByLocalName(el, "narypr");
      const chr = naryPr ? findChildByLocalName(naryPr, "chr") : null;
      const op = chr?.getAttribute("val") ?? "∑";
      const sub = findChildByLocalName(el, "sub");
      const sup = findChildByLocalName(el, "sup");
      const body = findChildByLocalName(el, "e");
      const opLatex = mapSymbols(op).trim();
      return `${opLatex}_{${sub ? childrenToLatex(sub) : ""}}^{${sup ? childrenToLatex(sup) : ""}} ${body ? childrenToLatex(body) : ""}`;
    }
  }

  // Unknown — drop tag, keep children
  return childrenToLatex(el);
}

function childrenToLatex(el: Element): string {
  return elementChildren(el).map(mathmlToLatex).join("");
}

function findChildByLocalName(el: Element, name: string): Element | null {
  for (const child of elementChildren(el)) {
    if (localName(child) === name) return child;
  }
  return null;
}

/** Wrap a base in braces when it would produce multi-token output. */
function wrapIfMulti(el: Element | undefined): string {
  if (!el) return "";
  const tex = mathmlToLatex(el);
  return wrapIfMultiText(tex);
}

function wrapIfMultiText(tex: string): string {
  if (tex.length <= 1) return tex;
  if (/^\\[a-zA-Z]+$/.test(tex.trim())) return tex; // single command
  return `{${tex}}`;
}

/* ─────────────────────── HTML processing entry ─────────────────────── */

export interface ClipboardResult {
  /** Final source string with `$...$` markers, ready for editor insertion. */
  text: string;
  /** How many math fragments were converted. */
  mathCount: number;
}

/**
 * Process clipboard data. Tries HTML first (for MathML / OMML), falls back
 * to plain text. Returns a clean source string that the WYSIWYG editor can
 * insert via its standard parse path.
 */
export function processClipboard(
  html: string,
  text: string,
): ClipboardResult {
  if (html && (html.includes("<math") || html.includes("oMath"))) {
    return processHtml(html);
  }
  return { text: cleanupText(text), mathCount: countMathDelimiters(text) };
}

function processHtml(html: string): ClipboardResult {
  if (typeof DOMParser === "undefined") {
    return { text: cleanupText(stripTags(html)), mathCount: 0 };
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  let mathCount = 0;

  // Replace each math root element (MathML <math> or Word OMath) with
  // `$...$` text. Iterate all elements and filter by local name so the
  // various namespace prefixes Word uses (`m:`, `mml:`, etc.) all match.
  const allElements = Array.from(doc.getElementsByTagName("*"));
  const mathRoots = allElements.filter((el) => {
    const name = localName(el);
    return name === "math" || name === "omath" || name === "omathpara";
  });

  for (const el of mathRoots) {
    // Skip if already replaced by an ancestor walk
    if (!el.isConnected) continue;
    const tex = mathmlToLatex(el).trim();
    if (!tex) {
      el.remove();
      continue;
    }
    const name = localName(el);
    const isDisplay =
      el.getAttribute("display") === "block" || name === "omathpara";
    const replacement = doc.createTextNode(
      isDisplay ? ` $$${tex}$$ ` : ` $${tex}$ `,
    );
    el.replaceWith(replacement);
    mathCount++;
  }

  // Convert <br> / block elements to line breaks; flatten everything else
  for (const br of Array.from(doc.querySelectorAll("br"))) {
    br.replaceWith(doc.createTextNode("\n"));
  }
  for (const tag of ["p", "div", "li"]) {
    for (const el of Array.from(doc.querySelectorAll(tag))) {
      el.append(doc.createTextNode("\n"));
    }
  }

  let text = doc.body.textContent ?? "";
  text = cleanupText(text);

  return { text, mathCount };
}

function cleanupText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ ​]/g, " ") // nbsp + zero-width space
    .replace(/[\t ]+/g, " ")
    .replace(/\n[\t ]+/g, "\n")
    .replace(/[\t ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    // Unicode superscripts: collapse runs into ^{...}
    .replace(/([⁰-⁹⁺⁻⁼⁽⁾ⁿ]+)/g, (m) => {
      const mapped = Array.from(m).map((c) => SUP_MAP[c] ?? c).join("");
      return mapped.length === 1 ? `^${mapped}` : `^{${mapped}}`;
    })
    .replace(/([₀-₉₊₋₌₍₎]+)/g, (m) => {
      const mapped = Array.from(m).map((c) => SUB_MAP[c] ?? c).join("");
      return mapped.length === 1 ? `_${mapped}` : `_{${mapped}}`;
    })
    .trim();
}

function countMathDelimiters(text: string): number {
  const inline = (text.match(/\$[^\n$]+\$/g) ?? []).length;
  const block = (text.match(/\$\$[\s\S]+?\$\$/g) ?? []).length;
  return inline + block;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ");
}
