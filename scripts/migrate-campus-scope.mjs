#!/usr/bin/env node
/**
 * Gán CƠ SỞ SỞ HỮU cho mục lục (`toc_nodes`) và khung YCCĐ (`competencies`).
 *
 * ── Vì sao cần ──────────────────────────────────────────────────────────
 *
 * Hai bộ này ra đời không có `campusId`, và không chỗ nào lọc theo cơ sở. Nên
 * một cơ sở chưa từng tạo mục lục cho môn nào vẫn thấy nguyên mục lục của cơ
 * sở khác, và khung YCCĐ của các cơ sở lẫn vào nhau. Người dùng gặp đúng hai
 * triệu chứng đó: "Đà Nẵng 3 chưa tạo mục lục Sinh mà đã có Chương 1 · Tuần 1",
 * và "khung rõ ràng có SI10.02.12.S05 mà màn nhập đề báo không có".
 *
 * Mã đã lọc theo `campusId`, nhưng node `campusId == null` vẫn cố ý hiện ở mọi
 * cơ sở — nếu không thì lên bản mới là toàn bộ mục lục đang dùng biến mất.
 * Script này gán chủ cho chúng; gán xong thì việc cách ly mới trọn vẹn.
 *
 * ── Suy ra chủ bằng cách nào ────────────────────────────────────────────
 *
 * Lần ngược từ CÂU HỎI. Câu hỏi có `campusId`, và trỏ tới mục lục
 * (`tocNodeId`) + khung (`competencyIds`, và ở cấp ý / phương án). Cơ sở nào
 * có câu hỏi dùng node nào thì cơ sở đó đã làm việc với node đó.
 *
 * Ba trường hợp:
 *
 *   1 cơ sở dùng   → gán thẳng cho cơ sở đó.
 *   NHIỀU cơ sở dùng → NHÂN BẢN: mỗi cơ sở một bản riêng, và câu hỏi của cơ sở
 *                    đó được trỏ sang bản của mình. Đây là ý "tạo sẵn cho các
 *                    đơn vị đã làm" — không cơ sở nào mất thứ mình đang dùng.
 *   KHÔNG cơ sở nào dùng → thừa kế chủ của node CHA. Còn mồ côi thật thì để
 *                    nguyên `null` và liệt kê ra cuối để người vận hành quyết.
 *
 * Node CHA phải đi theo con: gắn câu vào "Tuần 2" mà "Chương 1" thuộc cơ sở
 * khác thì cây gãy, nhánh không bao giờ duyệt tới được. Nên usage được đẩy
 * ngược lên toàn bộ tổ tiên trước khi chia chủ.
 *
 * ── Chạy ────────────────────────────────────────────────────────────────
 *
 *   node scripts/migrate-campus-scope.mjs             # DRY-RUN, không ghi gì
 *   node scripts/migrate-campus-scope.mjs --apply     # ghi thật
 *   node scripts/migrate-campus-scope.mjs --emulator  # chạy trên emulator
 *
 * Bản thật cần `serviceAccount.json` ở gốc repo (giống
 * `migrate-students-to-synthetic.mjs`). MẶC ĐỊNH LÀ DRY-RUN — đọc kỹ báo cáo
 * rồi mới thêm `--apply`.
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
  const cred = JSON.parse(
    readFileSync(resolve(process.cwd(), "serviceAccount.json"), "utf8"),
  );
  initializeApp({ credential: cert(cred) });
}
const db = getFirestore();

const load = async (name) => {
  const snap = await db.collection(name).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

console.log(
  `\n${APPLY ? "▶ GHI THẬT" : "○ DRY-RUN (không ghi gì)"} · ${EMU ? "emulator" : "PRODUCTION"}\n`,
);

const [questions, tocNodes, competencies, campuses] = await Promise.all([
  load("questions"),
  load("toc_nodes"),
  load("competencies"),
  load("campuses"),
]);
const campusName = new Map(campuses.map((c) => [c.id, c.name ?? c.id]));
console.log(
  `Đã đọc: ${questions.length} câu hỏi · ${tocNodes.length} node mục lục · ` +
    `${competencies.length} node khung · ${campuses.length} cơ sở\n`,
);

/** Mọi id khung mà một câu hỏi trỏ tới — cấp câu, cấp ý, cấp phương án. */
function competencyIdsOf(q) {
  const ids = new Set();
  for (const id of q.competencyIds ?? []) if (id) ids.add(id);
  for (const sq of q.subQuestions ?? []) if (sq?.competencyId) ids.add(sq.competencyId);
  for (const o of q.options ?? []) if (o?.competencyId) ids.add(o.competencyId);
  return ids;
}

/**
 * Chia chủ cho một bộ node có quan hệ cha–con.
 *
 * Trả về kế hoạch: node nào gán cho cơ sở nào, node nào phải nhân bản, câu hỏi
 * nào phải trỏ lại. KHÔNG ghi gì — để in ra soát trước.
 */
function planOwnership({ nodes, usageByNode, label }) {
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // Đẩy usage lên toàn bộ tổ tiên: cha phải thuộc cơ sở nào con thuộc, nếu
  // không cây gãy và nhánh không duyệt tới được.
  const expanded = new Map();
  for (const [nodeId, campusSet] of usageByNode) {
    let cur = byId.get(nodeId);
    const guard = new Set();
    while (cur && !guard.has(cur.id)) {
      guard.add(cur.id);
      const acc = expanded.get(cur.id) ?? new Set();
      for (const c of campusSet) acc.add(c);
      expanded.set(cur.id, acc);
      cur = cur.parentId ? byId.get(cur.parentId) : null;
    }
  }

  // Node không ai dùng thì thừa kế chủ của cha, lặp tới khi ổn định.
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of nodes) {
      if (expanded.has(n.id) || !n.parentId) continue;
      const parent = expanded.get(n.parentId);
      if (parent && parent.size > 0) {
        expanded.set(n.id, new Set(parent));
        changed = true;
      }
    }
  }

  const assign = []; // { node, campusId }
  const clone = []; // { node, campusIds: [...] }  (bản gốc giữ cho campusIds[0])
  const orphan = [];
  for (const n of nodes) {
    if (n.campusId) continue; // đã có chủ, không đụng
    const owners = [...(expanded.get(n.id) ?? [])].sort();
    if (owners.length === 0) orphan.push(n);
    else if (owners.length === 1) assign.push({ node: n, campusId: owners[0] });
    else clone.push({ node: n, campusIds: owners });
  }

  console.log(`── ${label} ──`);
  console.log(`   đã có chủ sẵn : ${nodes.filter((n) => n.campusId).length}`);
  console.log(`   gán 1 cơ sở    : ${assign.length}`);
  console.log(`   phải nhân bản  : ${clone.length}  (nhiều cơ sở cùng dùng)`);
  console.log(`   không suy được : ${orphan.length}`);
  for (const { node, campusIds } of clone.slice(0, 5)) {
    console.log(
      `     · "${node.name ?? node.title ?? node.id}" dùng bởi ${campusIds
        .map((c) => campusName.get(c) ?? c)
        .join(", ")}`,
    );
  }
  if (clone.length > 5) console.log(`     · …và ${clone.length - 5} node nữa`);
  if (orphan.length > 0) {
    console.log(
      `   ⚠ ${orphan.length} node không câu hỏi nào dùng và không suy được từ cha —`,
    );
    console.log(`     để nguyên "chưa gán" (vẫn hiện ở mọi cơ sở). Ví dụ:`);
    for (const n of orphan.slice(0, 5)) {
      console.log(`       ${n.id}  "${n.name ?? n.title ?? ""}"`);
    }
  }
  console.log("");
  return { assign, clone, orphan };
}

// ── Mục lục ───────────────────────────────────────────────────────────────
const tocUsage = new Map();
for (const q of questions) {
  if (!q.tocNodeId || !q.campusId) continue;
  const s = tocUsage.get(q.tocNodeId) ?? new Set();
  s.add(q.campusId);
  tocUsage.set(q.tocNodeId, s);
}
const tocPlan = planOwnership({
  nodes: tocNodes,
  usageByNode: tocUsage,
  label: "MỤC LỤC (toc_nodes)",
});

// ── Khung YCCĐ ────────────────────────────────────────────────────────────
const compUsage = new Map();
for (const q of questions) {
  if (!q.campusId) continue;
  for (const cid of competencyIdsOf(q)) {
    const s = compUsage.get(cid) ?? new Set();
    s.add(q.campusId);
    compUsage.set(cid, s);
  }
}
const compPlan = planOwnership({
  nodes: competencies,
  usageByNode: compUsage,
  label: "KHUNG YCCĐ (competencies)",
});

if (!APPLY) {
  console.log("Chưa ghi gì. Soát xong thì chạy lại kèm --apply.\n");
  process.exit(0);
}

/** Ghi theo lô, Firestore giới hạn 500 thao tác mỗi batch. */
async function commitAll(ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + 400)) op(batch);
    await batch.commit();
  }
}

const ops = [];
let cloned = 0;
/** id gốc → { campusId → id bản sao } */
const cloneMap = { toc: new Map(), comp: new Map() };

for (const [coll, plan, key, repointField] of [
  ["toc_nodes", tocPlan, "toc", "tocNodeId"],
  ["competencies", compPlan, "comp", null],
]) {
  for (const { node, campusId } of plan.assign) {
    ops.push((b) => b.update(db.collection(coll).doc(node.id), { campusId }));
  }
  for (const { node, campusIds } of plan.clone) {
    // Bản GỐC giữ cho cơ sở đầu tiên; các cơ sở còn lại nhận bản sao mới.
    ops.push((b) =>
      b.update(db.collection(coll).doc(node.id), { campusId: campusIds[0] }),
    );
    const per = new Map([[campusIds[0], node.id]]);
    for (const cid of campusIds.slice(1)) {
      const newId = `${node.id}--${cid}`;
      const { id: _drop, ...rest } = node;
      ops.push((b) =>
        b.set(db.collection(coll).doc(newId), {
          ...rest,
          id: newId,
          campusId: cid,
          clonedFrom: node.id,
        }),
      );
      per.set(cid, newId);
      cloned += 1;
    }
    cloneMap[key].set(node.id, per);
  }
  void repointField;
}

// Bản sao phải trỏ cha là bản sao CÙNG CƠ SỞ, không phải cha gốc — nếu không
// thì nhánh nhân bản vẫn treo dưới cây của cơ sở đầu tiên.
for (const [coll, key] of [["toc_nodes", "toc"], ["competencies", "comp"]]) {
  for (const [origId, per] of cloneMap[key]) {
    const orig = (key === "toc" ? tocNodes : competencies).find((n) => n.id === origId);
    if (!orig?.parentId) continue;
    const parentPer = cloneMap[key].get(orig.parentId);
    if (!parentPer) continue;
    for (const [cid, cloneId] of per) {
      if (cloneId === origId) continue;
      const newParent = parentPer.get(cid);
      if (newParent) {
        ops.push((b) =>
          b.update(db.collection(coll).doc(cloneId), { parentId: newParent }),
        );
      }
    }
  }
}

// Câu hỏi của cơ sở nhận bản sao phải trỏ sang bản của mình.
let repointed = 0;
for (const q of questions) {
  if (!q.campusId) continue;
  const patch = {};
  const tocPer = q.tocNodeId ? cloneMap.toc.get(q.tocNodeId) : null;
  const mine = tocPer?.get(q.campusId);
  if (mine && mine !== q.tocNodeId) patch.tocNodeId = mine;
  const ids = q.competencyIds ?? [];
  if (ids.length > 0) {
    const next = ids.map((id) => cloneMap.comp.get(id)?.get(q.campusId) ?? id);
    if (next.some((v, i) => v !== ids[i])) patch.competencyIds = next;
  }
  if (Object.keys(patch).length > 0) {
    ops.push((b) => b.update(db.collection("questions").doc(q.id), patch));
    repointed += 1;
  }
}

console.log(`Đang ghi ${ops.length} thao tác…`);
await commitAll(ops);
console.log(
  `\n✓ Xong. Nhân bản ${cloned} node, trỏ lại ${repointed} câu hỏi.\n` +
    `  Node còn "chưa gán": ${tocPlan.orphan.length} mục lục · ${compPlan.orphan.length} khung.\n`,
);
process.exit(0);
