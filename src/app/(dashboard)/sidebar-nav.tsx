"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  GraduationCap,
  Inbox,
  LayoutDashboard,
  Package,
  Users,
  UsersRound,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Item = {
  href: string;
  icon: typeof LayoutDashboard;
  label: string;
  badge?: number;
};

const ITEM_BASE =
  "flex items-center gap-3 py-3 text-sm font-bold tracking-wide transition-all duration-200 ease-in-out focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
const ITEM_ACTIVE = "border-l-4 border-foreground pl-4 text-foreground";
const ITEM_INACTIVE =
  "pl-5 text-muted-foreground hover:bg-muted hover:text-foreground";

export function SidebarNav({
  isAdmin,
  pendingSubmissionsCount,
}: {
  isAdmin: boolean;
  pendingSubmissionsCount: number;
}) {
  const pathname = usePathname();

  const learnerItems: Item[] = [
    {
      href: "/dashboard",
      icon: LayoutDashboard,
      label: "Dashboard",
    },
    {
      href: "/certificates",
      icon: GraduationCap,
      label: "Certificates",
    },
  ];

  const adminItems: Item[] = [
    { href: "/admin", icon: LayoutDashboard, label: "Overview" },
    { href: "/admin/programs", icon: Package, label: "Programs" },
    { href: "/admin/courses", icon: BookOpen, label: "Courses" },
    { href: "/admin/users", icon: Users, label: "Users" },
    {
      href: "/admin/submissions",
      icon: Inbox,
      label: "Submissions",
      badge: pendingSubmissionsCount > 0 ? pendingSubmissionsCount : undefined,
    },
    {
      href: "/admin/role-groups",
      icon: UsersRound,
      label: "Role groups",
    },
    { href: "/admin/reports", icon: BarChart3, label: "Reports" },
  ];

  return (
    <nav aria-label="Primary" className="flex flex-1 flex-col gap-1 text-sm">
      <NavSectionLabel>Learn</NavSectionLabel>
      {learnerItems.map((item) => (
        <NavLink
          key={item.href}
          item={item}
          pathname={pathname}
        />
      ))}

      {isAdmin ? (
        <>
          <NavSectionLabel className="mt-4">Admin</NavSectionLabel>
          {adminItems.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              pathname={pathname}
            />
          ))}
        </>
      ) : null}
    </nav>
  );
}

function NavSectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "px-5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

function NavLink({
  item,
  pathname,
}: {
  item: Item;
  pathname: string;
}) {
  const isActive = isLinkActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      data-active={isActive || undefined}
      className={cn(
        ITEM_BASE,
        isActive ? ITEM_ACTIVE : ITEM_INACTIVE,
      )}
    >
      <Icon className="size-5" aria-hidden />
      <span className="flex-1">{item.label}</span>
      {item.badge ? (
        <Badge
          variant={isActive ? "secondary" : "default"}
          className="tabular-nums"
        >
          {item.badge}
        </Badge>
      ) : null}
    </Link>
  );
}

/**
 * Active when the current pathname is exactly the link OR a sub-path.
 * Exception: /admin is only active on exact match so its sub-items
 * (programs, courses, etc.) don't also highlight Overview.
 * Same for /dashboard so /dashboard sub-routes don't bleed in.
 */
function isLinkActive(pathname: string, href: string): boolean {
  if (href === "/admin" || href === "/dashboard") {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
