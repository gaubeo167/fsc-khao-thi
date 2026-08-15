#!/usr/bin/env node
/**
 * Test hồi quy cho ĐƯỜNG DỮ LIỆU THỜI GIAN THỰC của phòng giám sát.
 *
 * Chạy:  node scripts/test-monitoring-live.mjs
 *
 * Vì sao có file này: hai bản vá riêng lẻ, mỗi bản làm chết một nửa màn hình
 * giám sát, và cả hai đều hỏng IM LẶNG (không log, không lỗi, build xanh):
 *
 *   1. `65f2b23 fix(attempts): don't clobber in-progress essays` — để chống
 *      snapshot Firestore nuốt chữ đang gõ, `_applySnapshot` giữ `answers`
 *      cục bộ cho MỌI bài `submittedAt == null`. Trên máy giám thị thì mọi
 *      bài của mọi HS đều chưa nộp → snapshot bị vứt `answers`, tiến độ
 *      đứng im ở con số lúc mở trang.
 *
 *   2. `06bd23f fix(bảo mật): khoá bằng chứng chống gian lận` — chuyển ghi
 *      vi phạm sang server, nhưng route chỉ nhận `kind` số ít
 *      ("tabSwitch") còn client gửi tên trường số nhiều ("tabSwitches").
 *      Mọi lần ghi bị trả 400; `fetch` không ném lỗi ở 4xx nên client nuốt
 *      luôn. Vi phạm chỉ tăng trong máy HS, giám thị không thấy gì.
 *
 * Các ca dưới khoá lại đúng hai lỗi đó, cộng hai bẫy đi kèm: nhãn vi phạm
 * phải tra được bằng khoá đã lưu, và thoát fullscreen LÚC NỘP BÀI không
 * được tính là vi phạm.
 */
import { readFileSync } from "node:fs";

let pass = 0,
  fail = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${name}${ok || !extra ? "" : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const STORE = "apps/web/src/features/shift-exam/state/attempts-store.ts";
const ROUTE = "apps/web/src/app/api/exam/[shiftId]/violation/route.ts";
const MONITOR =
  "apps/web/src/app/(authenticated)/admin/shifts/[id]/monitor/page.tsx";
const RUNTIME = "apps/web/src/features/shift-exam/components/exam-runtime.tsx";

const store = read(STORE);
const route = read(ROUTE);
const monitor = read(MONITOR);
const runtime = read(RUNTIME);

/* ───────── 1. Tiến độ HS phải chảy về máy giám thị ───────── */

check(
  "_applySnapshot chỉ giữ answers cục bộ cho bài CHÍNH tab này đang gõ",
  /locallyEdited\.has\(row\.id\)/.test(store),
  "thiếu điều kiện locallyEdited → mọi bài chưa nộp bị giữ bản cũ, giám thị thấy tiến độ đứng im",
);

check(
  "điều kiện cũ 'mọi bài chưa nộp' đã bị gỡ",
  !/if \(local && local\.submittedAt == null\) \{/.test(store),
  "vẫn còn nhánh giữ bản cục bộ cho mọi bài chưa nộp",
);

// Chỉ xét phần CÀI ĐẶT trong create(...), bỏ qua khai báo trong `interface
// Actions` vốn cũng khớp tên hàm.
const impl = store.slice(store.indexOf("export const useAttemptsStore"));
for (const fn of ["startOrResume", "saveAnswer", "toggleMark"]) {
  // Mỗi hàm HS dùng để sửa bài phải tự đánh dấu quyền sở hữu, nếu không
  // chính bài của HS lại bị snapshot nuốt chữ — đúng lỗi mà 65f2b23 đã vá.
  const body = impl.slice(impl.indexOf(`${fn}(`));
  check(
    `${fn} đánh dấu bài vào locallyEdited`,
    /locallyEdited\.add\(/.test(body.slice(0, 900)),
    "không đánh dấu → mất chữ đang gõ khi snapshot về",
  );
}

// Mất bài khi F5 giữa giờ thi: lúc tải lại, store rỗng và effect khởi tạo
// chạy TRƯỚC khi snapshot về, nên `startOrResume` dựng một bản rỗng. Nếu
// merge thay CẢ CỤM `answers` thì bản rỗng đó đè lên dữ liệu server và HS
// mất sạch bài. Gộp theo từng câu mới giữ được cả hai chiều.
check(
  "answers gộp theo từng câu, không thay cả cụm",
  /answers: \{ \.\.\.row\.answers, \.\.\.local\.answers \}/.test(store),
  "thay cả cụm = HS bấm F5 giữa giờ thi là mất sạch bài đang làm",
);
check(
  "markedForReview hợp nhất, không thay cả cụm",
  /markedForReview: Array\.from\(\s*new Set\(/.test(store),
  "thay cả cụm = mất các câu HS đã đánh dấu xem lại",
);
check(
  "không còn nhánh trả thẳng local.answers",
  !/answers: local\.answers,/.test(store),
  "còn nhánh cũ nghĩa là vẫn đè mất dữ liệu server",
);

check(
  "hàng cục bộ mồ côi chỉ được giữ nếu là bài của chính tab này",
  /!seen\.has\(a\.id\) && a\.submittedAt == null && locallyEdited\.has\(a\.id\)/.test(
    store,
  ),
  "hàng cũ trên máy giám thị sẽ sống mãi kể cả khi bài đã bị xoá",
);

/* ───────── 2. Hợp đồng ghi vi phạm client ↔ server ───────── */

// Tên `kind` mà client THỰC SỰ gửi đi = literal của type ViolationKind.
const kindLine = store.match(/export type ViolationKind =([^;]+);/);
check("đọc được ViolationKind từ store", kindLine != null);
const clientKinds = [...(kindLine?.[1] ?? "").matchAll(/"([^"]+)"/g)].map(
  (m) => m[1],
);
check(
  "ViolationKind có đủ 3 loại",
  clientKinds.length === 3,
  `thấy ${JSON.stringify(clientKinds)}`,
);

// Khoá mà route chấp nhận.
const kindsBlock = route.slice(route.indexOf("const KINDS"), route.indexOf("} as const"));
for (const k of clientKinds) {
  check(
    `route nhận kind "${k}" client gửi lên`,
    new RegExp(`(^|[\\s{])${k}\\s*:`, "m").test(kindsBlock),
    "route trả 400 bad_kind → vi phạm không bao giờ ghi được, và fetch không ném lỗi nên hỏng im lặng",
  );
}

check(
  "route LƯU kind đã chuẩn hoá, không lưu kind thô của request",
  /recentEvents: \[\.\.\.events, \{ kind: canonical, at \}\]/.test(route),
  "lưu 'tabSwitch' thì màn giám sát tra VIOLATION_LABEL ra undefined",
);

// Nhãn trên màn giám sát phải tra được bằng đúng khoá đã lưu.
const labelBlock = monitor.slice(
  monitor.indexOf("const VIOLATION_LABEL"),
  monitor.indexOf("const VIOLATION_ICON"),
);
for (const k of clientKinds) {
  check(
    `VIOLATION_LABEL có nhãn cho "${k}"`,
    new RegExp(`(^|[\\s{])${k}\\s*:`, "m").test(labelBlock),
    "dòng sự kiện hiện nhãn rỗng",
  );
}

check(
  "client kiểm tra res.ok khi ghi vi phạm",
  /if \(!res\.ok && res\.status !== 409\)/.test(store),
  "fetch không ném lỗi ở 4xx — không kiểm tra thì đổi hợp đồng route sẽ lại hỏng im lặng",
);

/* ───────── 3. Thoát fullscreen lúc nộp bài không phải vi phạm ───────── */

const fsBlock = runtime.slice(
  runtime.indexOf("function onFsChange"),
  runtime.indexOf("document.addEventListener(\"fullscreenchange\""),
);
check(
  "onFsChange bỏ qua khi bài đã nộp",
  /submittedAt != null\) return/.test(fsBlock),
  "handleSubmit gọi exitFullscreen() → ghi một vi phạm ma ngay lúc nộp bài",
);

const leaveBlock = runtime.slice(
  runtime.indexOf("function leave()"),
  runtime.indexOf("function onVisibility()"),
);
check(
  "rời tab sau khi đã nộp không tính vi phạm",
  /submittedAt != null\) return/.test(leaveBlock),
  "HS nộp xong rời trang vẫn bị ghi vi phạm",
);

/* ───────── 4. Tự nộp bài khi vượt hạn mức thoát fullscreen ───────── */

const TYPES = "apps/web/src/features/exam-shifts/data/types.ts";
const RESULT =
  "apps/web/src/app/(authenticated)/exam/[shiftId]/result/page.tsx";
const types = read(TYPES);
const result = read(RESULT);

check(
  "fullscreenExitLimit là tuỳ chọn (ca thi cũ không có trường này)",
  /fullscreenExitLimit\?: number/.test(types),
  "để bắt buộc thì ca thi đã lên lịch từ trước sẽ vỡ kiểu / bật tự nộp ngoài ý muốn",
);

check(
  "ca thi cũ không có hạn mức được đọc là 0 = không tự nộp",
  /fullscreenExitLimit \?\? 0/.test(runtime),
  "fallback khác 0 sẽ bật tự nộp cho ca thi giáo viên chưa từng đồng ý",
);

const autoBlock = runtime.slice(
  runtime.indexOf("Tự nộp bài khi vượt hạn mức"),
  runtime.indexOf("}, [hasStarted, submitted, fsExits, fsExitLimit]);"),
);
check("có nhánh tự nộp theo hạn mức", autoBlock.length > 0);
check(
  "hạn mức 0 thì thoát sớm, không bao giờ tự nộp",
  /fsExitLimit <= 0\) return/.test(autoBlock),
  "đặt 'Không tự nộp' mà vẫn bị nộp",
);
check(
  "chưa đủ hạn mức thì không nộp",
  /fsExits < fsExitLimit\) return/.test(autoBlock),
  "nộp sớm hơn hạn mức giáo viên đặt",
);
check(
  "bài đã nộp thì không nộp lại",
  /!hasStarted \|\| submitted\) return/.test(autoBlock),
  "gọi submit chồng lên bài đã nộp",
);
check(
  "chỉ áp dụng khi ca thi bắt buộc fullscreen",
  /requireFullscreen\) return/.test(autoBlock),
  "ca không bắt buộc fullscreen mà vẫn tự nộp",
);

check(
  "đếm lấy từ violations của bài làm (server cộng dồn), không phải biến cục bộ",
  /liveAttempt\?\.violations\.fullscreenExits \?\? 0/.test(runtime),
  "biến cục bộ bị devtools sửa hoặc F5 reset → thoát được chính sách",
);

check(
  "HS được cảnh báo số lần còn lại TRƯỚC khi mất bài",
  /fsExitsLeft/.test(runtime) &&
    /NỘP NGAY LẬP TỨC/.test(runtime),
  "lần cuối chỉ là một cú Esc rồi bài biến mất không báo trước",
);

// Ctrl+Tab trong Chrome làm rớt fullscreen CÙNG LÚC với ẩn tab, nên cả hai
// cờ cùng bật. Nếu màn chặn kiểm `fullscreenLost` trước thì HS chuyển tab
// lại đọc lời nhắn về fullscreen, không hề nhắc chuyển tab — trông y như
// chuyển tab chẳng bị xử lý gì.
const overlayBlock = runtime.slice(
  runtime.indexOf("Gọi ĐÚNG TÊN việc HS vừa làm"),
  runtime.indexOf("Vi phạm đã được ghi lại"),
);
// Khoá ĐÚNG thẻ <h3>. Trước đây ca này quét cả khối nên vẫn xanh khi tiêu đề
// bị đổi về fullscreen — vì `{tabAway` còn xuất hiện ở đoạn văn bên dưới.
const h3 = overlayBlock.slice(
  overlayBlock.indexOf("<h3"),
  overlayBlock.indexOf("</h3>"),
);
check(
  "TIÊU ĐỀ màn chặn gọi tên chuyển tab TRƯỚC fullscreen",
  h3.length > 0 && /\{tabAway/.test(h3) && !/\{fullscreenLost/.test(h3),
  "HS chuyển tab mà tiêu đề chỉ nói fullscreen = tưởng chuyển tab không bị xử lý",
);
check(
  "khi dính cả hai thì nhắc luôn cả fullscreen",
  /tabAway && fullscreenLost/.test(overlayBlock),
  "mất thông tin: HS không biết mình vi phạm mấy lỗi",
);

check(
  "luật mất-bài được nói ở màn hình trước khi bắt đầu",
  /autoSubmitOnExit/.test(runtime),
  "HS chỉ biết luật lúc nó đã kích hoạt = cái bẫy, không phải quy chế",
);

check(
  "trang kết quả giải thích vì sao bài bị nộp tự động",
  /Bài thi đã được nộp tự động/.test(result),
  "HS không hiểu vì sao mất bài, giám thị cũng không có gì để trả lời",
);

check(
  "lưới bật/tắt anti-cheat chỉ nhận khoá boolean",
  /BooleanAntiCheatKey/.test(read("apps/web/src/features/exam-shifts/dialogs/shift-wizard.tsx")),
  "thêm tuỳ chọn không phải boolean sẽ render ra ô tick câm",
);

/* ───────── 5. Không có cờ anti-cheat giả ───────── */

// `requireWebcam` / `faceDetection` từng là cờ bật được trong wizard, hiện
// dòng "Yêu cầu webcam" cho HS, nhưng không có getUserMedia hay nhận diện
// khuôn mặt ở đâu cả. Giáo viên bật rồi tưởng đang giám sát camera. Nguy
// hiểm hơn cả không có tính năng. Ca này chặn nó quay lại.
const wizard = read("apps/web/src/features/exam-shifts/dialogs/shift-wizard.tsx");
const seed = read("apps/web/src/features/exam-shifts/data/seed-shifts.ts");
for (const [label, src] of [
  ["AntiCheatConfig", types.slice(types.indexOf("export interface AntiCheatConfig"))],
  ["wizard", wizard],
  ["exam-runtime", runtime],
  ["seed-shifts", seed],
]) {
  check(
    `${label} không còn cờ webcam/nhận diện khuôn mặt`,
    !/\brequireWebcam\b\s*[:.]|\bfaceDetection\b\s*[:.]/.test(src),
    "cờ bật được nhưng không có code cưỡng chế = giáo viên tưởng đang giám sát camera",
  );
}

/* ───────── 6. Rules of Hooks ở trang giám sát ───────── */

// Mọi useMemo phải đứng TRƯỚC câu return đầu tiên, nếu không React ném
// "Rendered more hooks than during the previous render" đúng lúc store
// hydrate xong — tức đường tải Firestore bình thường.
const body = monitor.slice(monitor.indexOf("export default function MonitorPage"));
const firstReturn = body.search(/\n {2}(?:if \([^\n]*\) )?return /);
const lastMemo = body.lastIndexOf("useMemo(");
check(
  "mọi useMemo của MonitorPage nằm trước return sớm đầu tiên",
  firstReturn > 0 && lastMemo > 0 && lastMemo < firstReturn,
  `useMemo cuối ở ${lastMemo}, return sớm đầu tiên ở ${firstReturn}`,
);

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
