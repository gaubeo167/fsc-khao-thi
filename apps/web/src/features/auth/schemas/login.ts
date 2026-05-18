import { z } from "zod";

// Loose check — any reasonable email or a U-xxx system id. The legacy
// `@fpt.edu.vn` requirement was removed so accounts with public-domain
// emails (gmail, school admin imports, etc.) can sign in.
const LOOSE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USER_ID_RE = /^U-\d{3,}$/i;

export const LoginFormSchema = z.object({
  identifier: z
    .string()
    .min(1, "Vui lòng nhập email hoặc mã người dùng")
    .refine(
      (v) => LOOSE_EMAIL_RE.test(v) || USER_ID_RE.test(v),
      "Nhập đúng định dạng email hoặc mã người dùng (U-xxx).",
    ),
  password: z
    .string()
    .min(6, "Mật khẩu tối thiểu 6 ký tự")
    .max(128),
  remember: z.boolean().default(true),
});

export type LoginFormValues = z.infer<typeof LoginFormSchema>;

export function deriveDisplayName(identifier: string): string {
  const base = identifier.includes("@") ? (identifier.split("@")[0] ?? identifier) : identifier;
  if (!base) return identifier;
  return base.charAt(0).toUpperCase() + base.slice(1);
}
