# Kế hoạch củng cố bảo mật & chịu tải (bản Next.js + Firebase)

Theo sau bản đánh giá. Chia giai đoạn: **GĐ1 làm ngay (an toàn)**, **GĐ2-3 cần phối hợp/deploy + kiểm thử**.

---

## ✅ Giai đoạn 1 — ĐÃ LÀM (an toàn, đã typecheck)

### 1a. Xác thực mọi endpoint `/api` nhạy cảm
- Thêm `src/lib/api-auth.ts` (`verifyCaller`) — verify Firebase ID token + kiểm role.
- Thêm `authHeaders()` trong `src/lib/api-client.ts` — client gắn `Bearer <idToken>`.
- Áp cho: `ai/generate-question`, `generate-questions-batch`, `generate-toc`, `generate-image` (staff), `ai/assess-progress` (đăng nhập), `import/parse`, `admin/import/students` (staff). Cập nhật 7 client caller gửi token.
- **Kết quả:** không còn ai ẩn danh gọi được để đốt tiền LLM / parse file.

### 1b. Siết rule write-path an toàn (⚠️ cần deploy)
- `/proctor_events` update: chỉ HS-mục-tiêu (ack của mình) hoặc GV+ (trước là mọi user).
- `/grades_essay` create: bắt buộc `graderId == uid` (không mạo danh grader khác).
- **Deploy:** `firebase deploy --only firestore:rules` (sau khi code deploy).

> **Còn thiếu ở GĐ1:** rate-limit endpoint AI (serverless không có bộ nhớ chung) — làm ở GĐ2 bằng Firestore counter hoặc Upstash Redis.

---

## 🔴 Giai đoạn 2 — TÍNH TOÀN VẸN THI (quan trọng nhất, thay đổi lớn)

**Vấn đề:** HS đọc trực tiếp `/questions` & `/exam_forms` (có đáp án) qua SDK, và chấm điểm ở client + tự ghi `score` → kết quả thi không đáng tin.

**Giải pháp (server-authoritative exam):**
1. **Không cho HS đọc `/questions` & `/exam_forms`.** Siết rule đọc 2 collection này về `isTeacherOrAbove()` (HS không đọc).
2. **Phục vụ đề qua API server đã xác thực** — route mới `GET /api/exam/[shiftId]/questions`:
   - verify token + kiểm HS thuộc roster ca thi + ca đang mở.
   - trả câu hỏi **đã lọc bỏ** `isCorrect`/`correctAnswer`/`acceptedAnswers` (chỉ nội dung + phương án).
3. **Chấm điểm phía server** — route `POST /api/exam/[shiftId]/submit`:
   - nhận đáp án HS, server tự chấm (đọc đáp án đúng bằng Admin SDK), ghi `score`/`correctCount` **server-side**.
   - rule `/attempts`: HS **không được tự set** `score`/`submittedAt` (chỉ server-role ghi các field này). Có thể chuyển hẳn attempts sang ghi qua API (Admin SDK) và khoá client write.
4. **Autosave đáp án** vẫn có thể để client ghi `answers` (không phải điểm), hoặc qua API.

**Rủi ro/công:** cao — viết lại luồng làm bài + chấm; cần kiểm thử kỹ. Cân nhắc dùng **apps/api (Fastify) + Redis + Postgres** đã có cho luồng này (đúng thiết kế "đường bài thi bền vững").

**Lưu ý:** đây chính là thứ Moodle làm sẵn (Quiz chấm server, đáp án không lộ). Nếu theo hướng Moodle, GĐ2 được giải quyết bởi nền tảng.

---

## 🟠 Giai đoạn 3 — RÒ RỈ PII & CÔ LẬP CAMPUS

### 3a. Khoá `/users` read (đang PUBLIC — lộ SĐT/email phụ huynh, mã HS…)
- Đổi rule: `allow read: if isSignedIn() && (uid() == userId || isTeacherOrAbove());`
  - Query scoped của HS (`where documentId == uid`) và query của staff (đọc tất cả) đều qua được; **ẩn danh bị chặn**.
- **Vướng:** login legacy (username không có email tổng hợp) hiện lookup `/users` **trước khi đăng nhập** qua `resolveLoginEmail`.
  - **Giải:** viết **Cloud Function** (HTTPS callable, không cần auth) `resolveLoginEmail(identifier)` chạy Admin SDK trả email → client gọi thay vì query Firestore trực tiếp. Sau đó khoá `/users` read như trên.
- **Rủi ro:** trung bình (đụng luồng login) → cần Cloud Function + test kỹ HS legacy.

### 3b. Cô lập campus ở tầng dữ liệu
- Thêm điều kiện campus vào rule đọc các collection nội dung/điểm (`questions`, `shifts`, `homework`, `exam_forms`, `grades_essay`, `learning_materials`…): chỉ đọc trong campus của mình (superadmin bỏ qua).
- **Vướng lớn:** rule đọc theo `resource.data.campusId` **làm hỏng query `onSnapshot` toàn collection** (Firestore chặn nếu không tĩnh-đánh-giá được). → **Bắt buộc** đổi client sang **query có `where(campusId == ...)`** TRƯỚC, rồi mới siết rule.
- Làm cùng lúc với việc scope subscription theo campus (cũng giúp **giảm tải đọc** — xem GĐ4).

### 3c. Storage
- Siết `read` từ `isSignedIn()` → kiểm campus, hoặc dùng **signed URL ngắn hạn** từ Cloud Function thay cho URL vĩnh viễn.

---

## 🟠 Giai đoạn 4 — CHỊU TẢI

1. **Scope subscription theo campus** cho các collection còn tải nguyên khối (`shifts, exam_forms, homework, packages, blueprints, grading, materials, subjects, grades, classes, teaching, proctor_events`) — thêm `where(campusId == session.campusId)`; kết hợp GĐ3b.
2. **Giảm `get(/users/uid)` trong rules**: mỗi thao tác tốn +1 read. Cân nhắc đưa `role`/`campusId` vào **custom claims** của Firebase Auth (set qua Admin SDK khi tạo/sửa user) → rule đọc `request.auth.token.role` KHÔNG cần `get()` → giảm read + latency đáng kể ở tải cao.
3. **Load-test** kịch bản **thi đồng thời** (đỉnh tải thật): mô phỏng N HS vào 1 ca cùng lúc (k6/artillery + tài khoản test trên staging), đo Firestore reads/writes, độ trễ, quota. BTVN async ít rủi ro hơn.
4. **Debounce autosave** nếu ghi quá dày (giới hạn ~1 write/giây/doc).
5. Cân nhắc chuyển luồng attempts sang **apps/api + Redis (đệm) + Postgres** (đã có sẵn) cho quy mô nghìn HS thi đồng thời.

---

## Thứ tự đề xuất
GĐ1 (xong) → **deploy + test login/AI** → GĐ3a (khoá /users + Cloud Function) → GĐ2 (chấm server) → GĐ4 (scope campus + custom claims + load-test) → GĐ3b/3c.

> Nếu bạn nghiêng về **chuyển Moodle**, thì GĐ2 (chấm server) và phần lớn GĐ3-4 được nền tảng Moodle lo sẵn — nên cân nhắc mức đầu tư vào bản Next.js.

---

*Cập nhật: sau bản đánh giá security & load. GĐ1 đã có trong code (chưa deploy rules).*
