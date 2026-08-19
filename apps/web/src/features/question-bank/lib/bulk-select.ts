/**
 * MỘT luật duy nhất cho "đang tích chọn những dòng nào".
 *
 * ── Vì sao tách ra file riêng ───────────────────────────────────────────
 *
 * Hai màn cần đúng luật này: Ngân hàng câu hỏi (tích để lưu trữ hàng loạt) và
 * Phê duyệt (tích để duyệt hàng loạt). Viết inline ở hai chỗ là cách luật
 * phạm vi trong dự án này đã đi lệch nhiều lần — xem đầu `toc-scope.ts`.
 *
 * ── Luật quan trọng nhất: CHỈ tính trên dòng ĐANG THẤY ──────────────────
 *
 * Tập đã tích sống lâu hơn bộ lọc. Người dùng tích 5 câu, đổi bộ lọc, 3 câu
 * biến khỏi màn hình — nhưng id của chúng vẫn nằm trong tập đã tích. Bấm
 * "Lưu trữ" lúc đó là lưu trữ những câu KHÔNG ai nhìn thấy, và với một thao
 * tác hàng loạt thì đó là hỏng dữ liệu ở quy mô lớn chứ không phải một ô
 * hiển thị sai.
 *
 * Nên mọi hàm ở đây đều giao với `visibleIds` trước khi trả lời. Đổi bộ lọc
 * là số đếm "đã chọn N" tụt xuống ngay trước mắt — thấy được, sửa được. Đây
 * cùng một luật với `keepTocSelection`: thà bỏ lựa chọn còn hơn thao tác lên
 * thứ người dùng không nhìn thấy.
 */

/** Tập đã tích, đã cắt bỏ những id không còn hiển thị. */
export function visibleSelection(
  selected: ReadonlySet<string>,
  visibleIds: readonly string[],
): Set<string> {
  const out = new Set<string>();
  for (const id of visibleIds) if (selected.has(id)) out.add(id);
  return out;
}

/** Bật/tắt một dòng. */
export function toggleOne(
  selected: ReadonlySet<string>,
  id: string,
): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/**
 * Ô tích ở đầu bảng: đang tích ĐỦ dòng đang thấy thì bỏ hết, còn lại thì
 * tích hết.
 *
 * Chỉ đụng tới dòng đang thấy — id đã tích nhưng bị bộ lọc ẩn đi thì bị bỏ
 * luôn, đúng luật trên đầu file.
 */
export function toggleAllVisible(
  selected: ReadonlySet<string>,
  visibleIds: readonly string[],
): Set<string> {
  return allVisibleSelected(selected, visibleIds)
    ? new Set<string>()
    : new Set(visibleIds);
}

/** Mọi dòng đang thấy đều đã tích. Danh sách rỗng → `false`, không phải "đủ". */
export function allVisibleSelected(
  selected: ReadonlySet<string>,
  visibleIds: readonly string[],
): boolean {
  if (visibleIds.length === 0) return false;
  return visibleIds.every((id) => selected.has(id));
}

/** Đã tích một phần — để ô tích đầu bảng hiện trạng thái lửng (indeterminate). */
export function someVisibleSelected(
  selected: ReadonlySet<string>,
  visibleIds: readonly string[],
): boolean {
  if (visibleIds.length === 0) return false;
  return (
    visibleIds.some((id) => selected.has(id)) &&
    !allVisibleSelected(selected, visibleIds)
  );
}

/**
 * Những dòng sẽ thực sự bị tác động, theo ĐÚNG thứ tự đang hiển thị.
 *
 * Người gọi phải dùng hàm này chứ không phải tập đã tích thô: đây là chỗ duy
 * nhất bảo đảm thao tác hàng loạt không chạm vào dòng ngoài màn hình. Trả về
 * mảng (không phải Set) để lời xác nhận liệt kê được theo đúng thứ tự người
 * dùng thấy.
 */
export function selectedRows<T>(
  rows: readonly T[],
  idOf: (row: T) => string,
  selected: ReadonlySet<string>,
): T[] {
  return rows.filter((r) => selected.has(idOf(r)));
}
