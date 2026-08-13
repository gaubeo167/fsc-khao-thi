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
node scripts/test-short-answer.mjs   # so khớp đáp án trả lời ngắn
node scripts/test-grade.mjs          # chấm điểm theo chuẩn Bộ
node scripts/test-ai-error.mjs       # phân loại lỗi AI
```

Sửa lỗi thì viết thêm ca hồi quy khoá lại đúng lỗi đó.

## Lưu ý môi trường

- `apps/web/.env.local` **không** chứa khoá Firebase, nên `npm run dev` chạy ở
  chế độ seed/offline và không ghi gì vào Firestore production. QA đầy đủ trên
  localhost là an toàn.
- Đăng nhập seed: nhân viên dùng email, học sinh phải dùng id (`U-401`). Mật khẩu
  chung `fpt2026`.
- Phiên đăng nhập ở chế độ seed chỉ nằm trong bộ nhớ. Mỗi lần tải lại trang là
  mất đăng nhập, nên phải điều hướng bằng cách bấm link trong app.
- **Đừng chạy `next build` khi `next dev` đang chạy.** Nó ghi đè `apps/web/.next`
  và làm dev server trả 500. Dừng dev server trước, hoặc build xong thì
  `rm -rf apps/web/.next` và khởi động lại.
