import { ArrowRight, Check } from "lucide-react";

import { cn } from "@/lib/utils";

interface Step {
  label: string;
}

interface Props {
  current: number; // 1-based
  steps: Step[];
  /** Optional: clicking a step jumps back to it. */
  onJump?: (step: number) => void;
}

/**
 * Wizard-style progress indicator. Completed steps show a check, the active
 * step is ringed, future steps are muted. Steps can be clickable to walk
 * back via `onJump`.
 */
export function StepIndicator({ current, steps, onJump }: Props) {
  return (
    <ol className="flex flex-wrap items-center gap-2">
      {steps.map((s, i) => {
        const idx = i + 1;
        const isDone = idx < current;
        const isActive = idx === current;
        const clickable = onJump && idx < current;
        return (
          <li key={s.label} className="flex items-center gap-2">
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onJump?.(idx)}
              className={cn(
                "inline-flex items-center gap-2 rounded-md py-1 pl-1 pr-2 transition-colors",
                clickable && "cursor-pointer hover:bg-accent",
                !clickable && "cursor-default",
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold tabular-nums",
                  isDone && "border-primary bg-primary text-primary-foreground",
                  isActive && "border-primary bg-primary/10 text-primary",
                  !isDone && !isActive && "border-border text-muted-foreground",
                )}
              >
                {isDone ? <Check className="h-3 w-3" strokeWidth={3} /> : idx}
              </span>
              <span
                className={cn(
                  "text-[13px] font-medium",
                  isDone && "text-foreground/85",
                  isActive && "text-foreground",
                  !isDone && !isActive && "text-muted-foreground",
                )}
              >
                {s.label}
              </span>
            </button>
            {i < steps.length - 1 && (
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/60" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
