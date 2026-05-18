"use client";

import { Avatar } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import type { SeedUser } from "@/features/auth/data/seed-users";
import { useCampusesStore } from "@/features/campus/state/campuses-store";
import { ROLE_LABEL } from "@/features/admin/users/role-labels";
import { cn } from "@/lib/utils";

interface Props {
  user: SeedUser | null;
  onClose: () => void;
}

export function UserDetailsDialog({ user, onClose }: Props) {
  const campuses = useCampusesStore((s) => s.campuses);
  const campus = user?.campusId
    ? campuses.find((c) => c.id === user.campusId)
    : undefined;

  return (
    <Dialog open={Boolean(user)} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Chi tiết người dùng</DialogTitle>
          <DialogDescription>Thông tin tài khoản FSchools</DialogDescription>
        </DialogHeader>

        {user ? (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <Avatar name={user.name} size="lg" />
              <div className="min-w-0">
                <p className="text-section-title">{user.name}</p>
                <p className="text-meta truncate">
                  <span className="font-mono">{user.id}</span> · {user.email}
                </p>
              </div>
            </div>

            <Separator />

            <dl className="grid gap-3 text-[13px]">
              <Row label="Vai trò" value={ROLE_LABEL[user.role]} />
              <Row label="Campus" value={campus?.name ?? "— Toàn hệ thống —"} />
              {user.subject ? <Row label="Bộ môn" value={user.subject} /> : null}
              {user.className ? <Row label="Lớp" value={user.className} /> : null}
              <Row
                label="Trạng thái"
                value={
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold",
                      user.status === "active" &&
                        "bg-[var(--color-success)]/12 text-[var(--color-success)]",
                      user.status === "invited" &&
                        "bg-[var(--color-warning)]/12 text-[var(--color-warning)]",
                      user.status === "suspended" &&
                        "bg-destructive/12 text-destructive",
                    )}
                  >
                    <span aria-hidden className="h-1 w-1 rounded-full bg-current" />
                    {user.status === "active"
                      ? "Đang hoạt động"
                      : user.status === "invited"
                        ? "Đã mời"
                        : "Tạm khoá"}
                  </span>
                }
              />
              <Row
                label="Ngày tạo"
                value={new Date(user.createdAt).toLocaleString("vi-VN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })}
              />
            </dl>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-meta">{label}</dt>
      <dd className="font-medium text-foreground/85">{value}</dd>
    </div>
  );
}
