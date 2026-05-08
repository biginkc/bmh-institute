import { createAdminClient } from "@/lib/supabase/admin";

export type RateLimitKeyType = "ip" | "email";

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

type RateLimitRpcRow = {
  allowed: boolean;
  retry_after_seconds: number;
};

export async function checkAndConsume(input: {
  keyType: RateLimitKeyType;
  keyValue: string;
  threshold: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("fn_check_and_consume_rate_limit", {
    p_key_type: input.keyType,
    p_key_value: input.keyValue,
    p_threshold: input.threshold,
    p_window_seconds: input.windowSeconds,
  });

  const rows = data as RateLimitRpcRow[] | null;
  const row = rows?.[0];
  if (error || !row) {
    return { allowed: false, retryAfterSeconds: input.windowSeconds };
  }

  return {
    allowed: row.allowed,
    retryAfterSeconds: row.retry_after_seconds,
  };
}
