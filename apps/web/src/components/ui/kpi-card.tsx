import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type KpiTone = "blue" | "orange" | "green" | "violet" | "red";

interface KpiCardProps {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  tone?: KpiTone;
  delta?: { value: string; positive?: boolean };
  hint?: string;
}

const TONE: Record<KpiTone, { bg: string; fg: string }> = {
  blue:   { bg: "bg-[var(--color-tone-blue-soft)]",   fg: "text-[var(--color-tone-blue)]" },
  orange: { bg: "bg-[var(--color-tone-orange-soft)]", fg: "text-[var(--color-tone-orange)]" },
  green:  { bg: "bg-[var(--color-tone-green-soft)]",  fg: "text-[var(--color-tone-green)]" },
  violet: { bg: "bg-[var(--color-tone-violet-soft)]", fg: "text-[var(--color-tone-violet)]" },
  red:    { bg: "bg-[var(--color-tone-red-soft)]",    fg: "text-[var(--color-tone-red)]" },
};

/**
 * Stat tile per design system §5.3:
 *   [pastel icon 44×44] [big tabular number] [UPPERCASE muted label]
 * Bordered card, no shadow, subtle hover lift.
 */
export function KpiCard({
  label,
  value,
  icon: Icon,
  tone = "blue",
  delta,
  hint,
}: KpiCardProps) {
  const t = TONE[tone];

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-[14px] transition-transform hover:-translate-y-px">
      <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-lg", t.bg)}>
        <Icon className={cn("h-5 w-5", t.fg)} strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-kpi truncate">{value}</p>
        <p className="text-micro mt-1 truncate">{label}</p>
        {(delta || hint) && (
          <p className="mt-1 flex items-center gap-1.5 text-[11px]">
            {delta ? (
              <span
                className={cn(
                  "font-semibold tabular-nums",
                  delta.positive
                    ? "text-[var(--color-success-dark)]"
                    : "text-[var(--color-destructive-dark)]",
                )}
              >
                {delta.positive ? "↑" : "↓"} {delta.value}
              </span>
            ) : null}
            {hint ? <span className="text-muted-foreground">{hint}</span> : null}
          </p>
        )}
      </div>
    </div>
  );
}
