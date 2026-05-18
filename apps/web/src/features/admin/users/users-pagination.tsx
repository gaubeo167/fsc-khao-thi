"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface Props {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

const PAGE_SIZES = [10, 25, 50];

export function UsersPagination({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: Props) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  const visiblePages = buildPagination(page, pageCount);

  return (
    <nav
      aria-label="Phân trang"
      className="flex flex-wrap items-center justify-between gap-3 text-[13px]"
    >
      <p className="text-meta">
        Hiển thị <span className="font-semibold tabular-nums text-foreground/85">{start}</span>
        –<span className="font-semibold tabular-nums text-foreground/85">{end}</span> trong{" "}
        <span className="font-semibold tabular-nums text-foreground/85">{total}</span> người dùng
      </p>

      <div className="flex items-center gap-3">
        <div className="inline-flex items-center gap-1.5 rounded-md border bg-card p-0.5">
          <PageButton
            disabled={page === 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
            aria-label="Trang trước"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </PageButton>

          {visiblePages.map((p, i) =>
            p === "…" ? (
              <span key={`gap-${i}`} className="px-2 text-muted-foreground">
                …
              </span>
            ) : (
              <PageButton
                key={p}
                active={p === page}
                onClick={() => onPageChange(p)}
                aria-current={p === page ? "page" : undefined}
              >
                {p}
              </PageButton>
            ),
          )}

          <PageButton
            disabled={page === pageCount}
            onClick={() => onPageChange(Math.min(pageCount, page + 1))}
            aria-label="Trang sau"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </PageButton>
        </div>

        <label className="flex items-center gap-1.5 text-meta">
          <span className="hidden sm:inline">Số dòng:</span>
          <Select
            className="h-8 w-[68px] text-[12px]"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number.parseInt(e.target.value, 10))}
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </label>
      </div>
    </nav>
  );
}

function PageButton({
  active,
  disabled,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "min-w-[28px] rounded px-2 py-1 text-[12px] font-medium tabular-nums transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-foreground/75 hover:bg-accent hover:text-foreground",
        disabled && "cursor-not-allowed opacity-40 hover:bg-transparent",
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

function buildPagination(current: number, total: number): Array<number | "…"> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const result: Array<number | "…"> = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);

  if (left > 2) result.push("…");
  for (let i = left; i <= right; i++) result.push(i);
  if (right < total - 1) result.push("…");
  result.push(total);
  return result;
}
