"use client";

import type { ReactNode } from "react";

import { Separator } from "@/components/ui/separator";

interface StatusBarProps {
  title: string;
  left?: ReactNode;
  right?: ReactNode;
}

export function StatusBar({ title, left, right }: StatusBarProps) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
        <div className="flex items-center gap-2.5">
          <span className="rounded-md bg-primary px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">
            FSC
          </span>
          <span className="text-foreground/25">/</span>
          <span className="text-card-title">{title}</span>
        </div>
        {left ? (
          <>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-2">{left}</div>
          </>
        ) : null}
        <div className="ml-auto flex items-center gap-2">{right}</div>
      </div>
    </header>
  );
}
