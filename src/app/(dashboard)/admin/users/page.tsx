import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

import { Badge } from "@/components/ui/badge";
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
import { createClient } from "@/lib/supabase/server";

import { InviteForm } from "./invite-form";
import { RevokeInviteButton } from "./revoke-invite-button";

export default async function AdminUsersPage() {
  const supabase = await createClient();
  const [profiles, invites, roleGroups] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, full_name, system_role, status, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("invites")
      .select("id, email, system_role, role_group_ids, created_at, accepted_at, expires_at")
      .order("created_at", { ascending: false }),
    supabase.from("role_groups").select("id, name").order("name"),
  ]);

  const pendingInvites = (invites.data ?? []).filter(
    (i) => !i.accepted_at,
  );

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6 md:p-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Active team members and pending invites. Invite new users and
          Supabase emails them a signup link.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-5">
        <Card className="md:col-span-3">
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
              <Table>
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
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
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
            <Table>
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
                  return (
                    <TableRow key={i.id as string}>
                      <TableCell>{i.email as string}</TableCell>
                      <TableCell className="capitalize">
                        {i.system_role as string}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        in {formatDistanceToNow(expires)}
                      </TableCell>
                      <TableCell className="text-right">
                        <RevokeInviteButton inviteId={i.id as string} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
