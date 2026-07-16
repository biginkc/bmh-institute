import Link from "next/link";

import { Card } from "@/components/bmh-ds";
import { createClient } from "@/lib/supabase/server";

import {
  AdminMetricCard,
  AdminPageHeader,
  AdminSectionHeading,
} from "./_components/admin-shell";

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
    <main className="w-full flex-1 p-6 md:p-10">
      <AdminPageHeader
        title="Overview"
        description="Training activity, content inventory, and submissions that need attention."
      />

      <Card padding="md" style={{ marginBottom: 24 }}>
        <AdminSectionHeading
          title="Needs attention"
          description="Current admin follow-ups based on submissions, invites, and draft content."
          action={
            <Link href="/admin/reports" className="text-sm font-extrabold text-[var(--action)]">
              View reports
            </Link>
          }
        />
        {attentionItems.length === 0 ? (
          <p className="text-sm font-semibold text-[var(--text-muted)]">
            Nothing needs attention right now.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {attentionItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="block no-underline"
              >
                <Card
                  padding="sm"
                  interactive
                  style={attentionItemStyle(item.tone)}
                >
                  <span className="block text-sm font-extrabold text-[var(--ink-900)]">
                    {item.label}
                  </span>
                  <span className="block text-xs font-semibold text-[var(--text-muted)]">
                    {item.detail}
                  </span>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </Card>

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

      <div className="mt-8">
        <AdminSectionHeading title="Quick actions" />
        <div className="flex flex-wrap gap-3">
          <Link href="/admin/programs/new" className="block no-underline">
            <Card padding="sm" interactive outline>
              <span className="font-extrabold text-[var(--ink-900)]">New program</span>
            </Card>
          </Link>
          <Link href="/admin/courses/new" className="block no-underline">
            <Card padding="sm" interactive outline>
              <span className="font-extrabold text-[var(--ink-900)]">New course</span>
            </Card>
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

function attentionItemStyle(tone: NeedsAttentionItem["tone"]) {
  return tone === "urgent"
    ? { borderColor: "var(--yellow-500)", background: "var(--warning-soft)" }
    : undefined;
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
    <Link href={href} className="block no-underline">
      <AdminMetricCard label={label} value={count} highlight={highlight} />
    </Link>
  );
}
