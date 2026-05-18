import * as React from "react";

import { cn } from "@/lib/utils";

const TONE_CLASSES = [
  "bg-[var(--color-tone-blue-soft)] text-[var(--color-tone-blue)]",
  "bg-[var(--color-tone-orange-soft)] text-[var(--color-tone-orange)]",
  "bg-[var(--color-tone-green-soft)] text-[var(--color-tone-green)]",
  "bg-[var(--color-tone-violet-soft)] text-[var(--color-tone-violet)]",
];

function pickTone(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return TONE_CLASSES[h % TONE_CLASSES.length]!;
}

export function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "??";
  const last = parts[parts.length - 1] ?? "";
  if (parts.length === 1) return last.slice(0, 2).toUpperCase();
  const first = parts[0] ?? "";
  return (first[0] ?? "") + (last[0] ?? "").toUpperCase();
}

interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  name: string;
  size?: "sm" | "md" | "lg";
}

export function Avatar({ name, size = "md", className, ...props }: AvatarProps) {
  const initials = deriveInitials(name);
  const tone = pickTone(name);
  const dimensions =
    size === "sm" ? "h-7 w-7 text-[10px]" : size === "lg" ? "h-10 w-10 text-[13px]" : "h-8 w-8 text-[11px]";
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold uppercase tracking-tight",
        dimensions,
        tone,
        className,
      )}
      {...props}
    >
      {initials.toUpperCase()}
    </span>
  );
}
