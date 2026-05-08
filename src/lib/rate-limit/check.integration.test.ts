import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

import { checkAndConsume } from "./check";

const SUPABASE_URL = process.env.TEST_SUPABASE_URL;
const SERVICE_ROLE = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const envPresent = Boolean(SUPABASE_URL && SERVICE_ROLE);

const admin =
  SUPABASE_URL && SERVICE_ROLE
    ? createClient(SUPABASE_URL, SERVICE_ROLE, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

async function cleanup(keyValue: string) {
  if (!admin) return;
  await admin.from("auth_rate_limits").delete().eq("key_value", keyValue);
}

describe.skipIf(!envPresent)("checkAndConsume integration (HARDEN-06)", () => {
  it("allows requests up to the threshold and rejects the next one", async () => {
    const key = `203.0.113.${randomBytes(1).toString("hex")}`;

    try {
      await expect(
        checkAndConsume({
          keyType: "ip",
          keyValue: key,
          threshold: 2,
          windowSeconds: 900,
        }),
      ).resolves.toMatchObject({ allowed: true });
      await expect(
        checkAndConsume({
          keyType: "ip",
          keyValue: key,
          threshold: 2,
          windowSeconds: 900,
        }),
      ).resolves.toMatchObject({ allowed: true });
      await expect(
        checkAndConsume({
          keyType: "ip",
          keyValue: key,
          threshold: 2,
          windowSeconds: 900,
        }),
      ).resolves.toMatchObject({ allowed: false });
    } finally {
      await cleanup(key);
    }
  });

  it("tracks email and ip keys independently", async () => {
    const key = `harden-06-${randomBytes(8).toString("hex")}@bmh.invalid`;

    try {
      const ipResult = await checkAndConsume({
        keyType: "ip",
        keyValue: key,
        threshold: 1,
        windowSeconds: 900,
      });
      const emailResult = await checkAndConsume({
        keyType: "email",
        keyValue: key,
        threshold: 1,
        windowSeconds: 900,
      });

      expect(ipResult.allowed).toBe(true);
      expect(emailResult.allowed).toBe(true);
    } finally {
      await cleanup(key);
    }
  });

  it("returns a positive retryAfterSeconds when denied", async () => {
    const key = `harden-06-${randomBytes(8).toString("hex")}@bmh.invalid`;

    try {
      await checkAndConsume({
        keyType: "email",
        keyValue: key,
        threshold: 1,
        windowSeconds: 3600,
      });
      const denied = await checkAndConsume({
        keyType: "email",
        keyValue: key,
        threshold: 1,
        windowSeconds: 3600,
      });

      expect(denied.allowed).toBe(false);
      expect(denied.retryAfterSeconds).toBeGreaterThan(0);
    } finally {
      await cleanup(key);
    }
  });
});
