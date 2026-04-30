import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { SidebarNav } from "./sidebar-nav";

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

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <header className="border-border bg-background sticky top-0 z-10 flex items-center justify-between border-b px-6 py-3 print:hidden">
        <Link href="/dashboard" className="text-base font-semibold">
          BMH Institute
        </Link>
        <div className="text-muted-foreground flex items-center gap-4 text-sm">
          <Link
            href="/profile"
            className="hover:text-foreground underline-offset-2 hover:underline"
          >
            {user.email}
          </Link>
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
        <aside className="border-border bg-muted/20 hidden w-56 shrink-0 border-r md:block print:hidden">
          <SidebarNav
            isAdmin={isAdmin}
            pendingSubmissionsCount={pendingSubmissions}
          />
        </aside>
        <div className="flex flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}
