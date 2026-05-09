"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import { deleteUser, saveUserSettings } from "./actions";

export type RoleGroupOption = { id: string; name: string };

export function UserEditForm({
  userId,
  initialSystemRole,
  initialStatus,
  initialRoleGroupIds,
  allRoleGroups,
  canModifyRole,
  canSuspend,
}: {
  userId: string;
  initialSystemRole: "owner" | "admin" | "learner";
  initialStatus: "active" | "invited" | "suspended";
  initialRoleGroupIds: string[];
  allRoleGroups: RoleGroupOption[];
  canModifyRole: boolean;
  canSuspend: boolean;
}) {
  const router = useRouter();
  const [systemRole, setSystemRole] = useState(initialSystemRole);
  const [status, setStatus] = useState(initialStatus);
  const formRef = useRef<HTMLDivElement>(null);
  const systemRoleRef = useRef(systemRole);
  const statusRef = useRef(status);
  const [hydrated, setHydrated] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setHydrated(true);
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

  function updateStatus(next: "active" | "invited" | "suspended") {
    statusRef.current = next;
    setStatus(next);
  }

  function onSave() {
    const currentRoleGroupIds = getCurrentRoleGroupIds();
    startTransition(async () => {
      const result = await saveUserSettings({
        userId,
        system_role: systemRoleRef.current,
        status: statusRef.current,
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

  function onSuspendToggle() {
    const previousStatus = statusRef.current;
    const nextStatus = previousStatus === "suspended" ? "active" : "suspended";
    const currentRoleGroupIds = getCurrentRoleGroupIds();
    updateStatus(nextStatus);
    startTransition(async () => {
      const result = await saveUserSettings({
        userId,
        system_role: systemRoleRef.current,
        status: nextStatus,
        role_group_ids: currentRoleGroupIds,
      });
      if (!result.ok) {
        toast.error(result.error);
        updateStatus(previousStatus);
      } else {
        toast.success(
          nextStatus === "suspended" ? "User suspended." : "User reactivated.",
        );
      }
    });
  }

  function onDelete() {
    if (
      !confirm(
        "Permanently delete this user? They will be removed from auth and all their progress, certificates, and role assignments will be deleted. This cannot be undone.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await deleteUser(userId);
      if (!result.ok) toast.error(result.error);
      else {
        toast.success("User deleted.");
        router.push("/admin/users");
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
        <Label htmlFor="system_role">System role</Label>
        <select
          id="system_role"
          value={systemRole}
          onChange={(e) =>
            updateSystemRole(
              e.target.value as "owner" | "admin" | "learner",
            )
          }
          disabled={!hydrated || !canModifyRole}
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="status">Status</Label>
        <select
          id="status"
          value={status}
          onChange={(e) =>
            updateStatus(
              e.target.value as "active" | "invited" | "suspended",
            )
          }
          disabled={!hydrated || !canSuspend}
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
        >
          <option value="active">Active</option>
          <option value="invited">Invited</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Role groups</Label>
        {allRoleGroups.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            No role groups defined. Create role groups before inviting pilot
            learners.
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
          Role groups control pilot program and course access. Adding a group
          that grants a new program triggers an enrollment email.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 border-t pt-4">
        <div className="flex gap-2">
          {canSuspend ? (
            <Button
              variant="outline"
              onClick={onSuspendToggle}
              disabled={!hydrated || pending}
            >
              {status === "suspended" ? "Reactivate" : "Suspend"}
            </Button>
          ) : null}
          {canModifyRole ? (
            <Button
              variant="outline"
              onClick={onDelete}
              disabled={!hydrated || pending}
              className="text-destructive hover:text-destructive"
            >
              Delete user
            </Button>
          ) : null}
        </div>
        <Button onClick={onSave} disabled={!hydrated || pending}>
          {pending ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
