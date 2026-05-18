"use client";

import katex from "katex";
import { useMemo } from "react";

import { cn } from "@/lib/utils";

interface MathProps {
  tex: string;
  displayMode?: boolean;
  className?: string;
  /** Optional click handler — used to make rendered formulas editable. */
  onClick?: (e: React.MouseEvent<HTMLSpanElement>) => void;
}

/**
 * KaTeX-rendered math fragment. Errors are swallowed and the raw LaTeX is
 * shown in a destructive tint so authors can spot syntax issues at a glance.
 */
export function Math({ tex, displayMode = false, className, onClick }: MathProps) {
  const result = useMemo(() => {
    try {
      const html = katex.renderToString(tex, {
        displayMode,
        throwOnError: false,
        strict: "ignore",
        output: "html",
        trust: false,
      });
      return { html, error: false };
    } catch {
      return { html: tex, error: true };
    }
  }, [tex, displayMode]);

  if (displayMode) {
    return (
      <span
        className={cn("block my-1.5 cursor-text", onClick && "rounded hover:bg-primary/10", className)}
        onClick={onClick}
        dangerouslySetInnerHTML={{ __html: result.html }}
      />
    );
  }

  return (
    <span
      className={cn(
        "inline-block align-middle",
        onClick && "cursor-pointer rounded px-0.5 hover:bg-primary/10 hover:outline hover:outline-1 hover:outline-primary/30",
        result.error && "text-destructive font-mono text-[12px]",
        className,
      )}
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: result.html }}
    />
  );
}
