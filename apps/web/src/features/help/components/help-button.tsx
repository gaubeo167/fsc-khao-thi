"use client";

import { HelpCircle } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { findGuide } from "../data/guides";

/**
 * Route-aware help launcher in the top bar. Reads the current pathname,
 * resolves the matching guide and shows its steps + screenshots in a
 * scrollable dialog. Mounted once (in TopBar), so no per-page wiring.
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-h-[85vh] w-full max-w-2xl overflow-y-auto p-0"
          srTitle={guide?.title ?? "Hướng dẫn"}
        >
          <DialogHeader className="sticky top-0 z-10 border-b bg-background/95 px-6 py-4 backdrop-blur">
            <DialogTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-primary" />
              {guide ? `Hướng dẫn — ${guide.title}` : "Hướng dẫn"}
            </DialogTitle>
            {guide?.intro ? (
              <DialogDescription>{guide.intro}</DialogDescription>
            ) : null}
          </DialogHeader>

          <div className="space-y-4 px-6 py-5">
            {guide ? (
              <ol className="space-y-4">
                {guide.steps.map((step, i) => (
                  <li key={i} className="space-y-2">
                    {step.text ? (
                      <p className="text-[13.5px] leading-relaxed text-foreground/90">
                        {step.text}
                      </p>
                    ) : null}
                    {step.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={step.image}
                        alt={step.imageAlt ?? ""}
                        loading="lazy"
                        className="w-full rounded-lg border shadow-sm"
                      />
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-[13.5px] text-muted-foreground">
                Trang này chưa có hướng dẫn riêng. Xem tài liệu đầy đủ trong{" "}
                <span className="font-medium">docs/HUONG-DAN-SU-DUNG.md</span>.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
