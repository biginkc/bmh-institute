export type DeletionEntity = "module" | "lesson" | "role_group" | "block" | "question" | "option";

export type DeletionCode =
  | "ready"
  | "deleted"
  | "not_found"
  | "imported_protected"
  | "activity_protected"
  | "race_conflict"
  | "invalid_target"
  | "database_rejected";

export type DeletionPreview = {
  code: DeletionCode;
  entity_type?: DeletionEntity;
  entity_id?: string;
  children?: number;
  backing_rows?: number;
  members?: number;
  access_grants?: number;
};

export function deletionMessage(code: DeletionCode): string {
  switch (code) {
    case "imported_protected":
      return "Imported content is protected. Use the exact import rollback workflow.";
    case "activity_protected":
      return "Learner activity or immutable evidence exists, so this item cannot be deleted.";
    case "race_conflict":
      return "This item changed while you were reviewing it. Refresh and try again.";
    case "not_found":
      return "This item was already removed or no longer exists.";
    case "invalid_target":
      return "That deletion request is not valid.";
    default:
      return "The item could not be deleted.";
  }
}

export function deletionImpact(preview: DeletionPreview): string[] {
  const impact: string[] = [];
  if (preview.children) impact.push(`${preview.children} child item${preview.children === 1 ? "" : "s"}`);
  if (preview.backing_rows) impact.push(`${preview.backing_rows} backing row${preview.backing_rows === 1 ? "" : "s"}`);
  if (preview.members) impact.push(`${preview.members} learner assignment${preview.members === 1 ? "" : "s"}`);
  if (preview.access_grants) impact.push(`${preview.access_grants} access grant${preview.access_grants === 1 ? "" : "s"}`);
  return impact;
}
