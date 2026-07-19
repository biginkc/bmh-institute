import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parseWebVtt } from "./validate-caption-assets.mjs";

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function buildCaptionBindingEvidence({ manifestPath, ledgerPath, repoRoot }) {
  const [manifest, ledger] = await Promise.all([
    readFile(manifestPath, "utf8").then(JSON.parse),
    readFile(ledgerPath, "utf8").then(JSON.parse),
  ]);
  const assets = new Map((manifest.assets ?? []).map((asset) => [asset.source_key, asset]));
  const approvedVideos = (manifest.assets ?? []).filter(
    (asset) => asset.kind === "video" && asset.approval_status === "approved",
  );
  const records = [];

  for (const video of approvedVideos) {
    const caption = assets.get(`caption-${video.source_key}`);
    const transcript = assets.get(`transcript-${video.source_key}`);
    if (!caption || !transcript) throw new Error(`${video.source_key} has no derivative inventory pair.`);
    const prior = [...(ledger.records ?? [])].reverse().find(
      (record) => record.video_source_key === video.source_key && record.status === "approved",
    );
    if (!prior) throw new Error(`${video.source_key} has no prior content-QA decision source.`);
    const [captionBytes, transcriptBytes] = await Promise.all([
      readFile(path.resolve(repoRoot, caption.local_path)),
      readFile(path.resolve(repoRoot, transcript.local_path)),
    ]);
    const parsed = parseWebVtt(captionBytes.toString("utf8"));
    if (parsed.errors.length) {
      throw new Error(`${video.source_key} caption is not release-valid: ${parsed.errors.join("; ")}`);
    }
    const captionProse = parsed.cues.map((cue) => cue.text).join(" ").replace(/\s+/g, " ").trim();
    const transcriptProse = transcriptBytes.toString("utf8").split("\n").slice(4).join(" ").replace(/\s+/g, " ").trim();
    if (captionProse !== transcriptProse) throw new Error(`${video.source_key} caption and transcript disagree.`);
    records.push({
      video_source_key: video.source_key,
      video_sha256: video.checksum_sha256,
      caption_sha256: sha256(captionBytes),
      transcript_sha256: sha256(transcriptBytes),
      status: "approved",
      reviewed_by: prior.reviewed_by,
      decision_source: prior.decision_source,
    });
  }

  return {
    schema_version: 1,
    generated_at: new Date().toISOString().slice(0, 10),
    records,
  };
}

async function main() {
  const [manifestPath, ledgerPath, repoRoot] = process.argv.slice(2);
  if (!manifestPath || !ledgerPath || !repoRoot) {
    throw new Error("Usage: node scripts/course-content/build-caption-binding-evidence.mjs <manifest.json> <ledger.json> <repo-root>");
  }
  const evidence = await buildCaptionBindingEvidence({
    manifestPath: path.resolve(manifestPath),
    ledgerPath: path.resolve(ledgerPath),
    repoRoot: path.resolve(repoRoot),
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
