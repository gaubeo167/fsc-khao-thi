/**
 * Nhận dạng khuôn của file Word đã tải lên.
 *
 * Vì sao có file này: trước đây giáo viên phải tự chọn đúng nút ("Import từ
 * Word" hay "Upload đề theo mã") trước khi biết hệ thống đọc được file hay
 * không. Chọn sai thì được báo "sai mẫu, bấm nút kia". Cả hai parser đều phải
 * mang theo đoạn code dò khuôn của bên kia chỉ để in ra câu đó — tức là hệ
 * thống VẪN nhận ra được khuôn, chỉ là nhận ra xong rồi bắt người dùng đi
 * bấm lại. File này lật ngược: nhận ra thì dùng luôn.
 *
 * Chấm điểm chứ không dùng if-else theo thứ tự: một file có thể lẫn dấu vết
 * của cả hai khuôn (mã đề dán trong file soạn theo mẫu FSC chẳng hạn), và ai
 * NHIỀU bằng chứng hơn thì thắng, thay vì ai được kiểm tra trước thì thắng.
 */

import type { ImportFormat } from "./import-draft";

export interface FormatEvidence {
  format: ImportFormat;
  /** Số dòng khớp dấu hiệu đặc trưng của khuôn. */
  hits: number;
  /** Câu giải thích hiện cho người dùng khi cần. */
  reason: string;
}

export interface DetectResult {
  /** `null` = không khuôn nào có bằng chứng. */
  format: ImportFormat | null;
  evidence: FormatEvidence[];
}

/** `[SI10.02.2.D05.a] …` — dòng mở đầu câu của khuôn "mã đề". */
const MA_DE_RE = /^\s*\[\s*[A-Za-z]+\d+(?:\.\d+)+\.[DFSEdfse]\d+(?:\.[abcABC])?\s*\]/;

/** `# Câu 1`, `=== CÂU 1 ===`, `Câu 1`, `Câu 1:` — mở đầu câu khuôn FSC. */
const FSC_HEADER_RE =
  /^\s*(?:#\s*)?Câu\s*\d+\b\s*[:.\-]?\s*$|^\s*={2,}\s*CÂU\s*\d+\s*={2,}/i;

/** `Dạng: MCQ-SINGLE` — dòng khai báo siêu dữ liệu của khuôn FSC. */
const FSC_META_RE = /^\s*(Dạng|Độ khó|Đáp án|Giải thích)\s*:/i;

export function detectImportFormat(text: string): DetectResult {
  const lines = text.split(/\r?\n/);

  let maDe = 0;
  let fscHeader = 0;
  let fscMeta = 0;
  for (const line of lines) {
    if (MA_DE_RE.test(line)) maDe += 1;
    else if (FSC_HEADER_RE.test(line)) fscHeader += 1;
    else if (FSC_META_RE.test(line)) fscMeta += 1;
  }

  // Dòng `Dạng:` một mình không đủ để kết luận — nó chỉ cộng thêm sức nặng
  // cho các dòng mở đầu câu đã tìm thấy. Một file chỉ toàn `Đáp án:` mà không
  // có `Câu N` thì không phải khuôn FSC, và đoán bừa là hỏng cả file.
  const fsc = fscHeader > 0 ? fscHeader + Math.min(fscMeta, fscHeader) : 0;

  const evidence: FormatEvidence[] = [
    {
      format: "ma-de" as const,
      hits: maDe,
      reason: `${maDe} dòng mở đầu bằng mã chuyên đề dạng [SI10.02.2.D05]`,
    },
    {
      format: "fsc" as const,
      hits: fsc,
      reason: `${fscHeader} dòng "Câu N"${fscMeta > 0 ? ` + ${fscMeta} dòng khai báo (Dạng/Độ khó/Đáp án)` : ""}`,
    },
  ].sort((a, b) => b.hits - a.hits);

  return {
    format: evidence[0].hits > 0 ? evidence[0].format : null,
    evidence,
  };
}

export const FORMAT_LABEL: Record<ImportFormat, string> = {
  fsc: "Đề soạn theo mẫu FSC",
  "ma-de": "Đề theo mã chuyên đề",
};
