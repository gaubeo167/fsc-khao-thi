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
node scripts/test-multi-tf-grade.mjs   # Đúng–Sai nhiều ý: lũy tiến, đơn điệu, hai bộ chấm khớp nhau
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
node scripts/test-media-url.mjs       # nhận dạng URL video (YouTube/Drive/Vimeo/mp4)
node scripts/test-toc-scope.mjs       # mục lục KHÔNG mượn của khối khác
node scripts/test-my-shifts-order.mjs # lịch thi HS: việc cần làm lên trên
node scripts/test-edit-permission.mjs # ai được sửa trực tiếp câu đã dùng trong đề
node scripts/test-refresh-frozen.mjs  # đẩy câu đã sửa vào đề đang đóng băng
node scripts/test-user-update-plan.mjs # sửa hồ sơ ≠ đổi mật khẩu (hai kho khác nhau)
node scripts/test-bulk-select.mjs      # tích chọn hàng loạt chỉ chạm dòng đang thấy
node scripts/test-question-delete.mjs  # xoá cứng: soát đủ 6 nguồn tham chiếu + chuỗi phiên bản
node scripts/test-campus-scope.mjs    # ô chọn Môn·Khối theo đúng cơ sở đang thao tác
node scripts/check-design-tokens.mjs   # bánh cóc thang chữ (xem dưới)
```

Sửa lỗi thì viết thêm ca hồi quy khoá lại đúng lỗi đó.

`check-design-tokens.mjs` là **bánh cóc quay một chiều**: số chỗ dùng cỡ chữ
tự chế (`text-[Npx]`) và số chỗ dùng nửa pixel chỉ được GIẢM, không được tăng.
Mốc nằm ở `scripts/design-tokens-baseline.json`. Di cư xong một mảng thì chạy
`node scripts/check-design-tokens.mjs --update` để hạ mốc. Đừng bao giờ nâng
mốc lên để cho qua.

## Lưu ý môi trường

- `apps/web/.env.local` trỏ vào **Firebase emulator**, KHÔNG phải production và
  cũng không còn là chế độ seed/offline (khoá trong đó là khoá giả, project
  `demo-fsc`). QA đầy đủ trên localhost là an toàn, và dữ liệu ghi ra là thật —
  đọc lại được, kiểm tra được.

  ```bash
  npm run emu              # cửa sổ 1 — emulator + nạp dữ liệu mẫu
  cd apps/web && npm run dev   # cửa sổ 2
  ```

  Xem dữ liệu: http://127.0.0.1:4000. Truy vấn thẳng cần header quyền admin —
  không có nó thì mọi collection trả về rỗng và dễ tưởng là app không ghi:

  ```bash
  curl -H "Authorization: Bearer owner" \
    "http://localhost:8080/v1/projects/demo-fsc/databases/(default)/documents/questions?pageSize=300"
  ```

  Muốn quay lại seed/offline thì để `NEXT_PUBLIC_FIREBASE_API_KEY` rỗng.
- Đăng nhập emulator: nhân viên dùng email (`admin.caugiay@fpt.edu.vn`,
  `gv.toan@fpt.edu.vn`), học sinh dùng id. Mật khẩu chung `fpt2026` — xem
  `scripts/seed-emulator.mjs`.
- Dữ liệu emulator sống qua lần tải lại trang, nhưng `npm run emu` chạy lại là
  nạp về mẫu gốc. Mục lục (`toc_nodes`) KHÔNG nằm trong bộ mẫu — màn tải đề sẽ
  không hiện ô "Chỗ cất trong mục lục" cho tới khi có node.
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
