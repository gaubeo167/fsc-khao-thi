"use client";

import { cn } from "@/lib/utils";

interface TooltipProps {
  text: React.ReactNode;
  /** Tooltip placement. Default "top". */
  side?: "top" | "bottom";
  /** Extra wrapper className. The wrapper itself is `relative` +
   *  `group`, so callers usually want display + cursor utilities here. */
  className?: string;
  children: React.ReactNode;
}

/**
 * CSS-only tooltip. The native `title` attribute has a ~1.5s browser
 * delay before showing, which left users staring at a `cursor-help`
 * with no label — they thought hover wasn't working. This wrapper
 * shows the label immediately via Tailwind group-hover, no JS needed.
 *
 * Usage:
 *   <Tooltip text="Số lớp được giao: 3">
 *     <GraduationCap className="h-3.5 w-3.5" /> 3
 *   </Tooltip>
 */
export function Tooltip({
  text,
  side = "top",
  className,
  children,
}: TooltipProps) {
  return (
    <span
      className={cn(
        "group relative inline-flex items-center cursor-help",
        className,
      )}
    >
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none invisible absolute left-1/2 z-50 -translate-x-1/2",
          "whitespace-nowrap rounded-md bg-foreground/95 px-2 py-1 text-[11px]",
          "font-medium text-background opacity-0 shadow-md transition-opacity",
          "delay-0 group-hover:visible group-hover:opacity-100",
          side === "top"
            ? "bottom-full mb-1.5"
            : "top-full mt-1.5",
        )}
      >
        {text}
      </span>
    </span>
  );
}
