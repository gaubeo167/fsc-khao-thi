"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

import { useAuthStore } from "../state/auth-store";

import { UserMenu } from "./user-menu";

interface SiteHeaderProps {
  variant?: "default" | "minimal";
}

export function SiteHeader({ variant = "default" }: SiteHeaderProps) {
  const session = useAuthStore((s) => s.session);
  const hydrated = useAuthStore((s) => s.hydrated);

  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <Link
          href={session ? "/dashboard" : "/"}
          className="flex items-center gap-2.5"
        >
          <span className="rounded-md bg-primary px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">
            FSC
          </span>
          <span className="hidden items-center gap-2 sm:flex">
            <span className="text-card-title">FSchools</span>
            <span className="text-foreground/25">·</span>
            <span className="text-small text-muted-foreground">Khảo thí</span>
          </span>
        </Link>

        {variant === "minimal" ? null : (
          <div className="flex items-center gap-3">
            {!hydrated ? (
              <div className="h-7 w-24 animate-pulse rounded-md bg-muted" />
            ) : session ? (
              <UserMenu />
            ) : (
              <Button asChild size="sm">
                <Link href="/login">Đăng nhập →</Link>
              </Button>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
