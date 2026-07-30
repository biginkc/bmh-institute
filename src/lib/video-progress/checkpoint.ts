export type VideoCheckpoint = {
  blockId: string;
  positionSeconds: number;
  durationSeconds: number;
  clientUpdatedAt: number;
};

export function parseVideoCheckpoint(value: unknown): VideoCheckpoint | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (Object.hasOwn(input, "userId")) return null;
  if (typeof input.blockId !== "string" || !input.blockId.trim()) return null;
  if (typeof input.positionSeconds !== "number" || !Number.isFinite(input.positionSeconds)) return null;
  if (typeof input.durationSeconds !== "number" || !Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0) return null;
  if (input.positionSeconds < 0 || input.positionSeconds > input.durationSeconds) return null;
  if (typeof input.clientUpdatedAt !== "number" || !Number.isSafeInteger(input.clientUpdatedAt) || input.clientUpdatedAt <= 0) return null;
  if (input.clientUpdatedAt > Date.now() + 5 * 60 * 1000) return null;
  return {
    blockId: input.blockId.trim(),
    positionSeconds: input.positionSeconds,
    durationSeconds: input.durationSeconds,
    clientUpdatedAt: input.clientUpdatedAt,
  };
}
