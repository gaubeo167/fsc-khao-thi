"use client";

import { Clock } from "lucide-react";
import { useEffect, useState } from "react";

import { formatRemaining } from "@/lib/format";
import { cn } from "@/lib/utils";

interface TimerProps {
  endsAt: number;
  onExpire?: () => void;
}

export function Timer({ endsAt, onExpire }: TimerProps) {
  const [remaining, setRemaining] = useState(() => Math.max(0, endsAt - Date.now()));

  useEffect(() => {
    const interval = setInterval(() => {
      const next = Math.max(0, endsAt - Date.now());
      setRemaining(next);
      if (next === 0) {
        clearInterval(interval);
        onExpire?.();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [endsAt, onExpire]);

  const warning = remaining > 0 && remaining < 5 * 60_000;
  const critical = remaining > 0 && remaining < 60_000;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium tabular-nums",
        warning && "border-[var(--color-warning)]/50 text-[var(--color-warning)]",
        critical && "border-destructive/60 text-destructive animate-pulse",
      )}
      aria-live="polite"
      aria-atomic
    >
      <Clock className="h-4 w-4" />
      <span>{formatRemaining(remaining)}</span>
    </div>
  );
}
