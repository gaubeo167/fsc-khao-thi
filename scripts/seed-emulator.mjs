#!/usr/bin/env node
/**
 * Nạp dữ liệu mẫu vào Firebase Emulator để QA được TOÀN BỘ luồng ở local.
 *
 * Chạy:  npm run emu:seed      (emulator phải đang chạy)
 *   hoặc: npm run emu          (khởi động emulator rồi tự nạp)
 *
 * Vì sao cần: emulator khởi động rỗng, không có tài khoản nào để đăng nhập.
 * Mà những đường code đáng lo nhất của hệ thống — đồng bộ thời gian thực,
 * ghi vi phạm, nhập đề — đều CHỈ chạy khi `isFirebaseConfigured()` true. Ở
 * chế độ seed/offline chúng bị bỏ qua hoàn toàn, nên chạy localhost không
 * chứng minh được gì về chúng. Emulator + script này lấp đúng khoảng trống
 * đó mà không đụng một byte nào của production.
 *
 * KHÔNG bao giờ trỏ script này vào production: nó ghi thẳng, không hỏi lại.
 * Chốt an toàn ở dưới sẽ dừng nếu không thấy biến môi trường emulator.
 */
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// ── Chốt an toàn ────────────────────────────────────────────────────────
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
}
if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
}
for (const [k, v] of Object.entries({
  FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST,
  FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST,
})) {
  if (!/^(127\.0\.0\.1|localhost):/.test(v ?? "")) {
    console.error(
      `✗ ${k}=${v} không trỏ về máy này. Dừng để khỏi ghi nhầm vào production.`,
    );
    process.exit(1);
  }
}

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "demo-fsc";
initializeApp({ projectId: PROJECT_ID });
const auth = getAuth();
const db = getFirestore();

const PASSWORD = "fpt2026";

/**
 * Tài khoản mẫu. `uid` do MÌNH đặt, vì hệ thống dùng uid của Firebase Auth
 * làm id document trong /users (xem hydrateSession trong firebase-auth.ts) —
 * đặt trước thì Firestore và Auth khớp nhau ngay.
 */
const USERS = [
  {
    uid: "u-admin-cg",
    email: "admin.caugiay@fpt.edu.vn",
    name: "Admin Cầu Giấy",
    role: "campus-admin",
    campusId: "campus-caugiay",
  },
  {
    uid: "u-teacher-toan",
    email: "gv.toan@fpt.edu.vn",
    name: "GV Toán",
    role: "teacher",
    campusId: "campus-caugiay",
  },
  {
    uid: "u-student-1",
    email: "hs001@students.fsc.local",
    name: "Nguyễn Hoàng Lan",
    role: "student",
    campusId: "campus-caugiay",
    className: "7A1",
  },
  {
    uid: "u-student-2",
    email: "hs002@students.fsc.local",
    name: "Trần Văn Bình",
    role: "student",
    campusId: "campus-caugiay",
    className: "7A1",
  },
];

async function upsertUser(u) {
  try {
    await auth.getUser(u.uid);
    await auth.updateUser(u.uid, { email: u.email, password: PASSWORD, displayName: u.name });
  } catch {
    await auth.createUser({
      uid: u.uid,
      email: u.email,
      password: PASSWORD,
      displayName: u.name,
    });
  }
  await db
    .collection("users")
    .doc(u.uid)
    .set(
      {
        id: u.uid,
        email: u.email,
        name: u.name,
        role: u.role,
        campusId: u.campusId,
        className: u.className ?? null,
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
}

async function main() {
  console.log(`Nạp dữ liệu mẫu vào emulator (project: ${PROJECT_ID})…\n`);

  for (const u of USERS) {
    await upsertUser(u);
    console.log(`  ✓ ${u.role.padEnd(13)} ${u.email}`);
  }

  await db.collection("campuses").doc("campus-caugiay").set(
    {
      id: "campus-caugiay",
      name: "FPT Schools Cầu Giấy",
      gradeIds: ["grade-6", "grade-7", "grade-10"],
      status: "active",
    },
    { merge: true },
  );
  for (const g of [
    { id: "grade-6", name: "Khối 6" },
    { id: "grade-7", name: "Khối 7" },
    { id: "grade-10", name: "Khối 10" },
  ]) {
    await db.collection("grades").doc(g.id).set(g, { merge: true });
  }
  for (const s of [
    { id: "subject-toan", name: "Toán", gradeIds: ["grade-6", "grade-7", "grade-10"] },
    { id: "subject-sinh", name: "Sinh học", gradeIds: ["grade-10"] },
  ]) {
    await db.collection("subjects").doc(s.id).set(s, { merge: true });
  }

  /**
   * Vài node khung năng lực môn Sinh lớp 10, mã khớp file đề thật
   * `1. SHOC 10 DE CHINH THUC_da gan ID.docx`. Có mấy node này thì màn nhập
   * đề mới suy được ĐỘ KHÓ từ mã YCCĐ — chính là thứ không kiểm được ở chế
   * độ seed/offline.
   */
  const COMPS = [
    { code: "SI10.02.15", title: "Công nghệ tế bào động vật", bloomLevel: 2 },
    { code: "SI10.02.12", title: "Quá trình nguyên phân", bloomLevel: 1 },
    { code: "SI10.02.13", title: "Giảm phân", bloomLevel: 2 },
    { code: "SI10.02.14", title: "Chu kỳ tế bào và ung thư", bloomLevel: 3 },
  ];
  for (const c of COMPS) {
    await db
      .collection("competencies")
      .doc(`comp-${c.code}`)
      .set(
        {
          id: `comp-${c.code}`,
          code: c.code,
          title: c.title,
          bloomLevel: c.bloomLevel,
          subjectId: "subject-sinh",
          gradeId: "grade-10",
          kind: "outcome",
        },
        { merge: true },
      );
  }

  console.log(`  ✓ campus · 3 khối · 2 môn · ${COMPS.length} node khung năng lực (Sinh 10)`);
  console.log(`\nXong. Mật khẩu chung: ${PASSWORD}`);
  console.log("Giao diện emulator: http://127.0.0.1:4000");
  console.log(
    "\nĐể thử nhập đề SHOC: chọn Môn 'Sinh học' + Khối 10 — mã SI10.* sẽ khớp\n" +
      "khung năng lực ở trên và độ khó tự điền theo Bloom.",
  );
  process.exit(0);
}

main().catch((e) => {
  console.error("✗ Nạp thất bại:", e.message);
  console.error("  Emulator đã chạy chưa? Thử: npm run emu:start");
  process.exit(1);
});
