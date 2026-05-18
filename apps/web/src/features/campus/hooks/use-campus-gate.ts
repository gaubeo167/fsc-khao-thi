"use client";

import { useAuthStore } from "@/features/auth/state/auth-store";
import { useCampusStore } from "../state/campus-store";

/**
 * Permission gate for "campus-scoped" mutations.
 *
 * Superadmin can operate in two modes:
 *   1. "Tất cả campus" (activeCampusId = null) — read-only across all
 *      campuses. They can browse aggregate stats but must not create or
 *      mutate anything because the target campus is ambiguous.
 *   2. "Pinned campus" (activeCampusId = "campus-xxx") — they're acting as
 *      the campus admin and mutations are scoped to that campus.
 *
 * All other roles are naturally locked to their session.campusId so they
 * always pass the gate.
 *
 * Selectors take primitives only so any caller subscribed via this hook
 * doesn't re-render on unrelated store changes.
 */
export function useCampusGate(): {
  canMutate: boolean;
  /** Short Vietnamese explanation suitable for a banner / tooltip. */
  reason: string | null;
} {
  const role = useAuthStore((s) => s.session?.role);
  const activeCampusId = useCampusStore((s) => s.activeCampusId);

  if (!role) return { canMutate: false, reason: "Chưa đăng nhập" };
  if (role === "superadmin" && !activeCampusId) {
    return {
      canMutate: false,
      reason:
        "Đang ở chế độ Tất cả campus — chỉ xem tổng quan. Chọn 1 campus ở thanh trên để tạo / sửa / xoá.",
    };
  }
  return { canMutate: true, reason: null };
}
