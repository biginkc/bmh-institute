"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/bmh-ds";

import { saveUserSettings } from "./actions";

export type RoleGroupOption = { id: string; name: string };

export function UserEditForm({
  userId,
  initialSystemRole,
  initialRoleGroupIds,
  allRoleGroups,
  canModifyRole,
}: {
  userId: string;
  initialSystemRole: "owner" | "admin" | "learner";
  initialRoleGroupIds: string[];
  allRoleGroups: RoleGroupOption[];
  canModifyRole: boolean;
}) {
  const [systemRole, setSystemRole] = useState(initialSystemRole);
  const formRef = useRef<HTMLDivElement>(null);
  const systemRoleRef = useRef(systemRole);
  const [hydrated, setHydrated] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const timer = window.setTimeout(() => setHydrated(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  function getCurrentRoleGroupIds() {
    const checkedIds = Array.from(
      formRef.current?.querySelectorAll<HTMLInputElement>(
        "input[data-role-group-id]:checked",
      ) ?? [],
    ).map((input) => input.dataset.roleGroupId);
    return checkedIds.filter((id): id is string => Boolean(id));
  }

  function updateSystemRole(next: "owner" | "admin" | "learner") {
    systemRoleRef.current = next;
    setSystemRole(next);
  }

  function onSave() {
    const currentRoleGroupIds = getCurrentRoleGroupIds();
    startTransition(async () => {
      const result = await saveUserSettings({
        userId,
        system_role: systemRoleRef.current,
        role_group_ids: currentRoleGroupIds,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.newProgramTitles.length > 0) {
        toast.success(
          `Saved. Enrollment email sent for: ${result.newProgramTitles.join(", ")}.`,
        );
      } else {
        toast.success("Saved.");
      }
    });
  }

  return (
    <div
      ref={formRef}
      data-user-edit-form
      data-hydrated={hydrated ? "true" : "false"}
      className="flex flex-col gap-5"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="system_role" className="text-sm font-bold text-[var(--ink-800)]">System role</label>
        <select
          id="system_role"
          value={systemRole}
          onChange={(e) =>
            updateSystemRole(
              e.target.value as "owner" | "admin" | "learner",
            )
          }
          disabled={!hydrated || !canModifyRole}
          className="w-full rounded-[var(--bmh-radius-md)] border-2 border-[var(--ink-300)] bg-[var(--paper)] px-3 py-3 text-sm font-bold text-[var(--ink-900)]"
        >
          <option value="learner">Learner</option>
          <option value="admin">Admin</option>
          <option value="owner">Owner</option>
        </select>
        {!canModifyRole ? (
          <p className="text-muted-foreground text-xs">
            You can&apos;t change your own role from this screen.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-bold text-[var(--ink-800)]">Role groups</p>
        {allRoleGroups.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            No role groups defined. Create a role group before assigning
            course access.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {allRoleGroups.map((rg) => (
              <label
                key={rg.id}
                className="flex items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  data-role-group-id={rg.id}
                  defaultChecked={initialRoleGroupIds.includes(rg.id)}
                  disabled={!hydrated}
                  className="size-4"
                />
                {rg.name}
              </label>
            ))}
          </div>
        )}
        <p className="text-muted-foreground text-xs">
          Role groups control program and course access. Adding a group
          that grants a new program triggers an enrollment email.
        </p>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-[var(--border-hairline)] pt-4">
        <Button onClick={onSave} disabled={!hydrated || pending}>
          {pending ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
