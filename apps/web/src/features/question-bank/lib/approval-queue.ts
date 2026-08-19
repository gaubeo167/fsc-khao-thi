/**
 * MỘT luật cho "cái gì được nằm trong hàng đợi chờ duyệt".
 *
 * ── Vì sao tách ra ──────────────────────────────────────────────────────
 *
 * Trang Phê duyệt có ba tab (câu hỏi · học liệu · gói đề), mỗi tab tự viết bộ
 * lọc riêng. Tab Học liệu nhớ loại bản ĐÃ LƯU TRỮ, hai tab kia quên.
 *
 * Hậu quả đo được trên dữ liệu thật: cơ sở FSC Đà Nẵng 3 có 63 câu kho chung,
 * trong đó 21 câu vừa `archivedAt` vừa `status="pending"`. Ngân hàng câu hỏi
 * ẩn câu đã lưu trữ nên báo **21**, màn Phê duyệt không ẩn nên báo **42**.
 * Người dùng thấy hai con số cho cùng một cơ sở và không biết tin cái nào.
 *
 * Nguy hơn con số: người duyệt vẫn bấm duyệt được câu đã bị xoá mềm, ra một
 * câu vừa "đã duyệt" vừa "đã lưu trữ" — nó lọt vào kho chung mà không ai chủ
 * ý đưa vào.
 *
 * ── Luật ────────────────────────────────────────────────────────────────
 *
 * Lưu trữ là xoá mềm. Thứ đã xoá không chờ duyệt. Áp cho MỌI loại.
 */

/** Bản ghi nào cũng chỉ cần hai trường này để trả lời. */
export interface QueueCandidate {
  archivedAt?: string | null;
  status?: string | null;
}

/**
 * Bản ghi này có được vào hàng đợi duyệt không.
 *
 * Chỉ trả lời phần "đã xoá mềm chưa" — phạm vi cơ sở / kho / trạng thái là
 * việc của người gọi. Tách nhỏ vậy để ba tab dùng chung được mà không phải
 * kéo theo luật campus của nhau.
 */
export function inApprovalQueue(row: QueueCandidate): boolean {
  return !row.archivedAt;
}

/** Lọc cả danh sách. */
export function approvalQueue<T extends QueueCandidate>(rows: readonly T[]): T[] {
  return rows.filter(inApprovalQueue);
}
