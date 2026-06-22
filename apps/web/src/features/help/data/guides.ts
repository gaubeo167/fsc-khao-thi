/**
 * In-app help content, keyed by route. The HelpButton in the top bar
 * reads the current pathname, picks the guide whose `match` is the
 * longest prefix of it, and shows the steps + screenshots below.
 *
 * Screenshots live in /public/guide (served at /guide/*.png) and are the
 * same captures embedded in docs/HUONG-DAN-SU-DUNG.md.
 */

import type { QuestionType } from "@/features/question-bank/data/question-types";

export interface GuideStep {
  /** Markdown-ish plain text (no markdown rendering — kept simple). */
  text?: string;
  /** Public image path, e.g. "/guide/13-shifts.png". */
  image?: string;
  imageAlt?: string;
}

export interface GuideContent {
  title: string;
  intro?: string;
  steps: GuideStep[];
}

interface GuideEntry {
  /** Route prefix this guide applies to. Longest match wins. */
  match: string;
  guide: GuideContent;
}

const GUIDES: GuideEntry[] = [
  {
    match: "/dashboard",
    guide: {
      title: "Tổng quan",
      intro:
        "Trang chủ sau khi đăng nhập — tổng hợp nhanh các số liệu và lối tắt theo vai trò của bạn.",
      steps: [
        { text: "Xem nhanh các chỉ số chính (ca thi, bài tập, câu hỏi…)." },
        { text: "Dùng menu bên trái để vào từng chức năng." },
        { image: "/guide/02-dashboard.png", imageAlt: "Trang Tổng quan" },
      ],
    },
  },

  {
    match: "/admin/question-bank",
    guide: {
      title: "Ngân hàng câu hỏi",
      intro: "Nơi soạn, import và quản lý câu hỏi theo môn · khối.",
      steps: [
        { text: "Bấm “Tạo câu hỏi” để soạn câu mới (8 dạng: trắc nghiệm, đúng/sai, điền khuyết, nối, sắp xếp, gạch chân, tự luận…)." },
        { text: "Câu hỏi ở kho campus phải được Trưởng bộ môn duyệt mới dùng chung được." },
        { image: "/guide/10-question-bank.png", imageAlt: "Ngân hàng câu hỏi" },
        { text: "Bấm “Import từ Word” để nhập hàng loạt: tải file mẫu, sửa nội dung trong Word rồi upload." },
        { text: "Công thức toán: gõ trực tiếp bằng MathType / Equation Editor (Insert → Equation) — không cần gõ LaTeX." },
        { image: "/guide/11-import-word.png", imageAlt: "Hộp thoại Import từ Word" },
      ],
    },
  },

  {
    match: "/admin/exam-blueprints",
    guide: {
      title: "Khung đề & Gói đề",
      intro:
        "Quy trình: Khung đề (ma trận) → Gói đề → Sinh đề → dùng để tạo ca thi.",
      steps: [
        { text: "Tạo Khung đề: với mỗi chủ đề, chọn số câu dễ / trung bình / khó." },
        { text: "Từ khung đề tạo Gói đề (đặt tên, thời lượng); gói đề cần được duyệt." },
        { text: "⚠ Bấm “Sinh đề” để tạo các mã đề. Gói chưa sinh đề thì KHÔNG tạo được ca thi." },
        { image: "/guide/12-exam-blueprints.png", imageAlt: "Khung đề & Gói đề — số đề đã sinh" },
      ],
    },
  },

  {
    match: "/admin/shifts",
    guide: {
      title: "Ca kíp thi",
      intro: "Tạo và quản lý các buổi thi.",
      steps: [
        { text: "Bấm “Tạo ca thi mới” → wizard 5 bước: (1) Đối tượng & danh sách HS, (2) Gói đề & thang điểm, (3) Lịch thi, (4) Phòng & giám thị, (5) Chống gian lận." },
        { text: "Chỉ chọn được gói đề ĐÃ SINH ĐỀ. Gói chưa sinh đề bị làm mờ + gắn nhãn “Chưa sinh đề”." },
        { text: "Đề được “đóng băng” khi tạo ca — sửa câu hỏi sau đó không ảnh hưởng HS đang thi." },
        { image: "/guide/13-shifts.png", imageAlt: "Danh sách Ca kíp thi" },
      ],
    },
  },

  {
    match: "/admin/homework",
    guide: {
      title: "Bài tập về nhà (giáo viên)",
      intro: "Giao và theo dõi bài tập về nhà cho lớp / học sinh.",
      steps: [
        { text: "Bấm “Tạo BTVN”: chọn câu hỏi, đính kèm học liệu, chọn lớp/HS, đặt ngày giao & hạn nộp." },
        { text: "Vào một BTVN → “Thống kê” để xem ai đã nộp, số câu đúng, tiến độ lớp." },
        { text: "BTVN đã có HS làm thì không xoá/lưu trữ được (bảo toàn dữ liệu)." },
        { image: "/guide/15-homework-admin.png", imageAlt: "Quản lý Bài tập về nhà" },
      ],
    },
  },

  {
    match: "/grading",
    guide: {
      title: "Chấm bài tự luận",
      intro: "Chấm các câu tự luận được phân công, theo rubric, ẩn danh.",
      steps: [
        { text: "Chấm ẩn danh: hệ thống ẩn tên/lớp HS, chỉ hiển thị mã thi để chấm khách quan." },
        { text: "Chọn ca thi được phân công → chấm từng câu theo tiêu chí (rubric)." },
        { text: "Điểm tự luận sau khi chốt sẽ cộng vào kết quả của học sinh." },
        { image: "/guide/16-grading.png", imageAlt: "Chấm bài tự luận" },
      ],
    },
  },

  {
    match: "/reports",
    guide: {
      title: "Kết quả & Báo cáo",
      intro: "Thống kê điểm và kết quả theo ca thi / lớp.",
      steps: [
        { text: "Xem điểm từng học sinh, phổ điểm, tỉ lệ đạt." },
        { text: "Vào một ca thi để xem chi tiết bài làm từng HS." },
        { image: "/guide/17-reports.png", imageAlt: "Kết quả & Báo cáo" },
      ],
    },
  },

  {
    match: "/admin/users",
    guide: {
      title: "Người dùng",
      intro: "Quản lý tài khoản giáo viên & học sinh trong campus.",
      steps: [
        { text: "Thêm người dùng: chọn vai trò, nhập thông tin, gán campus/lớp." },
        { text: "Học sinh đăng nhập bằng mã học sinh + mật khẩu (email tạo tự động)." },
        { text: "Cấp quyền cho giáo viên: Tạo khung đề / Tạo gói đề / Tạo ca thi." },
        { image: "/guide/18-users.png", imageAlt: "Quản lý người dùng" },
      ],
    },
  },

  {
    match: "/admin/grades",
    guide: {
      title: "Khối · lớp",
      intro: "Quản lý khối, lớp và phân học sinh vào lớp.",
      steps: [
        { text: "Tạo / sửa khối và lớp của campus." },
        { text: "Phân học sinh vào lớp để hệ thống xác định đúng đối tượng thi / BTVN." },
        { image: "/guide/19-grades.png", imageAlt: "Khối · lớp" },
      ],
    },
  },

  {
    match: "/admin/subjects",
    guide: {
      title: "Môn học",
      intro: "Danh mục môn học của campus.",
      steps: [{ text: "Tạo / sửa môn học, gán màu và khối áp dụng." }],
    },
  },

  {
    match: "/admin/approvals",
    guide: {
      title: "Phê duyệt",
      intro: "Duyệt câu hỏi / gói đề ở kho campus (Trưởng bộ môn & Quản trị).",
      steps: [
        { text: "Xem các mục đang “Chờ duyệt”, mở để kiểm tra nội dung." },
        { text: "Duyệt hoặc từ chối (kèm lý do). Chỉ mục đã duyệt mới được dùng chung." },
        { image: "/guide/21-approvals.png", imageAlt: "Phê duyệt" },
      ],
    },
  },

  {
    match: "/admin/campuses",
    guide: {
      title: "Quản lý campus",
      intro: "Dành cho Superadmin — quản lý các cơ sở.",
      steps: [
        { text: "Tạo campus mới; hệ thống tự tạo tài khoản quản trị cho campus đó." },
        { text: "Để vận hành bên trong một campus, đăng nhập bằng tài khoản quản trị của campus đó." },
        { image: "/guide/30-campuses.png", imageAlt: "Quản lý campus" },
      ],
    },
  },

  // ───── Student ─────
  {
    match: "/my-exams/history",
    guide: {
      title: "Lịch sử bài thi",
      intro: "Các bài thi đã nộp và điểm.",
      steps: [
        { text: "Bấm vào một bài để xem kết quả chi tiết: điểm, số câu đúng, đáp án từng câu." },
        { image: "/guide/47-exam-history.png", imageAlt: "Lịch sử bài thi" },
        { image: "/guide/48-exam-result.png", imageAlt: "Trang kết quả bài thi" },
      ],
    },
  },
  {
    match: "/my-exams",
    guide: {
      title: "Lịch thi của tôi",
      intro: "Các ca thi được giao cho lớp / khối của bạn.",
      steps: [
        { text: "Mặc định hiển thị ca đang & sắp diễn ra. Đổi bộ lọc sang “Tất cả” để xem ca đã kết thúc." },
        { text: "Bấm “Vào thi ngay” ở ca đang mở để bắt đầu làm bài." },
        { image: "/guide/41-my-exams.png", imageAlt: "Lịch thi của tôi" },
        { text: "Màn làm bài: đọc quy định, bấm “Bắt đầu làm bài”. Có đếm giờ, đánh dấu câu, lưu tự động; mỗi ca chỉ làm 1 lần." },
        { image: "/guide/42-exam-runtime.png", imageAlt: "Màn hình trước khi bắt đầu làm bài" },
      ],
    },
  },
  {
    match: "/exam/",
    guide: {
      title: "Làm bài thi",
      intro: "Màn hình làm bài thi.",
      steps: [
        { text: "Đọc kỹ quy định, bấm “Bắt đầu làm bài”. Đồng hồ đếm ngược chạy ở góc phải." },
        { text: "Trả lời từng câu, có thể đánh dấu câu để xem lại. Đáp án lưu tự động." },
        { text: "Bấm “Nộp bài” khi xong — mỗi ca chỉ làm 1 lần." },
        { image: "/guide/42-exam-runtime.png", imageAlt: "Màn làm bài thi" },
      ],
    },
  },
  {
    match: "/my-homework",
    guide: {
      title: "Bài tập về nhà",
      intro: "Bài tập giáo viên giao cho lớp / khối của bạn.",
      steps: [
        { text: "Trạng thái: Đang mở / Chưa mở / Đã nộp / Quá hạn. Bấm vào để làm." },
        { image: "/guide/43-my-homework.png", imageAlt: "Danh sách bài tập về nhà" },
        { text: "Làm bài: trả lời từng câu, có thể xem học liệu đính kèm, lưu giữa chừng. Bấm “Nộp bài” khi xong." },
        { image: "/guide/44-homework-runtime.png", imageAlt: "Màn hình làm bài tập về nhà" },
      ],
    },
  },
  {
    match: "/my-materials",
    guide: {
      title: "Học liệu",
      intro: "Kho tài liệu / video giáo viên chia sẻ cho lớp · môn của bạn.",
      steps: [
        { text: "Bấm vào một học liệu để xem (video, PDF…)." },
        { image: "/guide/45-my-materials.png", imageAlt: "Học liệu" },
      ],
    },
  },
  {
    match: "/my-progress",
    guide: {
      title: "Tiến độ học tập",
      intro: "Tổng hợp kết quả thi + bài tập về nhà của bạn theo thời gian.",
      steps: [
        { text: "Theo dõi điểm số, số bài đã làm và xu hướng tiến bộ." },
        { image: "/guide/46-my-progress.png", imageAlt: "Tiến độ học tập" },
      ],
    },
  },
];

/**
 * Detailed, step-by-step input guide for EACH question type. Shown by the
 * "Hướng dẫn nhập loại này" button inside the question form (which is a
 * dialog, so the top-bar button is covered). Keyed by QuestionType.
 *
 * Common steps (chọn Môn · Khối · Độ khó · Kho, bấm Lưu) are kept short;
 * the focus is on what's UNIQUE to entering each type's answer.
 */
const QUESTION_TYPE_GUIDES: Partial<Record<QuestionType, GuideContent>> = {
  "mcq-single": {
    title: "Trắc nghiệm 1 đáp án",
    intro: "Câu hỏi có nhiều phương án nhưng CHỈ 1 phương án đúng.",
    steps: [
      { text: "1. Chọn Môn · Khối · Độ khó · Kho (Cá nhân = riêng bạn; Dùng chung campus = phải qua duyệt)." },
      { text: "2. Nhập Đề bài vào ô soạn thảo. Có thể chèn công thức toán, ảnh, video qua thanh công cụ phía trên ô." },
      { text: "3. Nhập các phương án trả lời (tối thiểu 2, tối đa 8). Bấm “+ Thêm phương án” để thêm dòng." },
      { text: "4. Đánh dấu đáp án đúng: bấm nút tròn (radio) bên trái phương án đúng — chỉ chọn được 1." },
      { text: "5. (Tuỳ chọn) Nhập “Giải thích đáp án” để hiện cho HS sau khi nộp." },
      { text: "6. Bấm Lưu. Nếu lưu vào kho campus, câu sẽ ở trạng thái Chờ duyệt." },
      { image: "/guide/qtype-mcq-single.png", imageAlt: "Form Trắc nghiệm 1 đáp án" },
    ],
  },
  "mcq-multi": {
    title: "Trắc nghiệm nhiều đáp án",
    intro: "Có từ 2 phương án đúng trở lên. HS phải chọn đủ và đúng.",
    steps: [
      { text: "1. Chọn Môn · Khối · Độ khó · Kho." },
      { text: "2. Nhập Đề bài (gợi ý nêu rõ “chọn tất cả đáp án đúng”)." },
      { text: "3. Nhập các phương án (tối thiểu 2, tối đa 8)." },
      { text: "4. Đánh dấu đáp án đúng: tích vào ô vuông (checkbox) bên trái — chọn được NHIỀU phương án." },
      { text: "5. (Tuỳ chọn) Nhập Giải thích." },
      { text: "6. Bấm Lưu." },
      { image: "/guide/qtype-mcq-multi.png", imageAlt: "Form Trắc nghiệm nhiều đáp án" },
    ],
  },
  "true-false": {
    title: "Đúng / Sai",
    intro: "Một mệnh đề, HS chọn Đúng hoặc Sai.",
    steps: [
      { text: "1. Chọn Môn · Khối · Độ khó · Kho." },
      { text: "2. Nhập mệnh đề vào ô Đề bài (vd: “Số 7 là số nguyên tố”)." },
      { text: "3. Chọn đáp án đúng bằng cách bấm nút “Đúng” hoặc “Sai”." },
      { text: "4. (Tuỳ chọn) Nhập Giải thích, rồi bấm Lưu." },
      { image: "/guide/qtype-true-false.png", imageAlt: "Form Đúng / Sai" },
    ],
  },
  "multi-tf": {
    title: "Đúng/Sai nhiều câu phụ",
    intro: "Một đoạn ngữ liệu chung + nhiều mệnh đề con, mỗi mệnh đề chọn Đúng/Sai riêng.",
    steps: [
      { text: "1. Chọn Môn · Khối · Độ khó · Kho." },
      { text: "2. Nhập đoạn ngữ liệu / dẫn đề chung vào ô Đề bài." },
      { text: "3. Thêm các câu phụ (mệnh đề con) — tối thiểu 2, tối đa 20. Bấm “+ Thêm câu phụ”." },
      { text: "4. Với MỖI câu phụ: nhập nội dung mệnh đề và chọn Đúng hoặc Sai cho riêng câu đó." },
      { text: "5. Bấm Lưu." },
      { image: "/guide/qtype-multi-tf.png", imageAlt: "Form Đúng/Sai nhiều câu phụ" },
    ],
  },
  "short-answer": {
    title: "Trả lời ngắn",
    intro: "HS gõ đáp án ngắn; hệ thống tự chấm bằng cách so với danh sách đáp án chấp nhận.",
    steps: [
      { text: "1. Chọn Môn · Khối · Độ khó · Kho." },
      { text: "2. Nhập Đề bài." },
      { text: "3. Thêm các đáp án được chấp nhận: gõ vào ô rồi nhấn Enter (hoặc bấm “+ Thêm”). Mỗi đáp án là một thẻ riêng — thêm mọi cách viết đúng (vd: “Hà Nội”, “Hanoi”, “HN”)." },
      { text: "4. (Tuỳ chọn) Tích “Phân biệt chữ hoa/thường” nếu cần chính xác hoa-thường." },
      { text: "5. Có thể chèn công thức toán trong đáp án, hoặc dùng “AI gợi ý đáp án”. Bấm Lưu." },
    ],
  },
  "fill-blank": {
    title: "Điền khuyết",
    intro: "Câu có một hay nhiều ô trống; HS điền vào từng ô.",
    steps: [
      { text: "1. Chọn Môn · Khối · Độ khó · Kho." },
      { text: "2. Nhập Đề bài. Tại vị trí cần để trống, bấm “+ Thêm ô trống” trên thanh công cụ — hệ thống chèn chip ô trống (đánh số tự động)." },
      { text: "3. Mỗi ô trống tạo ra một thẻ đáp án bên dưới (Ô 1, Ô 2…). Số ô tự đồng bộ theo đề bài." },
      { text: "4. Với mỗi ô: nhập các đáp án chấp nhận (Enter / “+ Thêm”), thêm mọi cách viết đúng." },
      { text: "5. Có thể dùng “AI gợi ý” cho từng ô hoặc tất cả. Bấm Lưu." },
      { image: "/guide/qtype-fill-blank.png", imageAlt: "Form Điền khuyết" },
    ],
  },
  matching: {
    title: "Ghép cặp",
    intro: "Nối mỗi mục cột A với mục đúng ở cột B. Hệ thống tự xáo cột B khi HS làm.",
    steps: [
      { text: "1. Chọn Môn · Khối · Độ khó · Kho." },
      { text: "2. Nhập Đề bài (yêu cầu ghép cặp)." },
      { text: "3. Thêm các cặp đúng (tối thiểu 2, tối đa 20): mỗi dòng nhập mục cột A (trái) và mục cột B (phải) tương ứng." },
      { text: "4. (Tuỳ chọn) Thêm “đáp án gây nhiễu” ở khu màu vàng: chỉ nhập mục cột B, không ghép với A nào — để tăng độ khó." },
      { text: "5. Bấm Lưu." },
      { image: "/guide/qtype-matching.png", imageAlt: "Form Ghép cặp" },
    ],
  },
  ordering: {
    title: "Sắp xếp thứ tự",
    intro: "HS kéo các mục về đúng thứ tự. Bạn nhập theo thứ tự ĐÚNG, hệ thống tự xáo khi HS làm.",
    steps: [
      { text: "1. Chọn Môn · Khối · Độ khó · Kho." },
      { text: "2. Nhập Đề bài." },
      { text: "3. Thêm các mục cần sắp xếp (tối thiểu 2, tối đa 20) và nhập nội dung từng mục." },
      { text: "4. Kéo biểu tượng tay cầm (⋮⋮) để đưa các mục về đúng thứ tự — đây là đáp án." },
      { text: "5. Bấm Lưu." },
      { image: "/guide/qtype-ordering.png", imageAlt: "Form Sắp xếp thứ tự" },
    ],
  },
  "drag-drop": {
    title: "Kéo thả",
    intro: "HS kéo cụm từ thả vào đúng vùng trống trong đề.",
    steps: [
      { text: "1. Chọn Môn · Khối · Độ khó · Kho." },
      { text: "2. Nhập Đề bài; tại vị trí cần thả, bấm “+ Chèn vùng thả” — hệ thống chèn chip vùng (đánh số)." },
      { text: "3. Với mỗi vùng: nhập đáp án ĐÚNG cho vùng đó (tối đa 20 vùng)." },
      { text: "4. (Tuỳ chọn) Thêm “cụm từ gây nhiễu” — các cụm không thuộc vùng nào, trộn vào để tăng độ khó (tối đa 30)." },
      { text: "5. Bấm Lưu." },
      { image: "/guide/qtype-drag-drop.png", imageAlt: "Form Kéo thả" },
    ],
  },
  underline: {
    title: "Gạch chân",
    intro: "HS gạch chân đúng các từ/cụm từ trong đoạn (vd: tìm động từ, tính từ…).",
    steps: [
      { text: "1. Chọn Môn · Khối · Độ khó · Kho." },
      { text: "2. Nhập đoạn văn vào ô Đề bài." },
      { text: "3. Bôi đen (chọn) từ/cụm từ cần gạch chân, rồi bấm nút “Đánh dấu gạch chân”. Cụm đó được đánh dấu — đây là đáp án HS phải gạch." },
      { text: "4. Lặp lại cho mọi cụm cần gạch. Bên dưới hiển thị “Đã đánh dấu N cụm”. Bấm vào thẻ để bỏ đánh dấu nếu sai." },
      { text: "5. Bấm Lưu (cần ít nhất 1 cụm được đánh dấu)." },
      { image: "/guide/qtype-underline.png", imageAlt: "Form Gạch chân" },
    ],
  },
  essay: {
    title: "Tự luận",
    intro: "HS viết bài; giáo viên chấm tay theo rubric (bộ tiêu chí).",
    steps: [
      { text: "1. Chọn Môn · Khối · Độ khó · Kho." },
      { text: "2. Nhập Đề bài / yêu cầu viết." },
      { text: "3. Lập rubric: thêm từng tiêu chí (vd “Nội dung & ý tưởng”) kèm điểm tối đa. Tổng điểm tự cộng. Bấm “+ Thêm tiêu chí”." },
      { text: "4. (Tuỳ chọn) Đặt số từ tối thiểu / tối đa." },
      { text: "5. (Tuỳ chọn) Bật “AI hỗ trợ chấm sơ bộ”. Bấm Lưu." },
      { text: "Lưu ý: câu tự luận được chấm tay ở mục “Chấm bài tự luận” sau khi HS nộp." },
      { image: "/guide/qtype-essay.png", imageAlt: "Form Tự luận" },
    ],
  },
  "ai-generated": {
    title: "AI tự sinh câu hỏi",
    intro: "Mô tả chủ đề/yêu cầu — AI tạo sẵn nhiều câu để bạn duyệt và lưu.",
    steps: [
      { text: "1. Chọn loại “AI tự sinh câu hỏi” — hệ thống mở luồng tạo hàng loạt." },
      { text: "2. Mô tả chủ đề, dạng câu, số lượng, độ khó mong muốn." },
      { text: "3. Bấm sinh — AI tạo danh sách câu hỏi nháp." },
      { text: "4. Xem lại từng câu, chỉnh nếu cần, chọn các câu đạt và lưu vào ngân hàng." },
    ],
  },
};

export function getQuestionTypeGuide(type: QuestionType): GuideContent | null {
  return QUESTION_TYPE_GUIDES[type] ?? null;
}

/** Pick the guide whose `match` is the longest prefix of `pathname`. */
export function findGuide(pathname: string | null | undefined): GuideContent | null {
  if (!pathname) return null;
  let best: GuideEntry | null = null;
  for (const entry of GUIDES) {
    if (pathname === entry.match || pathname.startsWith(entry.match)) {
      if (!best || entry.match.length > best.match.length) best = entry;
    }
  }
  return best?.guide ?? null;
}
