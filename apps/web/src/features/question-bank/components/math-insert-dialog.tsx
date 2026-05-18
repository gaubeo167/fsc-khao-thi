"use client";

import { Check, FunctionSquare, ImageIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

import { Math } from "./math";

interface Template {
  label: string;
  tex: string;
}

const TEMPLATES: Template[] = [
  { label: "x²", tex: "x^2" },
  { label: "x² + 2x + 1", tex: "x^2 + 2x + 1" },
  { label: "a/b", tex: "\\frac{a}{b}" },
  { label: "√x", tex: "\\sqrt{x}" },
  { label: "√(a²+b²)", tex: "\\sqrt{a^2 + b^2}" },
  { label: "Tổng Σ", tex: "\\sum_{i=1}^{n} i" },
  { label: "Tích phân", tex: "\\int_{0}^{1} x^2 \\, dx" },
  { label: "Giới hạn", tex: "\\lim_{x \\to 0} \\frac{\\sin x}{x}" },
  { label: "Ma trận 2×2", tex: "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}" },
  { label: "Hệ phương trình", tex: "\\begin{cases} x + y = 5 \\\\ x - y = 1 \\end{cases}" },
  { label: "Định lý Pythagoras", tex: "a^2 + b^2 = c^2" },
  { label: "Phân số kép", tex: "\\frac{1 + \\frac{x}{y}}{1 - \\frac{x}{y}}" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When editing an existing formula in the source. */
  initialTex?: string;
  initialDisplay?: boolean;
  onInsert: (snippet: string) => void;
}

export function MathInsertDialog({
  open,
  onOpenChange,
  initialTex = "",
  initialDisplay = false,
  onInsert,
}: Props) {
  const [tex, setTex] = useState(initialTex);
  const [display, setDisplay] = useState(initialDisplay);

  useEffect(() => {
    if (open) {
      setTex(initialTex);
      setDisplay(initialDisplay);
    }
  }, [open, initialTex, initialDisplay]);

  function insert() {
    if (!tex.trim()) return;
    const snippet = display ? `$$${tex.trim()}$$` : `$${tex.trim()}$`;
    onInsert(snippet);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl p-0 max-h-[90vh] overflow-y-auto"
        srTitle={initialTex ? "Chỉnh sửa công thức toán" : "Chèn công thức toán"}
      >
        <header className="flex items-start gap-3 border-b px-6 py-4 pr-12">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200">
            <FunctionSquare className="h-5 w-5" strokeWidth={1.85} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-section-title">
              {initialTex ? "Chỉnh sửa công thức toán" : "Chèn công thức toán"}
            </h2>
            <p className="text-meta mt-0.5">
              Nhập theo cú pháp LaTeX — xem preview live bên dưới
            </p>
          </div>
        </header>

        <div className="space-y-5 px-6 py-5">
          <div className="space-y-1.5">
            <Label className="text-[13px] font-medium text-foreground/80">Mã LaTeX</Label>
            <textarea
              autoFocus
              value={tex}
              onChange={(e) => setTex(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  insert();
                }
              }}
              rows={3}
              spellCheck={false}
              className="block w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-[13px] tracking-tight text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              placeholder="x^2 + 2x + 1"
            />
          </div>

          <div className="flex flex-wrap items-center gap-4 text-[13px]">
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                checked={!display}
                onChange={() => setDisplay(false)}
                className="h-4 w-4 accent-[var(--color-primary)]"
              />
              Inline (trong dòng văn bản)
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                checked={display}
                onChange={() => setDisplay(true)}
                className="h-4 w-4 accent-[var(--color-primary)]"
              />
              Hiển thị riêng dòng (block)
            </label>
          </div>

          <div>
            <p className="text-[13px] font-medium text-foreground/80 mb-1.5 inline-flex items-center gap-1.5">
              <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.85} />
              Preview
            </p>
            <div className="flex min-h-[80px] items-center justify-center rounded-md border bg-muted/30 px-4 py-5">
              {tex.trim() ? (
                <Math tex={tex} displayMode={display} />
              ) : (
                <span className="text-meta">Nhập công thức để xem preview…</span>
              )}
            </div>
          </div>

          <div>
            <p className="text-[13px] font-medium text-foreground/80 mb-2">
              Mẫu nhanh — click để chèn
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {TEMPLATES.map((t) => (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => setTex(t.tex)}
                  className="group flex flex-col items-center gap-1.5 rounded-lg border bg-card px-3 py-3 transition-colors hover:border-primary/40 hover:bg-primary/4"
                >
                  <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground">
                    {t.label}
                  </span>
                  <Math tex={t.tex} className="text-[14px]" />
                </button>
              ))}
            </div>
          </div>

          <Link
            href="https://katex.org/docs/supported.html"
            target="_blank"
            rel="noreferrer"
            className="text-meta inline-flex items-center gap-1 underline-offset-4 hover:underline"
          >
            📘 Cheat sheet LaTeX
          </Link>
        </div>

        <footer className="flex items-center justify-between border-t bg-muted/20 px-6 py-3.5">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button onClick={insert} disabled={!tex.trim()}>
            <Check className="h-4 w-4" />
            {initialTex ? "Cập nhật công thức" : "Chèn công thức"}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
