#!/usr/bin/env node
/**
 * Test hồi quy cho việc tách "sửa hồ sơ" và "đổi mật khẩu"
 * (apps/web/src/features/admin/users/lib/plan-update.ts).
 *
 * Chạy:  node scripts/test-user-update-plan.mjs
 *
 * Vì sao có file này: hộp thoại "Chỉnh sửa người dùng" có ô mật khẩu, và nó
 * gửi mật khẩu vào cùng một `update()` với tên · lớp · trạng thái. Vòng lặp
 * dọn dữ liệu trước khi ghi Firestore có dòng `if (k === "password") continue`
 * — đúng ở chỗ "đừng ghi mật khẩu vào Firestore", nhưng nó dừng ở đó. Mật
 * khẩu bị bỏ đi, không ai gọi đường đặt mật khẩu, giao diện báo lưu thành
 * công.
 *
 * Người dùng gặp đúng chuyện đó với tài khoản campusfs-0002: đổi mật khẩu
 * xong, học sinh đăng nhập vẫn báo sai. Không một dòng lỗi nào.
 *
 * Hai chiều đều phải khoá: mật khẩu KHÔNG được lọt vào Firestore, và cũng
 * KHÔNG được biến mất khỏi kế hoạch.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(mkdtempSync(join(tmpdir(), "fsc-userplan-")), "p.mjs");
execFileSync(
  "npx",
  [
    "esbuild",
    "src/features/admin/users/lib/plan-update.ts",
    "--bundle",
    "--format=esm",
    "--platform=node",
    "--alias:@=./src",
    `--outfile=${out}`,
  ],
  { cwd: "apps/web", stdio: "pipe" },
);
const { planUserUpdate, partialSaveMessage } = await import(out);

let pass = 0,
  fail = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${name}${ok || !extra ? "" : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};

/* ── Đúng cái lỗi người dùng gặp ──────────────────────────────────────── */
{
  const plan = planUserUpdate({
    name: "Nguyễn Việt Khang",
    status: "active",
    password: "fpt2026",
  });
  check(
    "mật khẩu KHÔNG bị nuốt mất",
    plan.newPassword === "fpt2026",
    JSON.stringify(plan),
  );
  check(
    "mật khẩu KHÔNG lọt vào phần ghi Firestore",
    !("password" in plan.profilePatch),
    JSON.stringify(plan.profilePatch),
  );
  check("các trường hồ sơ vẫn đi tiếp", plan.profilePatch.name === "Nguyễn Việt Khang");
}

/* ── Ô để trống = GIỮ NGUYÊN mật khẩu, không phải đặt rỗng ────────────── */
check("không có khoá password → không đổi", planUserUpdate({ name: "A" }).newPassword === null);
check("password rỗng → không đổi", planUserUpdate({ password: "" }).newPassword === null);
check(
  "password toàn khoảng trắng → không đổi",
  planUserUpdate({ password: "   " }).newPassword === null,
);
check(
  "password undefined → không đổi",
  planUserUpdate({ password: undefined }).newPassword === null,
);
// Mật khẩu có khoảng trắng hai đầu vẫn là mật khẩu người dùng gõ — giữ
// NGUYÊN VĂN, chỉ dùng bản trim để xét rỗng. Tự ý cắt là đổi mật khẩu
// thành thứ admin không hề đọc cho học sinh.
check(
  "mật khẩu có khoảng trắng hai đầu được giữ nguyên văn",
  planUserUpdate({ password: " abc123 " }).newPassword === " abc123 ",
  JSON.stringify(planUserUpdate({ password: " abc123 " }).newPassword),
);

/* ── Dọn dữ liệu cho Firestore ────────────────────────────────────────── */
{
  const plan = planUserUpdate({
    name: "A",
    className: null,
    subject: undefined,
    gradeIds: [],
    permissions: { canCreateShift: true },
  });
  check("null được giữ (xoá trường)", plan.profilePatch.className === null);
  check("undefined bị loại (không đụng tới)", !("subject" in plan.profilePatch));
  check("mảng rỗng được giữ", Array.isArray(plan.profilePatch.gradeIds));
  check("object lồng được giữ", plan.profilePatch.permissions?.canCreateShift === true);
}
check("patch rỗng → không có gì để ghi", Object.keys(planUserUpdate({}).profilePatch).length === 0);

/* ── Nửa thành công phải nói ra ───────────────────────────────────────── */
//
// Hồ sơ ghi Firestore, mật khẩu ghi Firebase Auth — hai kho, không có giao
// dịch chung. Nửa thành công là trạng thái CÓ THẬT, im lặng ở đây là quay
// lại đúng lỗi cũ.
{
  const msg = partialSaveMessage("HTTP 403");
  check("nói rõ hồ sơ đã lưu", msg.includes("Đã lưu"), msg);
  check("nói rõ mật khẩu KHÔNG đổi", msg.includes("MẬT KHẨU"), msg);
  check("nói rõ mật khẩu cũ còn hiệu lực", msg.includes("cũ vẫn"), msg);
  check("kèm nguyên nhân", msg.includes("HTTP 403"), msg);
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
