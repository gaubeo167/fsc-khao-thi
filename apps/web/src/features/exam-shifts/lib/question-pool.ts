/**
 * "Ca này gồm những câu hỏi nào" — một luật, dùng chung cho mọi màn đọc lại
 * kết quả (báo cáo, danh sách báo cáo, hàng đợi chấm tay).
 *
 * Ca thi chính thức giữ câu trong KHUNG ĐỀ: `bp.topics[].pickedQuestionIds`.
 * Bài kiểm tra giáo viên tự ra không có khung đề lẫn gói đề — câu nằm thẳng
 * trên bản ghi ca (`shift.questionIds`).
 *
 * Viết thẳng `bp.topics.flatMap(...)` ở từng màn là cái bẫy đã sập một lần:
 * bài kiểm tra ra 0 điểm ở màn Kết quả trong khi bài làm chấm đúng, vì danh
 * sách câu rỗng nên không có câu nào để cộng điểm.
 */
export function shiftQuestionPoolIds(
  shift: { questionIds?: string[] },
  bp: { topics?: Array<{ pickedQuestionIds?: string[] }> } | null | undefined,
): string[] {
  const picked = (bp?.topics ?? []).flatMap((t) => t?.pickedQuestionIds ?? []);
  return picked.length > 0 ? picked : (shift.questionIds ?? []);
}
