# Bàn giao: Dựng lại FSC Exam Platform trên Moodle

Thư mục này là **bộ bàn giao tự chứa** để mở một phiên Claude Code mới và **build lại toàn bộ chức năng** của FSC Exam Platform trên nền **Moodle** (native, dùng module/plugin Moodle).

> Mục tiêu: phiên mới có đủ thông tin để dựng Moodle, cấu hình, cài plugin, di trú dữ liệu và viết plugin custom cho phần Moodle chưa có — **không sót chức năng nào** so với hệ thống Next.js + Firebase hiện tại.

---

## 📁 Các file trong bộ bàn giao (đọc theo thứ tự)

| File | Nội dung | Vai trò |
|---|---|---|
| `README.md` (file này) | Cách bắt đầu phiên mới + prompt | **Bắt đầu ở đây** |
| `01-FEATURE-INVENTORY.md` | **Kiểm kê ĐẦY ĐỦ mọi chức năng** hiện có (checklist) | Đảm bảo không sót |
| `02-MOODLE-REBUILD-SPEC.md` | Ánh xạ FSC → Moodle, plugin, khoảng trống, lộ trình | Bản đồ thực thi |
| `03-DATA-MODEL.md` | Mô hình dữ liệu 20 thực thể (để viết converter) | Tham chiếu schema |
| `04-SETUP-MOODLE.md` | docker-compose + cấu hình Moodle lần đầu | Dựng môi trường |
| `05-QUESTION-CONVERTER.md` | Spec chuyển câu hỏi Firestore → Moodle XML | Di trú ngân hàng câu hỏi |
| `convert-questions.mjs` | **Script chuyển câu hỏi hoàn chỉnh** (11 loại) — chạy `node convert-questions.mjs ./firestore-export ./moodle-xml` | Di trú (dùng ngay) |
| `MO-TA-HE-THONG.md` | Mô tả hệ thống hiện tại (công nghệ/kiến trúc/chức năng) | Bối cảnh |

> Tất cả file cần thiết đã được copy sẵn vào thư mục này → chỉ cần copy **cả thư mục `moodle-handoff/`** sang nơi mới.

---

## 🚀 Các bước bắt đầu phiên làm việc mới

### Bước 1 — Chuẩn bị thư mục/repo mới cho Moodle
Tạo một thư mục TRỐNG (không phải repo Next.js cũ), ví dụ `fsc-moodle/`, rồi copy bộ bàn giao vào:
```bash
mkdir fsc-moodle && cd fsc-moodle
cp -r /Users/vietnb/FSC_EXAM_PLATFORM/docs/moodle-handoff ./handoff
git init -b main   # tuỳ chọn
```
> Vì sao thư mục riêng: dự án Moodle là PHP + cấu hình + plugin, khác hẳn repo Next.js. Tách ra cho sạch, repo cũ vẫn chạy song song tới khi cutover.

### Bước 2 — (Tuỳ chọn) Mang theo bản xuất dữ liệu để di trú
Nếu muốn migrate dữ liệu thật, chạy export ở repo cũ trước rồi copy sang:
```bash
# tại repo Next.js cũ (cần serviceAccount.json)
node scripts/export-firestore.mjs
cp -r firestore /đường-dẫn/fsc-moodle/firestore-export
```

### Bước 3 — Mở Claude Code trong `fsc-moodle/` và gửi prompt khởi động
Dán nguyên đoạn ở [§ Prompt khởi động](#-prompt-khởi-động) bên dưới.

### Bước 4 — Trả lời 6 quyết định
Phiên mới sẽ hỏi 6 quyết định (cô lập campus, hosting, auth, proctoring, lịch sử dữ liệu, giao diện) — xem mục 11 của `02-MOODLE-REBUILD-SPEC.md`. Trả lời để chốt hướng.

### Bước 5 — Theo lộ trình 10 bước
Phiên mới thực thi theo "Lộ trình build" (mục 10 của spec): dựng Moodle → cấu trúc/vai trò → người dùng → ngân hàng câu hỏi → ca thi → BTVN/học liệu → chấm/báo cáo → plugin custom → theme/mobile → di trú & nghiệm thu. Dùng `01-FEATURE-INVENTORY.md` làm checklist nghiệm thu từng phần.

---

## 💬 Prompt khởi động

> Copy nguyên khối dưới, dán vào phiên Claude Code mới (mở trong thư mục `fsc-moodle/`):

```
Tôi muốn DỰNG LẠI hệ thống khảo thí "FSC Exam Platform" trên nền MOODLE
(native — dùng module/plugin Moodle), thay cho bản Next.js + Firebase cũ.
KHÔNG giữ frontend React; mục tiêu là tận dụng tối đa Moodle.

Tài liệu bàn giao nằm trong thư mục ./handoff — HÃY ĐỌC TRƯỚC, theo thứ tự:
  1. handoff/README.md
  2. handoff/01-FEATURE-INVENTORY.md   ← danh sách ĐẦY ĐỦ chức năng phải đạt
  3. handoff/02-MOODLE-REBUILD-SPEC.md ← bản đồ ánh xạ FSC → Moodle + plugin + lộ trình
  4. handoff/03-DATA-MODEL.md          ← mô hình dữ liệu (để viết converter)
  5. handoff/04-SETUP-MOODLE.md        ← docker-compose dựng Moodle
  6. handoff/05-QUESTION-CONVERTER.md  ← chuyển câu hỏi Firestore → Moodle XML
  7. handoff/MO-TA-HE-THONG.md         ← bối cảnh hệ thống cũ

Yêu cầu:
- Trước khi build, HỎI TÔI 6 quyết định ở mục 11 của 02-MOODLE-REBUILD-SPEC.md.
- Sau khi tôi chốt, bắt đầu Giai đoạn 1: dựng Moodle 4.5 LTS bằng Docker
  (PostgreSQL + Redis) theo 04-SETUP-MOODLE.md, cấu hình tiếng Việt + MathJax,
  rồi hướng dẫn tôi từng bước.
- Đi theo "Lộ trình build" (mục 10 của spec). Sau mỗi phần, đối chiếu với
  01-FEATURE-INVENTORY.md để xác nhận đủ chức năng trước khi sang phần kế.
- Phần Moodle không có sẵn (gạch chân, giám sát realtime + nhắn tin giám thị,
  nhận xét AI…): xác định rõ và đề xuất plugin custom — đừng bỏ qua.

Nếu có firestore-export trong ./firestore-export thì dùng cho bước di trú.
Bắt đầu bằng việc đọc tài liệu và hỏi tôi 6 quyết định.
```

---

## ✅ Tiêu chí "đầy đủ"

Phiên mới coi là hoàn thành khi **mọi mục trong `01-FEATURE-INVENTORY.md` đều có lời giải trên Moodle** (bằng module có sẵn, cấu hình, hoặc plugin custom đã liệt kê), và đã di trú được người dùng + ngân hàng câu hỏi + học liệu.

---

*Hệ thống Next.js + Firebase hiện tại vẫn chạy độc lập cho tới khi cutover sang Moodle. Kế hoạch chuyển Supabase/Postgres trước đây (docs/MIGRATION-POSTGRES.md ở repo cũ) KHÔNG còn cần thiết nếu chọn hướng Moodle — Moodle tự có DB Postgres riêng; chỉ giữ schema để tham khảo khi viết converter.*
