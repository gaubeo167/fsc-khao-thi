"use client";

import { Bell, Send, Users, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useUsersStore } from "@/features/admin/users/users-store";
import { useAuthStore } from "@/features/auth/state/auth-store";
import type { ExamShift } from "@/features/exam-shifts/data/types";
import { useNotificationsStore } from "@/features/notifications/state/notifications-store";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
  shift: ExamShift;
}

export function SendReminderDialog({ open, onOpenChange, shift }: Props) {
  const session = useAuthStore((s) => s.session);
  const users = useUsersStore((s) => s.users);
  const classes = useGradesStore((s) => s.classes);
  const subjects = useSubjectsStore((s) => s.subjects);
  const pushMany = useNotificationsStore((s) => s.pushMany);

  // Recipients: students explicitly placed in a room, falling back to all
  // students of the assigned classes if the shift hasn't run Step 4 AI.
  const recipientIds = useMemo(() => {
    const explicit = new Set(shift.rooms.flatMap((r) => r.studentIds ?? []));
    if (explicit.size > 0) return Array.from(explicit);
    const codes = new Set(
      classes
        .filter((c) => shift.classIds.includes(c.id))
        .map((c) => c.code),
    );
    return users
      .filter(
        (u) =>
          u.role === "student" &&
          u.status === "active" &&
          u.campusId === shift.campusId &&
          u.className != null &&
          codes.has(u.className),
      )
      .map((u) => u.id);
  }, [shift, classes, users]);

  const subject = subjects.find((s) => s.id === shift.subjectId);
  const startStr = new Date(shift.startAt).toLocaleString("vi-VN", {
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const defaultBody =
    `Em chuẩn bị cho ca thi ${shift.name} (${subject?.name ?? "—"}) lúc ${startStr}. ` +
    `Đăng nhập trước 10 phút để kiểm tra thiết bị, ổn định kết nối mạng và đọc kỹ phần Cấu hình anti-cheat. Chúc em làm bài tốt!`;

  const [title, setTitle] = useState(
    `📅 Lịch thi: ${shift.name}`,
  );
  const [body, setBody] = useState(defaultBody);
  const [sent, setSent] = useState(false);

  function handleSend() {
    if (!session) return;
    if (recipientIds.length === 0) return;
    pushMany(
      recipientIds.map((studentId) => ({
        userId: studentId,
        kind: "shift-reminder" as const,
        title: title.trim() || `Lịch thi: ${shift.name}`,
        body: body.trim() || defaultBody,
        refId: shift.id,
        link: `/exam/${shift.id}`,
        senderId: session.userId,
        senderName: session.name ?? "Admin",
      })),
    );
    setSent(true);
    setTimeout(() => {
      setSent(false);
      onOpenChange(false);
    }, 1500);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0">
        <header className="flex items-start gap-3 border-b px-5 py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            <Bell className="h-5 w-5" strokeWidth={1.85} />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-section-title">
              Gửi nhắc nhở lịch thi
            </DialogTitle>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Mỗi HS nhận 1 thông báo trong trang của họ. Có thể dùng để nhắc
              kỳ thi sắp tới, thông báo thay đổi giờ / phòng…
            </p>
            <p className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
              <Users className="h-3 w-3" />
              {recipientIds.length} HS sẽ nhận
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded p-1 text-muted-foreground hover:bg-accent/30"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-3 px-5 py-4">
          <div>
            <Label className="text-[12px] font-semibold">Tiêu đề</Label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border bg-card px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div>
            <Label className="text-[12px] font-semibold">Nội dung</Label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-[13px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <p className="mt-1 text-[10.5px] text-muted-foreground">
              Mặc định đã chèn sẵn thời gian + môn. Có thể sửa lại theo ý.
            </p>
          </div>

          {/* Preview */}
          <div className="rounded-lg border-2 border-dashed bg-muted/30 p-3">
            <p className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
              Xem trước (giao diện HS)
            </p>
            <div className="rounded-md border-l-2 border-blue-400 bg-card px-3 py-2">
              <p className="text-[13px] font-semibold">{title}</p>
              <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-foreground/85">
                {body}
              </p>
              <p className="mt-1.5 text-[10.5px] text-muted-foreground">
                Gửi bởi {session?.name ?? "—"} · vừa xong
              </p>
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-between gap-2 border-t bg-[var(--color-surface-2)] px-5 py-3">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button
            size="sm"
            onClick={handleSend}
            disabled={sent || recipientIds.length === 0}
            className="gap-1.5"
          >
            {sent ? (
              <>
                ✓ Đã gửi cho {recipientIds.length} HS
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" />
                Gửi tới {recipientIds.length} HS
              </>
            )}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
