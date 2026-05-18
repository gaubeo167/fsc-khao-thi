"use client";

import {
  Bell,
  BellOff,
  CalendarClock,
  CheckCheck,
  Clock,
  Shield,
  User,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useShiftsStore } from "@/features/exam-shifts/state/shifts-store";
import {
  type Notification,
  useNotificationsStore,
} from "@/features/notifications/state/notifications-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { cn } from "@/lib/utils";

function relativeTime(iso: string, now: number = Date.now()): string {
  const diff = now - new Date(iso).getTime();
  if (diff < 0) return "vừa lập";
  if (diff < 60_000) return "vừa xong";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  return `${d} ngày trước`;
}

export function StudentNotificationsPanel({ limit = 4 }: { limit?: number }) {
  const session = useAuthStore((s) => s.session);
  const all = useNotificationsStore((s) => s.notifications);
  const markRead = useNotificationsStore((s) => s.markRead);
  const markAllReadFor = useNotificationsStore((s) => s.markAllReadFor);
  // Detail dialog for the notification the user just clicked on. Showing
  // full content + shift context here (rather than navigating away) lets
  // the student decide whether to enter the exam or just dismiss.
  const [opened, setOpened] = useState<Notification | null>(null);

  const mine = useMemo(() => {
    if (!session) return [];
    return all
      .filter((n) => n.userId === session.userId)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }, [all, session]);
  const unread = mine.filter((n) => n.readAt == null).length;

  if (!session) return null;

  return (
    <div className="rounded-xl border bg-card p-4">
      <header className="mb-2 flex items-center justify-between">
        <h3 className="text-section-title inline-flex items-center gap-2">
          <Bell className="h-4 w-4 text-blue-600" />
          Thông báo
          {unread > 0 && (
            <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {unread}
            </span>
          )}
        </h3>
        {unread > 0 && (
          <button
            type="button"
            onClick={() => markAllReadFor(session.userId)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:underline"
          >
            <CheckCheck className="h-3 w-3" />
            Đánh dấu đã đọc hết
          </button>
        )}
      </header>
      {mine.length === 0 ? (
        <div className="rounded-md border border-dashed bg-muted/20 px-3 py-6 text-center">
          <BellOff className="mx-auto h-5 w-5 text-muted-foreground/60" />
          <p className="mt-1 text-[12px] text-muted-foreground">
            Bạn không có thông báo mới.
          </p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {mine.slice(0, limit).map((n) => {
            const accent = n.kind === "shift-reminder" ? "blue" : "violet";
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => {
                    // Open the detail dialog FIRST — give the student a
                    // chance to read carefully before any navigation.
                    setOpened(n);
                    if (n.readAt == null) markRead(n.id);
                  }}
                  className={cn(
                    "block w-full rounded-md border bg-card px-3 py-2 text-left transition hover:bg-accent/20",
                    n.readAt == null &&
                      (accent === "blue"
                        ? "border-l-2 border-l-blue-400 bg-blue-50/30"
                        : "border-l-2 border-l-violet-400 bg-violet-50/30"),
                  )}
                >
                  <p className="text-[12.5px] font-semibold leading-tight">
                    {n.title}
                    {n.readAt == null && (
                      <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-rose-500" />
                    )}
                  </p>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-foreground/75">
                    {n.body}
                  </p>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[10.5px] text-muted-foreground">
                    <span>
                      {n.senderName} · {relativeTime(n.createdAt)}
                    </span>
                    <span className="font-semibold text-blue-700">
                      Xem chi tiết →
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {opened && (
        <NotificationDetailDialog
          notification={opened}
          onClose={() => setOpened(null)}
        />
      )}
    </div>
  );
}

function NotificationDetailDialog({
  notification: n,
  onClose,
}: {
  notification: Notification;
  onClose(): void;
}) {
  // If the notification refers to a shift, pull its details so the
  // student sees time / room / anti-cheat config right inside this
  // dialog — no need to bounce through the lịch thi page first.
  const shifts = useShiftsStore((s) => s.shifts);
  const subjects = useSubjectsStore((s) => s.subjects);
  const shift =
    n.refId && n.kind === "shift-reminder"
      ? shifts.find((s) => s.id === n.refId)
      : undefined;
  const subject = shift
    ? subjects.find((s) => s.id === shift.subjectId)
    : null;

  const now = Date.now();
  const startMs = shift ? new Date(shift.startAt).getTime() : 0;
  const endMs = shift ? new Date(shift.endAt).getTime() : 0;
  const inExamWindow =
    shift != null && now >= startMs && now <= endMs;
  const isBeforeStart = shift != null && now < startMs;
  const isAfterEnd = shift != null && now > endMs;

  function diffHumans(ms: number): string {
    if (ms <= 0) return "—";
    const totalMin = Math.floor(ms / 60_000);
    if (totalMin < 60) return `${totalMin} phút`;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h < 24) return `${h}h${m > 0 ? ` ${m}m` : ""}`;
    const d = Math.floor(h / 24);
    return `${d} ngày${h % 24 > 0 ? ` ${h % 24}h` : ""}`;
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg p-0">
        <header className="flex items-start gap-3 border-b px-5 py-4">
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
              n.kind === "shift-reminder"
                ? "bg-blue-50 text-blue-700"
                : "bg-violet-50 text-violet-700",
            )}
          >
            <Bell className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-section-title">
              {n.title}
            </DialogTitle>
            <p className="mt-0.5 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <User className="h-3 w-3" />
              {n.senderName}
              <span>·</span>
              <Clock className="h-3 w-3" />
              {relativeTime(n.createdAt, now)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-accent/30"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-3 px-5 py-4">
          {/* Body */}
          <div className="whitespace-pre-wrap rounded-md border bg-muted/30 px-3 py-2.5 text-[13.5px] leading-relaxed">
            {n.body}
          </div>

          {/* Shift context (if any) */}
          {shift && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3">
              <h4 className="mb-1.5 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.06em] text-blue-800">
                <CalendarClock className="h-3.5 w-3.5" />
                Chi tiết ca thi
              </h4>
              <p className="text-[14px] font-semibold leading-tight">
                {shift.name}
              </p>
              {subject && (
                <p className="mt-0.5 text-[11px]">
                  Môn:{" "}
                  <span className="rounded bg-blue-100 px-1.5 py-0.5 font-semibold text-blue-800">
                    {subject.name}
                  </span>
                </p>
              )}
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11.5px]">
                <div>
                  <dt className="text-muted-foreground">Bắt đầu</dt>
                  <dd className="font-semibold">
                    {new Date(shift.startAt).toLocaleString("vi-VN", {
                      hour: "2-digit",
                      minute: "2-digit",
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Kết thúc</dt>
                  <dd className="font-semibold">
                    {new Date(shift.endAt).toLocaleString("vi-VN", {
                      hour: "2-digit",
                      minute: "2-digit",
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Số phòng</dt>
                  <dd className="font-semibold">{shift.rooms.length}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Anti-cheat</dt>
                  <dd className="font-semibold">
                    {Object.values(shift.antiCheat).filter(Boolean).length}/
                    {Object.keys(shift.antiCheat).length} biện pháp
                  </dd>
                </div>
              </dl>
              {/* Time hint relative to now */}
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-[11.5px] font-semibold">
                {isBeforeStart && (
                  <>
                    <Shield className="h-3 w-3 text-blue-600" />
                    Bắt đầu sau{" "}
                    <span className="text-blue-700">
                      {diffHumans(startMs - now)}
                    </span>
                  </>
                )}
                {inExamWindow && (
                  <>
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                    </span>
                    <span className="text-emerald-700">
                      Đang mở · còn {diffHumans(endMs - now)}
                    </span>
                  </>
                )}
                {isAfterEnd && (
                  <span className="text-muted-foreground">
                    Đã kết thúc {diffHumans(now - endMs)} trước
                  </span>
                )}
              </p>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t bg-[var(--color-surface-2)] px-5 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>
            Đóng
          </Button>
          {shift ? (
            inExamWindow ? (
              <Button asChild size="sm" className="gap-1.5">
                <Link href={`/exam/${shift.id}`}>
                  ▶ Vào thi ngay
                </Link>
              </Button>
            ) : isAfterEnd ? (
              <Button asChild size="sm" variant="outline" className="gap-1.5">
                <Link href={`/exam/${shift.id}/result`}>
                  Xem kết quả →
                </Link>
              </Button>
            ) : (
              <Button asChild size="sm" className="gap-1.5">
                <Link href={`/my-exams`}>
                  <CalendarClock className="h-3.5 w-3.5" />
                  Xem lịch thi
                </Link>
              </Button>
            )
          ) : n.link ? (
            <Button asChild size="sm">
              <Link href={n.link}>Mở</Link>
            </Button>
          ) : null}
        </footer>
      </DialogContent>
    </Dialog>
  );
}
