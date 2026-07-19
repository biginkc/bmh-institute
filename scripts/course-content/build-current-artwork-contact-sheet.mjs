import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { compareArtworkAssetKeys, deterministicArtworkLabelSvg } from "./deterministic-artwork-label.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ledgerPath = path.join(
  repoRoot,
  "docs/course-production/thumbnail-pilots/production-ledger.json",
);
const outputDirectory = path.join(
  repoRoot,
  "docs/course-production/thumbnail-pilots/qa",
);
const outputPath = path.join(outputDirectory, "current-artwork-contact-sheet-2026-07-17.png");
const indexPath = path.join(outputDirectory, "current-artwork-contact-sheet-2026-07-17.json");

const columns = 4;
const tileWidth = 320;
const artworkHeight = 200;
const labelHeight = 44;
const gutter = 12;
const margin = 20;

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

async function main() {
  const ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
  const assets = [...ledger.assets].sort((left, right) => compareArtworkAssetKeys(left.asset_key, right.asset_key));
  const rows = Math.ceil(assets.length / columns);
  const cellHeight = artworkHeight + labelHeight;
  const canvasWidth = margin * 2 + columns * tileWidth + (columns - 1) * gutter;
  const canvasHeight = margin * 2 + rows * cellHeight + (rows - 1) * gutter;
  const composites = [];
  const index = [];

  for (const [position, asset] of assets.entries()) {
    const sourcePath = path.join(repoRoot, asset.output_path);
    const source = await readFile(sourcePath);
    const image = await sharp(source)
      .resize(tileWidth, artworkHeight, {
        fit: "contain",
        background: { r: 245, g: 245, b: 245, alpha: 1 },
        kernel: sharp.kernel.lanczos3,
      })
      .png()
      .toBuffer();
    const column = position % columns;
    const row = Math.floor(position / columns);
    const left = margin + column * (tileWidth + gutter);
    const top = margin + row * (cellHeight + gutter);
    composites.push({ input: image, left, top });
    composites.push({ input: deterministicArtworkLabelSvg(asset.asset_key, { width: tileWidth, height: labelHeight }), left, top: top + artworkHeight });
    index.push({
      position: position + 1,
      asset_key: asset.asset_key,
      output_path: asset.output_path,
      ledger_checksum_sha256: asset.checksum_sha256,
      rendered_input_sha256: sha256(source),
      approval_status: asset.approval_status,
    });
  }

  const contactSheet = await sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 3,
      background: { r: 229, g: 231, b: 235 },
    },
  })
    .composite(composites)
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, contactSheet);
  await writeFile(
    indexPath,
    `${JSON.stringify(
      {
        schema_version: "bmh-current-artwork-contact-sheet/v1",
        ledger_path: path.relative(repoRoot, ledgerPath),
        asset_count: index.length,
        columns,
        contact_sheet_path: path.relative(repoRoot, outputPath),
        contact_sheet_sha256: sha256(contactSheet),
        assets: index,
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    JSON.stringify(
      {
        output_path: path.relative(repoRoot, outputPath),
        index_path: path.relative(repoRoot, indexPath),
        asset_count: index.length,
        sha256: sha256(contactSheet),
      },
      null,
      2,
    ),
  );
}

await main();
