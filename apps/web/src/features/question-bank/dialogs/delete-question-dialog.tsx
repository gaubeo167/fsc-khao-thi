"use client";

import { Archive, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import type { DeleteVerdict } from "../lib/question-delete";

/**
 * Hộp thoại xoá câu hỏi — hai lối ra, KHÔNG phải một nút bị làm mờ.
 *
 * ── Vì sao không chỉ khoá nút ───────────────────────────────────────────
 *
 * Người dùng báo đúng: câu chưa dùng cho đề nào mà vẫn bắt lưu trữ. Bản cũ
 * chỉ có một nút "Lưu trữ", không giải thích, không có đường xoá hẳn — nên
 * kho tích rác vĩnh viễn từ mỗi lần nhập nhầm file.
 *
 * Nhưng "cho xoá" không thể là mặc định: câu đã vào đề / bài tập / có học
 * sinh làm rồi mà xoá cứng là đục lỗ vào minh chứng, không khôi phục được.
 * Nên hộp này luôn hiện CẢ HAI và nói rõ cái nào đang mở, cái nào không, vì
 * sao. Nút mờ mà im lặng chính là thứ đã đẩy người dùng đi hỏi.
 *
 * Xoá vĩnh viễn còn phải GÕ ĐÚNG MÃ CÂU mới bấm được — một cú bấm nhầm ở đây
 * không có Ctrl+Z.
 */
export function DeleteQuestionDialog({
  question,
  verdict,
  onCancel,
  onArchive,
  onDestroy,
}: {
  question: { id: string; content: string } | null;
  /** Kết quả soát; `null` khi chưa có câu nào được chọn. */
  verdict: DeleteVerdict | null;
  onCancel(): void;
  onArchive(): void;
  onDestroy(): void;
}) {
  const [typed, setTyped] = useState("");
  const open = Boolean(question);

  // Mở câu khác là xoá ô xác nhận — giữ lại giá trị cũ thì mã của câu TRƯỚC
  // có thể vô tình mở khoá nút xoá cho câu SAU.
  useEffect(() => {
    setTyped("");
  }, [question?.id]);

  const canDestroy = verdict?.deletable === true;
  const confirmed = typed.trim().toUpperCase() === (question?.id ?? "").toUpperCase();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent
        srTitle="Xoá câu hỏi"
        srDescription="Chọn lưu trữ (khôi phục được) hoặc xoá vĩnh viễn."
        className="max-w-lg p-0"
      >
        <header className="flex items-start gap-3 border-b px-6 py-4 pr-12">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-200">
            <TriangleAlert className="h-5 w-5" strokeWidth={1.85} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-section-title">Xoá câu hỏi?</h2>
            <p className="text-meta mt-0.5 truncate font-mono">{question?.id}</p>
          </div>
        </header>

        <div className="space-y-3 px-6 py-5">
          {/* ── Lối 1: lưu trữ ── */}
          <div className="rounded-lg border bg-surface px-4 py-3">
            <p className="inline-flex items-center gap-1.5 text-small font-semibold">
              <Archive className="h-4 w-4 text-muted-foreground" />
              Lưu trữ
            </p>
            <p className="text-meta mt-1 text-muted-foreground">
              Câu ẩn khỏi kho nhưng vẫn còn — khôi phục lại được bất cứ lúc nào từ
              mục &quot;Hiển thị đã lưu trữ&quot;. Đề đã đóng băng không bị ảnh
              hưởng.
            </p>
            <Button size="sm" variant="outline" className="mt-2" onClick={onArchive}>
              <Archive className="h-3.5 w-3.5" />
              Lưu trữ câu này
            </Button>
          </div>

          {/* ── Lối 2: xoá vĩnh viễn ── */}
          <div
            className={cn(
              "rounded-lg border px-4 py-3",
              canDestroy
                ? "border-destructive/30 bg-destructive-soft"
                : "border-dashed bg-muted/30",
            )}
          >
            <p
              className={cn(
                "inline-flex items-center gap-1.5 text-small font-semibold",
                canDestroy ? "text-destructive-text" : "text-muted-foreground",
              )}
            >
              <Trash2 className="h-4 w-4" />
              Xoá vĩnh viễn
            </p>
            <p
              className={cn(
                "text-meta mt-1",
                canDestroy ? "text-destructive-text" : "text-muted-foreground",
              )}
            >
              {verdict?.reason}
            </p>

            {/* Bị chặn: nêu ĐÍCH DANH chỗ đang giữ, để người dùng biết đi đâu gỡ. */}
            {!canDestroy && verdict && verdict.blockers.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {verdict.blockers.slice(0, 6).map((b, i) => (
                  <li key={`${b.kind}-${i}`} className="text-meta text-muted-foreground">
                    • {b.label}
                  </li>
                ))}
                {verdict.blockers.length > 6 && (
                  <li className="text-meta text-muted-foreground">
                    • …và {verdict.blockers.length - 6} chỗ nữa
                  </li>
                )}
              </ul>
            )}

            {/* Cho phép: bắt gõ đúng mã. Không có Ctrl+Z cho thao tác này. */}
            {canDestroy && (
              <div className="mt-2.5">
                <label className="text-meta block font-medium text-destructive-text">
                  Gõ <span className="font-mono font-bold">{question?.id}</span> để xác
                  nhận
                </label>
                <input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={question?.id}
                  autoComplete="off"
                  className="mt-1 h-9 w-full rounded-md border border-destructive/40 bg-card px-2 font-mono text-small focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30"
                />
                <Button
                  size="sm"
                  disabled={!confirmed}
                  onClick={onDestroy}
                  className="mt-2 bg-destructive text-white hover:bg-destructive/90"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Xoá vĩnh viễn
                </Button>
              </div>
            )}
          </div>
        </div>

        <footer className="flex items-center justify-end border-t bg-[var(--color-surface-2)] px-6 py-3.5">
          <Button type="button" variant="outline" onClick={onCancel}>
            Huỷ
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
