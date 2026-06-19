"use client";

import { Bell, Search } from "lucide-react";
import { memo } from "react";

import { Input } from "@/components/ui/input";
import { UserMenu } from "@/features/auth/components/user-menu";
import { HelpButton } from "@/features/help/components/help-button";

import { CampusBadge } from "./campus-badge";

export const TopBar = memo(function TopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/75 lg:px-6">
      <CampusBadge />

      <div className="relative max-w-md flex-1">
        <Search
          aria-hidden
          className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          strokeWidth={1.75}
        />
        <Input
          type="search"
          placeholder="Tìm câu hỏi, đề thi, người dùng…"
          aria-label="Tìm kiếm"
          className="h-9 bg-card pl-8 text-[13px]"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <HelpButton />
        <button
          type="button"
          aria-label="Thông báo"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-transparent text-foreground/70 transition-colors hover:border-border hover:bg-accent"
        >
          <Bell className="h-4 w-4" strokeWidth={1.75} />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-destructive" />
        </button>
        <UserMenu />
      </div>
    </header>
  );
});
