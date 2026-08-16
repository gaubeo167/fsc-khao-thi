/**
 * Nhờ AI dựng lại CÔNG THỨC bị vỡ khi rút chữ từ PDF.
 *
 * ── Vấn đề ──────────────────────────────────────────────────────────────
 *
 * PDF không lưu công thức như một đối tượng. Phân số là hai dòng chữ nằm
 * chồng lên nhau cộng một nét gạch ngang; luỹ thừa là một chữ nhỏ đặt cao
 * hơn. Rút chữ ra thì được đúng những mảnh đó, đúng thứ tự đọc từ trên xuống:
 *
 *     Find the value of the following expression
 *     (1 + 1
 *     3 + 1
 *
 * Không quy tắc nào ghép lại được — thông tin "chữ này nằm trên gạch, chữ
 * kia nằm dưới" đã mất từ lúc rút. Word thì khác: công thức là một khối
 * OMath, đổi thẳng sang LaTeX được (xem `omath-to-latex.ts`).
 *
 * ── Cách làm ────────────────────────────────────────────────────────────
 *
 * AI ở đây KHÔNG soạn câu hỏi và KHÔNG tách câu. Nó chỉ làm đúng một việc:
 * nhận văn bản vỡ, trả lại văn bản đó với các công thức được gộp thành
 * `$LaTeX$`. Toàn bộ phần nhận dạng khuôn đề, cắt câu, đọc phương án, đọc
 * đáp án vẫn do parser thường làm.
 *
 * Vì sao hẹp như vậy: để AI dựng cả câu hỏi thì mỗi lần sai là một câu sai
 * lặng lẽ vào ngân hàng, không ai đối chiếu. Giới hạn ở việc gộp công thức
 * thì phần sai nhiều nhất cũng chỉ là một công thức hiện chưa đúng — người
 * soạn nhìn thấy ngay ở màn kiểm tra, vì công thức hiện thành thẻ bấm được.
 */

import { aiComplete, AiProviderError } from "@/lib/ai/provider";

/** Cắt nhỏ để không vượt giới hạn ngữ cảnh, và để một lần hỏng không mất cả file. */
const CHUNK_CHARS = 6000;
/** Trần số lần gọi cho một file. Đề dài quá thì phần sau giữ nguyên văn bản gốc. */
const MAX_CHUNKS = 10;

const SYSTEM = `Bạn là bộ dọn văn bản rút từ file PDF đề thi.

NHIỆM VỤ DUY NHẤT: gộp lại những công thức toán bị vỡ thành nhiều dòng và viết chúng dưới dạng LaTeX đặt giữa hai dấu $.

LUẬT BẮT BUỘC:
1. KHÔNG thêm nội dung. KHÔNG bớt nội dung. KHÔNG dịch. KHÔNG diễn giải lại.
2. KHÔNG giải bài. KHÔNG thêm đáp án. KHÔNG sửa lỗi chính tả.
3. Giữ NGUYÊN mọi dòng không chứa công thức, từng ký tự một.
4. Giữ NGUYÊN các mốc đầu dòng: "Câu 1.", "1.", "A.", "a)", "[SI10.01.1.D01]".
5. Chỉ gộp dòng khi chắc chắn chúng là MỘT công thức bị PDF cắt rời. Không chắc thì để nguyên.
6. Phân số viết \\frac{tử}{mẫu}. Luỹ thừa viết ^{...}. Chỉ số dưới viết _{...}. Căn viết \\sqrt{...}.
7. Trả về DUY NHẤT văn bản đã dọn. Không lời mở đầu, không giải thích, không bọc trong khối mã.`;

export interface AiFormulaResult {
  text: string;
  /** Số đoạn đã nhờ AI dọn thành công. */
  repaired: number;
  /** Số đoạn AI trả về kết quả không dùng được → giữ nguyên bản gốc. */
  skipped: number;
  provider: string | null;
}

/**
 * Dọn công thức trong toàn bộ văn bản.
 *
 * KHÔNG bao giờ ném lỗi vì AI: hỏng thì trả lại văn bản gốc kèm số đoạn bị
 * bỏ qua. Nhập đề là việc chính, dọn công thức là việc thêm — để việc thêm
 * làm chết việc chính là đánh đổi sai.
 */
export async function repairFormulas(text: string): Promise<AiFormulaResult> {
  const chunks = splitChunks(text, CHUNK_CHARS);
  let repaired = 0;
  let skipped = 0;
  let provider: string | null = null;
  const out: string[] = [];

  for (const [i, chunk] of chunks.entries()) {
    if (i >= MAX_CHUNKS) {
      out.push(chunk);
      skipped += 1;
      continue;
    }
    try {
      const res = await aiComplete({
        system: SYSTEM,
        user: [{ type: "text", text: chunk }],
        maxTokens: 8000,
      });
      provider = res.provider;
      const cleaned = stripFence(res.text);
      if (isPlausible(chunk, cleaned)) {
        out.push(cleaned);
        repaired += 1;
      } else {
        // AI trả về thứ lệch quá xa bản gốc — nhiều khả năng nó đã tóm tắt
        // hoặc dịch. Giữ bản gốc: đề đọc thiếu công thức vẫn hơn đề bị viết
        // lại bằng chữ của máy.
        out.push(chunk);
        skipped += 1;
      }
    } catch (err) {
      if (err instanceof AiProviderError && (err.status === 401 || err.status === 403)) {
        throw err; // Sai key thì phải báo, không im lặng bỏ qua.
      }
      out.push(chunk);
      skipped += 1;
    }
  }

  return { text: out.join("\n"), repaired, skipped, provider };
}

/** Cắt theo RANH GIỚI DÒNG, không cắt giữa dòng — cắt giữa dòng là chẻ đôi câu. */
function splitChunks(text: string, size: number): string[] {
  const lines = text.split("\n");
  const chunks: string[] = [];
  let cur: string[] = [];
  let len = 0;
  for (const line of lines) {
    if (len + line.length > size && cur.length > 0) {
      chunks.push(cur.join("\n"));
      cur = [];
      len = 0;
    }
    cur.push(line);
    len += line.length + 1;
  }
  if (cur.length > 0) chunks.push(cur.join("\n"));
  return chunks;
}

/** Bỏ khối ```…``` nếu model vẫn bọc dù đã dặn đừng. */
function stripFence(s: string): string {
  const m = /^\s*```[a-z]*\n([\s\S]*?)\n?```\s*$/i.exec(s);
  return (m ? m[1]! : s).trim();
}

/**
 * Bản AI trả về có còn là văn bản gốc hay không.
 *
 * Hai chốt, cùng nhằm bắt lỗi "AI tóm tắt / viết lại" chứ không bắt lỗi nhỏ:
 *
 *   · Độ dài không được co lại dưới 60% — tóm tắt luôn ngắn đi nhiều.
 *   · Mọi MỐC CÂU của bản gốc phải còn đủ — mất mốc là mất câu, và mất câu
 *     thì không ai đếm lại.
 */
export function isPlausible(before: string, after: string): boolean {
  if (!after.trim()) return false;
  const a = before.replace(/\s+/g, "").length;
  const b = after.replace(/\s+/g, "").length;
  if (b < a * 0.6) return false;

  const want = questionMarkers(before);
  if (want.length === 0) return true;
  const have = new Set(questionMarkers(after));
  return want.every((m) => have.has(m));
}

const MARKER_RE = /^\s*(?:(C[âa]u)\s*(\d+)|(\d{1,3}))\s*[.):]/imu;

/**
 * Mốc mở đầu câu hỏi trong một văn bản.
 *
 * Chỗ tinh tế: mảnh công thức bị vỡ TRÔNG GIỐNG mốc số. Phân số
 *
 *     (1 + 1
 *     3 + 1
 *     9)
 *
 * có dòng "9)" khớp y hệt khuôn "số + dấu đóng". Mà gộp công thức lại thì
 * dòng đó biến mất — đúng như mong muốn. Nếu coi nó là mốc câu thì mọi lần
 * AI làm ĐÚNG việc đều bị chấm là làm mất câu, và tính năng không bao giờ
 * chạy.
 *
 * Nên mốc số trần chỉ được tính khi các số xếp thành DÃY TĂNG TỪ 1 — tức là
 * chúng thật sự đang đánh số câu, chứ không phải mảnh vỡ nằm lẫn. Cùng một
 * luật với `pickStrategy` bên parser, vì cùng một câu hỏi: dãy số này là
 * đánh số câu hay là số lẻ trong đề?
 */
function questionMarkers(text: string): string[] {
  const cau: string[] = [];
  const bare: number[] = [];
  const order: Array<{ kind: "cau" | "bare"; key: string; num: number }> = [];

  for (const line of text.split("\n")) {
    const m = MARKER_RE.exec(line);
    if (!m) continue;
    if (m[1]) {
      const key = `cau${m[2]}`;
      cau.push(key);
      order.push({ kind: "cau", key, num: Number(m[2]) });
    } else if (m[3]) {
      const num = Number(m[3]);
      bare.push(num);
      order.push({ kind: "bare", key: `so${num}`, num });
    }
  }

  // Đề đã có mốc "Câu N" thì số trần chỉ là đánh số trong đề — bỏ qua.
  if (cau.length > 0) return cau;

  const run = new Set<number>();
  let want = 1;
  for (const n of bare) {
    if (n === want) {
      run.add(n);
      want += 1;
    }
  }
  return order
    .filter((o) => o.kind === "bare" && run.has(o.num))
    .map((o) => o.key);
}
