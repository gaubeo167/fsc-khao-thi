# Kiểm kê đầy đủ chức năng — FSC Exam Platform

Danh sách **toàn bộ chức năng/luồng/quy tắc** của hệ thống hiện tại, dùng làm **checklist nghiệm thu** khi dựng lại trên Moodle. Mỗi mục ghi kèm **gợi ý hiện thực trên Moodle** (chi tiết ở `02-MOODLE-REBUILD-SPEC.md`).

Ký hiệu: ✅ Moodle có sẵn · ⚙️ cấu hình · 🧩 cần plugin (core/contrib) · 🛠️ cần plugin custom · 📥 cần di trú dữ liệu.

---

## A. Nền tảng & phân quyền

- [ ] **6 vai trò**: học sinh, giáo viên, trưởng bộ môn, quản trị campus, giám đốc đào tạo, superadmin → ⚙️ Roles + custom roles theo context.
- [ ] **Đa cơ sở (campus)** + cô lập dữ liệu giữa campus → ⚙️ Category lồng + Manager theo context (🧩 Workplace nếu cần tenant cứng).
- [ ] **Phân quyền 2 lớp** (giao diện ẩn/hiện menu + chốt phía máy chủ) → ✅ Capabilities + context của Moodle.
- [ ] **Quyền cấp riêng cho giáo viên** (canCreateBlueprint / canCreatePackage / canCreateShift) → ⚙️ Capability override theo user/role.
- [ ] **Đăng nhập** 2 nhóm (học sinh bằng mã HS/username; nhân viên bằng email) → ⚙️ Auth (mã HS = username Moodle).
- [ ] **Nhật ký hoạt động (audit log)**: create/update/delete/archive/approve/submit/grade… → ✅ Moodle Logs + Events API.
- [ ] **Hướng dẫn trong ứng dụng** (nút Hướng dẫn theo trang + theo từng loại câu hỏi) → ⚙️ Block HTML/Help strings, hoặc 🛠️ tùy biến.

## B. Quản trị danh mục

- [ ] **Người dùng**: tạo/sửa GV & HS, trạng thái (active/suspended/invited), mã HS, username, email liên hệ, SĐT/email phụ huynh, đặt lại mật khẩu → ✅ User management + 📥 upload CSV.
- [ ] **Khối · lớp**: CRUD khối (order, sĩ số), CRUD lớp (GV chủ nhiệm, campus), phân HS vào lớp → ⚙️ Category/Cohort + 📥 CSV.
- [ ] **Môn học**: CRUD môn (mã, màu, khối áp dụng, campus áp dụng) → ⚙️ Course/Category môn.
- [ ] **Mục lục chương (TOC)** theo môn/khối, phân cấp cha-con → ⚙️ Question categories phân cấp + Tags.
- [ ] **Phân công giảng dạy** (GV ↔ lớp ↔ môn) → ⚙️ Enrol GV làm Teacher vào course.
- [ ] **Phê duyệt**: duyệt câu hỏi / gói đề ở kho campus (TBM/Quản trị) → 🧩 Question status (ready/draft) + workflow (có thể cần plugin/quy ước).
- [ ] **Quản lý campus** (superadmin): tạo campus, tự tạo tài khoản quản trị campus → ⚙️ Tạo category + gán Manager.

## C. Ngân hàng câu hỏi

- [ ] **11+ loại câu hỏi** (xem ánh xạ qtype ở mục D bên dưới).
- [ ] **Soạn thảo giàu định dạng**: công thức toán, ảnh, video, audio, liên kết → ✅ Atto/TinyMCE + 🧩 MathType(WIRIS) + ✅ MathJax.
- [ ] **Công thức toán** (MathLive/KaTeX hiện tại) → 🧩 filter_wiris (soạn) + ✅ filter_mathjaxloader (render TeX).
- [ ] **Kho cá nhân / kho campus** → ⚙️ Question bank theo context (user/course/category).
- [ ] **Trạng thái** draft/pending/approved/rejected → 🧩 Question status + workflow.
- [ ] **Đánh phiên bản** câu hỏi (clone version mới, giữ lịch sử) → ✅ Question versioning (Moodle 4.x).
- [ ] **Lưu trữ (archive)** câu hỏi (không xoá cứng) → ✅ Hidden/deleted state + versioning.
- [ ] **Import từ Word** (MathType/OMath, ảnh dán, đánh dấu [đúng]) → 🧩 qformat_wordtable (chuẩn hoá template) + 📥.
- [ ] **AI sinh câu hỏi hàng loạt** → 🧩 Moodle AI (4.5+) / plugin / 🛠️.
- [ ] **AI gợi ý đáp án** (short-answer, fill-blank) → 🛠️ hoặc bỏ (tuỳ nhu cầu).
- [ ] **Tag độ khó** (dễ/TB/khó) + gắn TOC → ✅ Tags + question categories.
- [ ] **Hướng dẫn nhập theo từng loại** trong form soạn câu → ✅ Help của từng qtype.

## D. Ánh xạ 11 loại câu hỏi (chi tiết field ở MO-TA-HE-THONG)

- [ ] mcq-single → ✅ Multiple choice (1 đáp án).
- [ ] mcq-multi → ✅ Multiple choice (nhiều đáp án).
- [ ] true-false → ✅ True/False.
- [ ] multi-tf (Đ/S nhiều câu phụ) → 🧩 qtype_mtf.
- [ ] fill-blank (điền khuyết, nhiều đáp án/ô) → ✅ Cloze (multianswer) / gapselect.
- [ ] matching (ghép cặp + đáp án nhiễu) → ✅ Matching.
- [ ] ordering (sắp xếp) → 🧩 qtype_ordering.
- [ ] drag-drop (vùng thả + nhiễu) → ✅ ddwtos / ddimageortext.
- [ ] underline (gạch chân cụm từ) → 🛠️ **qtype_underline custom** (hoặc map ddwtos/Cloze).
- [ ] short-answer (đáp án chấp nhận, phân biệt hoa/thường) → ✅ Short answer.
- [ ] essay (rubric, số từ min/max) → ✅ Essay + Advanced grading (Rubric).
- [ ] ai-generated → 🧩 Moodle AI.

## E. Khung đề / Gói đề / Sinh đề → Quiz config

- [ ] **Khung đề (Blueprint)**: ma trận topic × số câu (dễ/TB/khó), chọn pool câu hỏi → ⚙️ Question categories + tag độ khó.
- [ ] **Gói đề (Package)**: thời lượng, duyệt → ⚙️ Cấu hình Quiz template.
- [ ] **Sinh đề / mã đề** (mỗi HS đề khác nhau) → ✅ Quiz Random questions (Moodle tự sinh per-attempt). *Khái niệm "sinh đề thủ công" được thay thế.*
- [ ] **Bắt buộc sinh đề mới tạo được ca thi** → ⚙️ Quy trình: phải có random questions hợp lệ.
- [ ] **Thang điểm**: đều / theo độ khó / thủ công từng câu → ⚙️ Question default mark + Quiz max grade.

## F. Ca thi (Shift) → Quiz activity

- [ ] **Wizard 5 bước** (đối tượng/roster, gói đề/thang điểm, lịch, phòng/giám thị, anti-cheat) → ⚙️ Quiz settings + Groups + Overrides.
- [ ] **Lịch**: giờ mở, giờ đóng, cho phép vào muộn (phút) → ✅ Open/Close + ⚙️ override vào muộn.
- [ ] **1 lượt làm** → ✅ Attempts = 1.
- [ ] **Phòng thi** (chia HS, sĩ số) → ✅ Groups/Groupings.
- [ ] **Giám thị** gán theo phòng → ⚙️ Role Proctor + group.
- [ ] **Đóng băng đề (snapshot, integrity hash, variants)** → ✅ Question versioning + attempt immutability.
- [ ] **Anti-cheat 9 cờ**: randomize câu/đáp án, fullscreen, chặn tab, chặn copy/paste, chặn chuột phải, webcam, face detection, oneTimeStart → ✅ Shuffle + 🧩 quizaccess_seb (Safe Exam Browser) + 🛠️/🧩 proctoring (webcam/face).

## G. Làm bài thi (runtime)

- [ ] **Màn bắt đầu** (quy định ca thi) → ✅ Quiz intro/start page.
- [ ] **Đếm giờ + tự nộp khi hết** → ✅ Time limit.
- [ ] **Lưu tự động giữa chừng** → ✅ Auto-save của Quiz.
- [ ] **Đánh dấu câu để xem lại + lưới câu hỏi** → ✅ Flag + Quiz navigation.
- [ ] **Ghi vi phạm** (tabSwitches, fullscreenExits, pasteAttempts) → 🧩/🛠️ proctoring/SEB logs.
- [ ] **Tin nhắn giám thị gửi HS giữa giờ** (realtime) + HS xác nhận → 🛠️ custom (Moodle không có sẵn live message trong quiz).
- [ ] **Cutoff vào muộn** → ⚙️ Override/availability.

## H. Giám sát & Chấm điểm

- [ ] **Giám sát thi realtime** (xem HS đang làm, tiến độ, vi phạm) → 🧩 quizaccess_proctoring / live reports (gần realtime) + 🛠️ nếu cần realtime thực.
- [ ] **Chấm trắc nghiệm tự động** (mọi loại auto-grade) → ✅ Quiz auto-grading.
- [ ] **Chấm tự luận theo rubric** → ✅ Manual grading + Advanced grading (Rubric/Marking guide).
- [ ] **Chấm ẩn danh** (giấu tên/lớp HS) → ✅ Anonymous/blind marking.
- [ ] **Phân công chấm** (grading assignment cho GV) → ⚙️ Role + nhóm chấm.

## I. Kết quả & Báo cáo

- [ ] **Trang kết quả HS**: điểm /10, số câu đúng, đáp án từng câu, đánh dấu essay chờ chấm → ✅ Quiz review + Gradebook.
- [ ] **Báo cáo theo ca/lớp**: phổ điểm, thống kê, chi tiết attempt → ✅ Quiz reports (Grades/Statistics/Responses) + 🧩 Report builder/Configurable Reports.
- [ ] **Thang điểm /10** (lưu ý bug % vs /10 ở bản cũ — Moodle dùng gradebook chuẩn) → ✅ Gradebook scale.

## J. Bài tập về nhà (BTVN)

- [ ] **Giao BTVN**: chọn câu hỏi, đính kèm học liệu, chọn lớp/HS, ngày giao + hạn nộp → ✅ Quiz (tự chấm) hoặc Assignment + Resource.
- [ ] **Trạng thái** Đang mở/Chưa mở/Đã nộp/Quá hạn → ✅ Availability + completion.
- [ ] **HS làm, lưu giữa chừng, nộp, tự chấm** → ✅ Quiz attempts.
- [ ] **Theo dõi tiến độ nộp của lớp** → ✅ Activity completion report.
- [ ] **Không xoá BTVN đã có bài làm** → ✅ Moodle chặn xoá có dữ liệu (cảnh báo).

## K. Học liệu

- [ ] **Kho tài liệu/video/PDF** chia sẻ theo môn/lớp → ✅ Resource: File/URL/Folder/Page/Book + 🧩 H5P.
- [ ] **Loại file** (video/pdf/word/ppt/excel/image/audio/link) → ✅ File/URL.
- [ ] **Kho cá nhân/campus + duyệt** → ⚙️ Context + (workflow nếu cần).
- [ ] **Viewer trong app** (xem video/pdf) → ✅ Trình xem nhúng của Moodle / H5P.
- [ ] **Gắn TOC, tag** → ✅ Tags.

## L. Cổng học sinh & Tiến độ

- [ ] **Lịch thi của tôi** (đang/sắp/đã kết thúc) → ✅ Dashboard + Calendar + Course quizzes.
- [ ] **Lịch sử bài thi** + xem kết quả chi tiết → ✅ Quiz review history + Gradebook.
- [ ] **Bài tập về nhà** + làm bài → ✅ Course activities.
- [ ] **Học liệu** → ✅ Course resources.
- [ ] **Tiến độ học tập**: điểm thi TB /10, % BTVN, số ca đã nộp, xu hướng điểm → ✅ Gradebook + Course completion + 🧩 Report builder / Learning Analytics.
- [ ] **Nhận xét AI về xu hướng học tập** → 🧩 Moodle AI / 🛠️ block custom gọi LLM.
- [ ] **Mobile** → ✅ Moodle App (miễn phí, có sẵn).

## M. Khác

- [ ] **Thông báo** (notifications) → ✅ Messaging/Notifications của Moodle.
- [ ] **Chọn/hiển thị campus đang thao tác** → ⚙️ Category context.
- [ ] **Tìm kiếm** câu hỏi/đề/người dùng → ✅ Global search + question bank filters.
- [ ] **Giao diện responsive + tiếng Việt** → ✅ Theme (Boost) + gói ngôn ngữ vi.
- [ ] **Demo mode / dữ liệu mẫu** (của bản cũ — không bắt buộc) → ⚙️ Khoá học demo + sample data.

---

## Tổng kết mức công

| Nhóm | Phần lớn |
|---|---|
| ✅ Moodle có sẵn / ⚙️ cấu hình | A, B, C(phần lớn), E, F, G(phần lớn), I, J, K, L(phần lớn), M |
| 🧩 Plugin contrib | qtype_mtf, qtype_ordering, qformat_wordtable, filter_wiris, quizaccess_seb, quizaccess_proctoring, report builder |
| 🛠️ **Cần viết custom** | **qtype_underline**, **tin nhắn giám thị realtime trong quiz**, **giám sát realtime thực**, **nhận xét AI** (nếu không dùng AI core), AI gợi ý đáp án |
| 📥 Di trú | người dùng/lớp (CSV), câu hỏi (Moodle XML), học liệu (file/URL). Lịch sử attempt: lưu trữ ngoài. |

→ ~80% chức năng đạt bằng Moodle có sẵn + cấu hình + plugin contrib. Phần 🛠️ là trọng tâm công sức custom.
