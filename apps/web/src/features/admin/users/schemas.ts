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

// Email is optional for students — the system auto-generates a
// Firebase Auth address when blank. Staff still require a real email
// because they receive password-reset / system notifications.
const OptionalEmail = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .refine((v) => !v || EMAIL_REGEX.test(v), {
    message: "Email không hợp lệ",
  });

export const CreateUserSchema = z
  .object({
    name: z.string().trim().min(2, "Vui lòng nhập họ tên đầy đủ").max(120),
    email: z
      .string()
      .trim()
      .optional()
      .or(z.literal("")),
    role: RoleSchema,
    campusId: z.string().min(1, "Vui lòng chọn campus"),
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
    // Student-only profile fields. The form shows them only when role
    // is "student"; for staff they're left empty.
    studentCode: z.string().trim().max(40).optional().or(z.literal("")),
    username: z.string().trim().max(40).optional().or(z.literal("")),
    parentPhone: z.string().trim().max(20).optional().or(z.literal("")),
    parentEmail: OptionalEmail,
    password: z
      .string()
      .min(6, "Mật khẩu tối thiểu 6 ký tự")
      .max(64),
    status: StatusSchema.default("active"),
  })
  .refine(
    (v) => v.role !== "student" ? !!v.email && EMAIL_REGEX.test(v.email) : true,
    {
      message: "Nhân viên / giáo viên cần email hợp lệ",
      path: ["email"],
    },
  );

export type CreateUserValues = z.infer<typeof CreateUserSchema>;

export const EditUserSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().optional().or(z.literal("")),
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
    studentCode: z.string().trim().max(40).optional().or(z.literal("")),
    username: z.string().trim().max(40).optional().or(z.literal("")),
    parentPhone: z.string().trim().max(20).optional().or(z.literal("")),
    parentEmail: OptionalEmail,
    password: z.string().max(64).optional().or(z.literal("")),
    status: StatusSchema,
  })
  .refine(
    (v) => !v.password || v.password.length >= 6,
    { message: "Mật khẩu mới phải ≥ 6 ký tự (hoặc để trống)", path: ["password"] },
  )
  .refine(
    (v) => v.role !== "student" ? !!v.email && EMAIL_REGEX.test(v.email) : true,
    {
      message: "Nhân viên / giáo viên cần email hợp lệ",
      path: ["email"],
    },
  );

export type EditUserValues = z.infer<typeof EditUserSchema>;
