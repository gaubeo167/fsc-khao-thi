"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  allVisibleSelected,
  selectedRows,
  someVisibleSelected,
  toggleAllVisible,
  toggleOne,
  visibleSelection,
} from "../lib/bulk-select";

/**
 * Trạng thái tích chọn cho một danh sách CÓ BỘ LỌC.
 *
 * Luật nằm ở `bulk-select.ts`; hook này chỉ giữ state và tự cắt tỉa mỗi khi
 * danh sách hiển thị đổi. Không có bước cắt tỉa đó thì tập đã tích âm thầm
 * giữ id của những dòng đã bị lọc đi, và thao tác hàng loạt chạm vào thứ
 * người dùng không nhìn thấy.
 */
export function useBulkSelect<T>(rows: readonly T[], idOf: (row: T) => string) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );

  const visibleIds = useMemo(() => rows.map(idOf), [rows, idOf]);

  // Đổi bộ lọc / danh sách là cắt ngay những id không còn hiển thị. Chỉ ghi
  // state khi thật sự có thay đổi, nếu không thì mỗi lần render lại tạo Set
  // mới và effect tự kích lại chính nó.
  useEffect(() => {
    setSelected((cur) => {
      const next = visibleSelection(cur, visibleIds);
      return next.size === cur.size ? cur : next;
    });
  }, [visibleIds]);

  const toggle = useCallback((id: string) => {
    setSelected((cur) => toggleOne(cur, id));
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((cur) => toggleAllVisible(cur, visibleIds));
  }, [visibleIds]);

  const clear = useCallback(() => setSelected(new Set<string>()), []);

  // Dòng sẽ bị tác động — luôn cắt theo danh sách đang hiển thị, kể cả khi
  // effect ở trên chưa kịp chạy sau một lần đổi bộ lọc.
  const rowsSelected = useMemo(
    () => selectedRows(rows, idOf, visibleSelection(selected, visibleIds)),
    [rows, idOf, selected, visibleIds],
  );

  return {
    /** Id đang tích VÀ đang hiển thị. */
    selected,
    count: rowsSelected.length,
    rowsSelected,
    isSelected: useCallback((id: string) => selected.has(id), [selected]),
    allSelected: allVisibleSelected(selected, visibleIds),
    someSelected: someVisibleSelected(selected, visibleIds),
    toggle,
    toggleAll,
    clear,
  };
}
