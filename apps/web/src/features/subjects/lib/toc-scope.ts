/**
 * MỘT luật duy nhất cho câu hỏi "mục lục nào thuộc môn + khối này".
 *
 * ── Vì sao phải gom về một chỗ ──────────────────────────────────────────
 *
 * Luật này từng được viết lại SÁU lần ở sáu file: ô gắn mục lục khi soạn câu,
 * hộp bốc câu cho đề, hộp chọn câu cho bài tập, hộp tải học liệu, hộp sửa học
 * liệu, và trợ lý tạo đề YCCĐ. Năm trong sáu bản có thêm một đoạn "nếu khối
 * này chưa có mục lục thì lấy TẤT CẢ mục lục của môn".
 *
 * Đoạn đó nghe hợp lý và sai nghiêm trọng. Đo trên dữ liệu thật: môn Tiếng
 * Anh có 19 node mục lục, TẤT CẢ thuộc khối 10. Nên mọi khối tiếng Anh khác
 * đều mượn mục lục khối 10 — và câu hỏi lớp 1 được cất vào chương trình lớp
 * 10 mà không có một dấu hiệu nào. Người dùng gọi đúng tên: "logic đang loạn".
 *
 * ── Luật ────────────────────────────────────────────────────────────────
 *
 * Đúng môn, VÀ (đúng khối HOẶC node dùng chung cho mọi khối).
 * KHÔNG mượn của khối khác. Khối chưa có mục lục thì hiện rỗng và nói ra —
 * để trống là lời mời đi tạo mục lục, còn mượn nhầm là dữ liệu hỏng lặng lẽ.
 */

export interface ScopedTocNode {
  id: string;
  name: string;
  code?: string | null;
  parentId: string | null;
  subjectId: string;
  gradeId: string | null;
  order: number;
}

/** Node thuộc đúng môn + khối. Node `gradeId == null` là dùng chung mọi khối. */
export function tocInScope<T extends ScopedTocNode>(
  nodes: T[],
  subjectId: string | null | undefined,
  gradeId: string | null | undefined,
): T[] {
  if (!subjectId) return [];
  return nodes.filter(
    (n) => n.subjectId === subjectId && (n.gradeId == null || n.gradeId === gradeId),
  );
}

export interface FlatTocOption {
  id: string;
  label: string;
  depth: number;
  code?: string | null;
}

/**
 * Trải cây mục lục thành danh sách phẳng có thụt đầu dòng.
 *
 * Node MỒ CÔI (cha nằm ngoài phạm vi hoặc đã bị xoá) được nâng lên làm gốc.
 * Không nâng thì cả nhánh không bao giờ được duyệt tới — node vẫn còn trong
 * kho, câu hỏi vẫn trỏ vào nó, nhưng nó biến mất khỏi mọi ô chọn.
 */
export function flattenToc<T extends ScopedTocNode>(scoped: T[]): FlatTocOption[] {
  const inScope = new Set(scoped.map((n) => n.id));
  const byParent = new Map<string | null, T[]>();
  for (const n of scoped) {
    const key = n.parentId && inScope.has(n.parentId) ? n.parentId : null;
    const list = byParent.get(key) ?? [];
    list.push(n);
    byParent.set(key, list);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.order - b.order);

  const out: FlatTocOption[] = [];
  const seen = new Set<string>();
  const walk = (parentId: string | null, depth: number) => {
    for (const c of byParent.get(parentId) ?? []) {
      // Chống lặp vô hạn nếu dữ liệu có vòng cha–con.
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push({ id: c.id, label: c.name, depth, code: c.code });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** Id của node và toàn bộ con cháu — để lọc "chọn chương thì lấy cả chương". */
export function tocSubtreeIds<T extends ScopedTocNode>(
  scoped: T[],
  rootId: string,
): Set<string> {
  const ids = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of scoped) {
      if (n.parentId && ids.has(n.parentId) && !ids.has(n.id)) {
        ids.add(n.id);
        changed = true;
      }
    }
  }
  return ids;
}
