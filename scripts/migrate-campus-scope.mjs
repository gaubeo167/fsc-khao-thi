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
 * `Subject.campusIds` LÀ CĂN CỨ CHUẨN. Mục lục và khung treo dưới một môn; môn
 * thuộc cơ sở nào thì chúng thuộc cơ sở đó. Đo trên dữ liệu thật: 13/13 môn
 * thuộc đúng MỘT cơ sở, và 51/51 node mục lục + 1030/1030 node khung đều có
 * `subjectId` hợp lệ — nên cách này phủ 100%, không cần đoán, không mồ côi.
 *
 * Bản đầu của script này suy chủ bằng cách lần ngược từ CÂU HỎI. Chạy thử ra
 * 235 node phải "nhân bản vì nhiều cơ sở cùng dùng" — và đó là KẾT LUẬN SAI.
 * Có 42/323 câu bị nộp nhầm sang môn của cơ sở khác (hậu quả của chính lỗi ô
 * chọn môn không lọc campus). Lấy usage làm căn cứ tức là lấy dấu vết của lỗi
 * làm bằng chứng, rồi nhân bản theo nó — đóng đinh cái lỗi vào dữ liệu.
 *
 * Nên: chủ lấy từ môn. Chỉ khi môn thuộc NHIỀU cơ sở mới nhân bản (dữ liệu
 * hiện tại không có ca này, nhưng luật phải đúng cho mai sau), và câu hỏi của
 * cơ sở nào thì trỏ sang bản của cơ sở đó.
 *
 * Câu nộp nhầm môn được LIỆT KÊ RA chứ không tự sửa: chuyển câu sang môn khác
 * là quyết định nghiệp vụ, không phải việc của một script gán chủ.
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

const [questions, tocNodes, competencies, campuses, subs, users] = await Promise.all([
  load("questions"),
  load("toc_nodes"),
  load("competencies"),
  load("campuses"),
  load("subjects"),
  load("users"),
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

const subById = new Map(subs.map((x) => [x.id, x]));

/**
 * Chia chủ cho một bộ node treo dưới môn.
 *
 * Chủ lấy thẳng từ `Subject.campusIds` — xem chú thích đầu file về lý do KHÔNG
 * lần ngược từ câu hỏi. Môn thuộc nhiều cơ sở thì nhân bản cho từng cơ sở.
 */
function planOwnership({ nodes, label }) {
  const assign = [];
  const clone = [];
  const orphan = [];
  for (const n of nodes) {
    if (n.campusId) continue; // đã có chủ, không đụng
    const owners = [...(subById.get(n.subjectId)?.campusIds ?? [])].sort();
    if (owners.length === 0) orphan.push(n);
    else if (owners.length === 1) assign.push({ node: n, campusId: owners[0] });
    else clone.push({ node: n, campusIds: owners });
  }

  console.log(`── ${label} ──`);
  console.log(`   đã có chủ sẵn : ${nodes.filter((n) => n.campusId).length}`);
  console.log(`   gán 1 cơ sở    : ${assign.length}`);
  console.log(`   phải nhân bản  : ${clone.length}  (môn thuộc nhiều cơ sở)`);
  console.log(`   không suy được : ${orphan.length}`);
  for (const { node, campusIds } of clone.slice(0, 5)) {
    console.log(
      `     · "${node.name ?? node.title ?? node.id}" → ${campusIds
        .map((c) => campusName.get(c) ?? c)
        .join(", ")}`,
    );
  }
  if (orphan.length > 0) {
    console.log(`   ⚠ ${orphan.length} node thuộc môn chưa gán cơ sở nào —`);
    console.log(`     để nguyên "chưa gán" (vẫn hiện ở mọi cơ sở). Ví dụ:`);
    for (const n of orphan.slice(0, 5)) {
      console.log(`       ${n.id}  "${n.name ?? n.title ?? ""}"  (môn ${n.subjectId})`);
    }
  }
  console.log("");
  return { assign, clone, orphan };
}

const tocPlan = planOwnership({ nodes: tocNodes, label: "MỤC LỤC (toc_nodes)" });
const compPlan = planOwnership({
  nodes: competencies,
  label: "KHUNG YCCĐ (competencies)",
});

// ── Câu nộp nhầm môn: NÊU RA, không tự sửa ────────────────────────────────
//
// Đối chiếu bằng HAI căn cứ độc lập:
//   · `q.campusId` — cơ sở đóng dấu lên câu lúc tạo;
//   · cơ sở của NGƯỜI TẠO (`ownerId` → users) — căn cứ này không phụ thuộc vào
//     phiên đăng nhập lúc đó, nên bắt được cả trường hợp `campusId` bị đóng dấu
//     sai (vd superadmin đang mở cơ sở khác trên thanh trên).
// Hai căn cứ lệch nhau cũng là một phát hiện đáng nêu.
const campusOfUser = new Map(users.map((u) => [u.id, u.campusId ?? null]));
const misfiled = [];
const stampMismatch = [];
for (const q of questions) {
  const ownerCampus = q.ownerId ? campusOfUser.get(q.ownerId) ?? null : null;
  if (ownerCampus && q.campusId && ownerCampus !== q.campusId) {
    stampMismatch.push({ q, ownerCampus });
  }
  const sub = subById.get(q.subjectId);
  if (!sub) continue;
  const owners = sub.campusIds ?? [];
  if (owners.length === 0) continue;
  // Câu được coi là nhầm khi CẢ HAI căn cứ đều không nằm trong cơ sở của môn.
  const actual = ownerCampus ?? q.campusId;
  if (actual && !owners.includes(actual)) {
    misfiled.push({ q, sub, owners, actual, ownerCampus });
  }
}
if (stampMismatch.length > 0) {
  console.log(
    `── ⚠ ${stampMismatch.length} câu có campusId KHÁC cơ sở của người tạo ──`,
  );
  for (const { q, ownerCampus } of stampMismatch.slice(0, 5)) {
    console.log(
      `     ${q.id}  dấu=${campusName.get(q.campusId) ?? q.campusId}  ·  người tạo thuộc ${campusName.get(ownerCampus) ?? ownerCampus}`,
    );
  }
  console.log("");
}
if (misfiled.length > 0) {
  console.log(`── ⚠ ${misfiled.length}/${questions.length} CÂU NỘP NHẦM MÔN CỦA CƠ SỞ KHÁC ──`);
  console.log(`   Hậu quả của ô chọn môn không lọc cơ sở (đã vá). Script này KHÔNG`);
  console.log(`   tự chuyển — đổi môn của câu hỏi là quyết định nghiệp vụ.`);
  const byPair = new Map();
  for (const m of misfiled) {
    const k = `${campusName.get(m.actual) ?? m.actual} → "${m.sub.name}" của ${m.owners
      .map((c) => campusName.get(c) ?? c)
      .join(",")}`;
    byPair.set(k, (byPair.get(k) ?? 0) + 1);
  }
  for (const [k, n] of byPair) console.log(`     ${n} câu · ${k}`);
  console.log("");
}

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
