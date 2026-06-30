# Spec: Dựng lại FSC Exam Platform trên nền Moodle

Tài liệu kỹ thuật để **build lại toàn bộ hệ thống FSC trên chuẩn Moodle**, tận dụng tối đa module/plugin có sẵn của Moodle thay vì tự code giao diện.

> Dùng tài liệu này để **mở một phiên làm việc mới** và thực thi việc dựng hệ thống trên Moodle. Đọc kèm [MO-TA-HE-THONG.md](MO-TA-HE-THONG.md) (mô tả hệ thống hiện tại — nguồn sự thật về tính năng cần có).

---

## 0. Cách dùng tài liệu này trong phiên mới

Mở phiên Claude Code mới **trong một thư mục/repo trống cho Moodle** (KHÔNG phải repo Next.js hiện tại) và dán prompt khởi động ở [Phụ lục A](#phụ-lục-a--prompt-khởi-động-cho-phiên-mới). Phiên mới sẽ: dựng Moodle (Docker) → cài plugin → cấu hình cấu trúc khoá học/vai trò → import ngân hàng câu hỏi → tạo quiz cho ca thi → migrate dữ liệu → viết plugin custom cho phần Moodle chưa có.

---

## 1. Quyết định nền tảng (đề xuất mặc định)

| Hạng mục | Đề xuất | Ghi chú |
|---|---|---|
| **Phiên bản** | **Moodle 4.5 LTS** (hoặc 5.x mới nhất ổn định) | LTS = hỗ trợ dài, nhiều plugin tương thích |
| **Ngôn ngữ/stack** | PHP 8.2+, **PostgreSQL** (hoặc MariaDB), Redis (cache/session), Nginx/Apache | Khớp ý muốn dùng Postgres |
| **Triển khai** | **Docker** (`moodle-docker` chính thức) cho dev → server riêng/managed cho prod | Dễ tái lập |
| **Giao diện** | **Moodle native + theme tuỳ biến** (Boost / Boost Union / Moove) | KHÔNG giữ React — để dùng được module Moodle |
| **Đa cơ sở (campus)** | **Category lồng nhau + role theo context** (miễn phí) | Cô lập "mềm"; muốn cô lập cứng → Moodle Workplace (trả phí) hoặc nhiều instance |
| **Xác thực** | Moodle native (email/manual, bulk CSV) | Tuỳ chọn SSO Firebase qua plugin OAuth2/OIDC |
| **Mobile** | **Moodle App** chính thức (miễn phí) | Có sẵn, không cần build |
| **Web service/API** | Bật REST API nếu sau này cần tích hợp ngoài | Không bắt buộc cho bản native |

> **Đánh đổi cần biết:** Moodle cho **quiz, ngân hàng câu hỏi, chấm điểm, gradebook, vai trò, báo cáo, mobile** rất mạnh và miễn phí — đây là phần lớn hệ thống FSC. Đổi lại, một số tính năng "đặc thù FSC" không có sẵn 1-1 (xem [mục 7 — Khoảng trống](#7-khoảng-trống--cần-plugin-custom)).

---

## 2. Ánh xạ kiến trúc tổng thể

```
FSC hiện tại (Next.js + Firestore)        →   Moodle 4.5
────────────────────────────────────────      ────────────────────────────────
Campus                                    →   Course Category (cấp 1)
Khối / Lớp                                →   Subcategory + Cohort (lớp) + Group
Môn học                                   →   Course (hoặc Category môn) trong campus
Ngân hàng câu hỏi + Khung đề (topic)      →   Question bank + Question categories + Tags
Gói đề (ma trận dễ/TB/khó) + "Sinh đề"    →   Quiz "Random questions" theo category + độ khó
                                              (Moodle tự sinh đề khác nhau cho mỗi HS)
Ca thi (Shift)                            →   Quiz activity (mở/đóng, giới hạn giờ, 1 lượt)
"Đóng băng đề" (snapshot)                 →   Question versioning (4.x) — attempt giữ version cũ
Phòng thi / giám thị                      →   Groups / Groupings + Quiz overrides + role giám thị
Bài làm (Attempt)                         →   quiz_attempts / question_attempts
Chấm trắc nghiệm tự động                  →   Quiz auto-grading
Chấm tự luận theo rubric (ẩn danh)        →   Manual grading + Advanced grading (Rubric) + Anonymous
BTVN                                      →   Quiz (tự chấm) hoặc Assignment (nộp bài) + Resource
Học liệu (video/PDF…)                     →   Resource: File/URL/Folder/Page/Book + H5P
Tiến độ học tập                           →   Course completion + Gradebook + Report builder
Báo cáo & phổ điểm                        →   Quiz reports + Report builder (4.x) / Configurable Reports
6 vai trò                                 →   Roles + Capabilities theo Context
Nhật ký audit                             →   Moodle Logs (core logging)
Nhận xét AI                               →   Moodle AI subsystem (4.5+) / plugin / custom block
Công thức toán (MathLive/KaTeX)           →   MathJax filter + MathType (WIRIS) plugin
Import từ Word                            →   qformat_wordtable (Word table → question bank)
```

---

## 3. Cấu trúc Category & Vai trò (đa cơ sở)

### 3.1 Cây category
```
FSchools (site)
 ├─ Campus: Cầu Giấy            (Category)   ← Manager = Quản trị campus
 │   ├─ Khối 6 → Môn Toán       (Course)
 │   ├─ Khối 7 → Môn Toán       (Course)
 │   └─ …
 ├─ Campus: Hoà Lạc            (Category)
 └─ Campus: Đà Nẵng            (Category)
```
- **Cohort** mỗi lớp (vd `7A1-CauGiay`) để ghi danh hàng loạt HS vào course.
- **Group/Grouping** trong course = phòng thi / nhóm giám thị.

### 3.2 Ánh xạ vai trò (Roles + Context)
| Vai trò FSC | Role Moodle | Gán ở context |
|---|---|---|
| Học sinh | Student | Course (qua cohort/enrol) |
| Giáo viên | Teacher (editingteacher) | Course |
| Trưởng bộ môn | **Custom role "Subject Lead"** (quyền duyệt câu hỏi: `moodle/question:*`) | Category môn/khối |
| Quản trị campus | Manager | Category campus |
| Giám đốc đào tạo | Manager | Category cấp trên (nhiều campus) |
| Superadmin | Site Administrator | System |
| Giám thị | Custom role "Proctor" (xem attempt, override) | Course/Quiz |

→ Cô lập campus đạt được nhờ **Manager chỉ được gán ở category campus của mình**. (Cô lập tuyệt đối giữa campus cần **Moodle Workplace tenants** — trả phí — hoặc tách instance.)

---

## 4. Ánh xạ 11 loại câu hỏi → Question types Moodle

| Loại FSC | Question type Moodle | Core/Plugin |
|---|---|---|
| mcq-single | **Multiple choice** (một đáp án) | Core |
| mcq-multi | **Multiple choice** (nhiều đáp án) hoặc `qtype_oumultiresponse` | Core / contrib |
| true-false | **True/False** | Core |
| multi-tf (Đ/S nhiều câu phụ) | **Multiple True/False** `qtype_mtf` | Contrib |
| fill-blank (điền khuyết) | **Missing words** (`gapselect`) hoặc **Cloze/Embedded** (`multianswer`) hoặc Short answer | Core |
| matching (ghép cặp) | **Matching** | Core |
| ordering (sắp xếp) | **Ordering** `qtype_ordering` | Contrib |
| drag-drop (kéo thả) | **Drag and drop into text** (`ddwtos`) / **onto image** (`ddimageortext`) | Core |
| underline (gạch chân) | ⚠ Không có sẵn → map sang `ddwtos`/Cloze, hoặc **viết qtype custom** | Custom (xem mục 7) |
| short-answer (trả lời ngắn) | **Short answer** | Core |
| essay (tự luận) | **Essay** + Advanced grading (Rubric) | Core |
| ai-generated | Dùng **Moodle AI** sinh câu / plugin sinh câu hỏi | Core 4.5+ / contrib |

- **Tổ chức:** question categories theo `Môn → Khối → Chủ đề (TOC)`, gắn **tag độ khó** (`dễ/TB/khó`) để quiz random theo ma trận.
- **Công thức toán:** bật `filter_mathjaxloader` (TeX) + cài **MathType/WIRIS** (`filter_wiris` + `tiny_wiris`) để soạn công thức WYSIWYG như MathLive hiện tại.

---

## 5. Ca thi & Bài tập về nhà

### 5.1 Ca thi = Quiz activity
- **Lịch:** "Open the quiz" / "Close the quiz" (= giờ mở/đóng); **Time limit** = thời lượng.
- **1 lượt:** Attempts allowed = 1.
- **Gói đề / sinh đề:** thêm **Random questions** lấy N câu từ category theo tag độ khó → mỗi HS một đề khác nhau (thay cho "sinh đề" thủ công). **Shuffle** câu + đáp án = anti-cheat randomize.
- **Đóng băng đề:** Moodle 4.x có **question versioning** — sửa câu sau khi HS đã làm sẽ tạo version mới, attempt cũ giữ version cũ (đúng tinh thần snapshot FSC).
- **Phòng/giám thị:** Groups = phòng; **Quiz overrides** theo group/user (giờ riêng, mật khẩu phòng); role **Proctor** xem tiến trình.
- **Chống gian lận:** **Safe Exam Browser** (`quizaccess_seb`, core), require password, browser security, + plugin proctoring (mục 7).
- **Thang điểm /10:** đặt **Maximum grade** = 10; gradebook quy đổi.

### 5.2 BTVN
- **Dạng câu hỏi tự chấm** → một **Quiz** không giám sát, nhiều lượt, không giới hạn giờ.
- **Dạng nộp bài/tự luận** → **Assignment** (`mod_assign`) + Rubric.
- **Học liệu đính kèm** → thêm Resource (File/URL/Page) vào cùng topic của course.

---

## 6. Chấm điểm, Báo cáo, Tiến độ

- **Chấm tự luận theo rubric, ẩn danh:** Quiz → manual grading câu Essay + **Advanced grading: Rubric/Marking guide**; bật **Anonymous** (blind marking) như "chấm ẩn danh" của FSC.
- **Báo cáo:** Quiz có sẵn *Grades / Responses / Statistics / Manual grading*; toàn trường dùng **Report builder** (4.x core) hoặc **Configurable Reports** (contrib) cho phổ điểm/thống kê theo lớp-ca.
- **Tiến độ học tập:** **Course completion** + **Activity completion** + **Gradebook** + (tuỳ chọn) **Learning Analytics**. Thay cho trang "Tiến độ học tập" + nhận xét AI hiện tại.

---

## 7. Khoảng trống — cần plugin custom

Moodle KHÔNG có sẵn các phần này, cần viết plugin hoặc chấp nhận thay thế:

| Tính năng FSC | Cách xử lý trên Moodle | Mức công |
|---|---|---|
| **Loại câu "Gạch chân"** | Viết `qtype_underline` custom, hoặc thay bằng `ddwtos`/Cloze | TB (1 plugin) |
| **Giám sát thi realtime + tin nhắn giám thị gửi HS giữa giờ** | Plugin proctoring (`quizaccess_proctoring`/Proctorio/BBB) + viết tính năng nhắn tin (custom `quizaccess_*` hoặc dùng Messaging) | Cao |
| **Nhận xét AI tiến độ học tập** | **Moodle AI subsystem (4.5+)** với provider OpenAI/Azure, hoặc block custom gọi LLM | TB |
| **Cô lập campus tuyệt đối (tenant)** | **Moodle Workplace** (trả phí) hoặc tách instance; bản free dùng category+role (cô lập mềm) | Quyết định |
| **"Sinh đề" như mã đề cố định** | Moodle random per-attempt thay thế; nếu cần mã đề in giấy → plugin xuất đề | Thấp/TB |
| **Import Word đúng định dạng FSC** | `qformat_wordtable` + chuẩn hoá template Word; có thể cần script chuyển đổi | TB |

---

## 8. Di trú dữ liệu Firestore → Moodle

| Dữ liệu | Cách chuyển |
|---|---|
| Người dùng, lớp, ghi danh | Xuất CSV → **Upload users** (admin), **Cohorts** CSV; hoặc Web Services API |
| Danh mục (môn/khối/campus) | Tạo category/course thủ công hoặc script qua Web Services |
| **Câu hỏi (11 loại)** | Viết **script chuyển đổi Firestore → Moodle XML** (ánh xạ qtype như mục 4) → Import vào question bank |
| Học liệu (file/URL) | Tải file lên + tạo Resource; URL ngoài giữ nguyên |
| **Bài làm / điểm lịch sử** | ⚠ Moodle KHÔNG import được quiz attempt cũ một cách sạch → **giữ bản xuất read-only** (đã có `scripts/export-firestore.mjs`) làm lưu trữ, bắt đầu mới trên Moodle |

> Lưu ý: lịch sử bài thi/điểm cũ nên giữ ở dạng báo cáo xuất ra (CSV/JSON) để tra cứu, không cố nhồi vào Moodle.

---

## 9. Danh sách plugin cần cài

**Core (bật sẵn):** mod_quiz, mod_assign, mod_resource, mod_url, mod_folder, mod_page, mod_book, mod_h5pactivity, question types (multichoice, truefalse, match, shortanswer, essay, gapselect, ddwtos, ddimageortext, multianswer), filter_mathjaxloader, advanced grading (rubric, guide), Report builder, Safe Exam Browser access rule, AI subsystem (4.5+).

**Contrib (cài thêm — kiểm tra tương thích version):**
- `qtype_ordering` — câu sắp xếp
- `qtype_mtf` — Đúng/Sai nhiều câu phụ
- `qformat_wordtable` (Moodle2Word) — import/export Word
- `filter_wiris` + `tiny_wiris` (MathType) — soạn công thức
- `quizaccess_proctoring` (hoặc giải pháp proctoring thương mại) — giám sát thi
- `block_configurable_reports` (nếu cần báo cáo tuỳ biến ngoài Report builder)
- Theme: `theme_boost_union` / `theme_moove` — giao diện đẹp, tuỳ biến

**Custom (tự viết — xem mục 7):** `qtype_underline`, plugin nhắn tin giám thị, block nhận xét AI (nếu không dùng AI core).

> Tải plugin từ Moodle Plugins Directory (moodle.org/plugins) và kiểm tra cột "Tương thích" với version chọn.

---

## 10. Lộ trình build cho phiên mới (theo giai đoạn)

1. **Dựng Moodle** bằng Docker (`moodle-docker`), Postgres + Redis; cấu hình tiếng Việt, múi giờ, MathJax.
2. **Cấu trúc & vai trò:** tạo cây category campus → khối/môn → course; tạo custom roles (Subject Lead, Proctor); gán Manager theo campus.
3. **Người dùng & ghi danh:** import CSV users + cohorts (lớp) + enrol vào course.
4. **Ngân hàng câu hỏi:** cài plugin qtype + MathType; tạo question categories + tag độ khó; viết & chạy **converter Firestore→Moodle XML**; import.
5. **Ca thi:** tạo Quiz mẫu với random questions theo ma trận; cấu hình SEB/anti-cheat, groups=phòng, overrides; kiểm thử 1 lượt/HS.
6. **BTVN & học liệu:** tạo Quiz/Assignment cho BTVN; thêm Resource/H5P học liệu.
7. **Chấm & báo cáo:** cấu hình Rubric + ẩn danh; dựng Report builder cho phổ điểm; bật Course completion.
8. **Khoảng trống:** viết `qtype_underline`, plugin proctoring/nhắn tin, block AI nhận xét.
9. **Theme & mobile:** tuỳ biến theme; kiểm thử Moodle App.
10. **Di trú & nghiệm thu:** migrate người dùng/câu hỏi/học liệu; chạy thử với 1 campus/lớp; mở rộng.

---

## 11. Quyết định cần bạn chốt trước khi build

1. **Cô lập campus:** category+role (miễn phí, mềm) hay **Moodle Workplace** (trả phí, tenant cứng)?
2. **Hosting:** tự dựng server / Docker, hay dùng dịch vụ managed (MoodleCloud, đối tác Moodle Partner)?
3. **Xác thực:** Moodle native, hay SSO bám Firebase (OAuth2/OIDC)?
4. **Proctoring:** mức độ giám sát cần đến đâu (SEB miễn phí? plugin? thương mại Proctorio?) — quyết định công sức.
5. **Lịch sử dữ liệu:** có cần xem lại điểm/bài cũ trong Moodle không, hay chấp nhận lưu trữ ngoài?
6. **Giao diện:** chấp nhận giao diện Moodle (tuỳ biến theme) hay vẫn muốn frontend riêng (headless qua Web Services — công sức rất lớn, không khuyến nghị).

---

## Phụ lục A — Prompt khởi động cho phiên mới

> Dán đoạn dưới vào phiên Claude Code mới, mở trong thư mục trống dành cho Moodle:

```
Tôi muốn dựng lại hệ thống khảo thí "FSC Exam Platform" trên nền MOODLE
(native, dùng module/plugin Moodle), thay cho bản Next.js + Firebase cũ.

Tài liệu nguồn (đọc trước):
- docs/MOODLE-REBUILD-SPEC.md  (spec ánh xạ FSC → Moodle, lộ trình, plugin)
- docs/MO-TA-HE-THONG.md        (mô tả đầy đủ tính năng hệ thống cũ cần đạt)
- prisma/schema-fsc.prisma      (mô hình dữ liệu — để viết converter sang Moodle XML)

Hãy bắt đầu Giai đoạn 1: dựng Moodle 4.5 LTS bằng moodle-docker (PostgreSQL +
Redis), cấu hình tiếng Việt + MathJax, rồi hướng dẫn tôi từng bước. Trước khi
build, hỏi tôi 6 quyết định ở mục 11 của spec. Theo lộ trình 10 bước ở mục 10.
```

---

*Tài liệu này là spec để khởi tạo dự án Moodle mới. Hệ thống Next.js + Firebase hiện tại vẫn chạy độc lập cho tới khi cutover sang Moodle.*
