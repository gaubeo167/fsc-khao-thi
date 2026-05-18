"use client";

import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SeedUser } from "@/features/auth/data/seed-users";
import { useCampusesStore } from "@/features/campus/state/campuses-store";
import { cn } from "@/lib/utils";

import { ROLE_LABEL, ROLE_TONE } from "./role-labels";
import { UserActionsMenu } from "./user-actions-menu";

interface Props {
  users: SeedUser[];
  canDelete: boolean;
  onView: (user: SeedUser) => void;
  onEdit: (user: SeedUser) => void;
  onResetPassword: (user: SeedUser) => void;
  onToggleSuspend: (user: SeedUser) => void;
  onDelete: (user: SeedUser) => void;
}

const STATUS_LABEL: Record<SeedUser["status"], string> = {
  active: "Hoạt động",
  invited: "Đã mời",
  suspended: "Tạm khoá",
};

export function UsersTable({
  users,
  canDelete,
  onView,
  onEdit,
  onResetPassword,
  onToggleSuspend,
  onDelete,
}: Props) {
  const campuses = useCampusesStore((s) => s.campuses);
  if (users.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-10 text-center">
        <p className="text-section-title">Không có người dùng phù hợp</p>
        <p className="text-small mt-1 text-muted-foreground">
          Thử thay đổi bộ lọc hoặc thêm người dùng mới.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Người dùng</TableHead>
            <TableHead>Vai trò</TableHead>
            <TableHead>Campus</TableHead>
            <TableHead>Bộ môn / Lớp</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead>Ngày tạo</TableHead>
            <TableHead className="text-right">Hành động</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => {
            const tone = ROLE_TONE[u.role];
            const campus = u.campusId
              ? campuses.find((c) => c.id === u.campusId)
              : undefined;
            return (
              <TableRow key={u.id}>
                <TableCell>
                  <button
                    type="button"
                    onClick={() => onView(u)}
                    className="flex items-center gap-2.5 text-left transition-opacity hover:opacity-80"
                  >
                    <Avatar name={u.name} />
                    <div className="min-w-0">
                      <p className="text-card-title truncate">{u.name}</p>
                      <p className="text-meta truncate">{u.email}</p>
                    </div>
                  </button>
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold",
                      tone.bg,
                      tone.fg,
                    )}
                  >
                    {ROLE_LABEL[u.role]}
                  </span>
                </TableCell>
                <TableCell>
                  {campus ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-foreground/70">
                        {campus.code}
                      </span>
                      <span className="text-foreground/80">
                        {campus.name.replace(/^FSchools /, "")}
                      </span>
                    </span>
                  ) : (
                    <span className="text-meta">— toàn hệ thống —</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className="text-foreground/85">{u.subject ?? u.className ?? "—"}</span>
                </TableCell>
                <TableCell>
                  <StatusBadge variant={u.status}>{STATUS_LABEL[u.status]}</StatusBadge>
                </TableCell>
                <TableCell>
                  <span className="text-meta tabular-nums">
                    {new Date(u.createdAt).toLocaleDateString("vi-VN", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <UserActionsMenu
                    user={u}
                    canDelete={canDelete}
                    onView={onView}
                    onEdit={onEdit}
                    onResetPassword={onResetPassword}
                    onToggleSuspend={onToggleSuspend}
                    onDelete={onDelete}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
