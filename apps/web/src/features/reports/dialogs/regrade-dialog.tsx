"use client";

import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { authHeaders } from "@/lib/api-client";

/**
 * Chấm lại toàn bộ bài của một ca thi.
 *
 * Dùng khi phát hiện SAU kỳ thi rằng một câu bị sai đáp án. Đề đã đóng băng
 * lúc sinh mã đề — đó là điều đúng, bài phải chấm theo đúng cái học sinh đã
 * đọc — nhưng nó khiến sửa câu hỏi gốc không thay đổi được gì. Nút này là
 * đường duy nhất để điểm sai không đứng nguyên trong học bạ.
 *
 * BẮT lý do, không cho bỏ trống: điểm đổi thì phải giải trình được với học
 * sinh và phụ huynh. Lý do được lưu cùng điểm cũ và điểm mới trên từng bài.
 */
export function RegradeDialog({
  open,
  onOpenChange,
  shiftId,
  attemptCount,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shiftId: string;
  attemptCount: number;
}) {
  const [reason, setReason] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<
    { total: number; changed: number } | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setReason("");
      setResult(null);
      setError(null);
      setRunning(false);
    }
  }, [open]);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/exam/${shiftId}/regrade`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ reason: reason.trim(), syncFromBank: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message ?? "Chấm lại thất bại.");
        return;
      }
      setResult({ total: data.total ?? 0, changed: data.changed ?? 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi mạng.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        srTitle="Chấm lại ca thi"
        srDescription="Chấm lại toàn bộ bài đã nộp của ca thi này sau khi sửa đáp án câu hỏi."
        className="max-w-lg p-0"
      >
        <header className="flex items-start gap-3 border-b px-5 py-4 pr-12">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-200">
            <RotateCcw className="h-5 w-5" strokeWidth={1.85} />
          </span>
          <div className="min-w-0">
            <h2 className="text-section-title">Chấm lại ca thi</h2>
            <p className="text-meta mt-0.5">
              {attemptCount} bài đã nộp sẽ được chấm lại bằng đáp án mới nhất
              trong ngân hàng câu hỏi.
            </p>
          </div>
        </header>

        <div className="space-y-4 px-5 py-4">
          {result ? (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3">
              <p className="text-small font-semibold text-emerald-900">
                Đã chấm lại {result.total} bài · {result.changed} bài đổi điểm.
              </p>
              <p className="text-meta mt-1 text-emerald-800">
                Điểm cũ, điểm mới và lý do được lưu trên từng bài — mở bài làm
                ra là xem được.
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
                <p className="text-meta inline-flex items-start gap-1.5 text-amber-900">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Chỉ ĐÁP ÁN được lấy mới từ ngân hàng. Đề bài giữ nguyên như
                    học sinh đã đọc — sửa đề bài sau kỳ thi là viết lại lịch sử.
                    Nếu đề bài sai thì phải huỷ câu, không phải chấm lại.
                  </span>
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-small font-medium text-foreground/80">
                  Lý do chấm lại *
                </Label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  placeholder="vd: Câu 7 bị đánh dấu nhầm đáp án B, đáp án đúng là C"
                  className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                />
                <p className="text-meta text-muted-foreground">
                  Lưu cùng điểm cũ và điểm mới trên từng bài. Phụ huynh hỏi
                  &quot;sao điểm con tôi đổi&quot; thì đây là câu trả lời.
                </p>
              </div>

              {error && (
                <p className="text-meta rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-rose-800">
                  {error}
                </p>
              )}
            </>
          )}
        </div>

        <footer className="flex items-center justify-between border-t bg-[var(--color-surface-2)] px-5 py-3.5">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {result ? "Đóng" : "Hủy"}
          </Button>
          {!result && (
            <Button onClick={() => void run()} disabled={running || reason.trim().length < 5}>
              {running ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              {running ? "Đang chấm lại…" : `Chấm lại ${attemptCount} bài`}
            </Button>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}
