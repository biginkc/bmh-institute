import Link from "next/link";
import type { ReactNode } from "react";
import { formatDistanceToNow } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import {
  shapePilotCohortRows,
  type PilotCohortRow,
  type PilotStatusKey,
} from "@/lib/pilot-cohort/status";

import { InviteForm } from "./invite-form";
import { ResendInviteButton } from "./resend-invite-button";
import { RevokeInviteButton } from "./revoke-invite-button";

export default async function AdminUsersPage() {
  // WR-05: page-level guard mirroring HARDEN-01's pattern on the reports
  // tree. The (dashboard)/admin/layout.tsx wraps this route with the same
  // requireAdmin() check, but defending in depth at the page boundary
  // means a direct fetch against this route file can't rely on the layout
  // having run.
  await requireAdmin();
  const supabase = await createClient();
  const [profiles, invites, roleGroups, userRoleGroups] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, full_name, system_role, status, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("invites")
      .select("id, email, system_role, role_group_ids, created_at, accepted_at, expires_at")
      .order("created_at", { ascending: false }),
    supabase.from("role_groups").select("id, name").order("name"),
    supabase.from("user_role_groups").select("user_id, role_group_id"),
  ]);

  const pendingInvites = (invites.data ?? []).filter(
    (i) => !i.accepted_at,
  );
  const userRoleGroupsByUserId = (userRoleGroups.data ?? []).reduce<
    Record<string, string[]>
  >((acc, row) => {
    const userId = row.user_id as string;
    const roleGroupId = row.role_group_id as string;
    acc[userId] = [...(acc[userId] ?? []), roleGroupId];
    return acc;
  }, {});
  const pilotRows = shapePilotCohortRows({
    profiles: (profiles.data ?? []).map((p) => ({
      id: p.id as string,
      email: p.email as string | null,
      full_name: p.full_name as string | null,
      system_role: p.system_role as "owner" | "admin" | "learner",
      status: p.status as "active" | "invited" | "suspended",
      created_at: p.created_at as string,
    })),
    invites: (invites.data ?? []).map((i) => ({
      id: i.id as string,
      email: i.email as string,
      system_role: i.system_role as "owner" | "admin" | "learner",
      role_group_ids: i.role_group_ids as string[] | null,
      created_at: i.created_at as string,
      accepted_at: i.accepted_at as string | null,
      expires_at: i.expires_at as string,
    })),
    userRoleGroupsByUserId,
    now: new Date(),
  });

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 p-6 md:p-10">
      <div className="mb-6">
        <PageHeader
          title="Users"
          description="Pilot learner access, invite status, and role groups."
          breadcrumb={[{ label: "Admin" }, { label: "Users" }]}
        />
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Pilot setup</CardTitle>
          <CardDescription>
            Learner access, invite status, and next actions for the internal
            pilot.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pilotRows.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No learners yet. Send the first pilot invite when the cohort is
              ready.
            </p>
          ) : (
            <DenseTableScroll testId="pilot-setup-table-scroll">
              <Table className="min-w-[52rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Person</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Setup status</TableHead>
                    <TableHead>Access</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pilotRows.map((row) => (
                    <TableRow key={`${row.kind}-${row.id}`}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {row.email}
                      </TableCell>
                      <TableCell>
                        <PilotStatusBadge statusKey={row.statusKey}>
                          {row.statusLabel}
                        </PilotStatusBadge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {row.accessLabel}
                      </TableCell>
                      <TableCell className="text-right">
                        <PilotRowActions row={row} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DenseTableScroll>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Active members</CardTitle>
            <CardDescription>
              Everyone with an auth account. Role and status shown.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(profiles.data ?? []).length === 0 ? (
              <p className="text-muted-foreground text-sm">No members yet.</p>
            ) : (
              <DenseTableScroll testId="active-members-table-scroll">
                <Table className="min-w-[46rem]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(profiles.data ?? []).map((p) => (
                      <TableRow key={p.id as string}>
                        <TableCell className="font-medium">
                          <Link
                            href={`/admin/users/${p.id as string}/edit`}
                            className="hover:underline underline-offset-4"
                          >
                            {p.full_name as string}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {p.email as string}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {p.system_role as string}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              p.status === "active" ? "default" : "secondary"
                            }
                            className="capitalize"
                          >
                            {p.status as string}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </DenseTableScroll>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Invite someone</CardTitle>
            <CardDescription>
              They get a Supabase email with a signup link.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InviteForm
              roleGroups={(roleGroups.data ?? []).map((rg) => ({
                id: rg.id as string,
                name: rg.name as string,
              }))}
            />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Pending invites</CardTitle>
          <CardDescription>
            Haven&apos;t been accepted yet. Revoke to remove from the list.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pendingInvites.length === 0 ? (
            <p className="text-muted-foreground text-sm">No pending invites.</p>
          ) : (
            <DenseTableScroll testId="pending-invites-table-scroll">
              <Table className="min-w-[48rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingInvites.map((i) => {
                    const expires = new Date(i.expires_at as string);
                    const isExpired = expires <= new Date();
                    return (
                      <TableRow key={i.id as string}>
                        <TableCell>{i.email as string}</TableCell>
                        <TableCell className="capitalize">
                          {i.system_role as string}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {isExpired ? (
                            <Badge variant="destructive">Expired</Badge>
                          ) : (
                            <>in {formatDistanceToNow(expires)}</>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <ResendInviteButton inviteId={i.id as string} />
                            <RevokeInviteButton inviteId={i.id as string} />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </DenseTableScroll>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function DenseTableScroll({
  testId,
  children,
}: {
  testId: string;
  children: ReactNode;
}) {
  return (
    <div data-testid={testId} className="overflow-x-auto pb-1">
      {children}
    </div>
  );
}

function PilotStatusBadge({
  statusKey,
  children,
}: {
  statusKey: PilotStatusKey;
  children: ReactNode;
}) {
  if (statusKey === "expired_invite") {
    return <Badge variant="destructive">{children}</Badge>;
  }
  if (statusKey === "missing_access") {
    return (
      <Badge
        variant="outline"
        className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
      >
        {children}
      </Badge>
    );
  }
  if (statusKey === "ready") {
    return <Badge variant="default">{children}</Badge>;
  }
  return <Badge variant="secondary">{children}</Badge>;
}

function PilotRowActions({ row }: { row: PilotCohortRow }) {
  if (row.kind === "profile") {
    return (
      <Link
        href={`/admin/users/${row.id}/edit`}
        className="text-muted-foreground hover:text-foreground text-sm"
      >
        Review access
      </Link>
    );
  }

  return (
    <div className="flex justify-end gap-2">
      <ResendInviteButton inviteId={row.id} />
      <RevokeInviteButton inviteId={row.id} />
    </div>
  );
}
