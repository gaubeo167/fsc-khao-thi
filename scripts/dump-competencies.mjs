#!/usr/bin/env node
/**
 * Liệt kê khung YCCĐ đang có, gom theo MÔN + KHỐI, và soi đầu mã.
 *
 * Chạy:  node scripts/dump-competencies.mjs
 *
 * CHỈ ĐỌC — không ghi, không xoá gì.
 *
 * Vì sao có script này: ô chọn YCCĐ lọc theo môn, nhưng khi khối đang chọn
 * chưa có khung nào thì nó lùi về lấy MỌI khối của môn đó. Nên một khung nằm
 * nhầm khối (hoặc nhầm môn) sẽ hiện ra ở chỗ không ai ngờ, trong khi màn
 * Chuẩn đầu ra — lọc chặt theo đúng môn + khối — lại báo "chưa có khung".
 * Hai màn nói ngược nhau, và không màn nào chỉ ra dữ liệu đang nằm ở đâu.
 *
 * Cột "cờ" đánh dấu chỗ đầu mã không khớp số khối, vd mã SI10 nằm ở Khối 1.
 */
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const cred = JSON.parse(
  readFileSync(resolve(process.cwd(), "serviceAccount.json"), "utf8"),
);
initializeApp({ credential: cert(cred) });
const db = getFirestore();

const [comps, subjects, grades] = await Promise.all([
  db.collection("competencies").get(),
  db.collection("subjects").get(),
  db.collection("grades").get(),
]);

const subjectName = new Map(subjects.docs.map((d) => [d.id, d.data().name ?? d.id]));
const gradeName = new Map(grades.docs.map((d) => [d.id, d.data().name ?? d.id]));

if (comps.empty) {
  console.log("(chưa có node YCCĐ nào)");
  process.exit(0);
}

/** Đầu mã: chữ = môn, số = khối. "SI10.01.1.D01" → { letters:"SI", grade:10 }. */
function prefixOf(code) {
  const first = String(code ?? "").trim().split(".")[0];
  const m = /^([A-Za-z]+)(\d*)/.exec(first ?? "");
  if (!m) return null;
  return { raw: first.toUpperCase(), letters: m[1].toUpperCase(), grade: m[2] ? Number(m[2]) : null };
}
const gradeNumberOf = (name) => {
  const m = /(\d+)/.exec(name ?? "");
  return m ? Number(m[1]) : null;
};

const groups = new Map();
for (const d of comps.docs) {
  const c = d.data();
  const key = `${c.subjectId ?? "(không môn)"}|${c.gradeId ?? "(không khối)"}`;
  const g = groups.get(key) ?? {
    subjectId: c.subjectId,
    gradeId: c.gradeId,
    kinds: {},
    prefixes: new Map(),
    total: 0,
  };
  g.total += 1;
  g.kinds[c.kind ?? "?"] = (g.kinds[c.kind ?? "?"] ?? 0) + 1;
  const p = prefixOf(c.code);
  if (p) g.prefixes.set(p.raw, (g.prefixes.get(p.raw) ?? 0) + 1);
  groups.set(key, g);
}

console.log(`Tổng ${comps.size} node YCCĐ, ${groups.size} nhóm môn×khối\n`);
console.log(
  "MÔN".padEnd(16) +
    "KHỐI".padEnd(12) +
    "TỔNG".padStart(6) +
    "  chương/chủ đề/YCCĐ".padEnd(24) +
    "ĐẦU MÃ".padEnd(20) +
    "CỜ",
);
console.log("─".repeat(96));

const suspects = [];
for (const g of [...groups.values()].sort((a, b) =>
  `${subjectName.get(a.subjectId)}`.localeCompare(`${subjectName.get(b.subjectId)}`),
)) {
  const sName = subjectName.get(g.subjectId) ?? g.subjectId ?? "—";
  const gName = g.gradeId ? (gradeName.get(g.gradeId) ?? g.gradeId) : "(không khối)";
  const pref = [...g.prefixes.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k}×${n}`)
    .join(" ");
  const top = [...g.prefixes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const topGrade = top ? prefixOf(top)?.grade : null;
  const wantGrade = gradeNumberOf(gName);
  const lech = topGrade != null && wantGrade != null && topGrade !== wantGrade;
  if (lech) suspects.push({ sName, gName, top, wantGrade });
  console.log(
    `${sName}`.padEnd(16) +
      `${gName}`.padEnd(12) +
      `${g.total}`.padStart(6) +
      `  ${g.kinds.chapter ?? 0}/${g.kinds.topic ?? 0}/${g.kinds.outcome ?? 0}`.padEnd(24) +
      `${pref || "—"}`.padEnd(20) +
      (lech ? "⚠ đầu mã không khớp khối" : ""),
  );
}

if (suspects.length > 0) {
  console.log("\n⚠ Nghi nằm sai chỗ:");
  for (const s of suspects) {
    console.log(
      `   ${s.sName} · ${s.gName}: mã ${s.top} (theo quy ước là khối ` +
        `${prefixOf(s.top)?.grade}) nhưng đang nằm ở khối ${s.wantGrade}`,
    );
  }
  console.log(
    "\n   Cách sửa: vào Quản lý môn học → Khung YCCĐ, chọn ĐÚNG môn + khối ghi\n" +
      "   ở trên, xoá các node đó, rồi nhập lại file vào đúng môn + khối.",
  );
}
process.exit(0);
