"use client";

import { Ban } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Headline shown next to the red sign. */
  title: string;
  /** Lead sentence. Use JSX to bold the target name inline. */
  intro: React.ReactNode;
  /** Bullet list of references blocking the action. */
  reasons: string[];
  /** Closing hint, e.g. "Hãy xử lý các tham chiếu trước." */
  outro?: string;
}

export function BlockedActionDialog({
  open,
  onOpenChange,
  title,
  intro,
  reasons,
  outro = "Hãy xử lý các tham chiếu trước.",
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/12 text-destructive ring-1 ring-destructive/20">
              <Ban className="h-4 w-4" strokeWidth={2} aria-hidden />
            </span>
            <DialogTitle>{title}</DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
          <p>{intro}</p>
          <ul className="ml-5 list-disc space-y-1.5 text-foreground/75">
            {reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          {outro ? <p className="text-muted-foreground">{outro}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button onClick={() => onOpenChange(false)}>Đã hiểu</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
