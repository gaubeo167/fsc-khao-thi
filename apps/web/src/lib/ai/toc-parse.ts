/**
 * Parsing + normalisation for the AI "table of contents" (mục lục) output.
 * Extracted from the route so it can be unit-tested in isolation.
 */

export interface TocNode {
  name: string;
  children?: TocNode[];
}

/**
 * Try to parse AI output as a TOC JSON. Tolerant of:
 *   - ```json fences / prose around the object,
 *   - a truncated response (maxTokens hit mid-tree) — we progressively
 *     balance the open brackets and trim the incomplete tail until a
 *     prefix parses, so everything before the cut still loads.
 * Returns a non-empty tree, or null if nothing usable could be recovered.
 */
export function parseTocJson(raw: string): TocNode[] | null {
  const startIdx = raw.indexOf("{");
  if (startIdx < 0) return null;
  const body = raw.slice(startIdx);

  // 1) Fast path: a well-formed object up to the last closing brace.
  const endIdx = body.lastIndexOf("}");
  if (endIdx > 0) {
    const nodes = tryTree(body.slice(0, endIdx + 1));
    if (nodes) return nodes;
  }

  // 2) Truncation repair: close the open brackets; if that still doesn't
  //    parse, chop the incomplete trailing token and retry a few times.
  let s = body;
  for (let i = 0; i < 40 && s.length > 2; i++) {
    const balanced = balanceBrackets(s);
    if (balanced) {
      const nodes = tryTree(balanced);
      if (nodes) return nodes;
    }
    s = trimTail(s);
  }
  return null;
}

function tryTree(candidate: string): TocNode[] | null {
  try {
    const data = JSON.parse(candidate);
    if (!data || typeof data !== "object" || !Array.isArray(data.tree)) return null;
    const nodes = normalizeNodes(data.tree, 0);
    return nodes.length > 0 ? nodes : null;
  } catch {
    return null;
  }
}

/**
 * Close an unterminated string and append the closing brackets needed to
 * balance every open `{`/`[`. Returns null when the tail is a property key
 * with no value (`… "name":`) — the caller trims further and retries.
 */
function balanceBrackets(s: string): string | null {
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") stack.push("}");
    else if (c === "[") stack.push("]");
    else if (c === "}" || c === "]") {
      if (stack.length === 0) return null; // more closers than openers
      stack.pop();
    }
  }
  let out = s;
  if (inStr) out += '"'; // close an unterminated string
  out = out.replace(/[\s,]+$/, ""); // drop trailing whitespace / comma
  if (/:\s*$/.test(out)) return null; // dangling `"key":` — needs a trim
  for (let i = stack.length - 1; i >= 0; i--) out += stack[i];
  return out;
}

/** Remove the last (incomplete) token so the next balance attempt lands on
 *  a clean boundary. Handles a trailing string literal, a partial
 *  number/keyword, and stray `:`/`,`. */
function trimTail(s: string): string {
  let t = s.replace(/\s+$/, "");
  if (t.endsWith('"')) {
    // Drop the whole trailing string literal (find its opening quote).
    let i = t.length - 2;
    while (i > 0 && !(t[i] === '"' && t[i - 1] !== "\\")) i--;
    t = t.slice(0, i);
  } else {
    // Drop a trailing run of non-structural characters (partial token).
    t = t.replace(/[^{}[\],"]+$/, "");
  }
  return t.replace(/[\s,:]+$/, "");
}

export function normalizeNodes(arr: unknown, depth: number): TocNode[] {
  if (!Array.isArray(arr)) return [];
  if (depth >= 4) return [];
  const out: TocNode[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const node = item as { name?: unknown; children?: unknown };
    if (typeof node.name !== "string") continue;
    const name = node.name.trim().slice(0, 200);
    if (!name) continue;
    const children = normalizeNodes(node.children, depth + 1);
    out.push(children.length > 0 ? { name, children } : { name });
  }
  return out;
}
