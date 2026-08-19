/**
 * "Câu hỏi này có xoá CỨNG được không?"
 *
 * ── Xoá cứng khác lưu trữ ở chỗ nào ─────────────────────────────────────
 *
 * Lưu trữ giấu câu đi, khôi phục lại được. Xoá cứng là mất hẳn — không có
 * đường lùi, và mọi bản ghi còn trỏ tới id đó trở thành trỏ vào hư không.
 *
 * Kho câu hỏi vẫn cần xoá cứng: nhập nhầm 50 câu, tải sai file, câu soạn thử.
 * Bắt lưu trữ những thứ đó là để rác tích trong kho vĩnh viễn. Nhưng "được
 * xoá" phải là kết luận của một phép soát ĐỦ, không phải một nút bấm.
 *
 * ── Vì sao KHÔNG dùng lại `questionInUse` ───────────────────────────────
 *
 * `lib/in-use.ts::questionInUse` trả lời một câu hỏi KHÁC: "sửa thẳng câu này
 * có làm hỏng đề đang chạy không?". Nó chỉ soát `exam_forms` còn `lifecycle
 * === "active"`, và cố ý bỏ qua bản đã lưu trữ — bản đã lưu trữ là bằng chứng
 * lịch sử đông cứng, sửa câu gốc không đụng tới nó.
 *
 * Với xoá cứng thì đúng lý lẽ đó lật ngược lại: bản ghi lịch sử là thứ PHẢI
 * giữ. Đề đã lưu trữ vẫn trỏ tới câu này; xoá câu đi là đục một lỗ vĩnh viễn
 * vào minh chứng của kỳ thi đã diễn ra. Nên ở đây:
 *
 *     MỌI tham chiếu đều chặn, bất kể còn sống hay đã lưu trữ.
 *
 * Dùng lại `questionInUse` cho nút xoá là cách chắc chắn nhất để xoá trúng
 * câu nằm trong một đề đã đóng băng năm ngoái.
 *
 * ── Sáu nguồn tham chiếu ────────────────────────────────────────────────
 *
 *   1. exam_forms       variants[].questions[].originalQuestionId
 *   2. blueprints       topics[].pickedQuestionIds
 *   3. generated_exams  questionIds
 *   4. homework         questionIds
 *   5. attempts         questionIds · answers · markedForReview
 *   6. homework_attempts answers · markedForReview
 *
 * Cộng thêm chuỗi phiên bản: câu này là v1 của một câu khác thì xoá nó làm
 * đứt chuỗi, `getLatestVersionsOf` mất gốc.
 *
 * `packages` KHÔNG có trong danh sách vì gói đề trỏ tới `blueprintId` chứ
 * không giữ id câu — soát blueprint là đã phủ.
 *
 * ── Điều kiện tiên quyết mà người gọi PHẢI bảo đảm ───────────────────────
 *
 * Phép soát này chạy ở CLIENT trên dữ liệu trong store. Nó chỉ đúng khi cả
 * sáu store đã tải xong — store chưa tải xong thì "không tìm thấy tham chiếu"
 * và "chưa biết" trông giống hệt nhau, mà một cái nghĩa là xoá được còn cái
 * kia nghĩa là có thể xoá nhầm dữ liệu thi thật.
 *
 * Vì vậy `hydrated` là tham số BẮT BUỘC, không phải tuỳ chọn. Chưa đủ thì
 * hàm trả `deletable: false`.
 *
 * ⚠ `auth-bootstrap.tsx` hiện tải TOÀN BỘ sáu collection này cho tài khoản
 * nhân viên, nên phép soát đủ dữ liệu. Chú thích trong file đó ghi rõ việc
 * thu hẹp attempts theo từng học sinh là "bước scaling tiếp theo (P1)". NẾU
 * ai làm bước đó, phép soát này âm thầm mất căn cứ và phải chuyển sang chạy
 * ở server. Đừng thu hẹp mà quên chỗ này.
 */

import { rootId } from "@/lib/version";

import type { Question } from "../data/seed-questions";

/** Chỉ lấy đúng những trường cần soát — không buộc vào type đầy đủ của từng
 *  feature, để module này test được mà không kéo theo cả cây kiểu. */
export interface DeletionSources {
  examForms: Array<{
    id: string;
    name?: string | null;
    variants: Array<{ questions: Array<{ originalQuestionId: string }> }>;
  }>;
  blueprints: Array<{
    id: string;
    name?: string | null;
    topics: Array<{ pickedQuestionIds: string[] }>;
  }>;
  generated: Array<{ id: string; name?: string | null; questionIds: string[] }>;
  homework: Array<{ id: string; title?: string | null; questionIds: string[] }>;
  attempts: Array<{
    id: string;
    studentId?: string | null;
    questionIds?: string[];
    answers?: Record<string, unknown>;
    markedForReview?: string[];
  }>;
  homeworkAttempts: Array<{
    id: string;
    studentId?: string | null;
    answers?: Record<string, unknown>;
    markedForReview?: string[];
  }>;
  /** Toàn bộ kho câu — để soát chuỗi phiên bản VÀ tra người tạo. */
  questions: Array<
    Pick<Question, "id"> & { versionOfRootId?: string; ownerId?: string | null }
  >;
}

/** Mọi store cần thiết đã tải xong chưa. Thiếu MỘT cái là chặn. */
export interface DeletionHydration {
  examForms: boolean;
  blueprints: boolean;
  generated: boolean;
  homework: boolean;
  attempts: boolean;
  homeworkAttempts: boolean;
  questions: boolean;
}

export interface DeleteBlocker {
  /** Nguồn chặn — để giao diện gom nhóm. */
  kind:
    | "exam-form"
    | "blueprint"
    | "generated"
    | "homework"
    | "attempt"
    | "homework-attempt"
    | "version-chain"
    | "not-owner"
    | "not-hydrated";
  /** Câu chữ hiện cho người dùng. */
  label: string;
}

export interface DeleteVerdict {
  deletable: boolean;
  blockers: DeleteBlocker[];
  /** Một câu giải thích, LUÔN có — kể cả khi cho phép xoá. */
  reason: string;
}

const LABEL: Record<DeleteBlocker["kind"], string> = {
  "exam-form": "đề thi đã đóng băng",
  blueprint: "khung đề",
  generated: "mã đề đã sinh",
  homework: "bài tập về nhà",
  attempt: "lượt làm bài của học sinh",
  "homework-attempt": "bài tập học sinh đã làm",
  "version-chain": "chuỗi phiên bản",
  "not-owner": "quyền",
  "not-hydrated": "dữ liệu đối chiếu",
};

/** Tất cả store đã tải xong chưa — tách ra để giao diện hiện được lý do chờ. */
export function allHydrated(h: DeletionHydration): boolean {
  return (
    h.examForms &&
    h.blueprints &&
    h.generated &&
    h.homework &&
    h.attempts &&
    h.homeworkAttempts &&
    h.questions
  );
}

/**
 * Soát một câu hỏi. Trả `deletable: false` kèm lý do cụ thể khi có bất kỳ
 * tham chiếu nào — nêu tên chứ không chỉ đếm, vì người dùng cần biết đi đâu
 * để gỡ.
 *
 * ── Quyền ───────────────────────────────────────────────────────────────
 *
 * AI TẠO CÂU NÀO THÌ XOÁ VĨNH VIỄN ĐƯỢC CÂU ĐÓ. Không phải "ai có quyền sửa
 * kho" — trước đây nút xoá chỉ nhìn `canMutate`, tức mọi nhân viên xoá vĩnh
 * viễn được câu của bất kỳ ai. Xoá cứng là thao tác DUY NHẤT trong hệ không
 * có đường lùi, nên phạm vi phải hẹp nhất có thể mà vẫn dùng được.
 *
 * Luật quyền nằm CHUNG cổng với luật tham chiếu, không tách ra chỗ khác: hai
 * cổng là hai đường, và sớm muộn một đường sẽ quên mất điều kiện của đường
 * kia. `actorUserId` bỏ trống = không soát quyền (dùng cho test luật tham
 * chiếu thuần).
 */
export function canHardDelete(
  questionId: string,
  src: DeletionSources,
  hydrated: DeletionHydration,
  actorUserId?: string | null,
): DeleteVerdict {
  if (!allHydrated(hydrated)) {
    return {
      deletable: false,
      blockers: [
        {
          kind: "not-hydrated",
          label: "Chưa tải xong dữ liệu để đối chiếu (đề thi · bài tập · lượt làm bài)",
        },
      ],
      reason:
        "Chưa đối chiếu đủ để chắc câu này không nằm trong đề hay bài tập nào. Chờ tải xong rồi thử lại — hoặc dùng Lưu trữ, lúc nào cũng an toàn.",
    };
  }

  // ── Quyền: chỉ người TẠO câu mới xoá vĩnh viễn được câu đó ─────────────
  //
  // Trả về sớm chứ không gom chung với các blocker tham chiếu: "câu này không
  // phải của bạn" đã là câu trả lời trọn vẹn, liệt kê thêm nó nằm trong đề nào
  // chỉ là nhiễu — và còn rò rỉ thông tin về dữ liệu của người khác.
  if (actorUserId != null) {
    const me = src.questions.find((q) => q.id === questionId);
    if (!me) {
      return {
        deletable: false,
        blockers: [
          { kind: "not-owner", label: "Không tìm thấy câu hỏi trong kho đang tải" },
        ],
        reason:
          "Không đối chiếu được người tạo câu này nên không xoá vĩnh viễn được. Dùng Lưu trữ.",
      };
    }
    if (me.ownerId !== actorUserId) {
      return {
        deletable: false,
        blockers: [{ kind: "not-owner", label: "Câu này do người khác tạo" }],
        reason:
          "Chỉ người TẠO câu mới xoá vĩnh viễn được câu đó. Bạn vẫn Lưu trữ được — câu ẩn khỏi kho và khôi phục lại được.",
      };
    }
  }

  const blockers: DeleteBlocker[] = [];
  const push = (kind: DeleteBlocker["kind"], name: string) => {
    if (blockers.length < 8) blockers.push({ kind, label: name });
  };

  // 1. Đề thi đã đóng băng — kể cả đề đã lưu trữ. Xem đầu file.
  for (const f of src.examForms) {
    if (
      f.variants.some((v) =>
        v.questions.some((q) => q.originalQuestionId === questionId),
      )
    ) {
      push("exam-form", f.name?.trim() || f.id);
    }
  }
  // 2. Khung đề đã bốc sẵn câu.
  for (const b of src.blueprints) {
    if (b.topics.some((t) => t.pickedQuestionIds.includes(questionId))) {
      push("blueprint", b.name?.trim() || b.id);
    }
  }
  // 3. Mã đề đã sinh.
  for (const g of src.generated) {
    if (g.questionIds.includes(questionId)) {
      push("generated", g.name?.trim() || g.id);
    }
  }
  // 4. Bài tập về nhà.
  for (const h of src.homework) {
    if (h.questionIds.includes(questionId)) {
      push("homework", h.title?.trim() || h.id);
    }
  }
  // 5. Lượt thi. Soát cả `answers` và `markedForReview`, không chỉ
  //    `questionIds`: bài cũ (trước khi có snapshot) có thể thiếu
  //    `questionIds` mà vẫn mang câu trả lời của câu này.
  for (const a of src.attempts) {
    const hit =
      (a.questionIds?.includes(questionId) ?? false) ||
      (a.answers != null &&
        Object.prototype.hasOwnProperty.call(a.answers, questionId)) ||
      (a.markedForReview?.includes(questionId) ?? false);
    if (hit) push("attempt", a.studentId?.trim() || a.id);
  }
  // 6. Bài tập học sinh đã làm.
  for (const a of src.homeworkAttempts) {
    const hit =
      (a.answers != null &&
        Object.prototype.hasOwnProperty.call(a.answers, questionId)) ||
      (a.markedForReview?.includes(questionId) ?? false);
    if (hit) push("homework-attempt", a.studentId?.trim() || a.id);
  }

  // 7. Chuỗi phiên bản. Câu này là gốc của một bản khác, hoặc có anh em cùng
  //    chuỗi → xoá đi là làm đứt chuỗi và `getLatestVersionsOf` mất gốc.
  const me = src.questions.find((q) => q.id === questionId);
  if (me) {
    const myRoot = rootId(me);
    const family = src.questions.filter(
      (q) => q.id !== questionId && rootId(q) === myRoot,
    );
    if (family.length > 0) {
      push(
        "version-chain",
        `${family.length} phiên bản khác cùng chuỗi (${family
          .slice(0, 3)
          .map((q) => q.id)
          .join(", ")}${family.length > 3 ? "…" : ""})`,
      );
    }
  }

  if (blockers.length === 0) {
    return {
      deletable: true,
      reason:
        "Câu này do bạn tạo, chưa vào đề, chưa vào bài tập, chưa ai làm, và không nằm trong chuỗi phiên bản nào. Xoá được vĩnh viễn.",
      blockers: [],
    };
  }

  const kinds = [...new Set(blockers.map((b) => b.kind))].map((k) => LABEL[k]);
  return {
    deletable: false,
    blockers,
    reason: `Câu này đang được ${kinds.join(" · ")} tham chiếu. Xoá vĩnh viễn sẽ để lại tham chiếu trỏ vào hư không, nên chỉ Lưu trữ được.`,
  };
}

/**
 * Chia một tập câu thành "xoá cứng được" và "chỉ lưu trữ được".
 *
 * Thao tác hàng loạt cần cái này: chọn 30 câu mà 2 câu đã vào đề thì đừng
 * chặn cả 30 — xoá 28 câu sạch, nói rõ 2 câu kia vì sao không.
 */
export function splitDeletable<T extends { id: string }>(
  rows: readonly T[],
  src: DeletionSources,
  hydrated: DeletionHydration,
  actorUserId?: string | null,
): { deletable: T[]; blocked: Array<{ row: T; verdict: DeleteVerdict }> } {
  const deletable: T[] = [];
  const blocked: Array<{ row: T; verdict: DeleteVerdict }> = [];
  for (const r of rows) {
    const v = canHardDelete(r.id, src, hydrated, actorUserId);
    if (v.deletable) deletable.push(r);
    else blocked.push({ row: r, verdict: v });
  }
  return { deletable, blocked };
}
