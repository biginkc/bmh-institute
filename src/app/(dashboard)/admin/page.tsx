import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";

export default async function AdminOverviewPage() {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const [
    programs,
    draftPrograms,
    courses,
    draftCourses,
    profiles,
    certificates,
    pendingSubs,
    pendingInvites,
    expiredInvites,
  ] =
    await Promise.all([
      supabase.from("programs").select("id", { count: "exact", head: true }),
      supabase
        .from("programs")
        .select("id", { count: "exact", head: true })
        .eq("is_published", false),
      supabase.from("courses").select("id", { count: "exact", head: true }),
      supabase
        .from("courses")
        .select("id", { count: "exact", head: true })
        .eq("is_published", false),
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase
        .from("certificates")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("assignment_submissions")
        .select("id", { count: "exact", head: true })
        .eq("status", "submitted"),
      supabase
        .from("invites")
        .select("id", { count: "exact", head: true })
        .is("accepted_at", null)
        .gt("expires_at", now),
      supabase
        .from("invites")
        .select("id", { count: "exact", head: true })
        .is("accepted_at", null)
        .lte("expires_at", now),
    ]);
  const attentionItems = getNeedsAttentionItems({
    pendingSubmissions: pendingSubs.count ?? 0,
    pendingInvites: pendingInvites.count ?? 0,
    expiredInvites: expiredInvites.count ?? 0,
    draftPrograms: draftPrograms.count ?? 0,
    draftCourses: draftCourses.count ?? 0,
  });

  return (
    <main className="flex-1 p-6 md:p-10">
      <div className="mb-6">
        <PageHeader
          title="Overview"
          description="Training activity, content inventory, and submissions that need attention."
          breadcrumb={[{ label: "Admin" }, { label: "Overview" }]}
        />
      </div>

      <section className="border-border bg-card mb-6 rounded-md border p-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Needs attention</h2>
            <p className="text-muted-foreground text-sm">
              Current admin follow-ups based on submissions, invites, and draft
              content.
            </p>
          </div>
          <Link
            href="/admin/reports"
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            View reports
          </Link>
        </div>
        {attentionItems.length === 0 ? (
          <p className="text-muted-foreground mt-4 text-sm">
            Nothing needs attention right now.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {attentionItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={attentionItemClassName(item.tone)}
              >
                <span className="block text-sm font-medium">{item.label}</span>
                <span className="text-muted-foreground block text-xs">
                  {item.detail}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Pending submissions"
          count={pendingSubs.count ?? 0}
          href="/admin/submissions"
          highlight={(pendingSubs.count ?? 0) > 0}
        />
        <StatCard
          label="Programs"
          count={programs.count ?? 0}
          href="/admin/programs"
        />
        <StatCard
          label="Courses"
          count={courses.count ?? 0}
          href="/admin/courses"
        />
        <StatCard
          label="Users"
          count={profiles.count ?? 0}
          href="/admin/users"
        />
        <StatCard
          label="Certificates issued"
          count={certificates.count ?? 0}
          href="/admin/reports"
        />
      </div>

      <div className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">Quick actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/programs/new"
            className="border-border hover:bg-muted rounded-md border px-3 py-1.5 text-sm"
          >
            New program
          </Link>
          <Link
            href="/admin/courses/new"
            className="border-border hover:bg-muted rounded-md border px-3 py-1.5 text-sm"
          >
            New course
          </Link>
        </div>
      </div>
    </main>
  );
}

type NeedsAttentionCounts = {
  pendingSubmissions: number;
  pendingInvites: number;
  expiredInvites: number;
  draftPrograms: number;
  draftCourses: number;
};

export type NeedsAttentionItem = {
  label: string;
  detail: string;
  href: string;
  tone: "normal" | "urgent";
};

export function getNeedsAttentionItems({
  pendingSubmissions,
  pendingInvites,
  expiredInvites,
  draftPrograms,
  draftCourses,
}: NeedsAttentionCounts): NeedsAttentionItem[] {
  const items: NeedsAttentionItem[] = [];

  if (pendingSubmissions > 0) {
    items.push({
      label: "Pending submissions",
      detail: pluralize(
        pendingSubmissions,
        "submission",
        "submissions",
        "needs",
        "need",
        "review",
      ),
      href: "/admin/submissions",
      tone: "urgent",
    });
  }

  if (expiredInvites > 0) {
    items.push({
      label: "Expired invites",
      detail: pluralize(
        expiredInvites,
        "invite",
        "invites",
        "needs",
        "need",
        "cleanup or resending",
      ),
      href: "/admin/users",
      tone: "urgent",
    });
  }

  if (pendingInvites > 0) {
    items.push({
      label: "Pending invites",
      detail: pluralize(
        pendingInvites,
        "invite",
        "invites",
        "is",
        "are",
        "waiting for signup",
      ),
      href: "/admin/users",
      tone: "normal",
    });
  }

  if (draftPrograms > 0) {
    items.push({
      label: "Draft programs",
      detail: pluralize(
        draftPrograms,
        "program",
        "programs",
        "is",
        "are",
        "not visible to learners",
      ),
      href: "/admin/programs",
      tone: "normal",
    });
  }

  if (draftCourses > 0) {
    items.push({
      label: "Draft courses",
      detail: pluralize(
        draftCourses,
        "course",
        "courses",
        "is",
        "are",
        "not visible to learners",
      ),
      href: "/admin/courses",
      tone: "normal",
    });
  }

  return items;
}

function attentionItemClassName(tone: NeedsAttentionItem["tone"]) {
  const base = "rounded-md border px-3 py-2 transition-colors";
  if (tone === "urgent") {
    return [
      base,
      "border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100",
      "dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100 dark:hover:bg-amber-900",
    ].join(" ");
  }
  return `${base} border-border hover:bg-muted`;
}

function pluralize(
  count: number,
  singularNoun: string,
  pluralNoun: string,
  singularVerb: string,
  pluralVerb: string,
  suffix: string,
) {
  const noun = count === 1 ? singularNoun : pluralNoun;
  const verb = count === 1 ? singularVerb : pluralVerb;
  return `${count} ${noun} ${verb} ${suffix}`;
}

function StatCard({
  label,
  count,
  href,
  highlight,
}: {
  label: string;
  count: number;
  href: string;
  highlight?: boolean;
}) {
  return (
    <Link href={href} className="block">
      <Card
        className={
          highlight
            ? "border-amber-400 bg-amber-50 transition-colors hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-950 dark:hover:bg-amber-900"
            : "hover:bg-muted/30 transition-colors"
        }
      >
        <CardHeader>
          <CardDescription>{label}</CardDescription>
          <CardTitle className="text-3xl font-semibold tabular-nums">
            {count}
          </CardTitle>
        </CardHeader>
        <CardContent />
      </Card>
    </Link>
  );
}
