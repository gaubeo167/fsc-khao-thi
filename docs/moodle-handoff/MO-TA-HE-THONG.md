# Mô tả hệ thống — FSC Exam Platform

Tài liệu kỹ thuật tổng quan: nền tảng, ngôn ngữ/công nghệ, kiến trúc và các chức năng của hệ thống khảo thí & học tập FSC.

> Cập nhật: 2026-06 · Dựa trên mã nguồn thực tế của repo `fsc-khao-thi`.

---

## 1. Tổng quan

FSC Exam Platform là nền tảng **khảo thí trực tuyến + học tập** cho hệ thống FSchools (nhiều cơ sở / campus). Hệ thống phục vụ toàn bộ vòng đời: soạn ngân hàng câu hỏi → tạo đề & ca thi → học sinh làm bài → chấm điểm → báo cáo, kèm các tính năng **bài tập về nhà**, **học liệu** và **phân quyền theo vai trò**.

Sản phẩm là một **ứng dụng web** (chạy trên trình duyệt, có responsive), kiến trúc **realtime** dựa trên Firebase, triển khai trên **Firebase Hosting** (khu vực Singapore).

---

## 2. Ngôn ngữ & công nghệ

Toàn bộ hệ thống viết bằng **TypeScript** (TypeScript 5.7) — một ngôn ngữ duy nhất cho cả frontend lẫn backend.

### 2.1 Frontend (ứng dụng web — `apps/web`)
| Hạng mục | Công nghệ | Phiên bản |
|---|---|---|
| Framework | **Next.js** (App Router) | 15 |
| Thư viện UI | **React** | 19 |
| Ngôn ngữ | **TypeScript** | 5.7 |
| CSS | **Tailwind CSS** | 4 |
| Thành phần UI | **Radix UI** (dialog, dropdown, radio, progress…) | — |
| Quản lý state | **Zustand** | 5 |
| Form & kiểm tra dữ liệu | **React Hook Form** + **Zod** | 4 |
| Data fetching | **TanStack React Query** | 5 |
| Icon | **lucide-react** | — |
| Thông báo (toast) | **sonner** | — |
| Công thức toán | **MathLive** + **KaTeX** | — |
| Đọc/ghi tài liệu | **docx**, **mammoth** (đọc Word), **jszip**, **xlsx** (Excel) | — |
| AI | **@anthropic-ai/sdk** (Claude) | — |

### 2.2 Backend & dữ liệu
- **Firebase** (nền tảng backend chính):
  - **Firebase Authentication** — đăng nhập, quản lý phiên.
  - **Cloud Firestore** — cơ sở dữ liệu NoSQL **realtime** (đồng bộ tức thời tới client).
  - **Firebase Storage** — lưu ảnh/file học liệu.
  - **Firebase Hosting** (Web Frameworks, region `asia-southeast1`) — nơi chạy ứng dụng Next.js.
  - **firebase-admin** — thao tác phía máy chủ/script.
- **Bộ xử lý bài thi quy mô lớn** (đường dữ liệu bền vững, tách riêng):
  - **`apps/api`** — máy chủ **Fastify** 5 (+ **Pino** logging) cung cấp API lưu/nộp bài thi.
  - **`apps/worker`** — tiến trình nền định kỳ đẩy dữ liệu từ bộ đệm sang CSDL.
  - **`packages/database`** — **Prisma** 6 ORM trên **PostgreSQL** (driver `pg`) + **Redis** (qua `ioredis`) làm bộ đệm nóng.

### 2.3 Công cụ build & quản lý mã
- **Monorepo** quản lý bằng **npm workspaces** + **Turborepo** (`turbo`).
- **tsx** để chạy TypeScript trực tiếp; **Prisma CLI** cho migration.
- Validation dùng chung qua **Zod** (gói `@fsc/shared`).

---

## 3. Kiến trúc & cấu trúc mã nguồn

Monorepo gồm **3 ứng dụng** và **3 gói dùng chung**:

```
apps/
  web/        → Ứng dụng web Next.js (giao diện chính, dùng Firebase trực tiếp)
  api/        → API Fastify cho luồng bài thi (Redis + Postgres)
  worker/     → Tiến trình nền: đẩy bài thi từ Redis → Postgres
packages/
  database/   → Prisma (Postgres) + Redis client (dùng bởi api & worker)
  shared/     → Kiểu dữ liệu & schema Zod dùng chung
  config/     → Cấu hình dùng chung
```

**Hai đường dữ liệu:**
1. **Đường realtime (chính):** `web` ↔ **Firestore** trực tiếp qua listener realtime — dùng cho gần như toàn bộ tính năng (ngân hàng câu hỏi, ca thi, BTVN, học liệu, báo cáo…).
2. **Đường bền vững cho bài thi quy mô lớn:** `web` → `api` (Fastify) → **Redis** (đệm nóng) → `worker` → **PostgreSQL** (lưu lâu dài). Mô hình `Attempt` / `Response` trong Prisma. Dùng khi cần chịu tải cao và đảm bảo không mất bài làm.

---

## 4. Mô hình dữ liệu & bảo mật

- **Firestore** lưu các tập dữ liệu chính: `users`, `campuses`, `subjects`, `grades`/`classes`, `questions`, `blueprints`, `packages`, `generated exams`, `shifts`, `exam_forms`, `attempts`, `homework`, `homework_attempts`, `learning materials`, `grading`, `proctor_events`, `audit_events`…
- **Bảo mật phía máy chủ** bằng **Firestore Security Rules** (`firestore.rules`): phân quyền theo vai trò, **cô lập theo campus**, học sinh chỉ đọc dữ liệu của chính mình (bài thi/BTVN), kho cá nhân chỉ chủ sở hữu truy cập, kho campus cần được duyệt.
- **Đông cứng đề (snapshot):** khi tạo ca thi, đề được "đóng băng" thành bản chụp — sửa câu hỏi sau đó không ảnh hưởng học sinh đang thi.
- **Nhật ký kiểm toán (`audit_events`)**: ghi lại mọi thay đổi quan trọng, chỉ thêm — không sửa/xoá.
- **Tối ưu quy mô lớn:** dữ liệu của học sinh được giới hạn truy vấn theo `studentId` (không tải toàn bộ collection), giúp hệ thống chịu được hàng nghìn học sinh đồng thời (xem `docs/HUONG-DAN-SU-DUNG.md` và lịch sử commit `perf(scale)`).

---

## 5. Phân quyền — 6 vai trò

| Vai trò | Phạm vi |
|---|---|
| **Học sinh** (student) | Làm bài thi, làm BTVN, xem học liệu, theo dõi tiến độ của bản thân |
| **Giáo viên** (teacher) | Soạn câu hỏi, giao BTVN, giám thị, chấm tự luận, xem báo cáo |
| **Trưởng bộ môn** (subject-lead) | Như giáo viên + duyệt câu hỏi/đề, quản lý khung đề |
| **Quản trị campus** (campus-admin) | Toàn quyền trong campus: người dùng, khối/lớp, môn, phê duyệt |
| **Giám đốc đào tạo** (academic-director) | Như quản trị campus, phạm vi đào tạo |
| **Superadmin** | Quản lý toàn hệ thống & các campus |

Phân quyền được thực thi 2 lớp: **giao diện** (ẩn/hiện menu theo vai trò + quyền cấp riêng) và **Firestore Rules** (lớp chốt phía máy chủ).

---

## 6. Các chức năng chính

### 6.1 Ngân hàng câu hỏi
- Soạn câu hỏi với trình soạn thảo giàu định dạng: **công thức toán** (MathLive/KaTeX), ảnh, video, audio, liên kết.
- **11+ loại câu hỏi:** Trắc nghiệm 1 đáp án, Trắc nghiệm nhiều đáp án, Đúng/Sai, Đ/S nhiều câu phụ, Điền khuyết, Ghép cặp, Sắp xếp thứ tự, Kéo thả, Gạch chân, Tự luận (rubric), Trả lời ngắn… và **AI tự sinh câu hỏi**.
- **Import từ Word**: tải file mẫu, soạn trong Word, công thức gõ bằng **MathType/Equation Editor** (hệ thống tự chuyển đổi khi nhập), ảnh dán trực tiếp.
- **AI hỗ trợ**: sinh câu hỏi hàng loạt, gợi ý đáp án.
- **Kho cá nhân / kho campus**, quy trình **duyệt** (Trưởng bộ môn), **đánh phiên bản** câu hỏi.
- **Hướng dẫn nhập từng bước theo từng loại** ngay trong form soạn câu.

### 6.2 Tạo đề & tổ chức thi
- **Khung đề (Blueprint)** — ma trận số câu dễ/trung bình/khó theo chủ đề.
- **Gói đề (Package)** — từ khung đề, cấu hình thời lượng, được duyệt.
- **Sinh đề** — tạo nhiều mã đề; **bắt buộc sinh đề mới được tạo ca thi**.
- **Ca thi (Shift)** — wizard 5 bước: đối tượng & danh sách HS → gói đề & thang điểm → lịch thi (giờ mở/đóng, vào muộn) → phòng & giám thị → cấu hình chống gian lận.

### 6.3 Làm bài thi (runtime)
- Đếm giờ, lưu tự động, đánh dấu câu để xem lại, mỗi ca làm 1 lần.
- **Chống gian lận (anti-cheat):** xáo câu/đáp án, chặn chuyển tab, fullscreen, chặn copy/paste… (tuỳ cấu hình).
- **Giám sát thi realtime** + giám thị gửi tin nhắn tới học sinh.
- Đề chạy trên **bản snapshot đóng băng**.

### 6.4 Chấm điểm & báo cáo
- **Trắc nghiệm chấm tự động**; **tự luận chấm tay theo rubric**, **ẩn danh** (giấu tên/lớp HS).
- **Kết quả & Báo cáo**: điểm từng HS, phổ điểm, thống kê theo ca/lớp.

### 6.5 Bài tập về nhà (BTVN)
- Giáo viên giao BTVN (chọn câu hỏi, đính kèm học liệu, chọn lớp/HS, đặt hạn).
- Học sinh làm, lưu giữa chừng, nộp; **chấm tự động** cho câu trắc nghiệm.
- Theo dõi tiến độ nộp của lớp.

### 6.6 Học liệu & tiến độ
- **Học liệu**: kho tài liệu/video/PDF chia sẻ theo môn · lớp.
- **Tiến độ học tập**: tổng hợp kết quả thi + BTVN của học sinh theo thời gian.

### 6.7 Quản trị
- **Người dùng** (tạo tài khoản GV/HS, cấp quyền), **Khối · lớp**, **Môn học**, **Phê duyệt**, **Quản lý campus** (superadmin).
- **Nhật ký hoạt động** (audit log).
- **Hướng dẫn trong ứng dụng**: nút *Hướng dẫn* theo từng trang + hướng dẫn nhập theo từng loại câu hỏi.

---

## 7. Triển khai

- **CI/CD:** đẩy mã lên **GitHub** → build & deploy lên **Firebase Hosting** (Next.js Web Frameworks, region `asia-southeast1`).
- **Quy tắc bảo mật** (`firestore.rules`, `storage.rules`) deploy qua **Firebase CLI** (`firebase deploy --only firestore:rules`).
- **Phát triển cục bộ:** `npm run dev` (Turborepo). Có **demo mode** chạy không cần Firebase (dùng dữ liệu mẫu) để xem thử nhanh. **Firebase Emulators** (Auth/Firestore/Storage) cho phát triển offline.
- Yêu cầu **Node.js 20+**.

---

*Chi tiết hướng dẫn sử dụng cho người dùng cuối: xem [HUONG-DAN-SU-DUNG.md](HUONG-DAN-SU-DUNG.md). Chi tiết triển khai: xem [../DEPLOYMENT.md](../DEPLOYMENT.md).*
