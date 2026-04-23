import Link from "next/link";
import { redirect } from "next/navigation";
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

import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("system_role, full_name")
    .eq("id", user.id)
    .maybeSingle();

  const isAdmin =
    profile?.system_role === "owner" || profile?.system_role === "admin";

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <header className="border-border bg-background sticky top-0 z-10 flex items-center justify-between border-b px-6 py-3">
        <Link href="/dashboard" className="text-base font-semibold">
          Sandra University
        </Link>
        <div className="text-muted-foreground flex items-center gap-4 text-sm">
          <span>{user.email}</span>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="hover:text-foreground underline-offset-2 hover:underline"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      <div className="flex flex-1">
        <aside className="border-border bg-muted/20 hidden w-56 shrink-0 border-r md:block">
          <nav className="flex flex-col gap-1 p-4 text-sm">
            <NavSectionLabel>Learn</NavSectionLabel>
            <NavLink href="/dashboard" icon={<LayoutDashboard className="size-4" />}>
              Dashboard
            </NavLink>
            <NavLink
              href="/certificates"
              icon={<GraduationCap className="size-4" />}
            >
              Certificates
            </NavLink>

            {isAdmin ? (
              <>
                <NavSectionLabel className="mt-4">
                  <ShieldCheck className="mr-1 inline size-3" />
                  Admin
                </NavSectionLabel>
                <NavLink href="/admin" icon={<LayoutDashboard className="size-4" />}>
                  Overview
                </NavLink>
                <NavLink href="/admin/programs" icon={<Package className="size-4" />}>
                  Programs
                </NavLink>
                <NavLink href="/admin/courses" icon={<BookOpen className="size-4" />}>
                  Courses
                </NavLink>
                <NavLink href="/admin/users" icon={<Users className="size-4" />}>
                  Users
                </NavLink>
                <NavLink
                  href="/admin/submissions"
                  icon={<Inbox className="size-4" />}
                >
                  Submissions
                </NavLink>
                <NavLink
                  href="/admin/role-groups"
                  icon={<UsersRound className="size-4" />}
                >
                  Role groups
                </NavLink>
                <NavLink
                  href="/admin/reports"
                  icon={<BarChart3 className="size-4" />}
                >
                  Reports
                </NavLink>
              </>
            ) : null}
          </nav>
        </aside>
        <div className="flex flex-1 flex-col">{children}</div>
      </div>
    </div>
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

function NavLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="text-foreground/80 hover:bg-muted hover:text-foreground flex items-center gap-2 rounded-md px-2 py-1.5"
    >
      {icon}
      <span>{children}</span>
    </Link>
  );
}
