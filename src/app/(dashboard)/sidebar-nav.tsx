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
  ShieldCheck,
  Users,
  UsersRound,
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
  variant = "sidebar",
}: {
  isAdmin: boolean;
  pendingSubmissionsCount: number;
  variant?: "sidebar" | "mobile";
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

  const mobile = variant === "mobile";

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "text-sm",
        mobile
          ? "flex gap-1 overflow-x-auto px-4 py-2"
          : "flex flex-1 flex-col gap-1",
      )}
    >
      {!mobile ? <NavSectionLabel>Learn</NavSectionLabel> : null}
      {learnerItems.map((item) => (
        <NavLink
          key={item.href}
          item={item}
          pathname={pathname}
          variant={variant}
        />
      ))}

      {isAdmin ? (
        <>
          {!mobile ? (
            <NavSectionLabel className="mt-4">
              <ShieldCheck className="mr-1 inline size-3" />
              Admin
            </NavSectionLabel>
          ) : null}
          {adminItems.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              pathname={pathname}
              variant={variant}
            />
          ))}
        </>
      ) : null}
    </nav>
  );
}

function NavLink({
  item,
  pathname,
  variant,
}: {
  item: Item;
  pathname: string;
  variant: "sidebar" | "mobile";
}) {
  const isActive = isLinkActive(pathname, item.href);
  const mobile = variant === "mobile";
  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      data-active={isActive || undefined}
      className={cn(
        "flex items-center gap-3 text-sm font-bold tracking-wide transition-all duration-200 ease-in-out focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        mobile ? "h-10 shrink-0 px-3" : "py-3",
        isActive
          ? mobile
            ? "border-b-4 border-foreground text-foreground"
            : "border-l-4 border-foreground pl-4 text-foreground"
          : mobile
            ? "text-muted-foreground hover:bg-muted hover:text-foreground"
            : "pl-5 text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {item.icon}
      <span className={mobile ? "whitespace-nowrap" : "flex-1"}>
        {item.label}
      </span>
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
