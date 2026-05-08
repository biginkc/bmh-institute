export type RolePlayEvent =
  | { type: "rp.ready"; scenario_id: string }
  | { type: "rp.height"; scenario_id: string; height_px: number }
  | {
      type: "rp.complete";
      scenario_id: string;
      attempt_id: string;
      score: number;
      summary_url?: string;
    }
  | { type: "rp.error"; scenario_id: string; message: string };

export function parseRolePlayEvent(value: unknown): RolePlayEvent | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (typeof data.type !== "string" || typeof data.scenario_id !== "string") {
    return null;
  }
  if (data.type === "rp.ready") return data as RolePlayEvent;
  if (data.type === "rp.height" && typeof data.height_px === "number") {
    return data as RolePlayEvent;
  }
  if (
    data.type === "rp.complete" &&
    typeof data.attempt_id === "string" &&
    typeof data.score === "number"
  ) {
    return data as RolePlayEvent;
  }
  if (data.type === "rp.error" && typeof data.message === "string") {
    return data as RolePlayEvent;
  }
  return null;
}

export function getTrustedOrigin(src: string): string | null {
  try {
    return new URL(src).origin;
  } catch {
    return null;
  }
}

export function isTrustedRolePlayMessage(params: {
  eventOrigin: string;
  trustedOrigin: string | null;
  expectedScenarioId: string;
  event: RolePlayEvent | null;
}): boolean {
  return (
    params.trustedOrigin !== null &&
    params.eventOrigin === params.trustedOrigin &&
    params.event?.scenario_id === params.expectedScenarioId
  );
}

export function clampRolePlayHeight(value: number): number {
  if (!Number.isFinite(value)) return 720;
  return Math.min(Math.max(Math.round(value), 360), 1400);
}
