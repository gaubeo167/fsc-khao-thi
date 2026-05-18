"use client";

import { useAuthStore } from "@/features/auth/state/auth-store";

/**
 * Permission gate for campus-scoped mutations — now decided purely by
 * the signed-in user's role / scope. The legacy "pick a campus before
 * you can mutate" picker has been retired; admins act inside their own
 * campus, and superadmin always has full mutation rights (the target
 * campus is selected per-form when needed).
 */
export function useCampusGate(): {
  canMutate: boolean;
  /** Short Vietnamese explanation suitable for a banner / tooltip. */
  reason: string | null;
} {
  const role = useAuthStore((s) => s.session?.role);

  if (!role) return { canMutate: false, reason: "Chưa đăng nhập" };
  if (role === "student") {
    return { canMutate: false, reason: "Học sinh không có quyền chỉnh sửa." };
  }
  return { canMutate: true, reason: null };
}
