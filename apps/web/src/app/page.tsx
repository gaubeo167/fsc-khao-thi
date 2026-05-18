"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect } from "react";

import { BrandPanel } from "@/components/marketing/brand-panel";
import { LandingFooter } from "@/components/marketing/landing-footer";
import { LandingHeader } from "@/components/marketing/landing-header";
import { RoleCluster } from "@/components/marketing/role-cluster";
import { LoginForm } from "@/features/auth/components/login-form";
import { useAuthStore } from "@/features/auth/state/auth-store";

export default function LandingPage() {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const hydrated = useAuthStore((s) => s.hydrated);

  useEffect(() => {
    if (hydrated && session) {
      router.replace("/dashboard");
    }
  }, [hydrated, router, session]);

  return (
    <div className="flex min-h-screen flex-col bg-card">
      <LandingHeader />

      <div className="grid flex-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,1fr)]">
        <div className="hidden lg:block">
          <BrandPanel />
        </div>

        <main id="login" className="flex flex-col bg-card">
          <CompactBrand />

          <div className="flex flex-1 items-center px-6 py-10 lg:px-10">
            <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-10">
              <div className="mx-auto w-full max-w-md xl:mx-0">
                <header className="mb-7">
                  <h2 className="text-page-title">Đăng nhập hệ thống</h2>
                  <p className="text-small mt-1.5 text-muted-foreground">
                    Đăng nhập bằng tài khoản đã được cấp.
                  </p>
                </header>

                <Suspense
                  fallback={<div className="h-72 animate-pulse rounded-xl bg-muted" />}
                >
                  <LoginForm />
                </Suspense>

                <p className="text-meta mt-6 text-center">
                  Bạn cần hỗ trợ? Liên hệ{" "}
                  <Link
                    href="mailto:khaothi@fpt.edu.vn"
                    className="font-medium text-foreground/80 underline-offset-4 hover:text-foreground hover:underline"
                  >
                    quản trị hệ thống
                  </Link>
                </p>
              </div>

              <RoleCluster />
            </div>
          </div>
        </main>
      </div>

      <LandingFooter />
    </div>
  );
}

/**
 * Mobile-only compact brand band: a slim blue strip at top, since the full
 * BrandPanel is hidden below lg breakpoint.
 */
function CompactBrand() {
  return (
    <div className="flex items-center gap-2.5 border-b bg-primary px-5 py-4 text-primary-foreground lg:hidden">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-foreground text-[12px] font-bold text-primary">
        FS
      </span>
      <div className="leading-tight">
        <p className="text-[13px] font-semibold tracking-tight">FSchools</p>
        <p className="text-[11px] text-primary-foreground/75">FPT Schools</p>
      </div>
    </div>
  );
}
