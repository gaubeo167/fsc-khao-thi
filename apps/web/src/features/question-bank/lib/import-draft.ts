/**
 * Dạng dữ liệu CHUNG cho mọi đường nhập câu hỏi.
 *
 * Trước đây hai đường nhập ("Import từ Word" và "Upload đề theo mã") có hai
 * kiểu dữ liệu riêng, hai dialog riêng gần 900 dòng mỗi cái, và hai parser
 * đều phải dò xem người dùng có tải nhầm mẫu của bên kia không để chỉ sang
 * nút đúng. Việc phải viết đoạn dò đó là bằng chứng: cái split phục vụ
 * parser, không phục vụ giáo viên.
 *
 * `DraftQuestion` là điểm gặp. Mỗi khuôn file chỉ cần một hàm chuẩn hoá về
 * đây; từ đây trở đi màn chỉnh sửa, phần kiểm tra hợp lệ và phần ghi vào kho
 * dùng chung một đường.
 *
 * Nguyên tắc: parser KHÔNG được đoán bừa. Thiếu dữ liệu thì để `null` và báo
 * lên `issues` cho người dùng bổ sung, chứ không điền đại một giá trị mặc
 * định — điền đại nghĩa là câu sai lặng lẽ vào kho.
 */

import type { QuestionType } from "../data/question-types";

import type { ImportedQuestion } from "./parse-import";
import type { ShortAnswerKey } from "@/lib/exam/short-answer-match";

import type { ParsedBankQuestion } from "./parse-exam-bank";

export type DraftDifficulty = "easy" | "medium" | "hard";

/** Khuôn file mà bộ nhận dạng kết luận. */
export type ImportFormat = "fsc" | "ma-de" | "generic";

export interface DraftOption {
  content: string;
  isCorrect: boolean;
}

export interface DraftSubQuestion {
  statement: string;
  correctAnswer: boolean;
}

export interface DraftQuestion {
  /** Khoá dựng ở client, chỉ để React nhận diện hàng trong danh sách. */
  id: string;
  /** Thứ tự trong file, giữ để người dùng đối chiếu với bản Word gốc. */
  index: number;
  /**
   * `null` = parser không nhận ra dạng câu. KHÔNG mặc định về mcq-single:
   * đoán sai dạng thì đáp án vào sai chỗ và không ai phát hiện.
   */
  type: QuestionType | null;
  /** `null` = chưa có mức độ. Đây là trường hay thiếu nhất khi nhập từ Word. */
  difficulty: DraftDifficulty | null;
  content: string;
  options: DraftOption[];
  subQuestions: DraftSubQuestion[];
  acceptedAnswers: ShortAnswerKey[];
  explanation: string;
  /** Mã chuyên đề đọc từ file (chỉ khuôn "mã đề" có). */
  chuyenDeCode: string | null;
  /** Mã đầy đủ như trong file, giữ nguyên để hiện lại cho người soạn. */
  rawCode: string | null;
  /**
   * Id YCCĐ (node LÁ của khung năng lực) sau khi khớp mã — khớp ở client vì
   * khung nằm trong store trình duyệt.
   *
   * Chỉ nhận node lá. Trước đây trường này từng nhận cả node chủ điểm, và vì
   * chủ điểm không mang mức Bloom nên cả đề mất mức độ mà vẫn báo "đã khớp".
   */
  chuyenDeId: string | null;
  /** Khớp bằng đường nào — `null` khi chưa khớp. Xem `match-competency.ts`. */
  chuyenDeMatch: "ma-day-du" | "so-chi-bao" | null;
  /** Mức Bloom lấy từ YCCĐ đã khớp, để ghi kèm câu hỏi. */
  bloomLevel: 1 | 2 | 3 | null;
  sourceFormat: ImportFormat;
  /** Cảnh báo do parser sinh ra (khác `issues` do bộ kiểm tra sinh ra). */
  parserWarnings: string[];
}

/** Một lỗi khiến câu chưa gửi duyệt được. `field` để màn sửa cuộn tới đúng ô. */
export interface DraftIssue {
  field: "type" | "difficulty" | "content" | "options" | "answer" | "chuyenDe";
  message: string;
}

/**
 * Kiểm tra một câu đã đủ điều kiện gửi duyệt chưa.
 *
 * Cố ý TÁCH khỏi parser: parser nói "file viết gì", bộ này nói "còn thiếu gì
 * để vào kho". Gộp chung thì mỗi lần đổi luật nghiệp vụ lại phải sửa parser.
 *
 * `requireChuyenDe` bật khi nhập theo mã đề — kho AIMO cần chuyên đề, còn
 * đường Word thường thì không.
 */
export function validateDraft(
  q: DraftQuestion,
  opts: { requireChuyenDe: boolean },
): DraftIssue[] {
  const issues: DraftIssue[] = [];

  if (!q.type) {
    issues.push({ field: "type", message: "Chưa nhận ra dạng câu hỏi" });
  }
  if (!q.difficulty) {
    issues.push({ field: "difficulty", message: "Chưa chọn mức độ câu hỏi" });
  }
  if (!stripToText(q.content)) {
    issues.push({ field: "content", message: "Đề bài đang trống" });
  }
  if (opts.requireChuyenDe && !q.chuyenDeId) {
    issues.push({ field: "chuyenDe", message: "Chưa khớp chuyên đề" });
  }

  switch (q.type) {
    case "mcq-single":
    case "mcq-multi": {
      const filled = q.options.filter((o) => stripToText(o.content));
      if (filled.length < 2) {
        issues.push({ field: "options", message: "Cần ít nhất 2 phương án" });
      }
      const correct = q.options.filter((o) => o.isCorrect).length;
      if (correct === 0) {
        issues.push({ field: "answer", message: "Chưa đánh dấu đáp án đúng" });
      }
      // Một đáp án đúng cho câu NHIỀU đáp án là dấu hiệu người soạn quên tô
      // các phương án còn lại, không phải câu hợp lệ.
      if (q.type === "mcq-multi" && correct === 1) {
        issues.push({
          field: "answer",
          message: "Trắc nghiệm nhiều đáp án nhưng chỉ có 1 đáp án đúng",
        });
      }
      if (q.type === "mcq-single" && correct > 1) {
        issues.push({
          field: "answer",
          message: `Trắc nghiệm 1 đáp án nhưng có ${correct} đáp án đúng`,
        });
      }
      break;
    }
    case "multi-tf": {
      if (q.subQuestions.filter((s) => stripToText(s.statement)).length < 2) {
        issues.push({ field: "options", message: "Cần ít nhất 2 ý Đúng/Sai" });
      }
      break;
    }
    case "short-answer": {
      if (q.acceptedAnswers.length === 0) {
        issues.push({ field: "answer", message: "Chưa có đáp án chấp nhận" });
      }
      break;
    }
    case "true-false": {
      // Đáp án boolean luôn có giá trị, không thể thiếu.
      break;
    }
    case "essay":
      // Tự luận chấm tay — không đòi đáp án máy.
      break;
    default:
      break;
  }

  return issues;
}

/** Bỏ thẻ ảnh markdown và khoảng trắng để biết ô có chữ thật hay không. */
function stripToText(s: string): string {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

let seq = 0;
function nextId(): string {
  seq += 1;
  return `dq-${seq}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Khuôn FSC (`# Câu N` + `Dạng:`) → dạng chung. */
export function draftFromFsc(
  q: ImportedQuestion,
  index: number,
): DraftQuestion {
  const base: DraftQuestion = {
    id: nextId(),
    index,
    type: (q.type as QuestionType) ?? null,
    // Parser FSC luôn đặt sẵn `difficulty`, kể cả khi file không ghi. Giữ
    // nguyên vì mẫu FSC có ô độ khó bắt buộc.
    difficulty: q.difficulty ?? null,
    content: q.content ?? "",
    options: [],
    subQuestions: [],
    acceptedAnswers: [],
    explanation: q.explanation ?? "",
    chuyenDeCode: null,
    rawCode: null,
    chuyenDeId: null,
    chuyenDeMatch: null,
    bloomLevel: null,
    sourceFormat: "fsc",
    parserWarnings: [],
  };
  if (q.type === "mcq-single" || q.type === "mcq-multi") {
    base.options = q.options.map((o) => ({
      content: o.content,
      isCorrect: o.isCorrect,
    }));
  }
  return base;
}

/** Khuôn mã đề (`[SI10.02.2.D05.a]` + gạch chân) → dạng chung. */
export function draftFromMaDe(
  q: ParsedBankQuestion,
  index: number,
): DraftQuestion {
  return {
    id: nextId(),
    index,
    type: (q.qType as QuestionType) ?? null,
    // `difficultyFromCode === false` nghĩa là mã KHÔNG ghi độ khó và
    // `difficulty` chỉ là giá trị mặc định của parser. Trả về null để màn sửa
    // bắt chọn, thay vì im lặng nhận "dễ" cho cả đề.
    difficulty: q.difficultyFromCode ? q.difficulty : null,
    content: q.content ?? "",
    options: (q.options ?? []).map((o) => ({
      content: o.content,
      isCorrect: o.isCorrect,
    })),
    subQuestions: (q.subQuestions ?? []).map((s) => ({
      statement: s.statement,
      correctAnswer: s.correctAnswer,
    })),
    acceptedAnswers: q.acceptedAnswers ?? [],
    explanation: q.explanation ?? "",
    chuyenDeCode: q.chuyenDeCode ?? null,
    rawCode: q.rawCode ?? null,
    chuyenDeId: null,
    chuyenDeMatch: null,
    bloomLevel: null,
    sourceFormat: "ma-de",
    parserWarnings: q.warnings ?? [],
  };
}

/**
 * Khuôn TỔNG QUÁT (đề giáo viên tự soạn) → dạng chung.
 *
 * Khác hai khuôn kia ở chỗ hầu hết trường đều có thể thiếu: đề thật thường
 * không đánh dấu đáp án đúng và không ghi mức độ. Để `null` đúng chỗ để màn
 * sửa bắt bổ sung, thay vì điền đại.
 */
export function draftFromGeneric(
  q: import("./parse-generic").GenericQuestion,
  index: number,
): DraftQuestion {
  const correct = q.options.filter((o) => o.isCorrect).length;
  return {
    id: nextId(),
    index,
    // Thứ tự ưu tiên: nhãn dạng câu người soạn ghi thẳng ra → chữ LOẠI trong
    // mã YCCĐ → đếm phương án.
    //
    // Nhãn `[TN]`/`[DS]`/`[TLN]`/`[TL]` đứng trước vì nó là ý ĐỊNH của người
    // soạn, viết riêng cho việc này. Mã YCCĐ đứng sau nhưng vẫn trên việc
    // đếm, vì câu Đúng/Sai và trả lời ngắn không có A/B/C/D nào để đếm —
    // dựa vào phương án thì đúng những câu đó ra "chưa nhận ra dạng" dù đề
    // đã ghi rõ loại.
    //
    // Riêng chữ D của mã YCCĐ vẫn để việc đếm quyết định giữa một/nhiều đáp
    // án, vì mã chỉ nói "trắc nghiệm" chứ không nói mấy đáp án đúng. Nhãn
    // thì phân biệt được: TN một đáp án, TNN nhiều đáp án.
    type:
      q.typeTag ??
      (q.typeLetter === "F"
        ? "multi-tf"
        : q.typeLetter === "S"
          ? "short-answer"
          : q.typeLetter === "E"
            ? "essay"
            : q.options.length >= 2
              ? correct > 1
                ? "mcq-multi"
                : "mcq-single"
              : q.typeLetter === "D"
                ? "mcq-single"
                : null),
    difficulty: q.difficulty,
    content: q.content,
    options: q.options.map((o) => ({ content: o.content, isCorrect: o.isCorrect })),
    subQuestions: q.subQuestions ?? [],
    acceptedAnswers: q.acceptedAnswers ?? [],
    explanation: q.explanation,
    chuyenDeCode: q.chuyenDeCode,
    rawCode: q.rawCode,
    chuyenDeId: null,
    chuyenDeMatch: null,
    bloomLevel: null,
    sourceFormat: "generic",
    parserWarnings: q.warnings,
  };
}
