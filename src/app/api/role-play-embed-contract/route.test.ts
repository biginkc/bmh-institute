import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EMBED_PARENT_LAUNCH_CONTRACT,
  EMBED_PARENT_LAUNCH_CONTRACT_SHA256,
} from "@/lib/role-plays/embed-parent-launch-contract";

import { GET } from "./route";

const EMBED_SIGNING_SECRET = "institute-embed-signing-secret-32-bytes-minimum";
const COMPLETION_VERIFY_SECRET =
  "institute-completion-verification-secret-32-bytes-minimum";

describe("role-play embed producer contract", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("publishes the exact non-secret parent-launch contract", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "a".repeat(40));
    vi.stubEnv("ROLE_PLAY_EMBED_SIGNING_SECRET", EMBED_SIGNING_SECRET);
    vi.stubEnv("ROLE_PLAY_COMPLETION_VERIFY_SECRET", COMPLETION_VERIFY_SECRET);
    const response = await GET();
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toEqual({
      contract: EMBED_PARENT_LAUNCH_CONTRACT,
      contract_sha256: EMBED_PARENT_LAUNCH_CONTRACT_SHA256,
      deployment_git_sha: "a".repeat(40),
      key_proof: {
        schema_version: 1,
        algorithm: "HMAC-SHA256",
        embed_signing: "AVG5Yacs5rHf3e-WnXCmQpg4TttJU4ZdrynwdIFXAH8",
        completion_verification: "odj09PXLCtQNKpkJsmFHRPw39qdNElnKiqliAVkcCA4",
      },
    });
    expect(JSON.stringify(body)).not.toContain(EMBED_SIGNING_SECRET);
    expect(JSON.stringify(body)).not.toContain(COMPLETION_VERIFY_SECRET);
  });

  it("fails closed when the deployed Git identity is unavailable", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "deployment identity unavailable",
    });
  });

  it.each([
    {
      name: "the embed signing secret is missing",
      embedSecret: "",
      completionSecret: COMPLETION_VERIFY_SECRET,
    },
    {
      name: "the completion verification secret is short",
      embedSecret: EMBED_SIGNING_SECRET,
      completionSecret: "too-short",
    },
    {
      name: "the directional secrets are identical",
      embedSecret: EMBED_SIGNING_SECRET,
      completionSecret: EMBED_SIGNING_SECRET,
    },
  ])("fails closed when $name", async ({ embedSecret, completionSecret }) => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "a".repeat(40));
    vi.stubEnv("ROLE_PLAY_EMBED_SIGNING_SECRET", embedSecret);
    vi.stubEnv("ROLE_PLAY_COMPLETION_VERIFY_SECRET", completionSecret);

    const response = await GET();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: "directional key proof unavailable",
    });
  });
});
