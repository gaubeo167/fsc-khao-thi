#!/usr/bin/env node
/**
 * Chuyển câu hỏi NỘP NHẦM về đúng môn của cơ sở mình, khớp lại YCCĐ + mục lục.
 *
 * ── Vì sao có những câu này ─────────────────────────────────────────────
 *
 * Ô chọn Môn ở hộp "Tải đề lên" từng KHÔNG lọc theo cơ sở. Ba cơ sở cùng có
 * môn tên "Sinh học"/"Sinh"; danh sách hiện cả ba với cái tên gần như giống
 * nhau, và người dùng chọn nhầm bản của cơ sở khác mà không có cách nào nhận
 * ra. Lỗi đã vá (`campus-scope.ts`), nhưng dữ liệu lỡ nộp nhầm thì vẫn nằm đó.
 *
 * ── Chuyển thế nào cho đúng ─────────────────────────────────────────────
 *
 * Môn đích = môn CỦA CƠ SỞ CÂU ĐÓ, chứa đủ những mã YCCĐ mà câu đang trỏ tới.
 * Chọn theo MÃ chứ không theo TÊN: tên là thứ đã gây ra lỗi ngay từ đầu
 * ("Sinh học" của ba cơ sở khác nhau), còn mã YCCĐ thì nói đúng nội dung.
 *
 *   · `competencyIds` → node cùng MÃ bên môn đích. Thiếu một mã là DỪNG, không
 *     chuyển câu đó — thà để nguyên còn hơn gắn câu vào một chuẩn đầu ra khác.
 *   · `tocNodeId` → môn đích có thể chưa có mục lục (Đà Nẵng 3: 0 node). Khi
 *     đó DỰNG LẠI đúng nhánh cha–con bên môn đích theo tên, rồi trỏ sang.
 *     KHÔNG để trống: bỏ trống là lặng lẽ mất cách sắp xếp của giáo viên.
 *
 * Node dựng lại là idempotent theo (tên · cha): chạy lại lần hai không đẻ thêm.
 *
 * ── Chạy ────────────────────────────────────────────────────────────────
 *
 *   node scripts/migrate-refile-questions.mjs             # DRY-RUN
 *   node scripts/migrate-refile-questions.mjs --apply     # ghi thật
 *   node scripts/migrate-refile-questions.mjs --emulator  # trên emulator
 */
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const APPLY = process.argv.includes("--apply");
const EMU = process.argv.includes("--emulator");
if (EMU) {
  process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
  initializeApp({ projectId: process.env.FSC_PROJECT_ID ?? "demo-fsc" });
} else {
  initializeApp({
    credential: cert(
      JSON.parse(readFileSync(resolve(process.cwd(), "serviceAccount.json"), "utf8")),
    ),
  });
}
const db = getFirestore();
const load = async (n) => (await db.collection(n).get()).docs.map((d) => ({ id: d.id, ...d.data() }));

console.log(
  `\n${APPLY ? "▶ GHI THẬT" : "○ DRY-RUN (không ghi gì)"} · ${EMU ? "emulator" : "PRODUCTION"}\n`,
);

const [questions, subs, comps, tocs, camps] = await Promise.all(
  ["questions", "subjects", "competencies", "toc_nodes", "campuses"].map(load),
);
const campusName = new Map(camps.map((c) => [c.id, c.name ?? c.id]));
const subById = new Map(subs.map((s) => [s.id, s]));
const compById = new Map(comps.map((c) => [c.id, c]));
const tocById = new Map(tocs.map((t) => [t.id, t]));

/** Chuẩn hoá mã để so khớp — cùng luật với `match-competency.ts::splitCode`. */
const canon = (code) =>
  String(code ?? "")
    .trim()
    .toUpperCase()
    .split(".")
    .map((seg, i) => (i > 0 && /^\d+$/.test(seg) ? String(Number(seg)) : seg))
    .join(".");

/** Mã YCCĐ → node, trong phạm vi một môn. */
const compIndexBySubject = new Map();
for (const c of comps) {
  if (!c.code) continue;
  const m = compIndexBySubject.get(c.subjectId) ?? new Map();
  m.set(canon(c.code), c);
  compIndexBySubject.set(c.subjectId, m);
}

const misfiled = questions.filter((q) => {
  const s = subById.get(q.subjectId);
  const owners = s?.campusIds ?? [];
  return s && owners.length > 0 && q.campusId && !owners.includes(q.campusId);
});
console.log(`${misfiled.length} câu đang nằm nhầm môn của cơ sở khác.\n`);

/** Nhánh mục lục cần dựng bên môn đích: khoá "subjectId|gradeId|đường dẫn tên". */
const tocPlanned = new Map();
/** Node đã có sẵn bên môn đích, tra theo (grade · đường dẫn tên). */
const tocExisting = new Map();
for (const t of tocs) {
  const chain = [];
  let cur = t;
  const guard = new Set();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    chain.unshift(cur.name ?? "");
    cur = cur.parentId ? tocById.get(cur.parentId) : null;
  }
  tocExisting.set(`${t.subjectId}|${t.gradeId ?? ""}|${chain.join(" / ")}`, t);
}

const moves = [];
const skipped = [];
for (const q of misfiled) {
  const needCodes = (q.competencyIds ?? [])
    .map((id) => compById.get(id)?.code)
    .filter(Boolean)
    .map(canon);

  // Môn đích: của đúng cơ sở câu này, phủ ĐỦ mã YCCĐ câu đang dùng.
  const candidates = subs.filter(
    (s) =>
      (s.campusIds ?? []).includes(q.campusId) &&
      (!q.gradeId || (s.gradeIds ?? []).includes(q.gradeId)),
  );
  const scored = candidates
    .map((s) => {
      const idx = compIndexBySubject.get(s.id) ?? new Map();
      const hit = needCodes.filter((c) => idx.has(c)).length;
      return { s, hit };
    })
    .sort((a, b) => b.hit - a.hit);
  const best = scored[0];

  if (!best || (needCodes.length > 0 && best.hit < needCodes.length)) {
    skipped.push({
      q,
      why: !best
        ? "cơ sở này chưa có môn nào phù hợp khối"
        : `môn đích thiếu ${needCodes.length - (best?.hit ?? 0)}/${needCodes.length} mã YCCĐ`,
    });
    continue;
  }

  const target = best.s;
  const idx = compIndexBySubject.get(target.id) ?? new Map();
  const newCompIds = (q.competencyIds ?? []).map((id) => {
    const code = compById.get(id)?.code;
    return code ? idx.get(canon(code))?.id ?? id : id;
  });

  // Mục lục: tìm nhánh cùng đường dẫn tên bên môn đích, chưa có thì lên kế
  // hoạch dựng lại — không bỏ trống.
  let newTocId = null;
  const src = q.tocNodeId ? tocById.get(q.tocNodeId) : null;
  if (src) {
    const chain = [];
    let cur = src;
    const guard = new Set();
    while (cur && !guard.has(cur.id)) {
      guard.add(cur.id);
      chain.unshift({ name: cur.name ?? "", code: cur.code ?? null });
      cur = cur.parentId ? tocById.get(cur.parentId) : null;
    }
    const gradeKey = q.gradeId ?? "";
    let parentKey = null;
    for (let i = 0; i < chain.length; i++) {
      const path = chain.slice(0, i + 1).map((x) => x.name).join(" / ");
      const key = `${target.id}|${gradeKey}|${path}`;
      if (!tocExisting.has(key) && !tocPlanned.has(key)) {
        tocPlanned.set(key, {
          key,
          subjectId: target.id,
          gradeId: q.gradeId ?? null,
          campusId: q.campusId,
          name: chain[i].name,
          code: chain[i].code,
          parentKey,
          order: i,
        });
      }
      parentKey = key;
    }
    newTocId = parentKey; // khoá của node lá; đổi sang id thật khi ghi
  }

  moves.push({ q, target, newCompIds, newTocKey: newTocId, src });
}

// ── Báo cáo ───────────────────────────────────────────────────────────────
const byPair = new Map();
for (const m of moves) {
  const from = subById.get(m.q.subjectId);
  const k = `"${from?.name}" (${m.q.subjectId}) → "${m.target.name}" (${m.target.id})  ·  ${campusName.get(m.q.campusId)}`;
  byPair.set(k, (byPair.get(k) ?? 0) + 1);
}
console.log("── SẼ CHUYỂN ──");
for (const [k, n] of byPair) console.log(`   ${String(n).padStart(3)} câu · ${k}`);
console.log(`\n── MỤC LỤC DỰNG LẠI BÊN MÔN ĐÍCH: ${tocPlanned.size} node ──`);
for (const p of [...tocPlanned.values()].slice(0, 10)) {
  console.log(`   "${p.name || "(không tên)"}"  môn=${p.subjectId} khối=${p.gradeId ?? "—"}`);
}
const remapped = moves.filter((m) =>
  m.newCompIds.some((v, i) => v !== (m.q.competencyIds ?? [])[i]),
).length;
console.log(`\n── YCCĐ khớp lại theo mã: ${remapped}/${moves.length} câu ──`);
for (const m of moves.slice(0, 3)) {
  const oldC = (m.q.competencyIds ?? []).map((i) => compById.get(i)?.code ?? i);
  const newC = m.newCompIds.map((i) => compById.get(i)?.code ?? compIndexBySubject.get(m.target.id)
    ? [...(compIndexBySubject.get(m.target.id) ?? new Map()).values()].find((x) => x.id === i)?.code ?? i
    : i);
  console.log(`   ${m.q.id}: [${oldC.join(",")}] → [${newC.join(",")}]  (id đổi, mã giữ nguyên)`);
}
if (skipped.length > 0) {
  console.log(`\n── ⚠ ${skipped.length} câu KHÔNG chuyển ──`);
  for (const s of skipped.slice(0, 10)) console.log(`   ${s.q.id}: ${s.why}`);
}

if (!APPLY) {
  console.log("\nChưa ghi gì. Soát xong thì chạy lại kèm --apply.\n");
  process.exit(0);
}

// ── Ghi ───────────────────────────────────────────────────────────────────
const keyToId = new Map();
let created = 0;
// Dựng mục lục theo thứ tự cha trước con.
for (const p of [...tocPlanned.values()].sort((a, b) => a.order - b.order)) {
  const id = `toc-${p.subjectId}-${created + 1}-${Date.now().toString(36)}`;
  const parentId = p.parentKey
    ? keyToId.get(p.parentKey) ?? tocExisting.get(p.parentKey)?.id ?? null
    : null;
  await db.collection("toc_nodes").doc(id).set({
    id,
    subjectId: p.subjectId,
    gradeId: p.gradeId,
    campusId: p.campusId,
    parentId,
    name: p.name,
    order: p.order,
    ...(p.code ? { code: p.code } : {}),
  });
  keyToId.set(p.key, id);
  created += 1;
}

let updated = 0;
for (let i = 0; i < moves.length; i += 400) {
  const batch = db.batch();
  for (const m of moves.slice(i, i + 400)) {
    const tocId = m.newTocKey
      ? keyToId.get(m.newTocKey) ?? tocExisting.get(m.newTocKey)?.id ?? null
      : null;
    batch.update(db.collection("questions").doc(m.q.id), {
      subjectId: m.target.id,
      competencyIds: m.newCompIds,
      ...(tocId ? { tocNodeId: tocId } : {}),
    });
    updated += 1;
  }
  await batch.commit();
}
console.log(`\n✓ Xong. Chuyển ${updated} câu · dựng ${created} node mục lục.\n`);
process.exit(0);
