import Link from "next/link";
import { redirect } from "next/navigation";
import { GraduationCap } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

import { SidebarNav } from "./sidebar-nav";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

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

  const pendingSubmissions = isAdmin
    ? (
        await supabase
          .from("assignment_submissions")
          .select("id", { count: "exact", head: true })
          .eq("status", "submitted")
      ).count ?? 0
    : 0;

  const displayName = profile?.full_name || user.email || "BMH Institute user";

  return (
    <div className="bg-background min-h-screen">
      <header className="border-border bg-background fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b pr-4 md:pr-8 print:hidden">
        <Link
          href="/dashboard"
          className="border-border flex h-full items-center gap-3 px-4 md:w-64 md:border-r md:px-6"
        >
          <div className="bg-primary flex size-10 items-center justify-center rounded-xl">
            <GraduationCap
              className="text-primary-foreground size-5"
              aria-hidden
            />
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="text-foreground truncate text-lg font-black tracking-wide">
              BMH Institute
            </span>
            <span className="text-muted-foreground text-[10px] font-bold tracking-widest uppercase">
              Training Platform
            </span>
          </div>
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <Link
            href="/profile"
            className="hidden items-center gap-2 sm:flex"
            title={user.email ?? ""}
          >
            <span className="text-foreground max-w-48 truncate font-medium">
              {displayName}
            </span>
            <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase">
              {isAdmin ? "admin" : "learner"}
            </span>
          </Link>
          <Link
            href="/profile"
            className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors sm:hidden"
          >
            Profile
          </Link>
          <form
            action="/auth/signout"
            method="post"
            className="border-border md:border-l md:pl-3"
          >
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>

      <aside className="border-border bg-background fixed bottom-0 left-0 top-16 z-30 hidden w-64 flex-col border-r pt-6 md:flex print:hidden">
        <SidebarNav
          isAdmin={isAdmin}
          pendingSubmissionsCount={pendingSubmissions}
        />
        <div
          className="border-border mx-6 mt-2 border-t pt-3 text-xs"
          title={user.email ?? ""}
        >
          <span className="text-muted-foreground block truncate">
            {user.email}
          </span>
        </div>
      </aside>

      <div className="border-border bg-background fixed inset-x-0 top-16 z-30 border-b md:hidden print:hidden">
        <SidebarNav
          isAdmin={isAdmin}
          pendingSubmissionsCount={pendingSubmissions}
          variant="mobile"
        />
      </div>

      <div className="flex min-h-screen flex-col pt-[7.25rem] md:ml-64 md:pt-16">
        <main className="flex flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
