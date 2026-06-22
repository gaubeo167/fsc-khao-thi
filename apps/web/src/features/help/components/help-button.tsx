"use client";

import { HelpCircle } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { findGuide } from "../data/guides";
import { GuideDialog } from "./guide-dialog";

/**
 * Route-aware help launcher in the top bar. Reads the current pathname,
 * resolves the matching guide and shows its steps + screenshots. Mounted
 * once (in TopBar), so no per-page wiring.
 */
export function HelpButton() {
  const pathname = usePathname();
  const guide = findGuide(pathname);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Xem hướng dẫn"
        title="Xem hướng dẫn cho trang này"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-transparent px-2.5 text-[13px] font-medium text-foreground/70 transition-colors hover:border-border hover:bg-accent"
      >
        <HelpCircle className="h-4 w-4" strokeWidth={1.75} />
        <span className="hidden sm:inline">Hướng dẫn</span>
      </button>

      <GuideDialog guide={guide} open={open} onOpenChange={setOpen} />
    </>
  );
}
