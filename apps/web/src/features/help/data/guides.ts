/**
 * In-app help content, keyed by route. The HelpButton in the top bar
 * reads the current pathname, picks the guide whose `match` is the
 * longest prefix of it, and shows the steps + screenshots below.
 *
 * Screenshots live in /public/guide (served at /guide/*.png) and are the
 * same captures embedded in docs/HUONG-DAN-SU-DUNG.md.
 */

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
