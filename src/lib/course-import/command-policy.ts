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
): "draft" | "canary" | "release" {
  if (command === "rollback" || command === "inspect-rollback-storage") return "draft";
  if (canary) return "canary";
  return command === "apply" || command === "verify" ? "release" : "draft";
}
