"use client";

import { FilePlus2, Lock, PencilLine } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Question } from "@/features/question-bank/data/seed-questions";
import type { EditVerdict } from "@/features/question-bank/lib/edit-permission";
import { cn } from "@/lib/utils";

/**
 * AI: Hộp thoại khi bấm Sửa một câu ĐANG DÙNG trong đề đã đóng băng.
 *
 * Trước đây chỗ này chỉ có một lối ra — "Tạo phiên bản mới" — và người dùng
 * chỉ ra đúng hệ quả: bản mới là một câu KHÁC (id khác, trạng thái nháp),
 * nên chấm lại ca thi cũ không bám vào đâu được.
 *
 * Nay là HAI lối, và hộp thoại phải nói rõ chúng khác nhau ở đâu, vì chọn
 * nhầm thì hỏng theo hai kiểu ngược nhau: sửa trực tiếp một câu đáng lẽ nên
 * ra bản mới thì viết đè lên câu các lớp sau vẫn dùng; tạo bản mới khi thực
 * ra chỉ cần sửa đáp án sai thì điểm sai đứng nguyên trong học bạ.
 *
 * Lối "sửa trực tiếp" khoá theo môn · khối (xem `canEditInPlace`). Khi bị
 * khoá vẫn HIỆN RA kèm lý do — nút mờ đi không giải thích là cách nhanh
 * nhất khiến người dùng tưởng hệ thống hỏng.
 */
export function InUseEditDialog({
  open,
  onOpenChange,
  question,
  blockerReason,
  nextVersion,
  verdict,
  onDirectEdit,
  onNewVersion,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  question: Question | null;
  /** vd. "Câu hỏi đang được dùng trong 1 đề thi đã đóng băng." */
  blockerReason: string;
  nextVersion: number;
  verdict: EditVerdict;
  onDirectEdit: () => void;
  onNewVersion: () => void;
}) {
  if (!question) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Câu hỏi đã được dùng trong đề thi</DialogTitle>
          <DialogDescription>
            {blockerReason} Đề đã phát cho học sinh là một bản chụp riêng —
            dù chọn cách nào, đề các em đã đọc cũng không đổi.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5">
          <Choice
            icon={verdict.allowed ? PencilLine : Lock}
            title="Sửa trực tiếp"
            disabled={!verdict.allowed}
            onClick={() => {
              if (!verdict.allowed) return;
              onDirectEdit();
            }}
          >
            Giữ nguyên mã <span className="font-mono">{question.id}</span> và
            trạng thái hiện tại. Dùng khi câu bị{" "}
            <span className="font-medium text-foreground">sai đáp án</span> và
            cần chấm lại ca thi đã diễn ra.
            <p className="mt-1.5">
              Điểm học sinh chỉ đổi khi bạn mở ca thi và bấm{" "}
              <span className="font-medium text-foreground">
                Chấm lại ca thi
              </span>
              .
            </p>
            <p
              className={cn(
                "mt-1.5 rounded-md px-2 py-1",
                verdict.allowed
                  ? "bg-emerald-50 text-emerald-800"
                  : "bg-[var(--color-warning)]/10 text-[var(--color-warning)]",
              )}
            >
              {verdict.reason}
            </p>
          </Choice>

          <Choice
            icon={FilePlus2}
            title={`Tạo phiên bản mới (v${nextVersion})`}
            onClick={onNewVersion}
          >
            Sinh một câu mới trong cùng chuỗi, bắt đầu ở trạng thái{" "}
            <span className="font-medium text-foreground">draft</span> — cần
            được duyệt trước khi dùng vào đề mới. Dùng khi bạn muốn đổi nội
            dung cho{" "}
            <span className="font-medium text-foreground">các đề sau</span> mà
            vẫn giữ nguyên bản đã dùng.
            <p className="mt-1.5">
              Chấm lại ca thi cũ chỉ nhận bản mới sau khi nó{" "}
              <span className="font-medium text-foreground">được duyệt</span>.
            </p>
          </Choice>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Choice({
  icon: Icon,
  title,
  children,
  disabled,
  onClick,
}: {
  icon: typeof PencilLine;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled}
      className={cn(
        "flex w-full gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors",
        disabled
          ? "cursor-not-allowed border-border bg-muted/30 opacity-95"
          : "border-border hover:border-ring hover:bg-accent/40",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          disabled
            ? "bg-muted text-muted-foreground"
            : "bg-primary/10 text-primary",
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={1.85} />
      </span>
      <span className="min-w-0">
        <span className="text-card-title block">{title}</span>
        <span className="text-meta mt-1 block text-muted-foreground">
          {children}
        </span>
      </span>
    </button>
  );
}
