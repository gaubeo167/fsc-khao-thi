"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SubmitDialogProps {
  answered: number;
  total: number;
  submitting: boolean;
  hasUnsavedDrafts: boolean;
  onConfirm: () => void;
  children: React.ReactNode;
}

export function SubmitDialog({
  answered,
  total,
  submitting,
  hasUnsavedDrafts,
  onConfirm,
  children,
}: SubmitDialogProps) {
  const [open, setOpen] = useState(false);
  const unanswered = total - answered;

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && setOpen(o)}>
      <span onClick={() => setOpen(true)}>{children}</span>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nộp bài thi?</DialogTitle>
          <DialogDescription>
            Sau khi nộp, bạn sẽ không thể chỉnh sửa câu trả lời.
          </DialogDescription>
        </DialogHeader>

        <ul className="text-small space-y-2 rounded-lg border bg-muted/30 p-3.5">
          <li className="flex items-center justify-between">
            <span className="text-muted-foreground">Đã trả lời</span>
            <span className="font-semibold tabular-nums">
              {answered} / {total}
            </span>
          </li>
          <li className="flex items-center justify-between">
            <span className="text-muted-foreground">Chưa trả lời</span>
            <span className="font-semibold tabular-nums">{unanswered}</span>
          </li>
          {hasUnsavedDrafts && (
            <li className="text-meta rounded-md bg-[var(--color-warning)]/10 px-2 py-1.5 text-[var(--color-warning)]">
              Còn thay đổi chưa lưu — sẽ được gửi đi trước khi nộp.
            </li>
          )}
        </ul>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
            Tiếp tục làm
          </Button>
          <Button onClick={onConfirm} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Nộp bài
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
