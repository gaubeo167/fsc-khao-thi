"use client";
import { Ban, Eye, EyeOff, Save, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAuthStore } from "@/features/auth/state/auth-store";
import {
  DEFAULT_RESULT_VISIBILITY,
  effectiveShiftStatus,
  type ExamShift,
  type StudentResultVisibility,
} from "@/features/exam-shifts/data/types";
import { useShiftsStore } from "@/features/exam-shifts/state/shifts-store";
import { cn } from "@/lib/utils";

/**
 * Việc SAU KỲ THI: công bố điểm và huỷ ca.
 *
 * ── Vì sao phải là hộp riêng ────────────────────────────────────────────
 *
 * Hai việc này chỉ có nghĩa sau khi học sinh đã làm bài — mà đúng lúc đó thì
 * trình tạo ca thi đã KHOÁ (`shiftInUse`: đề, thang điểm, danh sách, giờ giấc
 * phải đóng băng để còn đối chiếu). Trước đây cả hai chỉ đặt được trong trình
 * tạo ca, nên:
 *
 *   • chấm tự luận xong rồi thì KHÔNG còn đường mở "Hiện đầy đủ" cho học
 *     sinh — màn kết quả đứng mãi ở "Kết quả chưa được công bố";
 *   • hộp thoại xoá ca khuyên "đổi trạng thái sang Đã huỷ" nhưng không có
 *     chỗ nào đổi được, trừ khi ca ĐANG diễn ra.
 *
 * Hộp này mở đúng hai trường đó và không đụng gì khác, nên đóng băng vẫn
 * nguyên: nội dung đề, thang điểm, danh sách thi không sửa được ở đây.
 */
export function PostExamDialog({
  open,
  onOpenChange,
  shift,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  shift: ExamShift | null;
}) {
  const updateShift = useShiftsStore((s) => s.update);
  const setShiftStatus = useShiftsStore((s) => s.setStatus);
  const session = useAuthStore((s) => s.session);

  const [visibility, setVisibility] = useState<StudentResultVisibility>(
    DEFAULT_RESULT_VISIBILITY,
  );
  const [xacNhanHuy, setXacNhanHuy] = useState(false);

  // Nạp lại mỗi lần mở một ca khác — giữ state cũ là hiện nhầm cài đặt của
  // ca trước và người dùng bấm Lưu thì ghi đè thật.
  useEffect(() => {
    if (!open || !shift) return;
    setVisibility(shift.studentResultVisibility ?? DEFAULT_RESULT_VISIBILITY);
    setXacNhanHuy(false);
  }, [open, shift]);

  if (!shift) return null;

  const eff = effectiveShiftStatus(shift);
  const hienTai = shift.studentResultVisibility ?? DEFAULT_RESULT_VISIBILITY;
  const doiCaiDat = visibility !== hienTai;
  // Ca ĐANG diễn ra không huỷ ở đây: đường đó là "Dừng ca thi ngay" trên
  // danh sách, có cảnh báo riêng về học sinh đang làm bài.
  const huyDuoc = eff !== "in-progress" && eff !== "cancelled";

  const LUA_CHON: Array<{
    v: StudentResultVisibility;
    label: string;
    hint: string;
  }> = [
    {
      v: "full",
      label: "Hiện đầy đủ",
      hint: "Điểm tổng · từng câu đúng/sai · nhận xét của giáo viên",
    },
    {
      v: "score-only",
      label: "Chỉ điểm tổng",
      hint: "Học sinh thấy điểm số, không xem lại được từng câu",
    },
    {
      v: "hidden",
      label: "Ẩn hoàn toàn",
      hint: "Chặn màn kết quả — dùng khi còn đang chấm tự luận",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0">
        <header className="border-b px-5 py-4">
          <DialogTitle className="text-body font-semibold">
            Sau kỳ thi — {shift.name}
          </DialogTitle>
          <p className="text-meta mt-1 text-muted-foreground">
            Công bố điểm cho học sinh và đổi trạng thái ca. Đề, thang điểm và
            danh sách thi vẫn khoá, không sửa ở đây.
          </p>
        </header>

        <section className="space-y-3 px-5 py-4">
          <h3 className="text-meta font-semibold uppercase tracking-wide text-muted-foreground">
            Học sinh xem được gì
          </h3>
          <div className="space-y-2">
            {LUA_CHON.map((opt) => (
              <label
                key={opt.v}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border-2 bg-card p-3 transition",
                  visibility === opt.v
                    ? "border-primary ring-1 ring-primary/30"
                    : "border-border hover:border-primary/40",
                )}
              >
                <input
                  type="radio"
                  name="post-exam-visibility"
                  className="mt-0.5"
                  checked={visibility === opt.v}
                  onChange={() => setVisibility(opt.v)}
                />
                <span>
                  <span className="text-body flex items-center gap-1.5 font-semibold">
                    {opt.v === "hidden" ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                    {opt.label}
                    {opt.v === hienTai && (
                      <span className="text-meta rounded-full bg-surface-2 px-2 py-0.5 font-medium text-muted-foreground">
                        đang áp dụng
                      </span>
                    )}
                  </span>
                  <span className="text-meta mt-0.5 block text-muted-foreground">
                    {opt.hint}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </section>

        {huyDuoc && (
          <section className="space-y-2 border-t px-5 py-4">
            <h3 className="text-meta font-semibold uppercase tracking-wide text-muted-foreground">
              Huỷ ca thi
            </h3>
            <p className="text-meta text-muted-foreground">
              Ca đã huỷ biến khỏi danh sách hoạt động nhưng bài làm và điểm của
              học sinh GIỮ NGUYÊN — đây là cách ẩn một ca không còn dùng mà vẫn
              còn minh chứng. Bỏ chọn được sau bằng cách sửa lại ca.
            </p>
            {xacNhanHuy ? (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    setShiftStatus(shift.id, "cancelled");
                    onOpenChange(false);
                  }}
                >
                  <Ban className="h-3.5 w-3.5" />
                  Xác nhận huỷ ca
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setXacNhanHuy(false)}
                >
                  Thôi
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setXacNhanHuy(true)}
              >
                <Ban className="h-3.5 w-3.5" />
                Đổi trạng thái sang “Đã huỷ”
              </Button>
            )}
          </section>
        )}

        <footer className="flex items-center justify-between gap-2 border-t bg-[var(--color-surface-2)] px-5 py-3">
          <span className="text-meta text-muted-foreground">
            {doiCaiDat ? (
              <span className="font-semibold text-amber-700">
                • Có thay đổi chưa lưu
              </span>
            ) : (
              "Đã đồng bộ"
            )}
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>
              <X className="h-3.5 w-3.5" />
              Đóng
            </Button>
            <Button
              size="sm"
              disabled={!doiCaiDat || !session}
              onClick={() => {
                updateShift(shift.id, { studentResultVisibility: visibility });
                onOpenChange(false);
              }}
            >
              <Save className="h-3.5 w-3.5" />
              Lưu công bố
            </Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
