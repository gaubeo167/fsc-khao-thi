# Landing page assets

Đặt ảnh tòa nhà campus FPT Schools vào folder này với **tên `campus.jpg`** (hoặc `.png` / `.webp`).

Path tham chiếu trong code: `/landing/campus.jpg`
File path trên đĩa: `apps/web/public/landing/campus.jpg`

## Gợi ý

- **Kích thước**: tối thiểu `1600 × 1200px`, tỉ lệ ngang khoảng 4:3 — 3:2 là đẹp nhất
- **Định dạng**: `.jpg` cho ảnh thật, hoặc `.webp` cho file nhẹ hơn
- **Nội dung**: ảnh tòa nhà / campus / hành lang trường — high-contrast, không quá nhiều chi tiết vụn
- **Tone**: tự nhiên cũng được (hệ thống tự overlay gradient xanh lên trên)

Sau khi drop file vào, hard refresh browser. Nếu file **chưa có**, panel hiển thị fallback gradient + SVG building pattern — không vỡ layout.

## Đổi tên file khác

Sửa URL trong `src/components/marketing/brand-panel.tsx`:

```tsx
backgroundImage: "url('/landing/<tên-file-của-bạn>.jpg')"
```
