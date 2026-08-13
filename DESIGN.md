# Hệ thống thiết kế — FSC Exam Platform

> Nguồn chuẩn duy nhất cho mọi quyết định giao diện. Token thật nằm ở
> [`apps/web/src/app/globals.css`](apps/web/src/app/globals.css); file này giải
> thích **vì sao**, và ghi những luật mà CSS không tự nói được.
>
> Trước file này, `globals.css` dẫn nguồn tới `docs/FSC_Design_System.md` — một
> file chưa từng được commit. Hệ thống thiết kế thật sự sống trong một khối
> comment CSS suốt thời gian đó.

---

## Điều đáng nhớ

**"Tôi ra đề xong trong 10 phút."**

Đây là kim chỉ nam. Mọi tranh cãi thiết kế phía dưới đều quy về nó. Giáo viên là
người dùng chính, họ dùng công cụ này hằng ngày, và thứ họ cần là **mật độ thông
tin cao, ít bước, ít khung viền trang trí**. Đây là công cụ chuyên nghiệp, không
phải trang giới thiệu sản phẩm.

Hệ quả trực tiếp, nói trước để khỏi tranh cãi lại: **chữ ở đây nhỏ có chủ đích.**
Chữ chính 13-14px chứ không phải 16px. Gần như mọi bộ kiểm định giao diện sẽ chấm
điểm trừ chỗ đó. Chúng ta vẫn giữ, vì nâng lên 16px là giết mật độ, là đi ngược
thẳng kim chỉ nam. Nhưng phải **trả giá cho nó**: xem mục Màu sắc.

---

## Bối cảnh sản phẩm

- **Là gì:** nền tảng khảo thí và vận hành học thuật cho hệ thống FPT Schools.
  Soạn câu hỏi, dựng khung đề và gói đề, sinh đề tự động, lên ca thi, giám sát
  trực tiếp, chấm bài, báo cáo.
- **Cho ai:** giáo viên và tổ trưởng bộ môn (người dùng chính, dùng hằng ngày),
  admin campus, học sinh (dùng theo đợt, lúc thi và làm bài tập).
- **Quy mô:** 18 campus, ~20.000 học sinh, ~800 giáo viên.
- **Loại:** app quản trị dày dữ liệu (dashboard / bảng / wizard nhiều bước), kèm
  một màn làm bài toàn màn hình cho học sinh.
- **Ngôn ngữ:** tiếng Việt. Chữ có dấu, nên chiều cao dòng phải rộng hơn mặc định
  tiếng Anh để dấu không chạm nhau.

---

## Hướng thẩm mỹ

- **Hướng:** Utilitarian / công cụ chuyên nghiệp. Bảng điều khiển SaaS tối giản
  hiện đại, họ hàng gần với Linear, Notion, Stripe Dashboard.
- **Mức trang trí:** tối thiểu. Chữ và đường viền làm hết việc.
- **Cảm giác:** bình tĩnh, chắc chắn, không phô. Giáo viên đang làm việc hành
  chính có hệ quả thật, giao diện không nên tranh sự chú ý với nội dung.
- **Phân tách bằng ĐƯỜNG VIỀN, không bằng đổ bóng.** Bóng chỉ dành cho lớp nổi
  thật sự: hộp thoại, dropdown, popover. Bóng rải khắp nơi là dấu hiệu của giao
  diện không có cấu trúc.

---

## Chữ

### Font

**Inter**, nạp qua `next/font/google`, kèm `tabular-nums` cho mọi con số. Không
dùng font monospace ở bất kỳ đâu.

Nhiều bộ tiêu chí thiết kế xếp Inter vào nhóm "font mặc định của người bỏ cuộc"
và cấm dùng làm font chính. Ở đây là quyết định có lý do, không phải mặc định:
hệ thống này đầy điểm số, mã đề, mã câu hỏi, số câu đúng. `tabular-nums` giữ các
cột số thẳng hàng, và Inter làm việc đó tốt mà không cần kéo thêm một font
monospace thứ hai vào bundle.

**Nếu sau này muốn có chữ ký riêng:** chỗ đáng đổi là font hiển thị cho tiêu đề
trang (Geist hoặc General Sans), giữ Inter cho toàn bộ phần dữ liệu. Đó là thay
đổi có chủ đích, không phải việc cần làm bây giờ.

### Thang chữ

Dùng **utility ngữ nghĩa**, không viết `text-[Npx]`. Tên đặt theo VAI TRÒ chứ
không theo cỡ, để sau này đổi cỡ đồng loạt được.

| Utility | px | đậm | chữ hoa | dùng cho |
|---|---:|---:|:---:|---|
| `.text-display` | 48 | 800 | | chỉ trang đăng nhập |
| `.text-page-title` | 24 | 800 | | tiêu đề trang |
| `.text-kpi` | 28 | 800 | | số lớn trong thẻ chỉ số (tabular) |
| `.text-section-title` | 16 | 700 | | tiêu đề khu vực |
| `.text-card-title` | 14 | 700 | | tiêu đề thẻ |
| `.text-body` | 14 | 400 | | chữ chính |
| `.text-small` | 13 | 400 | | chữ phụ |
| `.text-meta` | 12 | 400 | | phụ chú (mờ) |
| `.text-eyebrow` | 11 | 600 | HOA | nhãn khu vực |
| `.text-hint` | 11 | 400 | | chú thích ô nhập, phụ đề hộp thoại (mờ) |
| `.text-micro` | 10 | 600 | HOA | nhãn chỉ số |
| `.text-dense` | 10 | 400 | | nhãn chip, ô bảng dày đặc |
| `.mono` | | | | Inter + tabular-nums cho cột số |

**Sàn cứng: 10px.** Không có gì nhỏ hơn.

### Ba luật bắt buộc

**1. Cấm nửa pixel.** Không có `text-[12.5px]`, `text-[11.5px]`, `text-[10.5px]`.
Không ai chọn 12,5px từ một thang; người ta chỉnh dần tới khi thấy vừa mắt, và
đó là lúc hệ thống chết. Làm tròn về bậc gần nhất.

**2. Cấm `text-[Npx]` trong code mới.** Nếu không có vai trò nào vừa, đó là dấu
hiệu hệ thống thiếu vai trò. **Thêm vai trò vào `globals.css` và cập nhật bảng
trên**, đừng chế tại chỗ.

**3. Thang bậc nhỏ tăng đều 1px, cố ý không theo tỉ lệ modular.** Sách vở khuyên
dùng thang 1.25 hoặc 1.333. Ở đây 1.25 cho ra 10 → 12,5 → 15,6, tức là bỏ trống
đúng dải 11 và 13px nơi phần lớn app này sống. Giáo viên quét bảng 40 câu hỏi cần
dải mịn ở vùng nhỏ. Thang này phục vụ mật độ, không phục vụ sự cân đối trên giấy.

### Nợ kỹ thuật đang có

Tính đến 2026-08-14: **1.826 chỗ dùng `text-[Npx]` tự chế trên 25 cỡ chữ riêng
biệt**, so với 489 chỗ dùng utility ngữ nghĩa. Tức là 79% việc chọn cỡ chữ không
đi qua hệ thống.

Nguyên nhân là **hệ thống để hở, không phải người viết code cẩu thả**: thang cũ
không có vai trò nào cho chữ 10px và 11px thường (cả `.text-eyebrow` lẫn
`.text-micro` đều ép chữ hoa), nên 341 chỗ phải tự chế. Cùng codebase đó chỉ lệch
**2 chỗ** ở spacing và **1 chỗ** ở bo góc, nơi hệ thống có đủ vai trò.

`.text-hint` và `.text-dense` được thêm để vá lỗ đó. **Chiến lược: di cư dần.**
Code cũ để nguyên, code mới bắt buộc dùng utility. Đừng mở một PR đổi 1.826 chỗ
cùng lúc.

---

## Màu

### Cách tiếp cận

Tiết chế. **Một màu nhấn duy nhất** (`#2563eb`) cho hành động, liên kết, trạng
thái đang chọn. Màu tím (`--color-purple`) là phụ, dùng rất thưa. Màu chỉ được
mang nghĩa, không dùng để trang trí.

### Bề mặt

| Token | Hex | dùng cho |
|---|---|---|
| `--color-background` | `#f5f7fa` | nền trang, xám lạnh |
| `--color-surface` / `--color-card` | `#ffffff` | thẻ, bảng, hộp thoại |
| `--color-surface-2` | `#f9fafb` | vùng lõm bên trong thẻ |

### Chữ: ba bậc, tất cả đều đọc được

| Token | Hex | trên thẻ trắng | trên nền trang |
|---|---|---|---|
| `--color-foreground` | `#0f172a` | 17,85:1 | 16,63:1 |
| `--color-text-2` | `#334155` | 10,35:1 | 9,65:1 |
| `--color-text-muted` | `#5f6f85` | 5,12:1 | 4,77:1 |

**Luật: mọi màu chữ phải đạt ≥ 4,5:1 trên CẢ HAI bề mặt**, không chỉ trên thẻ
trắng. Đây là chỗ trả giá cho quyết định giữ chữ nhỏ. Chữ nhỏ mà mờ là không đọc
được; chữ nhỏ mà đậm nét thì đọc tốt.

Trước 2026-08-14, `text-muted` là `#64748b`: đạt 4,76:1 trên thẻ trắng nhưng chỉ
4,43:1 trên nền trang, tức cùng một class đạt hay trượt tuỳ chỗ nó đứng. Mô tả
dưới mỗi tiêu đề trang nằm thẳng trên nền trang nên rơi vào vế trượt.

Bậc thứ 4 cũ (`--color-text-subtle` `#94a3b8`, 2,56:1) **đã bỏ**. Không dùng được
cho chữ, và thực tế dùng 0 lần. Cần nhạt hơn `text-muted` thì đó không phải chữ,
dùng token viền.

### Trạng thái

Nền pastel + chữ đậm + viền mềm, bo tròn 999px, chữ hoa. Mỗi trạng thái có đủ bộ
`-soft` (nền), `-border` (viền), `-text` (chữ):

- Thành công `#10b981` · Cảnh báo `#f59e0b` · Lỗi `#ef4444`

**Không bao giờ mã hoá thông tin chỉ bằng màu.** Luôn kèm chữ hoặc biểu tượng.
8% nam giới bị mù màu đỏ-lục, và bảng trạng thái ở đây dùng đúng cặp đỏ-lục.

### Dùng token, đừng gõ lại hex

Hiện có **115 chỗ viết hex thẳng trên 34 giá trị**, mà phần lớn là gõ lại đúng
giá trị của token đã có (`#86efac` chính là `--color-success-border`, `#dcfce7`
là `--color-tone-green-soft`). Không sai màu, nhưng đổi token sẽ không lan tới
những chỗ đó. Code mới dùng token.

### Dark mode

**Chưa làm.** 0 chỗ dùng `dark:`, không có `color-scheme`. Khi làm, theo hướng:

- Bề mặt phân tầng theo **độ cao**, không phải đảo ngược độ sáng. Nền tối nhất ở
  dưới cùng, mỗi lớp nổi lên sáng hơn một nấc.
- Chữ **trắng ngà** (~`#e2e8f0`), không trắng tinh. Trắng tinh trên nền tối gây
  chói và nhoè chữ có dấu.
- Màu nhấn **giảm bão hoà 10-20%**. `#2563eb` nguyên bản trên nền tối sẽ rung.
- Đặt `color-scheme: dark` trên `html` để ô cuộn và ô nhập của trình duyệt theo
  đúng tông.

---

## Giãn cách và bố cục

- **Đơn vị gốc:** 4px. Dùng thang của Tailwind, không chế `p-[14px]`.
- **Mật độ:** dày. Đây là công cụ làm việc, không phải trang giới thiệu.
- **Bo góc:** `sm` 6px · `md` 8px · `lg` 10px · `xl` 12px · `full` 9999px.
  Bo góc trong = bo góc ngoài trừ khoảng đệm, khi lồng nhau.
- **Phân tách bằng viền.** Bóng chỉ cho hộp thoại, dropdown, popover.

Phần này **đang rất kỷ luật**: chỉ 2 chỗ lệch ở spacing và 1 chỗ ở bo góc trên
toàn bộ codebase. Giữ nguyên như vậy.

---

## Chuyển động

- **Cách tiếp cận:** tối thiểu, chỉ phục vụ chức năng. Không có animation nào chỉ
  để cho đẹp.
- **Easing:** vào `ease-out` · ra `ease-in` · di chuyển `ease-in-out`.
- **Thời lượng:** vi mô 50-100ms · ngắn 150-250ms · vừa 250-400ms. Không có gì
  quá 400ms trừ chuyển trang.
- **Chỉ animate `transform` và `opacity`.** Không animate `width`, `height`,
  `top`, `left`. Không dùng `transition: all`.

### prefers-reduced-motion

Đã có luật trong `globals.css`, và nó **cố ý khác** đoạn reset hay được chép trên
mạng:

- **Chuyển động chức năng** (spinner, skeleton): **chậm lại**, không tắt. App có
  27 chỗ `animate-spin` và 8 chỗ `animate-pulse`, tất cả đều là báo hiệu đang
  tải. Đoạn reset phổ biến đặt `animation-iteration-count: 1` cho toàn bộ `*`,
  làm spinner đóng băng sau một vòng và người dùng tưởng hệ thống treo.
- **Chuyển động trang trí** (chấm live nhấp nháy): **tắt hẳn**.
- **Transition:** rút gần 0.

---

## Luật riêng cho màn làm bài của học sinh

Đây là **ngoại lệ duy nhất** với nguyên tắc mật độ. Học sinh đang căng thẳng,
tính giờ, không phải người dùng thành thạo dùng công cụ hằng ngày. Ở màn
`/exam/[shiftId]` và `/attempts/[id]`, mật độ thua khả năng đọc:

1. **Chữ đề bài và đáp án tối thiểu 15px.** Không dùng `.text-meta` hay
   `.text-hint` cho nội dung câu hỏi.
2. **Không animation vô hạn.** Không spinner nhấp nháy, không chấm đập trong tầm
   nhìn khi học sinh đang đọc đề.
3. **Trạng thái đã trả lời / chưa trả lời / đánh dấu không được chỉ dựa vào
   màu.** Bản đồ câu hỏi phải có thêm hình khối hoặc nhãn chữ.
4. **Đồng hồ luôn nhìn thấy**, không bị cuộn mất.
5. **Vùng bấm tối thiểu 44px** cho mọi lựa chọn đáp án. Học sinh dùng máy tính
   bảng, và bấm nhầm đáp án vì nút quá nhỏ là hỏng bài thi thật.
6. **Không có gì bất ngờ.** Không popup tự bật, không tự chuyển trang, không thay
   đổi bố cục giữa chừng.

---

## Tiếp cận (a11y)

- Vùng bấm ≥ 44px ở mọi chỗ tương tác.
- `focus-visible` phải thấy được. Không bao giờ `outline: none` mà không thay thế.
  Kim chỉ nam nói "ít bước", mà thao tác bàn phím là cách ít bước nhất.
- Nhãn ô nhập phải hiện khi ô đã có nội dung. Không dùng placeholder làm nhãn.
- Chữ có dấu tiếng Việt cần `line-height` ≥ 1,4 ở cỡ nhỏ.
- **Nợ đang có:** cảnh báo `Missing Description or aria-describedby for
  DialogContent` lặp ở nhiều hộp thoại. Chưa xử lý.

---

## Nhật ký quyết định

| Ngày | Quyết định | Lý do |
|---|---|---|
| 2026-08-14 | Lập DESIGN.md từ hệ thống đang chạy thật | `globals.css` dẫn nguồn tới `docs/FSC_Design_System.md` chưa từng tồn tại. Hợp thức hoá thay vì vẽ lại. |
| 2026-08-14 | Kim chỉ nam: "ra đề xong trong 10 phút" | Giáo viên là người dùng chính, dùng hằng ngày. Mật độ là tính năng. |
| 2026-08-14 | Thêm `.text-hint` (11px) và `.text-dense` (10px) | Thang cũ không có vai trò cho chữ 10/11px thường, 341 chỗ phải tự chế. Lỗi của hệ thống. |
| 2026-08-14 | Cấm nửa pixel, cấm `text-[Npx]` mới | 353 chỗ dùng 10,5/11,5/12,5px. Nửa pixel là dấu hiệu chỉnh mò, không phải chọn từ thang. |
| 2026-08-14 | Giữ chữ chính 13-14px, không nâng 16px | Nâng lên là giết mật độ. Trả giá bằng việc siết tương phản. |
| 2026-08-14 | `text-muted` `#64748b` → `#5f6f85` | Cũ trượt AA trên nền trang (4,43:1). Phủ 917 điểm dùng. |
| 2026-08-14 | Bỏ `--color-text-subtle` | 2,56:1, không dùng được cho chữ, đang dùng 0 lần. |
| 2026-08-14 | reduced-motion phân biệt chức năng / trang trí | Reset phổ biến làm đóng băng 35 spinner, tệ hơn thứ định tránh. |
| 2026-08-14 | Màn làm bài là ngoại lệ mật độ | Học sinh căng thẳng và tính giờ, không phải người dùng thành thạo. |
| 2026-08-14 | Giữ Inter | Đã chạy thật, chọn có lý do (`tabular-nums`), và hướng đã chốt là di cư dần chứ không thay máu. |
