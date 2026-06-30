# Kế hoạch chuyển đổi sang PostgreSQL (Supabase)

Tài liệu kiến trúc & lộ trình chuyển hệ thống FSC Exam Platform từ **Cloud Firestore (NoSQL)** sang **PostgreSQL (Supabase)**, theo hướng **chuyển dần từng phần (strangler), chạy song song** để không làm gián đoạn hệ thống đang phục vụ học sinh.

> Trạng thái: **Giai đoạn 0 — thiết kế & nền móng**. Chưa thay đổi luồng đang chạy.

---

## 1. Quyết định đã chốt

| Hạng mục | Lựa chọn |
|---|---|
| Cơ sở dữ liệu | **PostgreSQL trên Supabase** (managed) |
| Realtime | **Supabase Realtime** (thay listener Firestore) |
| Xác thực (Auth) | **GIỮ Firebase Auth** — chỉ chuyển *dữ liệu* sang Postgres |
| Lưu file/ảnh | Supabase Storage (hoặc giữ Firebase Storage giai đoạn đầu) |
| ORM | **Prisma** (đã có sẵn trong `packages/database`) |
| Cách triển khai | **Strangler** — chuyển từng domain, chạy song song, cutover từng phần |

**Vì sao giữ Firebase Auth:** luồng đăng nhập của HS/GV đang ổn định; tách phần Auth ra khỏi phạm vi giúp giảm rủi ro lớn nhất. Supabase sẽ được cấu hình **tin tưởng JWT của Firebase** (third-party auth) để RLS/Realtime vẫn nhận diện đúng người dùng.

---

## 2. Kiến trúc đích

```
Trình duyệt (Next.js, React)
   │  đăng nhập  ─────────────►  Firebase Auth  (giữ nguyên)
   │  lấy ID token (JWT)
   │
   │  đọc/ghi dữ liệu + realtime
   ▼
Supabase
   ├─ PostgreSQL  (dữ liệu: users, questions, shifts, attempts, homework, …)
   ├─ Realtime    (stream thay đổi bảng → client; thay onSnapshot)
   ├─ RLS         (Row Level Security — tin JWT Firebase, lọc theo uid/campus/role)
   └─ Storage     (ảnh câu hỏi, học liệu)
```

- **Client → Supabase trực tiếp** cho phần lớn truy vấn (giống cách hiện gọi Firestore trực tiếp), bảo vệ bằng **RLS** — tương đương Firestore Security Rules.
- **Tầng API (`apps/api` Fastify)** chỉ dùng cho thao tác cần đặc quyền/giao dịch phức tạp (vd nộp bài thi quy mô lớn, chấm điểm, sinh đề) — chạy bằng service-role key phía máy chủ.
- **Realtime:** Supabase Realtime phát thay đổi (INSERT/UPDATE/DELETE) theo bảng + bộ lọc → thay thế `onSnapshot`. RLS áp dụng cho cả realtime nên HS chỉ nhận thay đổi của chính mình.

---

## 3. Tầng truy cập dữ liệu (mấu chốt để chuyển dần)

Hiện mỗi store gọi thẳng helper Firestore (`subscribeCollection`, `writeDoc`, `patchDoc`). Để chuyển **từng domain** mà không viết lại toàn bộ một lần, ta tạo một **lớp repository trừu tượng**:

```
features/<domain>/state/<x>-store.ts
        │ gọi
        ▼
lib/data/<x>-repo.ts   ← interface chung: list/subscribe/get/create/update/remove
        │ chọn backend theo cờ
        ├─ firestore-adapter   (hiện tại)
        └─ supabase-adapter     (mới)
```

- Một **cờ cấu hình theo domain** (vd biến môi trường `DATA_BACKEND_<DOMAIN>=supabase|firestore`) quyết định domain nào đã chuyển.
- Nhờ vậy có thể bật Postgres cho **1 domain**, kiểm thử, rồi mới bật domain tiếp theo — chạy song song an toàn.

---

## 4. Di trú dữ liệu (Firestore → Postgres)

- Viết script **một chiều** đọc toàn bộ collection từ Firestore (qua firebase-admin) và ghi vào Postgres (qua Prisma), ánh xạ kiểu: `Timestamp → timestamptz`, `Reference → khoá ngoại`, mảng/đối tượng lồng → cột `jsonb` hoặc bảng con.
- Chạy **idempotent** (upsert theo id) để có thể chạy lại nhiều lần.
- Trong giai đoạn song song: **đồng bộ hai chiều tạm thời** cho domain đang cutover (ghi cả 2 nơi) hoặc khoá ghi ngắn khi cutover từng domain.
- Đã có sẵn `scripts/export-firestore.mjs` / `import-firestore.mjs` (Firestore↔Firestore) làm tham khảo cho bước đọc.

---

## 5. Lộ trình theo giai đoạn

Thứ tự ưu tiên: **danh mục tĩnh trước (ít rủi ro) → dữ liệu nặng/cần SQL → dữ liệu realtime cao (cuối)**.

| GĐ | Nội dung | Domain | Ghi chú |
|---|---|---|---|
| **0** | Thiết kế schema, nền móng, kế hoạch (tài liệu này) | — | Không đụng luồng chạy |
| **1** | Tạo Supabase project, schema Prisma, RLS cơ bản, cấu hình Firebase third-party auth | — | Cần bạn cấp quyền (mục 7) |
| **2** | Repository abstraction + Supabase adapter + realtime adapter | hạ tầng | Có cờ chuyển/đổi domain |
| **3** | Chuyển **danh mục tĩnh** | campuses, subjects, grades, classes, users | Ít thay đổi, ít realtime → an toàn để thử pattern |
| **4** | Chuyển **ngân hàng nội dung** | questions, blueprints, packages, generated_exams, materials | Dữ liệu lớn, hưởng lợi từ truy vấn SQL |
| **5** | Chuyển **thi & bài tập** | shifts, exam_forms, homework | Có lịch + snapshot |
| **6** | Chuyển **bài làm & realtime cao** | attempts/responses, homework_attempts, proctor_events, grading | Cần realtime + giao dịch; dùng `apps/api` cho ghi nặng |
| **7** | Báo cáo SQL, dọn Firestore, tối ưu index | — | Tận dụng sức mạnh SQL cho thống kê |

Mỗi giai đoạn: **bật cho 1 campus/nhóm thử → đối chiếu dữ liệu → mở rộng → tắt nhánh Firestore của domain đó.**

---

## 6. Lợi ích sau khi chuyển

- **Truy vấn/báo cáo mạnh** (JOIN, GROUP BY, view) — thay vì tải cả collection về client rồi lọc.
- **Chi phí dự đoán được** (không tính theo lượt đọc tài liệu như Firestore).
- **Toàn vẹn dữ liệu** bằng khoá ngoại + ràng buộc + giao dịch (vd nộp bài thi nguyên tử).
- **Mở rộng tốt cho hàng nghìn HS** thi đồng thời (kết hợp `apps/api` + Redis đã có).
- Nền tảng SQL chuẩn, dễ tích hợp công cụ BI/analytics sau này.

---

## 7. Việc BẠN cần chuẩn bị (cần để bắt đầu Giai đoạn 1)

1. **Tạo Supabase project** (https://supabase.com) → lấy:
   - `DATABASE_URL` (Postgres connection string, có pooler cho serverless)
   - `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (giữ bí mật, chỉ dùng phía máy chủ)
2. **Cấu hình Firebase third-party auth trong Supabase** (Authentication → Third-party / JWT) để Supabase tin JWT của Firebase project hiện tại.
3. **Cấp quyền chạy migration**: `serviceAccount.json` (đã có) + các key Supabase ở trên, đặt trong `.env` (KHÔNG commit).
4. Xác nhận **vùng đặt Supabase** (nên Singapore `ap-southeast-1` cho gần người dùng).

> Khi có các thông tin trên, tôi sẽ: tạo schema Prisma + RLS, viết adapter Supabase + realtime, viết script di trú, và chuyển **domain đầu tiên (danh mục tĩnh)** để bạn kiểm thử trước khi mở rộng.

---

## 8. Rủi ro & giảm thiểu

| Rủi ro | Giảm thiểu |
|---|---|
| Gián đoạn hệ thống đang chạy | Strangler + chạy song song; cutover từng domain; có cờ tắt/bật |
| Mất/sai dữ liệu khi di trú | Script idempotent (upsert theo id); đối chiếu số lượng + mẫu trước khi tắt Firestore |
| Realtime khác hành vi | Adapter realtime riêng; kiểm thử kỹ giám sát thi + tự lưu bài trước khi chuyển GĐ 6 |
| RLS cấu hình sai → lộ/khoá dữ liệu | Viết RLS phản chiếu đúng `firestore.rules` hiện có; test theo từng vai trò |
| Auth (Firebase JWT ↔ Supabase) | Giữ Firebase Auth; cấu hình third-party JWT; nếu trục trặc, fallback qua `apps/api` (verify token phía server) |

---

*Tài liệu liên quan: [MO-TA-HE-THONG.md](MO-TA-HE-THONG.md) (kiến trúc hiện tại), [../DEPLOYMENT.md](../DEPLOYMENT.md). Schema Prisma chi tiết sẽ bổ sung ở `prisma/schema.prisma` trong Giai đoạn 1.*
