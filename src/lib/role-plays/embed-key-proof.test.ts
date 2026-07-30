import { describe, expect, it } from "vitest";

import { createRolePlayEmbedKeyProof } from "./embed-key-proof";

const DEPLOYMENT_GIT_SHA = "a".repeat(40);
const CONTRACT_SHA256 =
  "f311ac5d975c1ee23e572409b1e33146ad49bc9e1c979974a98904a91a96f004";
const EMBED_SIGNING_SECRET = "institute-embed-signing-secret-32-bytes-minimum";
const COMPLETION_VERIFY_SECRET =
  "institute-completion-verification-secret-32-bytes-minimum";

describe("createRolePlayEmbedKeyProof", () => {
  it("creates deployment-bound, direction-separated proof vectors", () => {
    expect(
      createRolePlayEmbedKeyProof({
        deploymentGitSha: DEPLOYMENT_GIT_SHA,
        contractSha256: CONTRACT_SHA256,
        embedSigningSecret: EMBED_SIGNING_SECRET,
        completionVerificationSecret: COMPLETION_VERIFY_SECRET,
      }),
    ).toEqual({
      schema_version: 1,
      algorithm: "HMAC-SHA256",
      embed_signing: "AVG5Yacs5rHf3e-WnXCmQpg4TttJU4ZdrynwdIFXAH8",
      completion_verification: "odj09PXLCtQNKpkJsmFHRPw39qdNElnKiqliAVkcCA4",
    });
  });

  it("binds both proofs to the exact deployment SHA", () => {
    const original = createRolePlayEmbedKeyProof({
      deploymentGitSha: DEPLOYMENT_GIT_SHA,
      contractSha256: CONTRACT_SHA256,
      embedSigningSecret: EMBED_SIGNING_SECRET,
      completionVerificationSecret: COMPLETION_VERIFY_SECRET,
    });
    const changed = createRolePlayEmbedKeyProof({
      deploymentGitSha: "b".repeat(40),
      contractSha256: CONTRACT_SHA256,
      embedSigningSecret: EMBED_SIGNING_SECRET,
      completionVerificationSecret: COMPLETION_VERIFY_SECRET,
    });

    expect(changed.embed_signing).not.toBe(original.embed_signing);
    expect(changed.completion_verification).not.toBe(
      original.completion_verification,
    );
  });

  it.each([
    {
      name: "missing",
      embedSigningSecret: undefined,
      completionVerificationSecret: COMPLETION_VERIFY_SECRET,
    },
    {
      name: "short",
      embedSigningSecret: EMBED_SIGNING_SECRET,
      completionVerificationSecret: "too-short",
    },
    {
      name: "identical",
      embedSigningSecret: EMBED_SIGNING_SECRET,
      completionVerificationSecret: EMBED_SIGNING_SECRET,
    },
  ])("rejects $name directional secrets", (secrets) => {
    expect(() =>
      createRolePlayEmbedKeyProof({
        deploymentGitSha: DEPLOYMENT_GIT_SHA,
        contractSha256: CONTRACT_SHA256,
        ...secrets,
      }),
    ).toThrow(/distinct directional secrets/);
  });

  it("rejects malformed deployment and contract identities", () => {
    expect(() =>
      createRolePlayEmbedKeyProof({
        deploymentGitSha: "A".repeat(40),
        contractSha256: CONTRACT_SHA256,
        embedSigningSecret: EMBED_SIGNING_SECRET,
        completionVerificationSecret: COMPLETION_VERIFY_SECRET,
      }),
    ).toThrow(/exact deployment SHA/);
    expect(() =>
      createRolePlayEmbedKeyProof({
        deploymentGitSha: DEPLOYMENT_GIT_SHA,
        contractSha256: "0".repeat(63),
        embedSigningSecret: EMBED_SIGNING_SECRET,
        completionVerificationSecret: COMPLETION_VERIFY_SECRET,
      }),
    ).toThrow(/exact contract hash/);
  });
});
