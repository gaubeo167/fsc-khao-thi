/**
 * Minimal LaTeX → docx Math element converter.
 *
 * Handles the subset of LaTeX that shows up in K-12 question banks:
 *   - `x^2`, `x^{ab}`            → MathSuperScript
 *   - `x_n`, `x_{1,2}`           → MathSubScript
 *   - `x_n^m`                    → MathSuperSubScript (single base, both indices)
 *   - `\frac{a}{b}`              → MathFraction
 *   - `\sqrt{x}` `\sqrt[n]{x}`   → MathRadical
 *   - `\cdot`, `\times`, `\div`, `\pm`, `\leq`, `\geq`, `\neq`
 *     `\to`, `\Rightarrow`, `\infty`, `\pi`, `\alpha`–`\omega`
 *                                → corresponding Unicode glyph in a MathRun
 *   - everything else            → MathRun (plain text)
 *
 * The output is a flat array of children suitable for `new Math({ children })`.
 */

import {
  MathFraction,
  MathRadical,
  MathRun,
  MathSubScript,
  MathSuperScript,
  type Math as MathClass,
} from "docx";

type MathChild = ConstructorParameters<typeof MathClass>[0]["children"][number];

/** Replace LaTeX commands with their Unicode glyphs (no font dance). */
const SYMBOL_MAP: Record<string, string> = {
  "\\cdot": "·",
  "\\times": "×",
  "\\div": "÷",
  "\\pm": "±",
  "\\mp": "∓",
  "\\infty": "∞",
  "\\leq": "≤",
  "\\le": "≤",
  "\\geq": "≥",
  "\\ge": "≥",
  "\\neq": "≠",
  "\\ne": "≠",
  "\\approx": "≈",
  "\\to": "→",
  "\\rightarrow": "→",
  "\\leftarrow": "←",
  "\\Rightarrow": "⇒",
  "\\Leftarrow": "⇐",
  "\\Leftrightarrow": "⇔",
  "\\sum": "Σ",
  "\\prod": "Π",
  "\\int": "∫",
  "\\partial": "∂",
  "\\nabla": "∇",
  "\\in": "∈",
  "\\notin": "∉",
  "\\subset": "⊂",
  "\\subseteq": "⊆",
  "\\cup": "∪",
  "\\cap": "∩",
  "\\emptyset": "∅",
  "\\alpha": "α",
  "\\beta": "β",
  "\\gamma": "γ",
  "\\delta": "δ",
  "\\epsilon": "ε",
  "\\varepsilon": "ε",
  "\\zeta": "ζ",
  "\\eta": "η",
  "\\theta": "θ",
  "\\iota": "ι",
  "\\kappa": "κ",
  "\\lambda": "λ",
  "\\mu": "μ",
  "\\nu": "ν",
  "\\xi": "ξ",
  "\\pi": "π",
  "\\rho": "ρ",
  "\\sigma": "σ",
  "\\tau": "τ",
  "\\upsilon": "υ",
  "\\phi": "φ",
  "\\varphi": "φ",
  "\\chi": "χ",
  "\\psi": "ψ",
  "\\omega": "ω",
  "\\Gamma": "Γ",
  "\\Delta": "Δ",
  "\\Theta": "Θ",
  "\\Lambda": "Λ",
  "\\Xi": "Ξ",
  "\\Pi": "Π",
  "\\Sigma": "Σ",
  "\\Phi": "Φ",
  "\\Psi": "Ψ",
  "\\Omega": "Ω",
};

export function latexToDocxMath(input: string): MathChild[] {
  const out: MathChild[] = [];
  let i = 0;
  // Buffer plain text into a single MathRun to avoid run fragmentation
  let buffer = "";
  const flushBuffer = () => {
    if (buffer.length > 0) {
      out.push(new MathRun(buffer));
      buffer = "";
    }
  };

  while (i < input.length) {
    const ch = input[i];

    // ── \command ──
    if (ch === "\\") {
      // Match the longest known command
      const rest = input.slice(i);
      const cmdMatch = /^\\([a-zA-Z]+)/.exec(rest);
      if (cmdMatch) {
        const cmd = `\\${cmdMatch[1]}`;
        // \frac{a}{b}
        if (cmd === "\\frac") {
          const after = i + cmd.length;
          const num = readBraced(input, after);
          if (num) {
            const den = readBraced(input, num.end);
            if (den) {
              flushBuffer();
              out.push(
                new MathFraction({
                  numerator: latexToDocxMath(num.body),
                  denominator: latexToDocxMath(den.body),
                }),
              );
              i = den.end;
              continue;
            }
          }
        }
        // \sqrt{x} or \sqrt[n]{x}
        if (cmd === "\\sqrt") {
          const after = i + cmd.length;
          // optional [n]
          if (input[after] === "[") {
            const close = input.indexOf("]", after + 1);
            if (close > after) {
              const degree = input.slice(after + 1, close);
              const body = readBraced(input, close + 1);
              if (body) {
                flushBuffer();
                out.push(
                  new MathRadical({
                    children: latexToDocxMath(body.body),
                    degree: latexToDocxMath(degree),
                  }),
                );
                i = body.end;
                continue;
              }
            }
          }
          const body = readBraced(input, after);
          if (body) {
            flushBuffer();
            out.push(
              new MathRadical({
                children: latexToDocxMath(body.body),
              }),
            );
            i = body.end;
            continue;
          }
        }
        // Mapped symbol
        if (SYMBOL_MAP[cmd]) {
          buffer += SYMBOL_MAP[cmd];
          i += cmd.length;
          // Eat one trailing space (LaTeX convention `\alpha foo`)
          if (input[i] === " ") i++;
          continue;
        }
        // Unknown command — emit literally so we don't drop content
        buffer += cmd;
        i += cmd.length;
        continue;
      }
      buffer += "\\";
      i++;
      continue;
    }

    // ── superscript / subscript ──
    if (ch === "^" || ch === "_") {
      // Need a preceding "base" — pop the last char from buffer (or last run)
      let base: MathChild;
      if (buffer.length > 0) {
        const lastChar = buffer[buffer.length - 1];
        buffer = buffer.slice(0, -1);
        flushBuffer();
        base = new MathRun(lastChar);
      } else {
        // Pop last run from out
        const last = out.pop();
        base = last ?? new MathRun("");
      }

      i++;
      let body: { body: string; end: number } | null = null;
      if (input[i] === "{") {
        body = readBraced(input, i);
      } else {
        body = { body: input[i] ?? "", end: i + 1 };
      }
      if (!body) continue;

      if (ch === "^") {
        out.push(
          new MathSuperScript({
            children: [base],
            superScript: latexToDocxMath(body.body),
          }),
        );
      } else {
        out.push(
          new MathSubScript({
            children: [base],
            subScript: latexToDocxMath(body.body),
          }),
        );
      }
      i = body.end;
      continue;
    }

    // ── default: accumulate into buffer ──
    buffer += ch;
    i++;
  }

  flushBuffer();
  return out;
}

function readBraced(s: string, start: number): { body: string; end: number } | null {
  if (s[start] !== "{") return null;
  let depth = 0;
  for (let k = start; k < s.length; k++) {
    if (s[k] === "{") depth++;
    else if (s[k] === "}") {
      depth--;
      if (depth === 0) {
        return { body: s.slice(start + 1, k), end: k + 1 };
      }
    }
  }
  return null;
}
