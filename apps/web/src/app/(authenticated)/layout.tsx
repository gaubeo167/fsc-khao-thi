"use client";

import { Loader2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { ScopeProvider } from "@/features/auth/lib/scope-provider";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { AppShell } from "@/features/shell/components/app-shell";

export default function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const session = useAuthStore((s) => s.session);
  const hydrated = useAuthStore((s) => s.hydrated);

  useEffect(() => {
    if (!hydrated) return;
    if (!session) {
      const next = encodeURIComponent(pathname ?? "/dashboard");
      router.replace(`/login?next=${next}`);
    }
  }, [hydrated, pathname, router, session]);

  if (!hydrated || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
      </div>
    );
  }

  // The exam runtime owns the full viewport (its own status bar, no shell chrome).
  if (pathname?.startsWith("/attempts/")) {
    return <ScopeProvider>{children}</ScopeProvider>;
  }

  return (
    <ScopeProvider>
      <AppShell>{children}</AppShell>
    </ScopeProvider>
  );
}
