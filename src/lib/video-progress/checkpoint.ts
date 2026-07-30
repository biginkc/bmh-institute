export type VideoCheckpoint = {
  blockId: string;
  positionSeconds: number;
  durationSeconds: number;
  checkpointSequence: number;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseVideoCheckpoint(value: unknown): VideoCheckpoint | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (Object.hasOwn(input, "userId") || Object.hasOwn(input, "clientUpdatedAt")) return null;
  if (typeof input.blockId !== "string" || !UUID_PATTERN.test(input.blockId.trim())) return null;
  if (typeof input.positionSeconds !== "number" || !Number.isFinite(input.positionSeconds)) return null;
  if (typeof input.durationSeconds !== "number" || !Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0) return null;
  if (input.positionSeconds < 0 || input.positionSeconds > input.durationSeconds) return null;
  if (typeof input.checkpointSequence !== "number" || !Number.isSafeInteger(input.checkpointSequence) || input.checkpointSequence < 0) return null;
  return {
    blockId: input.blockId.trim(),
    positionSeconds: input.positionSeconds,
    durationSeconds: input.durationSeconds,
    checkpointSequence: input.checkpointSequence,
  };
}
