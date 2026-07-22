import Link from "next/link";
import { redirect } from "next/navigation";

import { Avatar } from "@/components/bmh-ds/avatar";
import { Button } from "@/components/bmh-ds/button";
import { Logo } from "@/components/bmh-ds/logo";
import { getRequestAuthContext } from "@/lib/auth/request-context";

import { SidebarNav } from "./sidebar-nav";
import { LessonSearch } from "./lesson-search";
import { MobileNav } from "./mobile-nav";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { supabase, user, profile } = await getRequestAuthContext();

  if (!user) {
    redirect("/login");
  }

  if (profile?.status === "suspended") {
    await supabase.auth.signOut();
    redirect("/login");
  }

  const isAdmin =
    profile?.system_role === "owner" || profile?.system_role === "admin";

  const pendingResult = isAdmin
    ? await supabase
        .from("assignment_submissions")
        .select("id", { count: "exact", head: true })
        .eq("status", "submitted")
    : { count: 0 };
  const pendingSubmissions = pendingResult.count ?? 0;

  const displayName = profile?.full_name || user.email || "BMH Institute user";
  const roleLabel = profile?.system_role ?? "learner";

  return (
    <div className="min-h-screen bg-[var(--surface-app)]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-[var(--border-hairline)] bg-[var(--paper)] md:flex md:w-64 print:hidden">
        <Link
          href="/dashboard"
          prefetch={false}
          className="flex h-[76px] shrink-0 items-center px-6 transition-opacity hover:opacity-90"
          aria-label="BMH Institute dashboard"
        >
          <span className="pointer-events-none">
            <Logo height={20} />
          </span>
        </Link>

        <div className="min-h-0 flex-1 overflow-y-auto py-3">
          <SidebarNav
            isAdmin={isAdmin}
            pendingSubmissionsCount={pendingSubmissions}
          />
        </div>

        <div className="mx-5 border-t border-[var(--border-hairline)] py-4">
          <Link
            href="/profile"
            prefetch={false}
            className="flex min-w-0 items-center gap-3 rounded-[var(--bmh-radius-md)] px-1 py-1 transition-colors hover:bg-[var(--ink-050)]"
            title={user.email ?? ""}
          >
            <Avatar name={displayName} size={38} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-[family-name:var(--font-body)] text-sm font-extrabold text-[var(--ink-900)]">
                {displayName}
              </span>
              <span className="block truncate font-[family-name:var(--font-body)] text-[11px] font-bold capitalize text-[var(--text-muted)]">
                {roleLabel}
              </span>
            </span>
          </Link>
          <form
            action="/auth/signout"
            method="post"
            className="mt-1 pl-[52px]"
          >
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              style={{ padding: "6px 0", color: "var(--text-muted)" }}
            >
              Sign out
            </Button>
          </form>
        </div>
      </aside>

      <header className="fixed inset-x-0 top-0 z-30 flex h-[76px] items-center gap-2 border-b border-[var(--border-hairline)] bg-[var(--paper)] px-2 sm:gap-4 sm:px-4 md:left-64 md:px-7 print:hidden">
        <Link
          href="/dashboard"
          prefetch={false}
          className="shrink-0 md:hidden"
          aria-label="BMH Institute dashboard"
        >
          <span className="pointer-events-none">
            <Logo height={17} mascot={false} />
          </span>
        </Link>
        <div className="hidden w-full max-w-[360px] sm:block">
          <LessonSearch instanceId="desktop" />
        </div>
        <span className="flex-1" />
        <div className="shrink-0 sm:hidden">
          <LessonSearch instanceId="mobile" compact />
        </div>
        <MobileNav
          isAdmin={isAdmin}
          pendingSubmissionsCount={pendingSubmissions}
        />
        <Link
          href="/profile"
          prefetch={false}
          className="flex size-10 shrink-0 items-center justify-center md:hidden"
          aria-label={`${displayName} profile`}
        >
          <Avatar name={displayName} size={36} />
        </Link>
      </header>

      <div className="flex min-h-screen flex-col pt-[76px] md:ml-64">
        <main className="flex flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
