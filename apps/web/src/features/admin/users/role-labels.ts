import type { Role } from "@/features/auth/state/auth-store";

export const ROLE_LABEL: Record<Role, string> = {
  superadmin: "Superadmin",
  "academic-director": "GĐ Học thuật",
  "campus-admin": "Campus Admin",
  "subject-lead": "Trưởng bộ môn",
  teacher: "Giáo viên",
  student: "Học sinh",
};

export const ROLE_TONE: Record<Role, { bg: string; fg: string }> = {
  superadmin: {
    bg: "bg-[var(--color-tone-violet-soft)]",
    fg: "text-[var(--color-tone-violet)]",
  },
  "academic-director": {
    bg: "bg-[var(--color-tone-violet-soft)]",
    fg: "text-[var(--color-tone-violet)]",
  },
  "campus-admin": {
    bg: "bg-[var(--color-tone-orange-soft)]",
    fg: "text-[var(--color-tone-orange)]",
  },
  "subject-lead": {
    bg: "bg-[var(--color-tone-blue-soft)]",
    fg: "text-[var(--color-tone-blue)]",
  },
  teacher: {
    bg: "bg-[var(--color-tone-blue-soft)]",
    fg: "text-[var(--color-tone-blue)]",
  },
  student: {
    bg: "bg-[var(--color-tone-green-soft)]",
    fg: "text-[var(--color-tone-green)]",
  },
};

export const ASSIGNABLE_ROLES: Role[] = [
  "campus-admin",
  "subject-lead",
  "teacher",
  "student",
];
