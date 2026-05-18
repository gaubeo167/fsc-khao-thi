"use client";

import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface Props {
  icon: LucideIcon;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Accent tone — drives the icon chip color. */
  tone?: "blue" | "emerald" | "violet" | "orange";
  required?: boolean;
  /** Optional content rendered at the right of the header (button, hint…). */
  headerEnd?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

const TONES = {
  blue: "bg-blue-50 text-blue-600 ring-blue-200",
  emerald: "bg-emerald-50 text-emerald-600 ring-emerald-200",
  violet: "bg-violet-50 text-violet-600 ring-violet-200",
  orange: "bg-orange-50 text-orange-600 ring-orange-200",
} as const;

/**
 * Section card with an icon header and bordered body. Use for grouping
 * form fields (e.g. "Đề bài câu hỏi", "Các đáp án") so the dialog reads
 * as distinct blocks rather than one continuous form.
 */
export function SectionCard({
  icon: Icon,
  title,
  subtitle,
  tone = "blue",
  required,
  headerEnd,
  children,
  className,
}: Props) {
  return (
    <section className={cn("rounded-xl border bg-card", className)}>
      <header className="flex items-center gap-2.5 border-b bg-muted/30 px-4 py-2.5">
        <span
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md ring-1",
            TONES[tone],
          )}
        >
          <Icon className="h-4 w-4" strokeWidth={1.85} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-semibold tracking-tight text-foreground">
            {title}
            {required && <span className="ml-1 text-destructive">*</span>}
          </h3>
          {subtitle && <p className="text-meta">{subtitle}</p>}
        </div>
        {headerEnd}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}
