#!/usr/bin/env node
/**
 * Test hồi quy: Firestore Timestamp → chuỗi ISO
 * (apps/web/src/lib/firestore-timestamps.ts).
 *
 * Chạy:  node scripts/test-firestore-timestamps.mjs
 *
 * Vì sao có file này: `writeDoc` GHI ĐÈ `updatedAt` bằng `serverTimestamp()`
 * — cố ý, để giờ do máy chủ quyết. Nhưng kiểu trong mã khai `updatedAt:
 * string` và mọi màn đều gọi `new Date(row.updatedAt)`. Đọc về là ĐỐI TƯỢNG
 * Timestamp, nên ra Invalid Date.
 *
 * Người dùng gặp đúng dòng này ở màn "Cấu trúc + Điểm":
 *     Đã có bản lưu (cập nhật Invalid Date). Lưu để cập nhật.
 *
 * `tsc` không bắt được: kiểu khai là `string` nên không ai kiểm lại, và lỗi
 * chỉ hiện khi dữ liệu đã đi một vòng qua Firestore thật — chạy trên dữ liệu
 * mẫu trong máy thì không bao giờ thấy.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(mkdtempSync(join(tmpdir(), "fsc-ts-")), "t.mjs");
execFileSync(
  "npx",
  [
    "esbuild",
    "src/lib/firestore-timestamps.ts",
    "--bundle",
    "--format=esm",
    "--platform=node",
    "--alias:@=./src",
    `--outfile=${out}`,
  ],
  { cwd: "apps/web", stdio: "pipe" },
);
const { normalizeTimestamps } = await import(out);

let pass = 0,
  fail = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${name}${ok || !extra ? "" : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};

/** Giả Timestamp của SDK: có toDate(). */
const TS = (iso) => ({
  seconds: Math.floor(new Date(iso).getTime() / 1000),
  nanoseconds: 0,
  toDate: () => new Date(iso),
});
/** Giả Timestamp đọc qua REST/emulator: chỉ còn hai trường số. */
const TSraw = (iso) => ({
  seconds: Math.floor(new Date(iso).getTime() / 1000),
  nanoseconds: (new Date(iso).getTime() % 1000) * 1e6,
});

/* ── 1. Ca thật người dùng gặp ─────────────────────────────────────────── */
{
  const doc = { id: "sinh__k10", subjectId: "sinh", updatedAt: TS("2026-08-19T03:14:15.000Z") };
  const n = normalizeTimestamps(doc);
  check("updatedAt thành chuỗi", typeof n.updatedAt === "string", typeof n.updatedAt);
  check(
    "…và new Date() đọc được (hết Invalid Date)",
    !Number.isNaN(new Date(n.updatedAt).getTime()),
    String(new Date(n.updatedAt)),
  );
  check("đúng mốc thời gian", n.updatedAt === "2026-08-19T03:14:15.000Z", n.updatedAt);
  check("trường khác giữ nguyên", n.subjectId === "sinh" && n.id === "sinh__k10");

  // Chứng minh bản CHƯA vá đúng là hỏng — để ai đó gỡ bản vá thì ca này đỏ.
  check("bản chưa vá: new Date(Timestamp) là Invalid Date", Number.isNaN(new Date(doc.updatedAt).getTime()));
}

/* ── 2. Dạng chỉ có hai trường số (REST / emulator) ────────────────────── */
{
  const n = normalizeTimestamps({ createdAt: TSraw("2026-01-02T10:20:30.500Z") });
  check("Timestamp không có toDate() vẫn đổi được", typeof n.createdAt === "string", typeof n.createdAt);
  check("giữ cả phần mili giây", n.createdAt === "2026-01-02T10:20:30.500Z", n.createdAt);
}

/* ── 3. Không đụng vào thứ không phải ngày ─────────────────────────────── */
check("chuỗi ISO sẵn có giữ nguyên", normalizeTimestamps({ a: "2026-01-01T00:00:00.000Z" }).a === "2026-01-01T00:00:00.000Z");
check("số giữ nguyên", normalizeTimestamps({ n: 42 }).n === 42);
check("null giữ nguyên", normalizeTimestamps({ n: null }).n === null);
check("boolean giữ nguyên", normalizeTimestamps({ b: false }).b === false);
check("null ở gốc không nổ", normalizeTimestamps(null) === null);
check("undefined ở gốc không nổ", normalizeTimestamps(undefined) === undefined);
check("chuỗi ở gốc không nổ", normalizeTimestamps("xin chào") === "xin chào");
{
  // `seconds` một mình KHÔNG phải Timestamp — câu hỏi có thể có trường đó.
  const n = normalizeTimestamps({ seconds: 30 });
  check("object chỉ có `seconds` KHÔNG bị nhận nhầm", n.seconds === 30, JSON.stringify(n));
}

/* ── 4. Lồng nhau: mảng, object trong object ───────────────────────────── */
{
  const doc = {
    id: "q1",
    versions: [{ at: TS("2026-03-01T00:00:00.000Z") }, { at: TS("2026-03-02T00:00:00.000Z") }],
    meta: { deep: { when: TS("2026-03-03T00:00:00.000Z") } },
  };
  const n = normalizeTimestamps(doc);
  check("Timestamp trong MẢNG cũng đổi", n.versions[0].at === "2026-03-01T00:00:00.000Z", n.versions[0].at);
  check("phần tử thứ hai cũng đổi", n.versions[1].at === "2026-03-02T00:00:00.000Z");
  check("Timestamp lồng SÂU cũng đổi", n.meta.deep.when === "2026-03-03T00:00:00.000Z", n.meta.deep.when);
}

/* ── 5. Không tạo bản sao vô ích ───────────────────────────────────────── */
// Kho dữ liệu đẩy thẳng mảng này vào Zustand. Bản sao mới ở mỗi lần đọc làm
// React dựng lại cả danh sách dù chẳng có gì đổi.
{
  const sach = { id: "a", name: "Sinh học", updatedAt: "2026-01-01T00:00:00.000Z" };
  check("không có Timestamp → trả về ĐÚNG đối tượng cũ", normalizeTimestamps(sach) === sach);
  const mang = [sach, { id: "b" }];
  check("mảng sạch → trả về đúng mảng cũ", normalizeTimestamps(mang) === mang);
  const ban = { id: "a", updatedAt: TS("2026-01-01T00:00:00.000Z") };
  check("có Timestamp → phải là đối tượng MỚI", normalizeTimestamps(ban) !== ban);
}

/* ── 6. Kiểu lạ của Firestore để nguyên ────────────────────────────────── */
{
  // Bytes / GeoPoint / DocumentReference — đi vào trong là hỏng dữ liệu.
  class GeoPoint {
    constructor(lat, lng) {
      this.latitude = lat;
      this.longitude = lng;
    }
  }
  const gp = new GeoPoint(16.05, 108.2);
  const n = normalizeTimestamps({ at: gp });
  check("GeoPoint giữ nguyên đối tượng", n.at === gp);
  const bytes = new Uint8Array([1, 2, 3]);
  check("Uint8Array giữ nguyên", normalizeTimestamps({ b: bytes }).b === bytes);
}

/* ── 7. Dữ liệu bệnh không làm treo ────────────────────────────────────── */
{
  const hong = { toDate: () => { throw new Error("hỏng"); } };
  check("toDate() ném lỗi → giữ nguyên, không nổ", normalizeTimestamps({ a: hong }).a === hong);
  const xau = { toDate: () => new Date("không phải ngày") };
  check("toDate() trả ngày sai → giữ nguyên", normalizeTimestamps({ a: xau }).a === xau);
  // Lồng nhau quá sâu: dừng lại chứ không tràn ngăn xếp.
  let sau = { at: TS("2026-01-01T00:00:00.000Z") };
  for (let i = 0; i < 40; i += 1) sau = { con: sau };
  let ok = true;
  try {
    normalizeTimestamps(sau);
  } catch {
    ok = false;
  }
  check("lồng 40 tầng không tràn ngăn xếp", ok);
}

console.log(`\n${pass} qua, ${fail} trượt`);
process.exit(fail === 0 ? 0 : 1);
