"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  GraduationCap,
  Users,
  BookOpen,
  Package,
  UsersRound,
  ShieldCheck,
  Inbox,
  BarChart3,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Item = {
  href: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
};

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
      icon: <LayoutDashboard className="size-4" />,
      label: "Dashboard",
    },
    {
      href: "/certificates",
      icon: <GraduationCap className="size-4" />,
      label: "Certificates",
    },
  ];

  const adminItems: Item[] = [
    { href: "/admin", icon: <LayoutDashboard className="size-4" />, label: "Overview" },
    { href: "/admin/programs", icon: <Package className="size-4" />, label: "Programs" },
    { href: "/admin/courses", icon: <BookOpen className="size-4" />, label: "Courses" },
    { href: "/admin/users", icon: <Users className="size-4" />, label: "Users" },
    {
      href: "/admin/submissions",
      icon: <Inbox className="size-4" />,
      label: "Submissions",
      badge: pendingSubmissionsCount > 0 ? pendingSubmissionsCount : undefined,
    },
    {
      href: "/admin/role-groups",
      icon: <UsersRound className="size-4" />,
      label: "Role groups",
    },
    { href: "/admin/reports", icon: <BarChart3 className="size-4" />, label: "Reports" },
  ];

  return (
    <nav className="flex flex-col gap-1 p-4 text-sm">
      <NavSectionLabel>Learn</NavSectionLabel>
      {learnerItems.map((item) => (
        <NavLink key={item.href} item={item} pathname={pathname} />
      ))}

      {isAdmin ? (
        <>
          <NavSectionLabel className="mt-4">
            <ShieldCheck className="mr-1 inline size-3" />
            Admin
          </NavSectionLabel>
          {adminItems.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </>
      ) : null}
    </nav>
  );
}

function NavLink({ item, pathname }: { item: Item; pathname: string }) {
  const isActive = isLinkActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5",
        isActive
          ? "bg-primary text-primary-foreground"
          : "text-foreground/80 hover:bg-muted hover:text-foreground",
      )}
    >
      {item.icon}
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
        "text-muted-foreground px-2 pb-1 text-xs font-semibold uppercase tracking-wide",
        className,
      )}
    >
      {children}
    </div>
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
