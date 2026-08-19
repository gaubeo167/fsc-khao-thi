#!/usr/bin/env node
/**
 * Test hồi quy cho việc khớp mã trong đề với YCCĐ của khung năng lực
 * (apps/web/src/features/question-bank/lib/match-competency.ts) và cho bộ đọc
 * khung (apps/web/src/lib/toc/parse-framework.ts).
 *
 * Chạy:  node scripts/test-match-competency.mjs
 *
 * Vì sao có file này: bản trước "khớp" bằng cách cắt đuôi mã rồi tra chủ
 * điểm. Cách đó không bao giờ báo lỗi — nó luôn tìm ra một node — nên nhìn
 * giao diện tưởng chạy đúng, trong khi câu hỏi bị gắn vào node CHỦ ĐIỂM và cả
 * đề mất mức Bloom. Một lỗi im lặng như vậy chỉ có test khoá lại được.
 *
 * Mã trong các ca dưới lấy từ file thật `1. SHOC 10 DE CHINH THUC_da gan ID.docx`
 * (21 câu, đủ 4 phần) — file không nằm trong repo.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "fsc-yccd-"));
function bundle(src, name) {
  const out = join(dir, name);
  execFileSync(
    "npx",
    [
      "esbuild",
      src,
      "--bundle",
      "--format=esm",
      "--platform=node",
      "--alias:@=./src",
      `--outfile=${out}`,
    ],
    { cwd: "apps/web", stdio: "pipe" },
  );
  return out;
}
const { buildOutcomeIndex, matchOutcome, splitCode, topicOfCode } = await import(
  bundle("src/features/question-bank/lib/match-competency.ts", "m.mjs")
);
const { parseFrameworkText } = await import(
  bundle("src/lib/toc/parse-framework.ts", "f.mjs")
);

let pass = 0,
  fail = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${name}${ok || !extra ? "" : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};

/* ── Khung năng lực mẫu: lá đánh mã bằng chữ D, như khung mẫu của trường ── */
const KHUNG = [
  { id: "c-12-02", code: "SI10.02.12.D02", title: "Nêu được dấu hiệu ung thư", bloomLevel: 1 },
  { id: "c-12-05", code: "SI10.02.12.D05", title: "Tính được số tế bào con", bloomLevel: 3 },
  { id: "c-12-08", code: "SI10.02.12.D08", title: "Trình bày được quá trình liền vết thương", bloomLevel: 2 },
  { id: "c-13-03", code: "SI10.02.13.D03", title: "Nêu được nơi xảy ra giảm phân", bloomLevel: 1 },
  { id: "c-13-05", code: "SI10.02.13.D05", title: "Tính được số giao tử", bloomLevel: 3 },
  { id: "c-15-01", code: "SI10.02.15.D01", title: "Nêu được thành tựu công nghệ tế bào", bloomLevel: 1 },
  { id: "c-9-02", code: "SI10.02.9.D02", title: "Phân biệt được các hình thức truyền tin", bloomLevel: 2 },
];
const idx = buildOutcomeIndex(KHUNG);
const hit = (code) => matchOutcome(code, idx);

/* ── 1. Mã đầy đủ khớp đúng LÁ, không dừng ở chủ điểm ─────────────────── */
check("D08 khớp đúng lá SI10.02.12.D08", hit("SI10.02.12.D08")?.id === "c-12-08");
check("khớp bằng mã đầy đủ được đánh dấu 'ma-day-du'", hit("SI10.02.12.D08")?.via === "ma-day-du");
check("mang theo Bloom của lá (D08 → 2)", hit("SI10.02.12.D08")?.bloomLevel === 2);
check("mang theo nội dung YCCĐ", /liền vết thương/.test(hit("SI10.02.12.D08")?.title ?? ""));

/* ── 2. Đề đổi chữ theo hình thức hỏi; khung vẫn đánh chữ D ───────────── */
check("tự luận E02 → lá D02 cùng chủ điểm", hit("SI10.02.12.E02")?.id === "c-12-02");
check("khớp kiểu này được đánh dấu 'so-chi-bao'", hit("SI10.02.12.E02")?.via === "so-chi-bao");
check("trả lời ngắn S05 → lá D05", hit("SI10.02.12.S05")?.id === "c-12-05");
check("đúng/sai F02 → lá D02", hit("SI10.02.9.F02")?.id === "c-9-02");
check("S05 lấy đúng Bloom của D05 (=3)", hit("SI10.02.12.S05")?.bloomLevel === 3);
check(
  "cùng số chỉ báo nhưng KHÁC chủ điểm thì không lẫn sang nhau",
  hit("SI10.02.13.S05")?.id === "c-13-05",
);

/* ── 3. Không đoán bừa ────────────────────────────────────────────────── */
check("mã dừng ở chủ điểm thì KHÔNG khớp", hit("SI10.02.12") === null);
check("chủ điểm không có trong khung → null", hit("SI10.02.99.D01") === null);
check("số chỉ báo không có trong khung → null", hit("SI10.02.12.D77") === null);
check("mã rỗng / thiếu → null", hit(null) === null && hit("") === null && hit("SI10") === null);

const nhapNhang = buildOutcomeIndex([
  ...KHUNG,
  { id: "c-12-05-e", code: "SI10.02.12.E05", title: "Lá thứ hai cùng số 05", bloomLevel: 2 },
]);
check(
  "hai lá cùng số chỉ báo: mã đầy đủ vẫn khớp chính xác",
  matchOutcome("SI10.02.12.E05", nhapNhang)?.id === "c-12-05-e",
);
check(
  "hai lá cùng số chỉ báo: chữ lạ thì TỪ CHỐI đoán",
  matchOutcome("SI10.02.12.S05", nhapNhang) === null,
);

/* ── 4. Chuẩn hoá mã: số 0 đứng đầu, chữ hoa/thường, đuôi độ khó ──────── */
check("số 0 đứng đầu: SI10.02.09.D02 = SI10.02.9.D02", hit("SI10.02.09.D02")?.id === "c-9-02");
check("số 0 ở chỉ báo: D2 = D02", hit("SI10.02.9.D2")?.id === "c-9-02");
check("chữ thường trong file vẫn khớp", hit("si10.02.12.d08")?.id === "c-12-08");
check("đuôi độ khó .a của khuôn mã đề bị bỏ qua", hit("SI10.02.12.D08.a")?.id === "c-12-08");
check("khoảng trắng thừa quanh mã", hit("  SI10.02.12.D08  ")?.id === "c-12-08");

/* ── 5. Mã môn KHÔNG bị cắt số 0 nhầm ─────────────────────────────────── */
// "T10" là mã môn một chữ cái; cắt số 0 ở đây sẽ biến nó thành "T1" và
// khớp nhầm sang môn khác.
const toan = buildOutcomeIndex([
  { id: "t-1", code: "T10.01.1.D01", title: "YCCĐ Toán 10", bloomLevel: 1 },
  { id: "t-2", code: "T1.01.1.D01", title: "YCCĐ Toán 1", bloomLevel: 1 },
]);
check("mã môn T10 không tụt thành T1", matchOutcome("T10.01.1.D01", toan)?.id === "t-1");
check("mã môn T1 vẫn là T1", matchOutcome("T1.01.1.D01", toan)?.id === "t-2");

/* ── 6. splitCode / topicOfCode ───────────────────────────────────────── */
check("splitCode tách đúng chủ điểm + chữ + số", (() => {
  const p = splitCode("SI10.02.15.E01");
  return p?.topic === "SI10.2.15" && p.letter === "E" && p.seq === "1";
})());
check("splitCode với mã chủ điểm: không có chữ/số chỉ báo", (() => {
  const p = splitCode("SI10.02.15");
  return p?.topic === "SI10.2.15" && p.letter === null && p.seq === null;
})());
check("topicOfCode trả chủ điểm của mã đầy đủ", topicOfCode("SI10.02.12.E02") === "SI10.2.12");
check("topicOfCode với mã hỏng → null", topicOfCode("linh tinh") === null);

/* ── 7. Bộ đọc khung: chỉ báo KHÔNG phải chữ D không được rơi mất ─────── */
const KHUNG_TEXT = [
  "[SI10.02]: 2. Sinh học tế bào",
  "2.12. Chu kỳ tế bào và ung thư",
  "[SI10.02.12.D01] a. Nêu được khái niệm chu kỳ tế bào",
  "[SI10.02.12.D02] b. Trình bày được các pha của chu kỳ",
  "[SI10.02.12.E03] c. Vận dụng giải thích cơ chế phát sinh ung thư",
  "[SI10.02.12.S04] a. Nêu được biện pháp phòng tránh",
].join("\n");
const tree = parseFrameworkText(KHUNG_TEXT);
const leaves = tree.tree.flatMap((ch) => ch.children.flatMap((tp) => tp.children));
check("đọc đủ 4 chỉ báo, không bỏ chữ E và S", leaves.length === 4, `được ${leaves.length}`);
check(
  "giữ nguyên chữ trong mã chỉ báo",
  leaves.map((l) => l.code).join(",") ===
    "SI10.02.12.D01,SI10.02.12.D02,SI10.02.12.E03,SI10.02.12.S04",
  leaves.map((l) => l.code).join(","),
);
check("chỉ báo chữ E vẫn lấy đúng nội dung", /phát sinh ung thư/.test(leaves[2]?.name ?? ""));

/* ── 8. Đi hết một vòng: khung đọc từ Word → khớp mã trong đề ─────────── */
const fromDoc = buildOutcomeIndex(
  leaves.map((l, i) => ({ id: `k${i}`, code: l.code, title: l.name, bloomLevel: 1 })),
);
check(
  "khung vừa đọc khớp được mã đề ghi chữ khác",
  matchOutcome("SI10.02.12.F02", fromDoc)?.code === "SI10.02.12.D02",
);
check(
  "khung có sẵn lá chữ E thì mã E khớp chính xác",
  matchOutcome("SI10.02.12.E03", fromDoc)?.code === "SI10.02.12.E03",
);

/* ── 9. Bộ đọc khung phải đọc được ĐÚNG những gì splitCode đọc được ────── */
// Lệch giữa hai đầu là lỗi im lặng tệ nhất của luồng này: khung MẤT lá, còn đề
// vẫn trích dẫn mã đó. `matchOutcome` không tìm ra mã đầy đủ nên tụt xuống
// đường "cùng số chỉ báo, khác chữ" và gắn câu vào MỘT LÁ KHÁC — giao diện báo
// "khớp theo số chỉ báo" y như bình thường. Không màn nào phát hiện hộ.
const khungLine = (code, desc) =>
  ["[SI10.02]: 2. Sinh học tế bào", "2.15. Công nghệ tế bào", `[${code}] ${desc}`].join("\n");
const leafOf = (code, desc = "a. Nội dung") => {
  const r = parseFrameworkText(khungLine(code, desc));
  return r.tree[0]?.children?.[0]?.children?.[0] ?? null;
};

check("chỉ báo HAI chữ không bị bỏ im", leafOf("SI10.02.15.EE1")?.code === "SI10.02.15.EE1");
check(
  "chỉ báo có đuôi độ khó `.a` đọc được, và đuôi bị cắt khỏi mã",
  leafOf("SI10.02.15.E01.a")?.code === "SI10.02.15.E01",
);
check("chỉ báo một chữ vẫn nguyên như cũ", leafOf("SI10.02.15.E01")?.code === "SI10.02.15.E01");

// Cùng một mã thì hai đầu phải cùng đọc ra, hoặc cùng từ chối.
for (const code of ["SI10.02.15.E01", "SI10.02.15.EE1", "SI10.02.15.E01.a"]) {
  check(
    `khung và splitCode cùng đọc được ${code}`,
    leafOf(code) !== null && splitCode(code) !== null,
  );
}

// Mã đọc không ra thì phải NÊU RA, không rơi im lặng.
const bad = parseFrameworkText(khungLine("SI10.02.15.01", "d. Không có chữ"));
check("mã đọc không ra thì báo lên `skipped`", bad.skipped.length === 1, JSON.stringify(bad.skipped));
check("mã đọc không ra thì KHÔNG đếm vào chỉ báo", bad.counts.indicators === 0);
check(
  "khung đọc được bình thường thì `skipped` rỗng",
  parseFrameworkText(khungLine("SI10.02.15.E01", "a. Ổn")).skipped.length === 0,
);

// Ca thật đứng sau báo lỗi của người dùng: khung ghi cả D01 lẫn E01, nhưng E01
// viết kèm đuôi độ khó. Trước bản vá E01 rơi mất, nên đề ghi E01 khớp NHẦM
// sang D01 mà vẫn hiện "khớp theo số chỉ báo".
const khungHaiLa = parseFrameworkText(
  [
    "[SI10.02]: 2. Sinh học tế bào",
    "2.15. Công nghệ tế bào",
    "[SI10.02.15.D01] a. Nêu được thành tựu",
    "[SI10.02.15.E01.a] b. Vận dụng giải thích",
  ].join("\n"),
);
const laHaiLa = khungHaiLa.tree[0].children[0].children;
check("khung giữ đủ hai lá D01 và E01", laHaiLa.length === 2, `được ${laHaiLa.length}`);
const idxHaiLa = buildOutcomeIndex(
  laHaiLa.map((l, i) => ({ id: `h${i}`, code: l.code, title: l.name, bloomLevel: i + 1 })),
);
check(
  "đề ghi E01 khớp ĐÚNG lá E01, không lệch sang D01",
  matchOutcome("SI10.02.15.E01", idxHaiLa)?.code === "SI10.02.15.E01",
);
check(
  "khớp bằng mã đầy đủ chứ không phải đoán theo số chỉ báo",
  matchOutcome("SI10.02.15.E01", idxHaiLa)?.via === "ma-day-du",
);

console.log(`\n${pass} qua, ${fail} trượt`);
process.exit(fail === 0 ? 0 : 1);
