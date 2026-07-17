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
): "draft" | "release" {
  if (command === "rollback" || command === "inspect-rollback-storage") return "draft";
  return command === "apply" || command === "verify" || canary ? "release" : "draft";
}
