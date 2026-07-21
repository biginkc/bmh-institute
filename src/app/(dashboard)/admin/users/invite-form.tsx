"use client";

import { useActionState } from "react";

import { Button, Input } from "@/components/bmh-ds";

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
      <Input
        id="email"
        name="email"
        type="email"
        required
        label="Email"
        placeholder="name@example.com"
        error={fieldError("email")}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="system_role" className="text-sm font-bold text-[var(--ink-800)]">
          Role
        </label>
        <select
          id="system_role"
          name="system_role"
          defaultValue="learner"
          className="w-full rounded-[var(--bmh-radius-md)] border-2 border-[var(--ink-300)] bg-[var(--paper)] px-3 py-3 text-sm font-bold text-[var(--ink-900)]"
        >
          <option value="learner">Learner</option>
          <option value="admin">Admin</option>
          <option value="owner">Owner</option>
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-bold text-[var(--ink-800)]">Role groups (optional)</p>
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
        <div className="rounded-[var(--bmh-radius-md)] border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-sm font-semibold text-[var(--danger)]">
          {state.error}
        </div>
      ) : null}
      {state && state.ok ? (
        <div className="rounded-[var(--bmh-radius-md)] border border-[var(--success)] bg-[var(--success-soft)] px-3 py-2 text-sm font-semibold text-[var(--green-500)]">
          Access granted to {state.email}. No Institute password or authentication email was created. Add them to Hugo separately.
        </div>
      ) : null}

      <div>
        <Button type="submit" disabled={pending} block>
          {pending ? "Granting..." : "Grant Institute access"}
        </Button>
      </div>
    </form>
  );
}
