export type RolePlayEvent =
  | { type: "rp.ready"; scenario_id: string }
  /**
   * Closer Lab posts this once the attempt is created. It is the only signal
   * Institute has that a session is live, and it gates credential re-minting:
   * re-minting resets the iframe `src`, which would tear down a running role
   * play. Treated as "not started" when never received, so a Closer Lab that
   * has not shipped it yet degrades safely.
   */
  | { type: "rp.started"; scenario_id: string }
  | { type: "rp.height"; scenario_id: string; height_px: number }
  | {
      type: "rp.complete";
      scenario_id: string;
      attempt_id: string;
      score: number;
      summary_url?: string;
      completion_token: string;
    }
  | { type: "rp.error"; scenario_id: string; message: string };

export function parseRolePlayEvent(value: unknown): RolePlayEvent | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (typeof data.type !== "string" || typeof data.scenario_id !== "string") {
    return null;
  }
  if (data.type === "rp.ready") return data as RolePlayEvent;
  if (data.type === "rp.started") return data as RolePlayEvent;
  if (data.type === "rp.height" && typeof data.height_px === "number") {
    return data as RolePlayEvent;
  }
  if (
    data.type === "rp.complete" &&
    typeof data.attempt_id === "string" &&
    typeof data.score === "number" &&
    typeof data.completion_token === "string"
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
  eventSource: MessageEventSource | null;
  trustedSource: MessageEventSource | null;
  expectedScenarioId: string;
  event: RolePlayEvent | null;
}): boolean {
  return (
    params.trustedOrigin !== null &&
    params.trustedSource !== null &&
    params.eventOrigin === params.trustedOrigin &&
    params.eventSource === params.trustedSource &&
    params.event?.scenario_id === params.expectedScenarioId
  );
}

export function clampRolePlayHeight(value: number): number {
  if (!Number.isFinite(value)) return 720;
  return Math.min(Math.max(Math.round(value), 360), 1400);
}
