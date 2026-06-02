"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { inviteUser, type InviteFormState } from "./actions";

export function InviteForm({
  roleGroups,
}: {
  roleGroups: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<
    InviteFormState,
    FormData
  >(inviteUser, null);
  const fieldError = (name: string): string | undefined =>
    state && !state.ok ? state.fieldErrors?.[name] : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          placeholder="name@example.com"
        />
        {fieldError("email") ? (
          <p className="text-destructive text-xs">{fieldError("email")}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="system_role">Role</Label>
        <select
          id="system_role"
          name="system_role"
          defaultValue="learner"
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
        >
          <option value="learner">Learner</option>
          <option value="admin">Admin</option>
          <option value="owner">Owner</option>
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Role groups (optional)</Label>
        {roleGroups.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            No role groups yet. Create some under Role groups.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {roleGroups.map((rg) => (
              <label
                key={rg.id}
                className="flex items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  name="role_group_ids"
                  value={rg.id}
                  className="size-4"
                />
                {rg.name}
              </label>
            ))}
          </div>
        )}
      </div>

      {state && !state.ok ? (
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm">
          {state.error}
        </div>
      ) : null}
      {state && state.ok ? (
        <div className="border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100 rounded-md border px-3 py-2 text-sm">
          Invite sent to {state.email}. They&apos;ll receive a Supabase email with a signup link.
        </div>
      ) : null}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Sending..." : "Send invite"}
        </Button>
      </div>
    </form>
  );
}
