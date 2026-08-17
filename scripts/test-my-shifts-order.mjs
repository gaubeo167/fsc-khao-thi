#!/usr/bin/env node
/**
 * Test hồi quy cho thứ tự ca thi trên màn "Lịch thi của tôi"
 * (apps/web/src/features/student/hooks/use-my-shifts.ts).
 *
 * Chạy:  node scripts/test-my-shifts-order.mjs
 *
 * Vì sao có file này: thứ tự cũ chỉ nhìn trạng thái của CA THI, không nhìn
 * em học sinh đã thi hay chưa. Hệ quả: một ca đang diễn ra mà em đã nộp bài
 * vẫn nằm trên cùng, đè lên đúng cái ca em cần vào làm ngay. Danh sách càng
 * dài thì càng dễ bỏ lỡ giờ thi.
 *
 * Hook thật đọc bốn store Zustand nên không nạp thẳng vào node được. File
 * này kiểm PHẦN LUẬT — thứ hạng + tiêu chí phá hoà — bằng cách dựng lại đúng
 * hàm `rank` và bộ so sánh trong hook, và đối chiếu từng dòng với bản gốc
 * (nếu ai sửa hook mà quên chỗ này, phần đối chiếu sẽ đỏ).
 */
import { readFileSync } from "node:fs";

const SRC = readFileSync(
  "apps/web/src/features/student/hooks/use-my-shifts.ts",
  "utf8",
);

let pass = 0,
  fail = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${name}${ok || !extra ? "" : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};

/* ── Bản sao của luật trong hook ──────────────────────────────────────── */
const rank = (m) => {
  if (m.effectiveStatus === "cancelled") return 6;
  if (m.attendance === "submitted") {
    return m.effectiveStatus === "in-progress" ? 4 : 5;
  }
  if (m.effectiveStatus === "in-progress") {
    return m.attendance === "doing" ? 0 : 1;
  }
  if (m.effectiveStatus === "scheduled" || m.effectiveStatus === "draft") {
    return 2;
  }
  return 3;
};
const sortMine = (list) =>
  [...list].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra <= 2) {
      return new Date(a.shift.startAt) - new Date(b.shift.startAt);
    }
    return new Date(b.shift.endAt) - new Date(a.shift.endAt);
  });

/* ── Bản sao phải khớp bản gốc ────────────────────────────────────────── */
for (const dong of [
  'if (m.effectiveStatus === "cancelled") return 6;',
  'return m.effectiveStatus === "in-progress" ? 4 : 5;',
  'return m.attendance === "doing" ? 0 : 1;',
  "if (ra !== rb) return ra - rb;",
]) {
  check(`hook còn giữ luật: ${dong.slice(0, 46)}…`, SRC.includes(dong));
}

const ca = (id, status, attendance, start, end) => ({
  shift: { id, startAt: start, endAt: end },
  effectiveStatus: status,
  attendance,
});

/* ── Ca người dùng chỉ ra: đã thi rồi phải xuống dưới ─────────────────── */
{
  const list = [
    ca("DA-NOP", "in-progress", "submitted", "2026-08-17T01:00", "2026-08-18T02:00"),
    ca("CHUA-THI", "in-progress", "not-yet", "2026-08-17T03:00", "2026-08-18T02:00"),
  ];
  const thu = sortMine(list).map((x) => x.shift.id);
  check(
    "ca ĐANG DIỄN RA chưa thi lên trên ca đang diễn ra ĐÃ NỘP",
    thu[0] === "CHUA-THI",
    thu.join(" → "),
  );
}

/* ── Đang làm dở là gấp nhất — đồng hồ vẫn chạy ───────────────────────── */
{
  const list = [
    ca("CHUA-VAO", "in-progress", "not-yet", "2026-08-17T01:00", "2026-08-18T02:00"),
    ca("LAM-DO", "in-progress", "doing", "2026-08-17T03:00", "2026-08-18T02:00"),
  ];
  check(
    "đang thi dở lên trước ca chưa vào thi",
    sortMine(list)[0].shift.id === "LAM-DO",
    sortMine(list).map((x) => x.shift.id).join(" → "),
  );
}

/* ── Thứ tự đầy đủ ────────────────────────────────────────────────────── */
{
  const list = [
    ca("6-HUY", "cancelled", "absent", "2026-08-01T01:00", "2026-08-01T02:00"),
    ca("5-XONG", "completed", "submitted", "2026-08-02T01:00", "2026-08-02T02:00"),
    ca("3-BO-THI", "completed", "absent", "2026-08-03T01:00", "2026-08-03T02:00"),
    ca("2-SAP-TOI", "scheduled", "not-yet", "2026-08-20T01:00", "2026-08-20T02:00"),
    ca("0-LAM-DO", "in-progress", "doing", "2026-08-17T01:00", "2026-08-18T02:00"),
    ca("4-DANG-NHUNG-NOP", "in-progress", "submitted", "2026-08-17T01:00", "2026-08-18T02:00"),
    ca("1-VAO-NGAY", "in-progress", "not-yet", "2026-08-17T02:00", "2026-08-18T02:00"),
  ];
  const thu = sortMine(list).map((x) => x.shift.id);
  check(
    "thứ tự đầy đủ: làm dở → vào ngay → sắp tới → bỏ thi → đang-nhưng-nộp → xong → huỷ",
    thu.join(",") ===
      "0-LAM-DO,1-VAO-NGAY,2-SAP-TOI,3-BO-THI,4-DANG-NHUNG-NOP,5-XONG,6-HUY",
    thu.join(" → "),
  );
}

/* ── Phá hoà trong cùng nhóm ──────────────────────────────────────────── */
{
  // Còn phải làm → ca sắp tới nhất lên trước.
  const list = [
    ca("SAU", "scheduled", "not-yet", "2026-09-01T01:00", "2026-09-01T02:00"),
    ca("TRUOC", "scheduled", "not-yet", "2026-08-20T01:00", "2026-08-20T02:00"),
  ];
  check(
    "cùng nhóm sắp diễn ra: ca gần nhất lên trước",
    sortMine(list)[0].shift.id === "TRUOC",
  );
}
{
  // Đã xong → ca gần đây nhất lên trước.
  const list = [
    ca("CU", "completed", "submitted", "2026-06-01T01:00", "2026-06-01T02:00"),
    ca("MOI", "completed", "submitted", "2026-08-01T01:00", "2026-08-01T02:00"),
  ];
  check(
    "cùng nhóm đã xong: ca gần đây nhất lên trước",
    sortMine(list)[0].shift.id === "MOI",
  );
}

/* ── Không được rơi mất ca nào ────────────────────────────────────────── */
{
  const list = [
    ca("a", "in-progress", "not-yet", "2026-08-17T01:00", "2026-08-18T02:00"),
    ca("b", "completed", "submitted", "2026-08-01T01:00", "2026-08-01T02:00"),
    ca("c", "cancelled", "absent", "2026-08-01T01:00", "2026-08-01T02:00"),
    ca("d", "draft", "not-yet", "2026-08-25T01:00", "2026-08-25T02:00"),
  ];
  const thu = sortMine(list);
  check("sắp xếp không làm rơi ca nào", thu.length === 4);
  check("không nhân bản ca nào", new Set(thu.map((x) => x.shift.id)).size === 4);
}

/* ── Thẻ ca thi KHÔNG được tự tính lại tình trạng ─────────────────────── */
//
// Sắp xếp và màu viền phải đọc cùng một con số. Thẻ tự tính lại là con
// đường tới cái thẻ ghi "Chưa thi" mà lại nằm dưới đáy danh sách.
{
  const CARD = readFileSync(
    "apps/web/src/features/student/components/student-shift-card.tsx",
    "utf8",
  );
  check("thẻ đọc attendance từ hook", CARD.includes("item.attendance"));
  check(
    "thẻ KHÔNG tự dựng lại attendance",
    !/const attendance:\s*"submitted"/.test(CARD),
  );
  check("thẻ đổi viền khi đã nộp", CARD.includes('attendance === "submitted"'));
  check(
    "đã nộp thì không mời vào thi lại",
    CARD.includes('attendance !== "submitted"'),
  );
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
