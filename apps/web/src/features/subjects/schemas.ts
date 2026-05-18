import { z } from "zod";

export const SubjectSchema = z.object({
  code: z.string().trim().min(1, "Mã môn là bắt buộc").max(16),
  name: z.string().trim().min(1, "Tên môn là bắt buộc").max(64),
  description: z.string().max(280).optional().default(""),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Mã màu không hợp lệ"),
  gradeIds: z.array(z.string()).min(1, "Chọn ít nhất một khối"),
  campusIds: z.array(z.string()).min(1, "Chọn ít nhất một campus"),
  status: z.enum(["active", "archived"]).default("active"),
});

export type SubjectValues = z.infer<typeof SubjectSchema>;

export const TocNodeSchema = z.object({
  name: z.string().trim().min(1, "Tên mục là bắt buộc").max(200),
});

export type TocNodeValues = z.infer<typeof TocNodeSchema>;
