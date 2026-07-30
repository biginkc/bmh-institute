import { createHash } from "node:crypto";

export const EMBED_PARENT_LAUNCH_CONTRACT = Object.freeze({
  schema_version: 1,
  algorithm: "HS256",
  issuer: "sandra-university",
  token_audience: "closer-lab",
  launch_audience: "closer-lab-parent-launch",
  launch_purpose: "embed-attempt-launch",
  max_ttl_seconds: 300,
  jti_bytes: 32,
  identity_claims: Object.freeze([
    "sub",
    "lesson_id",
    "block_id",
    "scenario_id",
    "parent_origin",
  ]),
  token_binding: "sha256-exact-compact-jwt",
  replay_binding: "sha256-jti",
  quota_binding: "sha256-nul-delimited-sub-lesson-block",
} as const);

export const EMBED_PARENT_LAUNCH_CONTRACT_SHA256 = createHash("sha256")
  .update(JSON.stringify(EMBED_PARENT_LAUNCH_CONTRACT))
  .digest("hex");
