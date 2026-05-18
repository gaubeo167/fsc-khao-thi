"use client";

import { Check, FunctionSquare, Keyboard as KeyboardIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

import { Math as MathPreview } from "./math";

import "mathlive";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace React.JSX {
    interface IntrinsicElements {
      "math-field": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          ref?: React.Ref<HTMLElement>;
        },
        HTMLElement
      >;
    }
  }
}

interface MathFieldElement extends HTMLElement {
  value: string;
  setValue(value: string): void;
  executeCommand(command: string | string[]): void;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTex?: string;
  initialDisplay?: boolean;
  onInsert: (snippet: string) => void;
}

/* ───────────── Palette categories (MathType-style) ───────────── */

type Btn = { label: string; latex: string; title?: string };
type Category = { id: string; name: string; buttons: Btn[] };

const CATEGORIES: Category[] = [
  {
    id: "basic",
    name: "Cơ bản",
    buttons: [
      { label: "+", latex: "+" },
      { label: "−", latex: "-" },
      { label: "×", latex: "\\times" },
      { label: "÷", latex: "\\div" },
      { label: "·", latex: "\\cdot" },
      { label: "=", latex: "=" },
      { label: "≠", latex: "\\ne" },
      { label: "≈", latex: "\\approx" },
      { label: "≡", latex: "\\equiv" },
      { label: "≤", latex: "\\le" },
      { label: "≥", latex: "\\ge" },
      { label: "<", latex: "<" },
      { label: ">", latex: ">" },
      { label: "±", latex: "\\pm" },
      { label: "∓", latex: "\\mp" },
      { label: "%", latex: "\\%" },
      { label: "°", latex: "^{\\circ}" },
      { label: "‰", latex: "\\permil" },
      { label: "∞", latex: "\\infty" },
      { label: "…", latex: "\\ldots" },
    ],
  },
  {
    id: "fractions",
    name: "Phân số · Căn",
    buttons: [
      { label: "a/b", latex: "\\frac{#0}{#0}", title: "Phân số" },
      { label: "½", latex: "\\frac{1}{2}" },
      { label: "⅓", latex: "\\frac{1}{3}" },
      { label: "⅔", latex: "\\frac{2}{3}" },
      { label: "¼", latex: "\\frac{1}{4}" },
      { label: "¾", latex: "\\frac{3}{4}" },
      { label: "a/b/c", latex: "\\frac{\\frac{#0}{#0}}{#0}", title: "Phân số kép" },
      { label: "√", latex: "\\sqrt{#0}", title: "Căn bậc 2" },
      { label: "∛", latex: "\\sqrt[3]{#0}", title: "Căn bậc 3" },
      { label: "ⁿ√", latex: "\\sqrt[#0]{#0}", title: "Căn bậc n" },
    ],
  },
  {
    id: "exponents",
    name: "Lũy thừa · Chỉ số",
    buttons: [
      { label: "x²", latex: "#@^{2}" },
      { label: "x³", latex: "#@^{3}" },
      { label: "xⁿ", latex: "#@^{#0}", title: "Lũy thừa" },
      { label: "x_n", latex: "#@_{#0}", title: "Chỉ số dưới" },
      { label: "x_n^m", latex: "#@_{#0}^{#0}", title: "Cả dưới + trên" },
      { label: "eˣ", latex: "e^{#0}" },
      { label: "10ⁿ", latex: "10^{#0}" },
      { label: "logₐ", latex: "\\log_{#0}" },
      { label: "ln", latex: "\\ln" },
      { label: "log", latex: "\\log" },
      { label: "exp", latex: "\\exp" },
    ],
  },
  {
    id: "brackets",
    name: "Ngoặc",
    buttons: [
      { label: "(  )", latex: "\\left(#0\\right)" },
      { label: "[  ]", latex: "\\left[#0\\right]" },
      { label: "{  }", latex: "\\left\\{#0\\right\\}" },
      { label: "⟨  ⟩", latex: "\\left\\langle#0\\right\\rangle" },
      { label: "|x|", latex: "\\left|#0\\right|", title: "Trị tuyệt đối" },
      { label: "‖x‖", latex: "\\left\\|#0\\right\\|", title: "Chuẩn" },
      { label: "⌊x⌋", latex: "\\lfloor #0 \\rfloor", title: "Floor" },
      { label: "⌈x⌉", latex: "\\lceil #0 \\rceil", title: "Ceiling" },
      { label: "(a/b)", latex: "\\left(\\frac{#0}{#0}\\right)" },
    ],
  },
  {
    id: "sums",
    name: "Tổng · Tích · Tích phân",
    buttons: [
      { label: "Σ", latex: "\\sum_{#0}^{#0}" },
      { label: "Σ(n=1)", latex: "\\sum_{n=1}^{#0}" },
      { label: "Π", latex: "\\prod_{#0}^{#0}" },
      { label: "∫", latex: "\\int" },
      { label: "∫(a,b)", latex: "\\int_{#0}^{#0}" },
      { label: "∮", latex: "\\oint" },
      { label: "∬", latex: "\\iint" },
      { label: "∭", latex: "\\iiint" },
      { label: "lim", latex: "\\lim_{#0 \\to #0}" },
      { label: "lim x→0", latex: "\\lim_{x \\to 0}" },
      { label: "lim x→∞", latex: "\\lim_{x \\to \\infty}" },
      { label: "max", latex: "\\max_{#0}" },
      { label: "min", latex: "\\min_{#0}" },
    ],
  },
  {
    id: "calculus",
    name: "Đạo hàm",
    buttons: [
      { label: "dy/dx", latex: "\\frac{dy}{dx}" },
      { label: "d/dx", latex: "\\frac{d}{dx}" },
      { label: "∂/∂x", latex: "\\frac{\\partial}{\\partial x}" },
      { label: "∂²/∂x²", latex: "\\frac{\\partial^2}{\\partial x^2}" },
      { label: "f'(x)", latex: "f'(#0)" },
      { label: "f''(x)", latex: "f''(#0)" },
      { label: "f⁽ⁿ⁾", latex: "f^{(#0)}" },
      { label: "∇", latex: "\\nabla" },
      { label: "∂", latex: "\\partial" },
      { label: "Δ", latex: "\\Delta" },
    ],
  },
  {
    id: "functions",
    name: "Hàm số",
    buttons: [
      { label: "sin", latex: "\\sin" },
      { label: "cos", latex: "\\cos" },
      { label: "tan", latex: "\\tan" },
      { label: "cot", latex: "\\cot" },
      { label: "sec", latex: "\\sec" },
      { label: "csc", latex: "\\csc" },
      { label: "arcsin", latex: "\\arcsin" },
      { label: "arccos", latex: "\\arccos" },
      { label: "arctan", latex: "\\arctan" },
      { label: "sinh", latex: "\\sinh" },
      { label: "cosh", latex: "\\cosh" },
      { label: "tanh", latex: "\\tanh" },
      { label: "ln", latex: "\\ln" },
      { label: "log", latex: "\\log" },
      { label: "log₁₀", latex: "\\log_{10}" },
      { label: "exp", latex: "\\exp" },
      { label: "gcd", latex: "\\gcd" },
      { label: "deg", latex: "\\deg" },
    ],
  },
  {
    id: "greek",
    name: "Hy Lạp",
    buttons: [
      { label: "α", latex: "\\alpha" },
      { label: "β", latex: "\\beta" },
      { label: "γ", latex: "\\gamma" },
      { label: "δ", latex: "\\delta" },
      { label: "ε", latex: "\\varepsilon" },
      { label: "ζ", latex: "\\zeta" },
      { label: "η", latex: "\\eta" },
      { label: "θ", latex: "\\theta" },
      { label: "ι", latex: "\\iota" },
      { label: "κ", latex: "\\kappa" },
      { label: "λ", latex: "\\lambda" },
      { label: "μ", latex: "\\mu" },
      { label: "ν", latex: "\\nu" },
      { label: "ξ", latex: "\\xi" },
      { label: "π", latex: "\\pi" },
      { label: "ρ", latex: "\\rho" },
      { label: "σ", latex: "\\sigma" },
      { label: "τ", latex: "\\tau" },
      { label: "υ", latex: "\\upsilon" },
      { label: "φ", latex: "\\varphi" },
      { label: "χ", latex: "\\chi" },
      { label: "ψ", latex: "\\psi" },
      { label: "ω", latex: "\\omega" },
      { label: "Γ", latex: "\\Gamma" },
      { label: "Δ", latex: "\\Delta" },
      { label: "Θ", latex: "\\Theta" },
      { label: "Λ", latex: "\\Lambda" },
      { label: "Π", latex: "\\Pi" },
      { label: "Σ", latex: "\\Sigma" },
      { label: "Φ", latex: "\\Phi" },
      { label: "Ψ", latex: "\\Psi" },
      { label: "Ω", latex: "\\Omega" },
    ],
  },
  {
    id: "arrows",
    name: "Mũi tên · Quan hệ",
    buttons: [
      { label: "→", latex: "\\to" },
      { label: "←", latex: "\\leftarrow" },
      { label: "↔", latex: "\\leftrightarrow" },
      { label: "⇒", latex: "\\Rightarrow" },
      { label: "⇐", latex: "\\Leftarrow" },
      { label: "⇔", latex: "\\Leftrightarrow" },
      { label: "↑", latex: "\\uparrow" },
      { label: "↓", latex: "\\downarrow" },
      { label: "⟼", latex: "\\mapsto" },
      { label: "≡", latex: "\\equiv" },
      { label: "∝", latex: "\\propto" },
      { label: "≅", latex: "\\cong" },
      { label: "∼", latex: "\\sim" },
      { label: "≃", latex: "\\simeq" },
    ],
  },
  {
    id: "sets",
    name: "Tập hợp",
    buttons: [
      { label: "∈", latex: "\\in" },
      { label: "∉", latex: "\\notin" },
      { label: "∋", latex: "\\ni" },
      { label: "⊂", latex: "\\subset" },
      { label: "⊆", latex: "\\subseteq" },
      { label: "⊃", latex: "\\supset" },
      { label: "⊇", latex: "\\supseteq" },
      { label: "∪", latex: "\\cup" },
      { label: "∩", latex: "\\cap" },
      { label: "\\", latex: "\\setminus" },
      { label: "∅", latex: "\\emptyset" },
      { label: "ℕ", latex: "\\mathbb{N}" },
      { label: "ℤ", latex: "\\mathbb{Z}" },
      { label: "ℚ", latex: "\\mathbb{Q}" },
      { label: "ℝ", latex: "\\mathbb{R}" },
      { label: "ℂ", latex: "\\mathbb{C}" },
    ],
  },
  {
    id: "logic",
    name: "Logic",
    buttons: [
      { label: "∧", latex: "\\land" },
      { label: "∨", latex: "\\lor" },
      { label: "¬", latex: "\\neg" },
      { label: "⊕", latex: "\\oplus" },
      { label: "⊤", latex: "\\top" },
      { label: "⊥", latex: "\\bot" },
      { label: "∀", latex: "\\forall" },
      { label: "∃", latex: "\\exists" },
      { label: "∄", latex: "\\nexists" },
      { label: "⊢", latex: "\\vdash" },
      { label: "⊨", latex: "\\models" },
      { label: "∴", latex: "\\therefore" },
      { label: "∵", latex: "\\because" },
    ],
  },
  {
    id: "geometry",
    name: "Hình học",
    buttons: [
      { label: "∠", latex: "\\angle" },
      { label: "∡", latex: "\\measuredangle" },
      { label: "⊥", latex: "\\perp" },
      { label: "∥", latex: "\\parallel" },
      { label: "△", latex: "\\triangle" },
      { label: "□", latex: "\\square" },
      { label: "○", latex: "\\circ" },
      { label: "≅", latex: "\\cong" },
      { label: "∼", latex: "\\sim" },
      { label: "°", latex: "^{\\circ}" },
      { label: "AB", latex: "\\overline{AB}", title: "Đoạn thẳng" },
      { label: "⃗AB", latex: "\\overrightarrow{AB}", title: "Vector" },
      { label: "︵AB", latex: "\\overset{\\frown}{AB}", title: "Cung" },
    ],
  },
  {
    id: "matrix",
    name: "Ma trận · Hệ",
    buttons: [
      {
        label: "(  )",
        latex: "\\begin{pmatrix} #0 & #0 \\\\ #0 & #0 \\end{pmatrix}",
        title: "Ma trận 2×2",
      },
      {
        label: "[  ]",
        latex: "\\begin{bmatrix} #0 & #0 \\\\ #0 & #0 \\end{bmatrix}",
        title: "Ma trận vuông 2×2",
      },
      {
        label: "3×3",
        latex:
          "\\begin{pmatrix} #0 & #0 & #0 \\\\ #0 & #0 & #0 \\\\ #0 & #0 & #0 \\end{pmatrix}",
        title: "Ma trận 3×3",
      },
      {
        label: "|  |",
        latex:
          "\\begin{vmatrix} #0 & #0 \\\\ #0 & #0 \\end{vmatrix}",
        title: "Định thức 2×2",
      },
      {
        label: "{x= y=",
        latex:
          "\\begin{cases} #0 \\\\ #0 \\end{cases}",
        title: "Hệ 2 phương trình",
      },
      {
        label: "{3 dòng",
        latex:
          "\\begin{cases} #0 \\\\ #0 \\\\ #0 \\end{cases}",
        title: "Hệ 3 phương trình",
      },
      {
        label: "vec(↓)",
        latex: "\\begin{pmatrix} #0 \\\\ #0 \\\\ #0 \\end{pmatrix}",
        title: "Vector cột",
      },
      {
        label: "vec(→)",
        latex: "\\begin{pmatrix} #0 & #0 & #0 \\end{pmatrix}",
        title: "Vector hàng",
      },
    ],
  },
];

/* ───────────── Component ───────────── */

export function MathLiveDialog({
  open,
  onOpenChange,
  initialTex = "",
  initialDisplay = false,
  onInsert,
}: Props) {
  const mathFieldRef = useRef<MathFieldElement | null>(null);
  const [tex, setTex] = useState(initialTex);
  const [display, setDisplay] = useState(initialDisplay);
  const [showVirtual, setShowVirtual] = useState(false);
  const [activeCat, setActiveCat] = useState<string>("basic");

  useEffect(() => {
    if (!open) return;

    // Sync state immediately for preview / submit logic.
    setTex(initialTex);
    setDisplay(initialDisplay);

    // The math-field custom element may not exist yet when the dialog mounts
    // — retry until it does, then push the initial LaTeX into it and focus.
    let cancelled = false;
    function applyToField() {
      if (cancelled) return;
      const field = mathFieldRef.current;
      if (!field) {
        requestAnimationFrame(applyToField);
        return;
      }
      field.setValue(initialTex);
      // Slight delay so the value renders before we focus into it.
      setTimeout(() => {
        if (!cancelled) field.focus();
      }, 30);
    }
    applyToField();

    return () => {
      cancelled = true;
    };
  }, [open, initialTex, initialDisplay]);

  function handleInput(e: React.FormEvent<HTMLElement>) {
    setTex((e.target as MathFieldElement).value);
  }

  function insertSnippet(latex: string) {
    const field = mathFieldRef.current;
    if (field) {
      field.executeCommand(["insert", latex]);
      field.focus();
      setTex(field.value);
    }
  }

  function submit() {
    if (!tex.trim()) return;
    const snippet = display ? `$$${tex.trim()}$$` : `$${tex.trim()}$`;
    onInsert(snippet);
    onOpenChange(false);
  }

  const cat = CATEGORIES.find((c) => c.id === activeCat) ?? CATEGORIES[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl p-0 max-h-[92vh] overflow-y-auto"
        srTitle={initialTex ? "Chỉnh sửa công thức" : "Soạn công thức toán"}
      >
        <header className="flex items-start gap-3 border-b px-6 py-4 pr-12">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200">
            <FunctionSquare className="h-5 w-5" strokeWidth={1.85} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-section-title">
              {initialTex ? "Chỉnh sửa công thức" : "Soạn công thức toán"}
            </h2>
            <p className="text-meta mt-0.5">
              Trải nghiệm như MathType · gõ <span className="font-mono">1/2</span> →
              phân số · <span className="font-mono">x^2</span> → lũy thừa ·{" "}
              <span className="font-mono">sqrt</span> → căn ·{" "}
              <kbd className="rounded border bg-muted px-1 text-[10px]">Tab</kbd> chuyển
              giữa các ô
            </p>
          </div>
        </header>

        <div className="space-y-4 px-6 py-5">
          {/* Math input */}
          <div className="space-y-1.5">
            <Label className="text-[13px] font-medium text-foreground/80">
              Soạn công thức
            </Label>
            <div className="rounded-lg border-2 border-input bg-background px-3 py-3 transition-colors focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/15">
              <math-field
                ref={mathFieldRef as unknown as React.Ref<HTMLElement>}
                onInput={handleInput as unknown as React.FormEventHandler<HTMLElement>}
                style={{
                  fontSize: "20px",
                  minHeight: "44px",
                  width: "100%",
                  border: "none",
                  outline: "none",
                  background: "transparent",
                }}
                {...({
                  "virtual-keyboard-mode": showVirtual ? "manual" : "off",
                  "smart-mode": "true",
                  "smart-fence": "true",
                  "remove-extraneous-parentheses": "true",
                  "math-virtual-keyboard-policy": "manual",
                } as React.HTMLAttributes<HTMLElement>)}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setShowVirtual((s) => !s)}
              className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] font-medium text-foreground/80 hover:bg-accent"
            >
              <KeyboardIcon className="h-3.5 w-3.5" strokeWidth={1.85} />
              {showVirtual ? "Ẩn bàn phím ảo" : "Bàn phím ảo MathType"}
            </button>
            <div className="ml-auto flex items-center gap-3 text-[13px]">
              <label className="inline-flex cursor-pointer items-center gap-1.5">
                <input
                  type="radio"
                  checked={!display}
                  onChange={() => setDisplay(false)}
                  className="h-4 w-4 accent-[var(--color-primary)]"
                />
                Inline (trong dòng)
              </label>
              <label className="inline-flex cursor-pointer items-center gap-1.5">
                <input
                  type="radio"
                  checked={display}
                  onChange={() => setDisplay(true)}
                  className="h-4 w-4 accent-[var(--color-primary)]"
                />
                Block (riêng dòng)
              </label>
            </div>
          </div>

          {/* Palette */}
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1 border-b">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveCat(c.id)}
                  className={
                    c.id === activeCat
                      ? "border-b-2 border-primary px-3 py-1.5 text-[12px] font-semibold text-primary"
                      : "px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground"
                  }
                >
                  {c.name}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-8 lg:grid-cols-10">
              {cat.buttons.map((b) => (
                <button
                  key={`${b.label}-${b.latex}`}
                  type="button"
                  onClick={() => insertSnippet(b.latex)}
                  title={b.title ?? b.latex}
                  className="flex h-11 items-center justify-center rounded-md border bg-card px-2 text-[14px] transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-lg border bg-muted/30 px-4 py-3">
            <p className="text-eyebrow mb-1.5">Preview</p>
            <div className="flex min-h-[40px] items-center">
              {tex.trim() ? (
                <MathPreview tex={tex} displayMode={display} />
              ) : (
                <span className="text-meta italic">
                  Bắt đầu soạn để xem preview…
                </span>
              )}
            </div>
            {tex.trim() && (
              <details className="mt-2">
                <summary className="text-meta cursor-pointer select-none">
                  Xem nguồn LaTeX
                </summary>
                <p className="text-meta mt-1 font-mono break-all text-foreground/80">
                  {tex}
                </p>
              </details>
            )}
          </div>
        </div>

        <footer className="flex items-center justify-between border-t bg-[var(--color-surface-2)] px-6 py-3.5">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            onClick={submit}
            disabled={!tex.trim()}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          >
            <Check className="h-4 w-4" />
            {initialTex ? "Cập nhật" : "Chèn công thức"}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
