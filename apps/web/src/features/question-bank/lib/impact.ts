/**
 * "Xoá cái này thì mất gì?" — đếm câu hỏi bị ảnh hưởng trước khi xoá.
 *
 * ── Vì sao cần ──────────────────────────────────────────────────────────
 *
 * Ba lệnh xoá trong phần quản trị đều dọn gọn trong phạm vi của mình rồi
 * dừng: xoá môn thì xoá mục lục của môn, xoá node mục lục thì xoá node con,
 * xoá node YCCĐ thì xoá node con. KHÔNG lệnh nào ngó sang kho câu hỏi.
 *
 * Hậu quả im lặng:
 *
 *   · Xoá môn → câu hỏi của môn đó vẫn nằm trong kho, trỏ vào một môn không
 *     còn tồn tại. Không màn nào liệt kê chúng nữa, nhưng chúng vẫn ở đó.
 *   · Xoá node mục lục / YCCĐ → câu hỏi giữ nguyên id đã trỏ tới node vừa
 *     mất. Ô chọn không hiện gì (không tìm thấy node), nhưng dữ liệu vẫn
 *     mang id chết, và mọi thống kê theo mục lục / YCCĐ đếm hụt.
 *
 * Bộ này để hai việc: đếm cho người dùng thấy TRƯỚC khi bấm, và dọn tham
 * chiếu cho sạch SAU khi họ đồng ý.
 *
 * Hàm thuần, không đụng store — để test được mà không cần dựng UI.
 */

import type { Question } from "../data/seed-questions";

/** Node có cha — dùng chung cho mục lục và khung YCCĐ. */
interface TreeNode {
  id: string;
  parentId?: string | null;
}

/**
 * Id của node và TOÀN BỘ con cháu.
 *
 * Xoá một node là xoá cả nhánh (cả hai store đều làm vậy), nên đếm ảnh hưởng
 * cũng phải tính cả nhánh — đếm mỗi node gốc là báo thiếu.
 */
export function subtreeIds(all: TreeNode[], rootId: string): Set<string> {
  const ids = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of all) {
      if (n.parentId && ids.has(n.parentId) && !ids.has(n.id)) {
        ids.add(n.id);
        changed = true;
      }
    }
  }
  return ids;
}

/** Câu đã bỏ vào thùng lưu trữ thì không tính — chúng không hiện ở đâu nữa. */
const isLive = (q: Question) => !q.archivedAt;

/** Câu hỏi thuộc một môn (mọi khối, mọi kho). */
export function questionsOfSubject(
  questions: Question[],
  subjectId: string,
): Question[] {
  return questions.filter((q) => isLive(q) && q.subjectId === subjectId);
}

/** Câu hỏi đang cất ở một nhánh mục lục. */
export function questionsOfToc(
  questions: Question[],
  tocIds: Set<string>,
): Question[] {
  return questions.filter(
    (q) => isLive(q) && q.tocNodeId != null && tocIds.has(q.tocNodeId),
  );
}

/**
 * Câu hỏi có gắn YCCĐ trong nhánh — tính CẢ gắn ở cấp ý và cấp phương án.
 *
 * Bỏ sót hai chỗ đó là báo thiếu đúng những câu Đúng/Sai nhiều ý, mà đó lại
 * là dạng dùng YCCĐ theo từng ý nhiều nhất.
 */
export function questionsOfCompetency(
  questions: Question[],
  compIds: Set<string>,
): Question[] {
  return questions.filter((q) => isLive(q) && touchesCompetency(q, compIds));
}

function touchesCompetency(q: Question, ids: Set<string>): boolean {
  if ((q.competencyIds ?? []).some((id) => ids.has(id))) return true;
  const withOptions = q as { options?: Array<{ competencyId?: string | null }> };
  if (
    (withOptions.options ?? []).some(
      (o) => o.competencyId && ids.has(o.competencyId),
    )
  ) {
    return true;
  }
  const withSubs = q as {
    subQuestions?: Array<{ competencyId?: string | null }>;
  };
  return (withSubs.subQuestions ?? []).some(
    (s) => s.competencyId && ids.has(s.competencyId),
  );
}

/**
 * Bản vá gỡ mọi tham chiếu YCCĐ thuộc nhánh sắp xoá khỏi một câu hỏi.
 *
 * Trả `null` khi câu không dính gì — người gọi bỏ qua, khỏi ghi thừa.
 *
 * `bloomLevel` đi theo YCCĐ (nó được sao xuống từ node lúc gắn), nên gỡ YCCĐ
 * mà giữ Bloom là để lại một con số không còn nguồn gốc.
 */
export function clearCompetencyRefs(
  q: Question,
  ids: Set<string>,
): Partial<Question> | null {
  if (!touchesCompetency(q, ids)) return null;
  const patch: Record<string, unknown> = {};

  const kept = (q.competencyIds ?? []).filter((id) => !ids.has(id));
  if (kept.length !== (q.competencyIds ?? []).length) {
    patch.competencyIds = kept;
    if (kept.length === 0) patch.bloomLevel = undefined;
  }

  const withOptions = q as { options?: Array<Record<string, unknown>> };
  if (withOptions.options?.some((o) => o.competencyId && ids.has(o.competencyId as string))) {
    patch.options = withOptions.options.map((o) =>
      o.competencyId && ids.has(o.competencyId as string)
        ? { ...o, competencyId: null }
        : o,
    );
  }

  const withSubs = q as { subQuestions?: Array<Record<string, unknown>> };
  if (withSubs.subQuestions?.some((s) => s.competencyId && ids.has(s.competencyId as string))) {
    patch.subQuestions = withSubs.subQuestions.map((s) =>
      s.competencyId && ids.has(s.competencyId as string)
        ? { ...s, competencyId: null, bloomLevel: undefined }
        : s,
    );
  }

  return Object.keys(patch).length > 0 ? (patch as Partial<Question>) : null;
}
