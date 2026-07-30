import { NextResponse } from "next/server";

import {
  EMBED_PARENT_LAUNCH_CONTRACT,
  EMBED_PARENT_LAUNCH_CONTRACT_SHA256,
} from "@/lib/role-plays/embed-parent-launch-contract";
import { createRolePlayEmbedKeyProof } from "@/lib/role-plays/embed-key-proof";

export const dynamic = "force-dynamic";

export async function GET() {
  const deploymentGitSha = process.env.VERCEL_GIT_COMMIT_SHA?.trim() ?? "";
  if (!/^[0-9a-f]{40}$/.test(deploymentGitSha)) {
    return NextResponse.json(
      { error: "deployment identity unavailable" },
      {
        status: 503,
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  }

  let keyProof;
  try {
    keyProof = createRolePlayEmbedKeyProof({
      deploymentGitSha,
      contractSha256: EMBED_PARENT_LAUNCH_CONTRACT_SHA256,
      embedSigningSecret: process.env.ROLE_PLAY_EMBED_SIGNING_SECRET,
      completionVerificationSecret:
        process.env.ROLE_PLAY_COMPLETION_VERIFY_SECRET,
    });
  } catch {
    return NextResponse.json(
      { error: "directional key proof unavailable" },
      {
        status: 503,
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  }

  return NextResponse.json(
    {
      contract: EMBED_PARENT_LAUNCH_CONTRACT,
      contract_sha256: EMBED_PARENT_LAUNCH_CONTRACT_SHA256,
      deployment_git_sha: deploymentGitSha,
      key_proof: keyProof,
    },
    {
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}
