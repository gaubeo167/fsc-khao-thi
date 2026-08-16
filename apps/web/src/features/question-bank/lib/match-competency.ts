/**
 * Khớp mã trong đề với đúng một YCCĐ (lá) của khung năng lực.
 *
 * ── Vì sao cần file riêng ──────────────────────────────────────────────
 *
 * Trước đây màn nhập đề khớp mã bằng cách CẮT phần đuôi rồi tra chủ điểm:
 *
 *     [SI10.02.12.E02]  →  cắt ".E02"  →  tra "SI10.02.12"  →  khớp CHỦ ĐIỂM
 *
 * Khớp như vậy luôn "thành công" nên nhìn qua tưởng chạy đúng, nhưng sai ở
 * hai chỗ và cả hai đều lặng lẽ:
 *
 *   1. `competencyIds` của câu hỏi trỏ vào node CHỦ ĐIỂM chứ không phải YCCĐ.
 *      Ô chọn YCCĐ chỉ liệt kê node lá, nên node đang gắn không nằm trong
 *      danh sách — người dùng thấy ô "trỏ sai chỗ" mà không sửa được.
 *   2. Chỉ node lá mới mang `bloomLevel`. Dừng ở chủ điểm là mất luôn mức
 *      độ, nên toàn bộ 21 câu ra "chưa chọn mức độ" dù đề đã ghi đủ mã.
 *
 * ── Chữ cái trong mã ───────────────────────────────────────────────────
 *
 * Khung năng lực đánh mã lá bằng chữ `D`: SI10.02.12.D01 … D08. Còn đề thi
 * thay chữ đó theo HÌNH THỨC hỏi (đọc từ file SHOC 10, 21 câu, đủ 4 phần):
 *
 *     Phần I  trắc nghiệm    D      Phần III trả lời ngắn  S
 *     Phần II đúng/sai       F      Phần B   tự luận       E
 *
 * Bằng chứng số ĐẰNG SAU chữ là số chỉ báo chứ không phải số thứ tự câu:
 * `SI10.02.12.S05` xuất hiện ở HAI câu khác nhau, và cùng chủ điểm .12 có cả
 * `D05` lẫn `S05` — cùng một chỉ báo 05, hỏi bằng hai hình thức.
 *
 * Nên thứ tự tra là: mã đầy đủ trước, rồi tới "cùng chủ điểm + cùng số chỉ
 * báo, khác chữ". Cách hai chỉ nhận khi có ĐÚNG MỘT ứng viên — nhiều ứng
 * viên nghĩa là khung thật sự có nhiều lá cùng số, đoán bừa là gắn sai chuẩn
 * đầu ra cho câu hỏi và không ai phát hiện.
 */

export type CompetencyMatchVia = "ma-day-du" | "so-chi-bao";

export interface OutcomeLite {
  id: string;
  code?: string | null;
  bloomLevel?: number | null;
  title: string;
}

export interface OutcomeMatch {
  id: string;
  code: string;
  title: string;
  bloomLevel: number | null;
  via: CompetencyMatchVia;
}

export interface OutcomeIndex {
  byCode: Map<string, OutcomeLite & { code: string }>;
  byTopicSeq: Map<string, Array<OutcomeLite & { code: string }>>;
}

interface CodeParts {
  /** Chủ điểm đã chuẩn hoá, vd "SI10.2.12". */
  topic: string;
  /** Chữ hình thức/chỉ báo, vd "D". `null` khi mã dừng ở chủ điểm. */
  letter: string | null;
  /** Số chỉ báo đã bỏ số 0 đứng đầu, vd "5". `null` khi dừng ở chủ điểm. */
  seq: string | null;
}

const INDICATOR_SEG = /^([A-Z])(\d+)$/;
const NUM_SEG = /^\d+$/;
/** Đuôi độ khó tuỳ chọn của khuôn mã đề: `[SI10.02.2.D05.a]`. */
const DIFF_SUFFIX = /^[A-Z]$/;

/**
 * Tách mã thành chủ điểm + chỉ báo, bỏ số 0 đứng đầu ở các đoạn số.
 *
 * Bỏ số 0 vì đề và khung không thống nhất: khung ghi `SI10.02.9`, đề có thể
 * ghi `SI10.02.09`. Đoạn ĐẦU giữ nguyên — đó là mã môn (`SI10`), cắt số 0
 * hay đụng vào là hỏng (`T10` thành `T1`).
 */
export function splitCode(raw: string): CodeParts | null {
  const parts = raw.trim().toUpperCase().split(".").filter(Boolean);
  if (parts.length < 2) return null;

  // Đuôi độ khó `.a/.b/.c` là siêu dữ liệu, không thuộc mã.
  if (DIFF_SUFFIX.test(parts[parts.length - 1]!)) parts.pop();
  if (parts.length < 2) return null;

  let letter: string | null = null;
  let seq: string | null = null;
  const ind = INDICATOR_SEG.exec(parts[parts.length - 1]!);
  if (ind) {
    letter = ind[1]!;
    seq = String(Number(ind[2]));
    parts.pop();
  }

  const topic = [
    parts[0]!,
    ...parts.slice(1).map((s) => (NUM_SEG.test(s) ? String(Number(s)) : s)),
  ].join(".");
  return { topic, letter, seq };
}

/** Mã đã chuẩn hoá để so sánh — `SI10.02.09.D05` và `SI10.2.9.D5` bằng nhau. */
function canonical(p: CodeParts): string {
  return p.letter ? `${p.topic}.${p.letter}${p.seq}` : p.topic;
}

/** Chủ điểm của một mã, hoặc `null` nếu mã không đọc được. */
export function topicOfCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return splitCode(raw)?.topic ?? null;
}

/**
 * Dựng chỉ mục tra cứu. CHỈ nhận node lá — node chương/chủ đề/chủ điểm lọt
 * vào đây là quay lại đúng lỗi cũ.
 */
export function buildOutcomeIndex(outcomes: OutcomeLite[]): OutcomeIndex {
  const byCode = new Map<string, OutcomeLite & { code: string }>();
  const byTopicSeq = new Map<string, Array<OutcomeLite & { code: string }>>();
  for (const o of outcomes) {
    if (!o.code) continue;
    const p = splitCode(o.code);
    if (!p) continue;
    const node = { ...o, code: o.code };
    byCode.set(canonical(p), node);
    if (p.seq != null) {
      const key = `${p.topic}|${p.seq}`;
      const list = byTopicSeq.get(key);
      if (list) list.push(node);
      else byTopicSeq.set(key, [node]);
    }
  }
  return { byCode, byTopicSeq };
}

/**
 * Tìm YCCĐ cho một mã đọc từ đề. Trả `null` khi không chắc — màn sửa sẽ bắt
 * người dùng chọn tay, tốt hơn nhiều so với gắn đại một node gần đúng.
 */
export function matchOutcome(
  rawCode: string | null | undefined,
  index: OutcomeIndex,
): OutcomeMatch | null {
  if (!rawCode) return null;
  const p = splitCode(rawCode);
  if (!p) return null;

  const exact = index.byCode.get(canonical(p));
  if (exact) {
    return {
      id: exact.id,
      code: exact.code,
      title: exact.title,
      bloomLevel: exact.bloomLevel ?? null,
      via: "ma-day-du",
    };
  }

  // Đề ghi chữ theo hình thức hỏi (E/F/S), khung đánh mã bằng D. Cùng chủ
  // điểm + cùng số chỉ báo là cùng một YCCĐ.
  if (p.seq != null) {
    const cands = index.byTopicSeq.get(`${p.topic}|${p.seq}`) ?? [];
    if (cands.length === 1) {
      const hit = cands[0]!;
      return {
        id: hit.id,
        code: hit.code,
        title: hit.title,
        bloomLevel: hit.bloomLevel ?? null,
        via: "so-chi-bao",
      };
    }
  }
  return null;
}
