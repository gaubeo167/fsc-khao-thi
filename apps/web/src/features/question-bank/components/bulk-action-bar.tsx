"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Thanh thao tác hàng loạt, dùng chung cho Ngân hàng câu hỏi và Phê duyệt.
 *
 * Luôn HIỆN (kể cả khi chưa tích câu nào) thay vì trồi lên lúc tích câu đầu
 * tiên: ô "chọn tất cả" phải nhìn thấy được thì người dùng mới biết là có
 * chức năng chọn nhiều. Thanh nhảy vào bố cục cũng làm cả danh sách bên dưới
 * xê dịch đúng lúc người ta đang nhắm chuột vào một dòng.
 */
export function BulkActionBar({
  allSelected,
  someSelected,
  count,
  visibleCount,
  onToggleAll,
  onClear,
  children,
}: {
  allSelected: boolean;
  someSelected: boolean;
  /** Số dòng đang tích (đã cắt theo bộ lọc). */
  count: number;
  /** Số dòng đang hiển thị — để nói rõ "chọn tất cả" là chọn bao nhiêu. */
  visibleCount: number;
  onToggleAll(): void;
  onClear(): void;
  /** Nút hành động của từng màn (Lưu trữ / Duyệt…). */
  children?: ReactNode;
}) {
  const boxRef = useRef<HTMLInputElement>(null);

  // `indeterminate` không phải thuộc tính HTML, chỉ đặt được qua DOM. Thiếu
  // nó thì tích một phần trông y hệt chưa tích gì.
  useEffect(() => {
    if (boxRef.current) boxRef.current.indeterminate = someSelected;
  }, [someSelected]);

  return (
    <div
      className={cn(
        "mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-card px-3 py-2 transition-colors",
        count > 0 && "border-primary/40 bg-primary/5",
      )}
    >
      <label className="inline-flex cursor-pointer items-center gap-2 text-small font-medium">
        <input
          ref={boxRef}
          type="checkbox"
          checked={allSelected}
          onChange={onToggleAll}
          disabled={visibleCount === 0}
          className="h-4 w-4 cursor-pointer accent-[var(--color-primary)]"
          aria-label={`Chọn tất cả ${visibleCount} câu đang hiển thị`}
        />
        Chọn tất cả
        <span className="text-meta text-muted-foreground tabular-nums">
          ({visibleCount})
        </span>
      </label>

      {count > 0 && (
        <>
          <span
            aria-live="polite"
            className="text-small font-semibold text-primary tabular-nums"
          >
            Đã chọn {count} câu
          </span>
          <Button size="sm" variant="ghost" onClick={onClear}>
            <X className="h-3.5 w-3.5" />
            Bỏ chọn
          </Button>
        </>
      )}

      <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
