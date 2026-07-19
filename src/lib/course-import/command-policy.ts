export type CourseImportCommand =
  | "validate"
  | "upload"
  | "apply"
  | "verify"
  | "rollback"
  | "inspect-rollback-storage";

export function manifestGateForCommand(
  command: CourseImportCommand,
  canary: boolean,
  review = false,
): "draft" | "canary" | "release" {
  if (canary && review) {
    throw new Error("Review and canary import scopes cannot be combined.");
  }
  if (command === "rollback" || command === "inspect-rollback-storage") return "draft";
  if (canary) return "canary";
  if (review) return "draft";
  return command === "apply" || command === "verify" ? "release" : "draft";
}

export function enforcePublicationBlockersForGate(
  gate: ReturnType<typeof manifestGateForCommand>,
): boolean {
  return gate !== "draft";
}
