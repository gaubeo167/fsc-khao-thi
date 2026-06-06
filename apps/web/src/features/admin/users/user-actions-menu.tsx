"use client";

import {
  Eye,
  KeyRound,
  PauseCircle,
  PencilLine,
  PlayCircle,
  Trash2,
  TrendingUp,
} from "lucide-react";

import { IconButton } from "@/components/ui/icon-button";
import type { SeedUser } from "@/features/auth/data/seed-users";

interface Props {
  user: SeedUser;
  canDelete: boolean;
  onView: (user: SeedUser) => void;
  onEdit: (user: SeedUser) => void;
  onResetPassword: (user: SeedUser) => void;
  onToggleSuspend: (user: SeedUser) => void;
  onDelete: (user: SeedUser) => void;
  /** Optional — only meaningful for student rows. When provided, renders
   *  a Tiến độ button that opens the progress dialog for this student. */
  onViewProgress?: (user: SeedUser) => void;
}

/**
 * Inline action row using the shared IconButton primitive. Each action
 * carries its role through the button's color variant.
 */
export function UserActionsMenu({
  user,
  canDelete,
  onView,
  onEdit,
  onResetPassword,
  onToggleSuspend,
  onDelete,
  onViewProgress,
}: Props) {
  const isSuspended = user.status === "suspended";

  return (
    <div className="inline-flex items-center justify-end gap-1.5">
      <IconButton title="Xem chi tiết" onClick={() => onView(user)}>
        <Eye className="h-4 w-4" strokeWidth={1.75} />
      </IconButton>
      {onViewProgress && user.role === "student" && (
        <IconButton
          variant="warning"
          title="Tiến độ học tập"
          onClick={() => onViewProgress(user)}
        >
          <TrendingUp className="h-4 w-4" strokeWidth={1.75} />
        </IconButton>
      )}
      <IconButton variant="primary" title="Chỉnh sửa" onClick={() => onEdit(user)}>
        <PencilLine className="h-4 w-4" strokeWidth={1.75} />
      </IconButton>
      <IconButton
        variant="warning"
        title="Đặt lại mật khẩu"
        onClick={() => onResetPassword(user)}
      >
        <KeyRound className="h-4 w-4" strokeWidth={1.75} />
      </IconButton>
      <IconButton
        variant={isSuspended ? "success" : "warning"}
        title={isSuspended ? "Mở khoá tài khoản" : "Tạm khoá tài khoản"}
        onClick={() => onToggleSuspend(user)}
      >
        {isSuspended ? (
          <PlayCircle className="h-4 w-4" strokeWidth={1.75} />
        ) : (
          <PauseCircle className="h-4 w-4" strokeWidth={1.75} />
        )}
      </IconButton>
      {canDelete && (
        <IconButton
          variant="destructive"
          title="Xoá vĩnh viễn"
          onClick={() => onDelete(user)}
        >
          <Trash2 className="h-4 w-4" strokeWidth={1.75} />
        </IconButton>
      )}
    </div>
  );
}
