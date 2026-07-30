import { createHmac } from "node:crypto";

const MIN_SECRET_BYTES = 32;
const KEY_PROOF_CONTEXT = "bmh-role-play-embed-key-proof";

export const ROLE_PLAY_EMBED_KEY_PROOF_SCHEMA_VERSION = 1 as const;
export const ROLE_PLAY_EMBED_KEY_PROOF_ALGORITHM = "HMAC-SHA256" as const;

export type RolePlayEmbedKeyProof = {
  schema_version: typeof ROLE_PLAY_EMBED_KEY_PROOF_SCHEMA_VERSION;
  algorithm: typeof ROLE_PLAY_EMBED_KEY_PROOF_ALGORITHM;
  embed_signing: string;
  completion_verification: string;
};

type RolePlayEmbedKeyProofInput = {
  deploymentGitSha: string;
  contractSha256: string;
  embedSigningSecret: string | undefined;
  completionVerificationSecret: string | undefined;
};

export function createRolePlayEmbedKeyProof(
  input: RolePlayEmbedKeyProofInput,
): RolePlayEmbedKeyProof {
  if (!/^[0-9a-f]{40}$/.test(input.deploymentGitSha)) {
    throw new Error(
      "Role play embed key proof requires an exact deployment SHA.",
    );
  }
  if (!/^[0-9a-f]{64}$/.test(input.contractSha256)) {
    throw new Error(
      "Role play embed key proof requires an exact contract hash.",
    );
  }

  const embedSigningSecret = normalizeSecret(input.embedSigningSecret);
  const completionVerificationSecret = normalizeSecret(
    input.completionVerificationSecret,
  );
  if (
    !embedSigningSecret ||
    !completionVerificationSecret ||
    embedSigningSecret === completionVerificationSecret
  ) {
    throw new Error(
      "Role play embed key proof requires distinct directional secrets of at least 32 bytes.",
    );
  }

  return {
    schema_version: ROLE_PLAY_EMBED_KEY_PROOF_SCHEMA_VERSION,
    algorithm: ROLE_PLAY_EMBED_KEY_PROOF_ALGORITHM,
    embed_signing: proofForDirection(
      "institute-embed-signing",
      input.deploymentGitSha,
      input.contractSha256,
      embedSigningSecret,
    ),
    completion_verification: proofForDirection(
      "institute-completion-verification",
      input.deploymentGitSha,
      input.contractSha256,
      completionVerificationSecret,
    ),
  };
}

function normalizeSecret(secret: string | undefined): string | undefined {
  const normalized = secret?.trim();
  return normalized && Buffer.byteLength(normalized, "utf8") >= MIN_SECRET_BYTES
    ? normalized
    : undefined;
}

function proofForDirection(
  direction: "institute-embed-signing" | "institute-completion-verification",
  deploymentGitSha: string,
  contractSha256: string,
  secret: string,
): string {
  const challenge = [
    KEY_PROOF_CONTEXT,
    `v${ROLE_PLAY_EMBED_KEY_PROOF_SCHEMA_VERSION}`,
    direction,
    deploymentGitSha,
    contractSha256,
  ].join("\0");
  return createHmac("sha256", secret)
    .update(challenge, "utf8")
    .digest("base64url");
}
