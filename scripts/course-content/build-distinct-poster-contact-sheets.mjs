import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceDirectory = path.join(
  repoRoot,
  "docs/course-production/thumbnail-pilots/references/production-video-stills",
);
const sourceRecordPath = path.join(sourceDirectory, "contact-sheets.json");
const outputDirectory = path.join(sourceDirectory, "distinct-posters");
const outputRecordPath = path.join(outputDirectory, "contact-sheets.json");

const targets = [
  "video-slot-04-humanizing-b",
  "video-slot-04-ideal-seller",
  "video-slot-05-offer-b",
  "video-slot-06-framework",
  "video-slot-11-trust",
  "video-slot-12-faq-b",
  "video-slot-18-operator",
];

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

const sourceRecord = JSON.parse(await readFile(sourceRecordPath, "utf8"));
const records = [];
await mkdir(outputDirectory, { recursive: true });

for (const assetKey of targets) {
  const parent = sourceRecord.records.find((record) =>
    record.video_evidence.some((video) => video.asset_key === assetKey),
  );
  if (!parent) throw new Error(`Missing parent contact sheet for ${assetKey}`);
  const row = parent.video_evidence.findIndex((video) => video.asset_key === assetKey);
  const parentPath = path.join(repoRoot, parent.contact_sheet_input.path);
  const outputPath = path.join(outputDirectory, `${assetKey}-contact-sheet.png`);
  const contents = await sharp(parentPath)
    .extract({ left: 0, top: row * 180, width: 960, height: 180 })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
  await writeFile(outputPath, contents);
  const video = parent.video_evidence[row];
  records.push({
    master_id: `master-poster-${assetKey}`,
    contact_sheet_input: {
      id: `video-contact-sheet-${assetKey}`,
      role: "checksum-bound exact mapped-video contact sheet",
      path: path.relative(repoRoot, outputPath),
      sha256: sha256(contents),
      dimensions: [960, 180],
      frame_count: 3,
    },
    video_evidence: [video],
    parent_contact_sheet_sha256: parent.contact_sheet_input.sha256,
    parent_row: row,
  });
}

await writeFile(
  outputRecordPath,
  `${JSON.stringify(
    {
      schema_version: "bmh-distinct-poster-contact-sheets/v1",
      generator: "lossless row extraction from checksum-bound mapped-video contact sheets",
      source_record_path: path.relative(repoRoot, sourceRecordPath),
      records,
    },
    null,
    2,
  )}\n`,
);

console.log(JSON.stringify({ output_record_path: path.relative(repoRoot, outputRecordPath), records }, null, 2));
