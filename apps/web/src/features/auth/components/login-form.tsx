"use client";

import { zodResolverSafe } from "@/lib/zod-resolver";
import { AtSign, Eye, EyeOff, KeyRound, Loader2, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCampusStore } from "@/features/campus/state/campus-store";

import { LoginFormSchema, type LoginFormValues } from "../schemas/login";
import { useAuthStore } from "../state/auth-store";

export function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/dashboard";
  const signIn = useAuthStore((s) => s.signIn);
  const setActiveCampus = useCampusStore((s) => s.setActive);

  const [submitting, setSubmitting] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const form = useForm<LoginFormValues>({
    resolver: zodResolverSafe(LoginFormSchema),
    defaultValues: { identifier: "", password: "", remember: true },
    mode: "onBlur",
  });

  async function onSubmit(values: LoginFormValues) {
    setAuthError(null);
    setSubmitting(true);

    // Trim both fields — most "I can't login" reports come from leading /
    // trailing spaces accidentally copied with the password.
    const result = await signIn({
      identifier: values.identifier.trim(),
      password: values.password.trim(),
    });

    if (!result.ok) {
      const msg =
        result.reason === "not_found"
          ? "Không tìm thấy tài khoản với email này. Liên hệ Admin campus nếu bạn nghĩ tài khoản đã được tạo."
          : result.reason === "invalid_password"
            ? "Email hoặc mật khẩu không đúng. Vui lòng kiểm tra lại."
            : result.reason === "network"
              ? "Không kết nối được tới máy chủ. Kiểm tra mạng và thử lại."
              : "Tài khoản đã bị tạm khoá. Liên hệ admin để mở khoá.";
      setAuthError(msg);
      form.setValue("password", "");
      setSubmitting(false);
      return;
    }

    // Scope subsequent queries to the user's campus (null = all, for superadmin).
    setActiveCampus(result.session.campusId);
    router.replace(next);
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="space-y-4"
      noValidate
      aria-describedby={authError ? "auth-error" : undefined}
    >
      {authError ? (
        <div
          id="auth-error"
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-3"
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" strokeWidth={1.75} />
          <div className="text-[13px] leading-relaxed text-destructive">
            <p className="font-semibold">Đăng nhập thất bại</p>
            <p className="mt-0.5 text-destructive/80">{authError}</p>
          </div>
        </div>
      ) : null}

      <Field label="Email hoặc Mã người dùng" error={form.formState.errors.identifier?.message}>
        <div className="relative">
          <AtSign
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            strokeWidth={1.75}
            aria-hidden
          />
          <Input
            id="identifier"
            autoComplete="username"
            autoFocus
            placeholder="email hoặc mã người dùng"
            aria-invalid={Boolean(form.formState.errors.identifier)}
            className="h-11 pl-9"
            disabled={submitting}
            {...form.register("identifier")}
          />
        </div>
      </Field>

      <Field label="Mật khẩu" error={form.formState.errors.password?.message}>
        <div className="relative">
          <KeyRound
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            strokeWidth={1.75}
            aria-hidden
          />
          <Input
            id="password"
            type={showPwd ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••"
            aria-invalid={Boolean(form.formState.errors.password)}
            className="h-11 pl-9 pr-10"
            disabled={submitting}
            {...form.register("password")}
          />
          <button
            type="button"
            aria-label={showPwd ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            onClick={() => setShowPwd((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            tabIndex={-1}
          >
            {showPwd ? (
              <EyeOff className="h-4 w-4" strokeWidth={1.75} />
            ) : (
              <Eye className="h-4 w-4" strokeWidth={1.75} />
            )}
          </button>
        </div>
      </Field>

      <div className="flex items-center justify-between">
        <label className="text-[13px] inline-flex cursor-pointer items-center gap-2 text-foreground/80">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 rounded border-border accent-[var(--color-primary)] focus:ring-2 focus:ring-ring/30"
            {...form.register("remember")}
          />
          Ghi nhớ đăng nhập
        </label>
        <Link
          href="mailto:khaothi@fpt.edu.vn?subject=Qu%C3%AAn%20m%E1%BA%ADt%20kh%E1%BA%A9u"
          className="text-[13px] font-medium text-primary underline-offset-4 hover:underline"
        >
          Quên mật khẩu?
        </Link>
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={submitting}>
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Đăng nhập"}
      </Button>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[13px] font-medium text-foreground/80">{label}</Label>
      {children}
      {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
    </div>
  );
}
