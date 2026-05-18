"use client";

import { Building2, Globe2 } from "lucide-react";
import { memo } from "react";

import { useAuthStore } from "@/features/auth/state/auth-store";
import { useCampusesStore } from "@/features/campus/state/campuses-store";

/**
 * Read-only badge in the top bar that shows the user's operating campus.
 *
 * - Superadmin: "Toàn hệ thống" — they only see cross-campus overview and
 *   never operate inside a single campus. To work on a campus, log in as
 *   that campus's admin account.
 * - Campus-bound roles: name of their campus, fixed at login.
 *
 * Replaces the older CampusSelector (which let superadmin "switch into"
 * campus admin mode). That model has been removed for clarity.
 */
export const CampusBadge = memo(function CampusBadge() {
  const role = useAuthStore((s) => s.session?.role);
  const sessionCampusId = useAuthStore((s) => s.session?.campusId);
  const campuses = useCampusesStore((s) => s.campuses);

  if (!role) return null;

  if (role === "superadmin") {
    return (
      <div
        title="Superadmin chỉ xem được tổng quan toàn hệ thống. Đăng nhập bằng tài khoản admin của campus để thao tác trong campus đó."
        className="hidden items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[13px] font-semibold text-blue-700 md:inline-flex"
      >
        <Globe2 className="h-3.5 w-3.5" strokeWidth={1.85} />
        Toàn hệ thống
      </div>
    );
  }

  const campus = sessionCampusId
    ? campuses.find((c) => c.id === sessionCampusId)
    : null;
  return (
    <div
      title="Tài khoản gắn cố định với campus này"
      className="hidden items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-[13px] font-medium text-foreground/75 md:inline-flex"
    >
      <Building2 className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.85} />
      <span className="max-w-[200px] truncate">
        {campus?.name ?? "Campus"}
      </span>
    </div>
  );
});
