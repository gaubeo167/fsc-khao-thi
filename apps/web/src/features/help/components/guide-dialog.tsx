"use client";

import { HelpCircle } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { GuideContent } from "../data/guides";

/**
 * Presentational guide dialog — renders a guide's steps + screenshots in
 * a scrollable modal. Controlled via `open` / `onOpenChange`. Reused by
 * the top-bar HelpButton (route guide) and inline help triggers
 * (e.g. per question-type guide inside the question form).
 */
export function GuideDialog({
  guide,
  open,
  onOpenChange,
}: {
  guide: GuideContent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
              Mục này chưa có hướng dẫn riêng. Xem tài liệu đầy đủ trong{" "}
              <span className="font-medium">docs/HUONG-DAN-SU-DUNG.md</span>.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
