"use client";

import { HelpCircle } from "lucide-react";
import { useState } from "react";

import type { GuideContent } from "../data/guides";
import { GuideDialog } from "./guide-dialog";

/**
 * Inline "Xem hướng dẫn" button for use inside dialogs/forms where the
 * top-bar HelpButton is covered by an overlay. Pass the guide to show
 * (e.g. the current question type's guide).
 */
export function InlineGuideButton({
  guide,
  label = "Hướng dẫn nhập loại này",
}: {
  guide: GuideContent | null;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!guide) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-[12.5px] font-medium text-primary transition-colors hover:bg-primary/10"
      >
        <HelpCircle className="h-3.5 w-3.5" strokeWidth={1.85} />
        {label}
      </button>
      <GuideDialog guide={guide} open={open} onOpenChange={setOpen} />
    </>
  );
}
