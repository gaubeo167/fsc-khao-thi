import {
  Activity,
  BarChart3,
  BookOpen,
  BookOpenCheck,
  Building2,
  CalendarClock,
  CheckSquare,
  ClipboardEdit,
  FileText,
  GraduationCap,
  History,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  Library,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { Role } from "@/features/auth/state/auth-store";

export interface NavItem {
  href: string;
  icon: LucideIcon;
  label: string;
  /** Roles allowed to see this item. Undefined = visible to everyone. */
  roles?: Role[];
  /** Disabled items render but are not clickable — for routes not yet built. */
  disabled?: boolean;
  /** Optional small badge text on the right (e.g. counts). */
  badge?: string;
  /**
   * Optional per-user "permission gate" — when set, a user whose role
   * isn't in `roles` BUT who has `permissions.canCreate{Blueprint,Package,Shift}`
   * also passes. Lets an admin promote a teacher to author blueprints
   * without changing their role.
   */
  needsCreate?: "blueprint" | "package" | "shift";
}

export interface NavGroup {
  label: string;
  items: NavItem[];
  /** If set, group hides entirely when user role is not in this list. */
  roles?: Role[];
}

// Role buckets — note Superadmin is intentionally absent from STAFF / LEAD /
// ADMIN. They only see Dashboard + Quản lý campus and never operate inside
// a single campus directly. To work on a campus, log in as that campus's
// admin account (auto-created when the campus is created).
const STAFF: Role[] = ["teacher", "subject-lead", "campus-admin", "academic-director"];
const LEAD: Role[] = ["subject-lead", "campus-admin", "academic-director"];
const ADMIN: Role[] = ["campus-admin", "academic-director"];
const SYSTEM: Role[] = ["superadmin"];
const STUDENT: Role[] = ["student"];
// Teachers + TBM ONLY — admins use the full `/admin/grades` + `/admin/subjects`
// views instead, so we hide the "my-*" personal views from them to avoid
// confusion.
const TEACHER_ONLY: Role[] = ["teacher", "subject-lead"];

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Tổng quan",
    items: [{ href: "/dashboard", icon: LayoutDashboard, label: "Tổng quan" }],
  },
  {
    label: "Học sinh",
    roles: STUDENT,
    items: [
      { href: "/my-exams", icon: CalendarClock, label: "Lịch thi của tôi", roles: STUDENT },
      { href: "/my-exams/history", icon: History, label: "Lịch sử bài thi", roles: STUDENT },
    ],
  },
  {
    label: "Của tôi",
    roles: TEACHER_ONLY,
    items: [
      { href: "/my-classes", icon: GraduationCap, label: "Lớp của tôi", roles: TEACHER_ONLY },
      { href: "/my-subjects", icon: BookOpen, label: "Môn của tôi", roles: TEACHER_ONLY },
      { href: "/my-monitoring", icon: Activity, label: "Giám sát thi", roles: TEACHER_ONLY },
    ],
  },
  {
    label: "Vận hành",
    roles: STAFF,
    items: [
      { href: "/admin/question-bank", icon: Library, label: "Ngân hàng câu hỏi", roles: STAFF },
      // Blueprints + Shifts: defaults to LEAD/ADMIN but a `teacher` with the
      // matching `permissions.canCreate*` flag also passes via the runtime
      // check in `filterNavForRole`. The role array stays as the BASELINE
      // — extra teachers get an additional pass.
      { href: "/admin/exam-blueprints", icon: FileText, label: "Quản lý đề thi", roles: LEAD, needsCreate: "blueprint" },
      // Open to STAFF so teachers can see shifts in their subject scope
      // (proctor view). The "Tạo ca thi mới" button is internally gated
      // by the `canCreateShift` flag. Teachers without proctor or create
      // permission will see an empty list with a clear message.
      { href: "/admin/shifts", icon: ListChecks, label: "Ca kíp thi", roles: STAFF },
      { href: "/admin/schedule", icon: CalendarClock, label: "Lịch thi", roles: STAFF },
      { href: "/grading", icon: ClipboardEdit, label: "Chấm bài tự luận", roles: STAFF },
      { href: "/reports", icon: BarChart3, label: "Kết quả & Báo cáo", roles: STAFF },
    ],
  },
  {
    label: "Quản trị",
    roles: ADMIN,
    items: [
      { href: "/admin/users", icon: Users, label: "Người dùng", roles: ADMIN },
      { href: "/admin/grades", icon: LayoutGrid, label: "Khối · lớp", roles: ADMIN },
      { href: "/admin/subjects", icon: BookOpenCheck, label: "Môn học", roles: ADMIN },
      { href: "/admin/approvals", icon: CheckSquare, label: "Phê duyệt", roles: LEAD },
      { href: "/admin/activity", icon: Activity, label: "Nhật ký hoạt động", roles: ADMIN, disabled: true },
    ],
  },
  {
    label: "Hệ thống",
    roles: SYSTEM,
    items: [
      { href: "/admin/campuses", icon: Building2, label: "Quản lý campus", roles: SYSTEM },
      { href: "/admin/settings", icon: Settings, label: "Cấu hình hệ thống", roles: SYSTEM, disabled: true },
    ],
  },
];

/**
 * Permission overrides for a teacher — admin can grant individual
 * teachers the ability to author blueprints / packages / shifts without
 * changing their role.
 */
export interface UserPermissions {
  canCreateBlueprint?: boolean;
  canCreatePackage?: boolean;
  canCreateShift?: boolean;
}

export function filterNavForRole(
  role: Role | undefined,
  permissions?: UserPermissions,
): NavGroup[] {
  if (!role) return [];
  function itemAllowed(i: NavItem): boolean {
    // Role gate.
    if (i.roles && !i.roles.includes(role!)) {
      // Item normally blocked — check if a permission override applies.
      if (i.needsCreate) {
        const flag =
          i.needsCreate === "blueprint"
            ? permissions?.canCreateBlueprint
            : i.needsCreate === "package"
              ? permissions?.canCreatePackage
              : permissions?.canCreateShift;
        if (flag !== true) return false;
      } else {
        return false;
      }
    }
    return true;
  }
  return NAV_GROUPS
    .map((g) => ({
      ...g,
      items: g.items.filter(itemAllowed),
    }))
    .filter((g) => {
      // Keep the group if (a) the role is in its roles list, OR
      // (b) it still has at least one visible item after the per-item
      // permission overrides. (b) ensures a teacher promoted to create
      // shifts sees the "Vận hành" group even if the group's `roles` is
      // tight.
      if (g.roles && !g.roles.includes(role)) {
        return g.items.length > 0;
      }
      return g.items.length > 0;
    });
}
