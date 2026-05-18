import { z } from "zod";

export const RoleSchema = z.enum([
  "campus-admin",
  "subject-lead",
  "teacher",
  "student",
]);

export const StatusSchema = z.enum(["active", "invited", "suspended"]);

// Plain RFC-ish email regex (no domain constraint). The domain whitelist
// was removed at the request of the operator — staff/students may have
// emails on any domain.
const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/i;

export const CreateUserSchema = z
  .object({
    name: z.string().trim().min(2, "Vui lòng nhập họ tên đầy đủ").max(120),
    email: z
      .string()
      .trim()
      .min(1, "Vui lòng nhập email")
      .regex(EMAIL_REGEX, "Email không hợp lệ"),
    role: RoleSchema,
    campusId: z.string().min(1, "Vui lòng chọn campus"),
    subject: z.string().max(64).optional().or(z.literal("")),
    /**
     * Lớp chỉ là gợi ý cho học sinh — không strict. Trường hợp campus chưa
     * có lớp nào hoặc giáo viên admin tạo user trước khi xếp lớp, cho phép
     * bỏ trống và bổ sung sau ở trang Khối · lớp / Users.
     */
    className: z.string().max(32).optional().or(z.literal("")),
    subjectIds: z.array(z.string()).optional().default([]),
    gradeIds: z.array(z.string()).optional().default([]),
    classIds: z.array(z.string()).optional().default([]),
    permissions: z
      .object({
        canCreateBlueprint: z.boolean().optional(),
        canCreatePackage: z.boolean().optional(),
        canCreateShift: z.boolean().optional(),
      })
      .optional(),
    password: z
      .string()
      .min(6, "Mật khẩu tối thiểu 6 ký tự")
      .max(64),
    status: StatusSchema.default("active"),
  });

export type CreateUserValues = z.infer<typeof CreateUserSchema>;

export const EditUserSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z
      .string()
      .trim()
      .min(1)
      .regex(EMAIL_REGEX, "Email không hợp lệ"),
    role: RoleSchema,
    campusId: z.string().min(1),
    subject: z.string().max(64).optional().or(z.literal("")),
    className: z.string().max(32).optional().or(z.literal("")),
    subjectIds: z.array(z.string()).optional().default([]),
    gradeIds: z.array(z.string()).optional().default([]),
    classIds: z.array(z.string()).optional().default([]),
    permissions: z
      .object({
        canCreateBlueprint: z.boolean().optional(),
        canCreatePackage: z.boolean().optional(),
        canCreateShift: z.boolean().optional(),
      })
      .optional(),
    /**
     * Optional new password — leave blank to keep the current one.
     */
    password: z.string().max(64).optional().or(z.literal("")),
    status: StatusSchema,
  })
  .refine(
    (v) => !v.password || v.password.length >= 6,
    { message: "Mật khẩu mới phải ≥ 6 ký tự (hoặc để trống)", path: ["password"] },
  );

export type EditUserValues = z.infer<typeof EditUserSchema>;
