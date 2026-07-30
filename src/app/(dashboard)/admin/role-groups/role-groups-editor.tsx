"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button, IconButton, Input, Table } from "@/components/bmh-ds";
import { DestructiveConfirmation } from "@/components/destructive-confirmation";
import { deletionImpact, deletionMessage, type DeletionPreview } from "@/lib/release-control/admin-deletions";

import {
  createRoleGroup,
  deleteRoleGroup,
  previewRoleGroupDeletion,
  updateRoleGroup,
} from "./actions";

type RoleGroupRow = {
  id: string;
  name: string;
  description: string | null;
};

export function RoleGroupsEditor({ initial }: { initial: RoleGroupRow[] }) {
  const [pending, startTransition] = useTransition();
  const [groups, setGroups] = useState(initial);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [confirmation, setConfirmation] = useState<{ groupId: string; preview: DeletionPreview } | null>(null);

  function onAdd() {
    const name = newName.trim();
    if (!name) {
      toast.error("Name is required.");
      return;
    }
    startTransition(async () => {
      const result = await createRoleGroup({
        name,
        description: newDesc.trim() || null,
      });
      if (!result.ok) toast.error(result.error);
      else {
        toast.success("Role group added.");
        setNewName("");
        setNewDesc("");
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div style={{ width: "100%", overflowX: "auto" }}>
        <div style={{ minWidth: "38rem" }}>
        <Table
        rowKey="id"
        columns={[
          { key: "name", label: "Role group" },
          { key: "description", label: "Description" },
          { key: "action", label: "Action", align: "right" },
        ]}
        rows={groups}
        empty="No role groups yet."
        cell={{
          name: (group) => (
            <div className="flex min-w-52 items-center gap-3">
              <Input
                aria-label={`${group.name} name`}
                value={group.name}
                onChange={(event) => updateField(group.id, "name", event.target.value)}
                onBlur={() => onSave(group.id)}
                size="sm"
              />
              <Link
                href={`/admin/role-groups/${group.id}`}
                className="shrink-0 text-xs font-extrabold text-[var(--action)] hover:underline"
              >
                Manage access
              </Link>
            </div>
          ),
          description: (group) => (
            <Input
              aria-label={`${group.name} description`}
              value={group.description ?? ""}
              onChange={(event) => updateField(group.id, "description", event.target.value)}
              onBlur={() => onSave(group.id)}
              placeholder="Description"
              size="sm"
            />
          ),
          action: (group) => (
            <IconButton
              label="Delete role group"
              variant="plain"
              size="sm"
              disabled={pending}
              onClick={() => onDelete(group.id)}
            >
              <Trash2 size={16} />
            </IconButton>
          ),
        }}
        />
        </div>
      </div>

      <div className="border-t border-[var(--border-hairline)] px-3 pt-5">
        <p className="mb-3 text-xs font-extrabold uppercase tracking-[.08em] text-[var(--text-muted)]">
          Add a role group
        </p>
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="min-w-0 flex-1">
            <Input
              id="new-name"
              label="Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Phone Setters"
            />
          </div>
          <div className="min-w-0 flex-1">
            <Input
              id="new-desc"
              label="Description (optional)"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
          </div>
          <Button onClick={onAdd} disabled={pending}>
            {pending ? "..." : "Add"}
          </Button>
        </div>
      </div>
      {confirmation ? (
        <DestructiveConfirmation
          title={`Delete “${groups.find((group) => group.id === confirmation.groupId)?.name ?? "this role group"}”?`}
          description="Learner assignments and access grants for this group will be removed."
          impact={deletionImpact(confirmation.preview)}
          onCancel={() => setConfirmation(null)}
          onConfirm={confirmDelete}
        />
      ) : null}
    </div>
  );

  function updateField(id: string, field: "name" | "description", value: string) {
    setGroups((current) =>
      current.map((group) =>
        group.id === id ? { ...group, [field]: value } : group,
      ),
    );
  }

  function onSave(id: string) {
    const group = groups.find((candidate) => candidate.id === id);
    const original = initial.find((candidate) => candidate.id === id);
    if (!group || !original) return;
    if (
      group.name === original.name &&
      (group.description ?? "") === (original.description ?? "")
    ) {
      return;
    }
    startTransition(async () => {
      const result = await updateRoleGroup({
        id: group.id,
        name: group.name,
        description: group.description?.trim() || null,
      });
      if (!result.ok) toast.error(result.error);
      else toast.success("Saved.");
    });
  }

  function onDelete(id: string) {
    const group = groups.find((candidate) => candidate.id === id);
    if (!group) return;
    startTransition(async () => {
      const preview = await previewRoleGroupDeletion(group.id);
      if (preview.code !== "ready") {
        toast.error(deletionMessage(preview.code));
        return;
      }
      setConfirmation({ groupId: group.id, preview });
    });
  }

  function confirmDelete() {
    if (!confirmation) return;
    const groupId = confirmation.groupId;
    setConfirmation(null);
    startTransition(async () => {
      const result = await deleteRoleGroup(groupId);
      if (!result.ok) toast.error(result.error);
      else toast.success("Role group removed.");
    });
  }
}
