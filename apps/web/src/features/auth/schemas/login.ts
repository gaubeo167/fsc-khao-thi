import { z } from "zod";

// Three accepted shapes:
//   - real email (staff)              `gv.toan@school.edu.vn`
//   - legacy system id                `U-001`
//   - username / studentCode (HS)     `vietlam167`, `FSCCG-2024-001`
// The role tab in the login UI decides which is required; the schema
// only checks the input is non-empty + at least 3 chars + made of
// reasonable identifier characters.
const IDENTIFIER_RE = /^[A-Za-z0-9._@\-+]+$/;

export const LoginFormSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(3, "Tài khoản tối thiểu 3 ký tự")
    .max(120, "Tài khoản quá dài")
    .refine(
      (v) => IDENTIFIER_RE.test(v),
      "Tài khoản chỉ gồm chữ, số, dấu chấm, gạch ngang, gạch dưới, @ hoặc +.",
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
