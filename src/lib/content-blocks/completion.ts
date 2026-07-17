export function defaultRequiredForBlock(): boolean {
  return false;
}

export function normalizeRequiredForBlock(
  blockType: string,
  content: unknown,
  requested: boolean,
): boolean {
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    return false;
  }
  const row = content as Record<string, unknown>;
  if (blockType === "role_play") {
    return (
      typeof row.scenario_id === "string" &&
      row.scenario_id.trim().length > 0 &&
      requested
    );
  }
  if (blockType !== "video") return false;
  return (
    row.source === "upload" &&
    typeof row.file_path === "string" &&
    row.file_path.trim().length > 0 &&
    typeof row.duration_seconds === "number" &&
    Number.isFinite(row.duration_seconds) &&
    row.duration_seconds > 0 &&
    requested
  );
}
