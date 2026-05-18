"use client";

import { ChevronDown, MapPin } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { UserMenu } from "@/features/auth/components/user-menu";
import { useAuthStore } from "@/features/auth/state/auth-store";

const NAV = [
  { href: "#about", label: "Giới thiệu" },
  { href: "#features", label: "Tính năng" },
  { href: "#guide", label: "Hướng dẫn" },
  { href: "#news", label: "Tin tức" },
];

export function LandingHeader() {
  const session = useAuthStore((s) => s.session);
  const hydrated = useAuthStore((s) => s.hydrated);

  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 lg:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="rounded-md bg-primary px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">
            FS
          </span>
          <div className="hidden leading-tight sm:block">
            <p className="text-card-title">FSchools</p>
            <p className="text-meta -mt-0.5">Khảo thí</p>
          </div>
        </Link>

        <nav aria-label="Điều hướng trang chủ" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="rounded-md px-3 py-1.5 text-[13px] font-medium text-foreground/75 transition-colors hover:bg-accent hover:text-foreground"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            className="hidden items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] font-medium text-foreground/80 transition-colors hover:bg-accent md:inline-flex"
          >
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
            <span>FPT Schools Cầu Giấy</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>

          {!hydrated ? (
            <div className="h-8 w-32 animate-pulse rounded-md bg-muted" />
          ) : session ? (
            <div className="flex items-center gap-2">
              <Button asChild size="sm">
                <Link href="/dashboard">Vào hệ thống</Link>
              </Button>
              <UserMenu />
            </div>
          ) : (
            <>
              <a
                href="#login"
                className="hidden rounded-md px-3 py-1.5 text-[13px] font-medium text-foreground/75 transition-colors hover:bg-accent hover:text-foreground sm:inline-block"
              >
                Đăng nhập
              </a>
              <Button asChild size="sm">
                <a href="#login">Vào hệ thống</a>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
