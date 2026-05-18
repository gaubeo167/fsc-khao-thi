"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { memo, useMemo } from "react";

import { useUsersStore } from "@/features/admin/users/users-store";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { cn } from "@/lib/utils";

import { filterNavForRole, type NavItem } from "../data/nav";

export function Sidebar() {
  const pathname = usePathname();
  const role = useAuthStore((s) => s.session?.role);
  const userId = useAuthStore((s) => s.session?.userId);
  // Resolve the 3 permission flags as PRIMITIVES so Zustand's Object.is
  // equality check stays stable across unrelated mutations. Returning the
  // whole `permissions` object would cause the sidebar to re-render every
  // time *any* user record changed, which the equality check can't see
  // through.
  const canCreateBlueprint = useUsersStore((s) =>
    userId
      ? (s.users.find((u) => u.id === userId)?.permissions
          ?.canCreateBlueprint ?? false)
      : false,
  );
  const canCreatePackage = useUsersStore((s) =>
    userId
      ? (s.users.find((u) => u.id === userId)?.permissions
          ?.canCreatePackage ?? false)
      : false,
  );
  const canCreateShift = useUsersStore((s) =>
    userId
      ? (s.users.find((u) => u.id === userId)?.permissions?.canCreateShift ??
          false)
      : false,
  );
  const groups = useMemo(
    () =>
      filterNavForRole(role, {
        canCreateBlueprint,
        canCreatePackage,
        canCreateShift,
      }),
    [role, canCreateBlueprint, canCreatePackage, canCreateShift],
  );

  return (
    <aside
      aria-label="Điều hướng chính"
      className="hidden h-full w-60 shrink-0 flex-col border-r bg-card lg:flex"
    >
      <div className="flex h-14 items-center gap-2.5 border-b px-4">
        <span className="rounded-md bg-primary px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">
          FSC
        </span>
        <div className="leading-tight">
          <p className="text-card-title">FSchools</p>
          <p className="text-meta -mt-0.5">FSC Exam Platform</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 py-4">
        <ul className="space-y-6">
          {groups.map((group, gi) => (
            <li key={group.label} className={cn(gi > 0 && "border-t pt-5")}>
              <p className="mb-2.5 flex items-center gap-2 px-2 text-[10px] font-bold uppercase tracking-[0.12em] text-foreground/55">
                <span
                  aria-hidden
                  className="inline-block h-1 w-1 rounded-full bg-foreground/35"
                />
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <SidebarItem
                    key={item.href}
                    item={item}
                    active={
                      !item.disabled &&
                      (pathname === item.href || pathname?.startsWith(`${item.href}/`))
                    }
                  />
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t p-3">
        <div className="rounded-lg bg-muted/60 p-3">
          <p className="text-card-title">FSC Exam Platform</p>
          <p className="text-meta mt-0.5">Phiên bản 1.0 · 2026.05</p>
        </div>
      </div>
    </aside>
  );
}

const SidebarItem = memo(function SidebarItem({
  item,
  active,
}: {
  item: NavItem;
  active: boolean;
}) {
  const Icon = item.icon;
  // Active = primary-soft bg + 3px primary border-left + primary-text + semibold (§5.6)
  const className = cn(
    "group relative flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-colors",
    active && "bg-[var(--color-primary-soft)] text-[var(--color-primary-text)] font-semibold",
    !active && !item.disabled && "font-medium text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)] hover:text-foreground",
    item.disabled && "font-medium cursor-not-allowed text-muted-foreground/70",
  );

  const content = (
    <>
      {active ? (
        <span
          aria-hidden
          className="absolute -left-2.5 top-1 bottom-1 w-[3px] rounded-full bg-[var(--color-primary)]"
        />
      ) : null}
      <Icon
        className={cn("h-4 w-4 shrink-0", active && "text-[var(--color-primary)]")}
        strokeWidth={2}
      />
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge ? (
        <span className="rounded-full bg-[var(--color-primary)] px-1.5 text-[10px] font-bold leading-[1.4] text-white">
          {item.badge}
        </span>
      ) : null}
    </>
  );

  return (
    <li>
      {item.disabled ? (
        <span aria-disabled className={className} title="Sắp ra mắt">
          {content}
        </span>
      ) : (
        <Link href={item.href} className={className} aria-current={active ? "page" : undefined}>
          {content}
        </Link>
      )}
    </li>
  );
});
