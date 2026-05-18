import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * StatusBadge — the canonical entity-status indicator per design system §5.9.
 *
 * Shape: 999px pill, 10px uppercase text, bold, pastel bg + bold text + soft border.
 * Use it for everything: approval state, account status, exam status, etc.
 *
 * `live` variant adds a pulsing dot per §5.4 — reserve for active monitoring.
 */
export type StatusVariant =
  | "approved"
  | "pending"
  | "rejected"
  | "draft"
  | "active"
  | "suspended"
  | "invited"
  | "live"
  | "info"
  | "neutral";

const VARIANTS: Record<StatusVariant, { bg: string; border: string; text: string }> = {
  approved: { bg: "bg-[#DCFCE7]", border: "border-[#86EFAC]", text: "text-[#166534]" },
  active:   { bg: "bg-[#DCFCE7]", border: "border-[#86EFAC]", text: "text-[#166534]" },
  pending:  { bg: "bg-[#FEF3C7]", border: "border-[#FCD34D]", text: "text-[#92400E]" },
  invited:  { bg: "bg-[#FEF3C7]", border: "border-[#FCD34D]", text: "text-[#92400E]" },
  rejected: { bg: "bg-[#FEE2E2]", border: "border-[#FCA5A5]", text: "text-[#991B1B]" },
  suspended:{ bg: "bg-[#FEE2E2]", border: "border-[#FCA5A5]", text: "text-[#991B1B]" },
  draft:    { bg: "bg-[#F1F5F9]", border: "border-[#E2E8F0]", text: "text-[#475569]" },
  neutral:  { bg: "bg-[#F1F5F9]", border: "border-[#E2E8F0]", text: "text-[#475569]" },
  info:     { bg: "bg-[#DBEAFE]", border: "border-[#BFDBFE]", text: "text-[#1E40AF]" },
  live:     { bg: "bg-[#FEE2E2]", border: "border-[#FCA5A5]", text: "text-[#DC2626]" },
};

interface Props extends React.HTMLAttributes<HTMLSpanElement> {
  variant: StatusVariant;
  children: React.ReactNode;
}

export function StatusBadge({ variant, className, children, ...props }: Props) {
  const v = VARIANTS[variant];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em]",
        v.bg,
        v.border,
        v.text,
        className,
      )}
      {...props}
    >
      {variant === "live" ? (
        <span aria-hidden className="status-live-dot" />
      ) : null}
      {children}
    </span>
  );
}
