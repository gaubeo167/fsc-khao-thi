# FSC Exam Platform

Nền tảng khảo thí và vận hành học thuật cho hệ thống FPT Schools. Giáo viên soạn
câu hỏi, dựng khung đề, sinh đề tự động, lên ca thi, giám sát trực tiếp và chấm
bài. Học sinh làm bài thi và bài tập về nhà.

Quy mô đang phục vụ: 18 campus, ~20.000 học sinh, ~800 giáo viên.

**Đang chạy tại:** https://fsc-khao-thi.vercel.app

---

## Chạy trên máy bạn

```bash
npm install
npm run dev --workspace apps/web    # http://localhost:3000
```

Đăng nhập bằng tài khoản seed, mật khẩu chung `fpt2026`:

| Vai trò | Đăng nhập bằng |
|---|---|
| Superadmin | `vietnb4@fpt.edu.vn` |
| Admin campus | `admin.caugiay@fpt.edu.vn` |
| Giáo viên | `gv.toan.minh@fpt.edu.vn` |
| Học sinh | `U-401` (tab "Học sinh") |

### Bẫy quan trọng: local chạy ở chế độ seed

`apps/web/.env.local` **không chứa khoá Firebase**, nên `isFirebaseConfigured()`
trả `false` và toàn bộ ứng dụng chạy ở **chế độ seed/offline**:

- Không đọc, không ghi gì vào Firestore production. QA thoải mái trên localhost.
- Dữ liệu lấy từ `features/*/data/seed-*.ts`, nằm trong bộ nhớ trình duyệt.
- **Phiên đăng nhập chỉ nằm trong bộ nhớ.** Mỗi lần tải lại trang là mất đăng
  nhập, nên khi thao tác tự động phải điều hướng bằng cách bấm link trong app
  chứ không `goto` thẳng URL.
- Học sinh seed không có `username`/`studentCode` nên phải đăng nhập bằng id
  (`U-401`), không phải email. Tab "Học sinh" chặn ký tự `@` theo thiết kế.

Muốn chạy với Firestore thật thì điền `NEXT_PUBLIC_FIREBASE_*` vào `.env.local`.
Xem `apps/web/.env.example`.

### Bẫy thứ hai: đừng build khi dev server đang chạy

`next build` ghi đè `apps/web/.next` và làm dev server đang chạy trả 500
(`ENOENT vendor-chunks`). Dừng dev server trước, hoặc build xong thì
`rm -rf apps/web/.next` và khởi động lại.

---

## Kiểm thử

```bash
node scripts/test-short-answer.mjs     # so khớp đáp án trả lời ngắn (38 ca)
node scripts/test-grade.mjs            # chấm điểm theo chuẩn Bộ (18 ca)
node scripts/test-ai-error.mjs         # phân loại lỗi AI (16 ca)
node scripts/test-math-xss.mjs         # XSS ở bộ render công thức (13 ca)
node scripts/check-design-tokens.mjs   # bánh cóc thang chữ
npx tsc --noEmit -p apps/web/tsconfig.json
```

Không có framework test. Quy ước của repo là script node độc lập trong
`scripts/`, dùng `esbuild` để nạp module TypeScript. Sửa lỗi thì viết thêm ca
hồi quy khoá lại đúng lỗi đó.

`check-design-tokens.mjs` là **bánh cóc quay một chiều**: số chỗ dùng cỡ chữ tự
chế chỉ được giảm. Xem [DESIGN.md](DESIGN.md).

---

## Triển khai

Hai thứ deploy độc lập, và **đây là chỗ hay quên**:

```bash
git push origin main
npx vercel --prod --yes                                    # ứng dụng
npx firebase deploy --only firestore:rules --project fsc-khao-thi   # phân quyền
```

Đổi `firestore.rules` mà quên deploy rules thì code mới chạy với phân quyền cũ.
Ngược lại, siết rules trước khi code mới lên có thể chặn nhầm người dùng thật.
Thứ tự an toàn: nếu rules nới lỏng thì deploy rules trước; nếu rules siết chặt
thì deploy app trước.

Kiểm tra rules trước khi đẩy:

```bash
npx firebase deploy --only firestore:rules --project fsc-khao-thi --dry-run
```

---

## Cấu trúc mã nguồn

```
apps/web/src/
├── app/                      Next.js App Router
│   ├── (authenticated)/      35 trang sau đăng nhập
│   ├── api/                  20 route chạy Admin SDK  → docs/API.md
│   └── globals.css           Token thiết kế           → DESIGN.md
├── features/                 23 module theo nghiệp vụ
│   ├── question-bank/        Ngân hàng câu hỏi, 11 dạng câu
│   ├── exams/                Khung đề, gói đề, sinh đề, YCCĐ
│   ├── exam-forms/           Ảnh chụp đề đóng băng     → docs/CHAM-DIEM.md
│   ├── exam-shifts/          Ca thi, phòng, giám thị
│   ├── shift-exam/           Runtime làm bài của học sinh
│   ├── competencies/         Khung Yêu cầu cần đạt (YCCĐ)
│   └── …
├── lib/
│   ├── exam/grade.ts         Engine chấm             → docs/CHAM-DIEM.md
│   ├── exam/short-answer-match.ts   So khớp trả lời ngắn
│   ├── api-auth.ts           verifyCaller            → docs/MO-HINH-BAO-MAT.md
│   └── firestore-sync.ts     Đọc/ghi Firestore từ client
└── firestore.rules           25 collection           → docs/MO-HINH-BAO-MAT.md
```

**Điều bất thường cần biết ngay:** client (zustand store) đọc/ghi Firestore
**trực tiếp**, không đi qua API. Nghĩa là `firestore.rules` chính là hàng rào
phân quyền thật, không phải một lớp phòng thủ phụ. Đọc
[docs/MO-HINH-BAO-MAT.md](docs/MO-HINH-BAO-MAT.md) trước khi sửa bất cứ thứ gì
liên quan tới dữ liệu.

---

## Tài liệu

### Cho người viết code

| Tài liệu | Nội dung |
|---|---|
| [docs/CHAM-DIEM.md](docs/CHAM-DIEM.md) | Cơ chế chấm điểm: thang chuẩn Bộ, ScoringPolicy, ảnh chụp đề, so khớp trả lời ngắn |
| [docs/MO-HINH-BAO-MAT.md](docs/MO-HINH-BAO-MAT.md) | Vì sao rules là hàng rào thật, danh sách trắng vs đen, ranh giới Admin SDK |
| [docs/API.md](docs/API.md) | 20 route: method, quyền, vào/ra |
| [DESIGN.md](DESIGN.md) | Hệ thống thiết kế: thang chữ, màu, chuyển động, luật phòng thi |
| [CLAUDE.md](CLAUDE.md) | Quy ước cho tác nhân AI làm việc trên repo |

### Cho người dùng và người ra quyết định

| Tài liệu | Nội dung |
|---|---|
| [docs/HUONG-DAN-SU-DUNG.md](docs/HUONG-DAN-SU-DUNG.md) | Hướng dẫn theo từng vai trò |
| [docs/MO-TA-HE-THONG.md](docs/MO-TA-HE-THONG.md) | Mô tả tổng quan hệ thống |

### Kế hoạch (chưa thực hiện)

`docs/MIGRATION-POSTGRES.md` và `docs/MOODLE-REBUILD-SPEC.md` là **đề xuất
tương lai**, không mô tả hệ đang chạy. `docs/SECURITY-HARDENING-PLAN.md` là kế
hoạch theo giai đoạn và đã lạc hậu so với thực tế; phần bảo mật hiện hành nằm ở
[docs/MO-HINH-BAO-MAT.md](docs/MO-HINH-BAO-MAT.md).

---

## Công nghệ

Next.js 15 App Router · React 19 · TypeScript · Tailwind CSS v4 · Firebase
(Auth + Firestore + Storage) · Vercel · KaTeX cho công thức toán · Gemini /
Anthropic cho các tính năng AI.

## Sáu vai trò

`superadmin` › `academic-director` › `campus-admin` › `subject-lead` ›
`teacher` › `student`

Năm vai đầu là "staff" (`STAFF_ROLES` trong `lib/api-auth.ts`). Superadmin cố ý
**chỉ xem tổng quan toàn hệ thống**, không thao tác bên trong campus; muốn làm
việc trong campus thì đăng nhập bằng tài khoản admin của campus đó.
