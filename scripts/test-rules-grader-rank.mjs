#!/usr/bin/env node
/**
 * Test firestore.rules THẬT cho phân công chấm — chạy trên emulator.
 *
 *   npm run emu                       # cửa sổ 1
 *   node scripts/test-rules-grader-rank.mjs
 *
 * ── Vì sao không đủ nếu chỉ có test-grader-rank.mjs ─────────────────────
 *
 * File kia đọc `firestore.rules` bằng regex — nó bắt được "có gọi hàm chưa",
 * không bắt được "gọi xong có ra đúng kết quả không". Mà đây là rules phân
 * quyền sắp đẩy lên production: sai một vế thì hoặc TBM vượt quyền tiếp,
 * hoặc TBM bị khoá sạch không phân công được ai — và cái thứ hai chỉ lộ ra
 * khi thầy cô ngồi trước màn hình bấm Lưu.
 *
 * Cách chạy: nạp rules hiện hành lên emulator, seed vài hồ sơ, rồi GHI THẬT
 * bằng token của từng vai. Emulator nhận JWT không chữ ký, nên giả được
 * người đăng nhập mà không cần thư viện ngoài.
 */
import { readFileSync } from "node:fs";

const HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "localhost:8080";
const PROJECT = "demo-fsc";
const BASE = `http://${HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;

const b64 = (o) =>
  Buffer.from(JSON.stringify(o)).toString("base64url");
/** JWT không chữ ký — emulator chấp nhận, dùng để giả người đăng nhập. */
function token(uid) {
  const now = Math.floor(Date.now() / 1000);
  return (
    b64({ alg: "none", typ: "JWT" }) +
    "." +
    b64({
      iss: `https://securetoken.google.com/${PROJECT}`,
      aud: PROJECT,
      auth_time: now,
      user_id: uid,
      sub: uid,
      iat: now,
      exp: now + 3600,
      firebase: { identities: {}, sign_in_provider: "password" },
    }) +
    "."
  );
}

const val = (v) =>
  v === null
    ? { nullValue: null }
    : typeof v === "number"
      ? { integerValue: String(v) }
      : { stringValue: String(v) };
const fields = (o) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));

async function req(method, path, { as, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${as ? token(as) : "owner"}`,
    },
    body: body ? JSON.stringify({ fields: fields(body) }) : undefined,
  });
  return res.status;
}

const put = (coll, id, data) =>
  req("PATCH", `/${coll}/${id}`, { body: data }); // owner → bỏ qua rules

let pass = 0,
  fail = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${name}${ok || !extra ? "" : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};

/* ── Nạp đúng bản rules trong repo lên emulator ──────────────────────── */
{
  const rules = readFileSync("firestore.rules", "utf8");
  const res = await fetch(
    `http://${HOST}/emulator/v1/projects/${PROJECT}:securityRules`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: { files: [{ name: "firestore.rules", content: rules }] } }),
    },
  );
  check("rules biên dịch và nạp được lên emulator", res.status === 200, String(res.status));
  if (res.status !== 200) {
    console.log(await res.text());
    process.exit(1);
  }
}

/* ── Seed hồ sơ (bằng quyền owner, bỏ qua rules) ─────────────────────── */
const U = {
  admin: { role: "campus-admin", campusId: "c1" },
  giamDoc: { role: "academic-director", campusId: "c1" },
  tbm: { role: "subject-lead", campusId: "c1", subjectIds: "s-toan" },
  gv: { role: "teacher", campusId: "c1" },
  gv2: { role: "teacher", campusId: "c1" },
  tbm2: { role: "subject-lead", campusId: "c1" },
  hs: { role: "student", campusId: "c1" },
};
for (const [id, u] of Object.entries(U)) {
  await put("users", `rk-${id}`, { ...u, name: id, status: "active" });
}

const gan = (as, id, graderId) =>
  req("PATCH", `/grading_assignments/${id}`, {
    as,
    body: { shiftId: "rk-shift", graderId, campusId: "c1", graderName: "x" },
  });
const xoa = (as, id) => req("DELETE", `/grading_assignments/${id}`, { as });
const OK = (s) => s === 200;
const CAM = (s) => s === 403;

/* ── 1. TBM: lỗi gốc — giao việc cho bậc admin ───────────────────────── */
{
  check("TBM giao cho GIÁO VIÊN → được", OK(await gan("rk-tbm", "t-gv", "rk-gv")), String(await gan("rk-tbm", "t-gv", "rk-gv")));
  check("TBM giao cho TBM khác → được", OK(await gan("rk-tbm", "t-tbm2", "rk-tbm2")));
  const a = await gan("rk-tbm", "t-admin", "rk-admin");
  check("TBM giao cho ADMIN CƠ SỞ → BỊ CHẶN", CAM(a), `HTTP ${a}`);
  const b = await gan("rk-tbm", "t-gd", "rk-giamDoc");
  check("TBM giao cho GIÁM ĐỐC CHUYÊN MÔN → BỊ CHẶN", CAM(b), `HTTP ${b}`);
  const c = await gan("rk-tbm", "t-hs", "rk-hs");
  check("TBM giao cho HỌC SINH → BỊ CHẶN", CAM(c), `HTTP ${c}`);
}

/* ── 2. Admin vẫn làm được việc của mình ─────────────────────────────── */
// Siết nhầm cả admin thì admin hết tự nhận chấm được — đúng lý do họ có mặt.
{
  check("admin giao cho giáo viên → được", OK(await gan("rk-admin", "a-gv", "rk-gv2")));
  check("admin TỰ NHẬN chấm → được", OK(await gan("rk-admin", "a-self", "rk-admin")));
  check("admin giao cho giám đốc chuyên môn → được", OK(await gan("rk-admin", "a-gd", "rk-giamDoc")));
  const d = await gan("rk-admin", "a-hs", "rk-hs");
  check("admin giao cho HỌC SINH → BỊ CHẶN (mở bài bạn cùng lớp)", CAM(d), `HTTP ${d}`);
}

/* ── 3. Gỡ phân công cũng phải theo bậc ──────────────────────────────── */
{
  check("TBM gỡ được phân công của giáo viên", OK(await xoa("rk-tbm", "t-gv")));
  const e = await xoa("rk-tbm", "a-self"); // admin tự nhận
  check("TBM KHÔNG gỡ được phân công của admin", CAM(e), `HTTP ${e}`);
  check("admin gỡ được phân công của chính mình", OK(await xoa("rk-admin", "a-self")));
}

/* ── 4. Vai không được phân công ─────────────────────────────────────── */
{
  const f = await gan("rk-gv", "g-1", "rk-gv2");
  check("giáo viên thường KHÔNG phân công được ai", CAM(f), `HTTP ${f}`);
  const g = await gan("rk-hs", "h-1", "rk-gv2");
  check("học sinh KHÔNG phân công được ai", CAM(g), `HTTP ${g}`);
}

/* ── 5. Người chấm không có hồ sơ ────────────────────────────────────── */
// Đặt thì cấm (ghi mù), nhưng admin phải GỠ được, nếu không bản ghi mồ côi
// thành không ai xoá nổi và dọn rác lại phải mở rules ra sửa.
{
  const h = await gan("rk-tbm", "x-1", "khong-ton-tai");
  check("không ai đặt được người chấm không có hồ sơ", CAM(h), `HTTP ${h}`);
  const i = await gan("rk-admin", "x-2", "khong-ton-tai");
  check("kể cả admin cũng không đặt được", CAM(i), `HTTP ${i}`);
  // Dựng bản ghi mồ côi bằng quyền owner rồi thử gỡ.
  await put("grading_assignments", "mo-coi", {
    shiftId: "rk-shift", graderId: "da-bi-xoa", campusId: "c1", graderName: "x",
  });
  const j = await xoa("rk-tbm", "mo-coi");
  check("TBM không gỡ được bản ghi mồ côi", CAM(j), `HTTP ${j}`);
  const k = await xoa("rk-admin", "mo-coi");
  check("admin GỠ ĐƯỢC bản ghi mồ côi (dọn rác)", OK(k), `HTTP ${k}`);
}

/* ── Dọn ─────────────────────────────────────────────────────────────── */
for (const id of ["t-tbm2", "a-gv", "a-gd"]) await req("DELETE", `/grading_assignments/${id}`);
for (const id of Object.keys(U)) await req("DELETE", `/users/rk-${id}`);

console.log(`\n${pass} qua, ${fail} trượt`);
process.exit(fail ? 1 : 0);
