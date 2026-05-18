import { z } from "zod";

export const GradeSchema = z.object({
  code: z.string().trim().min(1, "Mã khối là bắt buộc").max(8),
  name: z.string().trim().min(1, "Tên khối là bắt buộc").max(64),
  order: z.coerce.number().int().min(0).max(99),
  status: z.enum(["active", "archived"]).default("active"),
});

export type GradeValues = z.infer<typeof GradeSchema>;

export const ClassSchema = z.object({
  gradeId: z.string().min(1, "Vui lòng chọn khối"),
  code: z.string().trim().min(1, "Mã lớp là bắt buộc").max(16),
  name: z.string().trim().min(1, "Tên lớp là bắt buộc").max(64),
  // Free-text display label — kept as a fallback. Authoritative link is
  // `homeroomTeacherId` (resolved from the users store).
  homeroomTeacher: z.string().trim().max(120).default(""),
  homeroomTeacherId: z.string().nullable().default(null),
  studentCount: z.coerce.number().int().min(0).max(999),
  campusId: z.string().min(1, "Vui lòng chọn campus"),
  status: z.enum(["active", "archived"]).default("active"),
});

export type ClassValues = z.infer<typeof ClassSchema>;
