# FSC Exam Platform

Nền tảng khảo thí cho hệ thống FPT Schools. Next.js App Router + Firestore,
deploy trên Vercel.

## Hệ thống thiết kế

**Luôn đọc [DESIGN.md](DESIGN.md) trước khi đụng vào bất kỳ thứ gì thuộc giao
diện.** Font, màu, giãn cách, thang chữ, hướng thẩm mỹ đều chốt ở đó. Không đi
chệch nếu người dùng chưa đồng ý.

Ba luật hay bị vi phạm nhất:

1. **Không viết `text-[Npx]`.** Dùng utility ngữ nghĩa (`.text-body`,
   `.text-meta`, `.text-hint`, `.text-dense`…). Nếu không có vai trò nào vừa thì
   đó là hệ thống thiếu vai trò: thêm vào `globals.css` và cập nhật bảng trong
   DESIGN.md, đừng chế tại chỗ.
2. **Không dùng nửa pixel.** `text-[12.5px]` là dấu hiệu chỉnh mò.
3. **Màn làm bài của học sinh là ngoại lệ mật độ.** Chữ ≥ 15px, không animation
   vô hạn, trạng thái không chỉ dựa vào màu. Xem mục riêng trong DESIGN.md.

Khi chạy QA hoặc review, báo lại mọi chỗ code lệch DESIGN.md.

## Kiểm thử

Chạy các script hồi quy trước khi deploy:

```bash
node scripts/test-short-answer.mjs     # so khớp đáp án trả lời ngắn
node scripts/test-grade.mjs            # chấm điểm theo chuẩn Bộ
node scripts/test-ai-error.mjs         # phân loại lỗi AI
node scripts/test-math-xss.mjs         # XSS ở bộ render công thức toán
node scripts/test-monitoring-live.mjs  # đường dữ liệu thời gian thực phòng giám sát
node scripts/test-parse-generic.mjs   # parser đề tự soạn (khuôn SHOC / AIMO / nội bộ)
node scripts/test-match-competency.mjs # khớp mã trong đề với YCCĐ + đọc khung
node scripts/test-mau-co-ban.mjs      # file mẫu Word đọc ngược lại có ra đúng 11 dạng câu
node scripts/test-framework-scope.mjs # soát nhầm môn/khối khi nhập khung YCCĐ
node scripts/test-impact.mjs          # đếm/gỡ ảnh hưởng khi xoá môn · mục lục · YCCĐ
node scripts/test-pdf-import.mjs      # đọc đề từ PDF
node scripts/test-ai-formulas.mjs     # chốt kiểm bản AI dọn công thức PDF
node scripts/test-preview-text.mjs    # dòng xem trước không rò cú pháp nội bộ
node scripts/test-omath.mjs           # công thức Word → LaTeX + mốc $…$ dùng chung
node scripts/test-audio-marker.mjs    # mốc audio + giới hạn số lần nghe
node scripts/check-design-tokens.mjs   # bánh cóc thang chữ (xem dưới)
```

Sửa lỗi thì viết thêm ca hồi quy khoá lại đúng lỗi đó.

`check-design-tokens.mjs` là **bánh cóc quay một chiều**: số chỗ dùng cỡ chữ
tự chế (`text-[Npx]`) và số chỗ dùng nửa pixel chỉ được GIẢM, không được tăng.
Mốc nằm ở `scripts/design-tokens-baseline.json`. Di cư xong một mảng thì chạy
`node scripts/check-design-tokens.mjs --update` để hạ mốc. Đừng bao giờ nâng
mốc lên để cho qua.

## Lưu ý môi trường

- `apps/web/.env.local` **không** chứa khoá Firebase, nên `npm run dev` chạy ở
  chế độ seed/offline và không ghi gì vào Firestore production. QA đầy đủ trên
  localhost là an toàn.
- Đăng nhập seed: nhân viên dùng email, học sinh phải dùng id (`U-401`). Mật khẩu
  chung `fpt2026`.
- Phiên đăng nhập ở chế độ seed chỉ nằm trong bộ nhớ. Mỗi lần tải lại trang là
  mất đăng nhập, nên phải điều hướng bằng cách bấm link trong app.
- **Build khi dev server đang chạy: đổi thư mục kết xuất.** `next dev` và
  `next build` mặc định dùng chung `apps/web/.next`, nên build đè lên thư mục
  dev server đang phục vụ — nó vẫn sống nhưng trả 500 cho mọi trang và không
  báo vì sao. Không phải dừng dev nữa, chỉ cần:

  ```bash
  cd apps/web && NEXT_DIST_DIR=.next-build npx next build
  git checkout -- apps/web/next-env.d.ts apps/web/tsconfig.json
  ```

  Dòng thứ hai BẮT BUỘC: `next build` tự viết lại hai file đó để trỏ vào thư
  mục kết xuất vừa dùng. Quên trả lại thì `tsconfig.json` trong repo trỏ vào
  một thư mục nằm trong `.gitignore` — máy khác và Vercel không có nó.

  `.next-build/` đã nằm trong `.gitignore` và xoá lúc nào cũng được (~500MB).
  Không đặt biến này thì build vẫn ra `.next` như cũ, nên Vercel không đổi gì.
