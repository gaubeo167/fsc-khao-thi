"use client";

import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  variant?: "default" | "destructive";
  /** Block the confirm button — used when description renders a
   *  "cannot proceed" notice (e.g. data integrity guard). */
  disableConfirm?: boolean;
  onConfirm: () => void;
}

export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  variant = "default",
  disableConfirm,
  onConfirm,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="mb-1 flex items-center gap-2.5">
            <span
              className={
                variant === "destructive"
                  ? "flex h-9 w-9 items-center justify-center rounded-full bg-destructive/12 text-destructive"
                  : "flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-warning)]/12 text-[var(--color-warning)]"
              }
            >
              <AlertTriangle className="h-4 w-4" strokeWidth={1.75} />
            </span>
            <DialogTitle>{title}</DialogTitle>
          </div>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            variant={variant === "destructive" ? "destructive" : "default"}
            disabled={disableConfirm}
            onClick={() => {
              if (disableConfirm) return;
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
