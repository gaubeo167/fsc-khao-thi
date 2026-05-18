import { cn } from "@/lib/utils";

import { DIFFICULTY_LABEL, type DifficultyCounts } from "../lib/blueprint-stats";

interface Props {
  counts: DifficultyCounts;
  /** Compact = chip pill style without the dot. */
  size?: "sm" | "md";
  className?: string;
}

/**
 * Three colored pills showing NB / TH / VDC counts. Used across blueprint
 * cards, picker dialogs, and matrix editors so the visual language stays
 * consistent (green / yellow / red).
 */
export function DifficultyPills({ counts, size = "sm", className }: Props) {
  return (
    <div className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      <Pill kind="easy" value={counts.easy} size={size} />
      <Pill kind="medium" value={counts.medium} size={size} />
      <Pill kind="hard" value={counts.hard} size={size} />
    </div>
  );
}

function Pill({
  kind,
  value,
  size,
}: {
  kind: "easy" | "medium" | "hard";
  value: number;
  size: "sm" | "md";
}) {
  const meta = DIFFICULTY_LABEL[kind];
  const palette =
    kind === "easy"
      ? "bg-emerald-50 ring-emerald-200 text-emerald-700"
      : kind === "medium"
        ? "bg-amber-50 ring-amber-300 text-amber-700"
        : "bg-rose-50 ring-rose-200 text-rose-700";
  const badge =
    kind === "easy"
      ? "bg-emerald-100 text-emerald-700"
      : kind === "medium"
        ? "bg-amber-100 text-amber-700"
        : "bg-rose-100 text-rose-700";
  return (
    <span
      title={meta.full}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 ring-1",
        size === "sm" ? "py-0.5 text-[11px]" : "py-1 text-[12px]",
        palette,
      )}
    >
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full px-1.5 text-[10px] font-bold",
          badge,
        )}
      >
        {meta.short}
      </span>
      <span className="tabular-nums font-semibold">{value} câu</span>
    </span>
  );
}
