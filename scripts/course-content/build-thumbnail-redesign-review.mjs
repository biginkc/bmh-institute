import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const reviewRoot = path.join(repoRoot, "docs/course-production/thumbnail-redesign");
const indexPath = path.join(reviewRoot, "review-index.json");
const boardPath = path.join(reviewRoot, "approved-and-pending-review-board.png");
const evidencePath = path.join(reviewRoot, "review-evidence.json");
const mode = process.argv[2] ?? "--check";

if (!["--write", "--check"].includes(mode)) {
  throw new Error("Usage: node scripts/course-content/build-thumbnail-redesign-review.mjs [--write|--check]");
}

const sha256 = (contents) => createHash("sha256").update(contents).digest("hex");
const escapeXml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

function wrapTitle(title, maxCharacters = 34) {
  const words = title.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxCharacters || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= 2) return lines;
  const second = `${lines.slice(1).join(" ").slice(0, maxCharacters - 1).trimEnd()}…`;
  return [lines[0], second];
}

function validateIndex(index) {
  if (index.schema_version !== "bmh-thumbnail-redesign-review/v1") {
    throw new Error("Unexpected thumbnail review schema");
  }
  if (!Array.isArray(index.items) || index.items.length !== 25) {
    throw new Error("Thumbnail review index must contain exactly 25 items");
  }
  const orders = index.items.map((item) => item.visible_order);
  if (new Set(orders).size !== 25 || orders.some((order, index) => order !== index + 1)) {
    throw new Error("Thumbnail review visible_order must be the unique sequence 1 through 25");
  }
  const bindings = index.items.map((item) => item.binding);
  if (new Set(bindings).size !== bindings.length) {
    throw new Error("Thumbnail review bindings must be unique");
  }
  const approved = index.items.filter((item) => item.status === "approved");
  const pending = index.items.filter((item) => item.status === "pending");
  if (approved.length !== 15 || pending.length !== 10) {
    throw new Error("Thumbnail review must contain exactly 15 approved and 10 pending items");
  }
  if (approved.some((item) => typeof item.asset !== "string") || pending.some((item) => item.asset !== null)) {
    throw new Error("Approved items require assets and pending items must not claim assets");
  }
  if (index.summary?.total !== 25 || index.summary?.approved !== 15 || index.summary?.pending !== 10) {
    throw new Error("Thumbnail review summary does not match the item statuses");
  }
}

function textElements(lines, x, y, options = {}) {
  const { fontSize = 20, fontWeight = 800, fill = "#0e1116", lineHeight = 24, anchor = "start" } = options;
  return lines.map((line, index) => (
    `<text x="${x}" y="${y + index * lineHeight}" text-anchor="${anchor}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="${fontWeight}" fill="${fill}">${escapeXml(line)}</text>`
  )).join("");
}

async function build() {
  const indexBytes = await readFile(indexPath);
  const index = JSON.parse(indexBytes);
  validateIndex(index);

  const approvedEvidence = [];
  const imageComposites = [];
  const baseParts = [];
  const overlayParts = [];
  const width = 2400;
  const headerHeight = 150;
  const margin = 32;
  const gap = 24;
  const cardWidth = 448;
  const imageHeight = 280;
  const footerHeight = 80;
  const cardHeight = imageHeight + footerHeight;
  const gridTop = headerHeight + margin;
  const height = gridTop + 5 * cardHeight + 4 * gap + margin;
  const roundedImageMask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${cardWidth}" height="${imageHeight}"><path d="M 18 0 H ${cardWidth - 18} Q ${cardWidth} 0 ${cardWidth} 18 V ${imageHeight} H 0 V 18 Q 0 0 18 0 Z" fill="#fff"/></svg>`,
  );

  baseParts.push(`<rect width="${width}" height="${height}" fill="#f4f1e9"/>`);
  baseParts.push(`<text x="${margin}" y="66" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="900" fill="#0e1116">BMH Employee Training — thumbnail redesign</text>`);
  baseParts.push(`<text x="${margin}" y="112" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700" fill="#536170">15 approved · 10 pending · review-only package</text>`);
  baseParts.push(`<rect x="1988" y="42" width="380" height="72" rx="36" fill="#fff" stroke="#0e1116" stroke-width="4"/>`);
  baseParts.push(`<text x="2178" y="87" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="23" font-weight="900" fill="#0e1116">DRAFT — NOT PRODUCTION</text>`);

  for (const item of index.items) {
    const position = item.visible_order - 1;
    const column = position % 5;
    const row = Math.floor(position / 5);
    const x = margin + column * (cardWidth + gap);
    const y = gridTop + row * (cardHeight + gap);
    baseParts.push(`<rect x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}" rx="18" fill="#fff" stroke="#0e1116" stroke-width="4"/>`);

    if (item.status === "approved") {
      const assetPath = path.resolve(reviewRoot, item.asset);
      if (!assetPath.startsWith(`${reviewRoot}${path.sep}`)) {
        throw new Error(`Asset path escapes the review directory: ${item.asset}`);
      }
      const contents = await readFile(assetPath);
      const metadata = await sharp(contents).metadata();
      if (metadata.format !== "png" || metadata.width !== 1280 || metadata.height !== 800) {
        throw new Error(`Approved asset must be a 1280 x 800 PNG: ${item.asset}`);
      }
      approvedEvidence.push({
        visible_order: item.visible_order,
        title: item.title,
        binding: item.binding,
        asset: item.asset,
        checksum_sha256: sha256(contents),
        size_bytes: contents.length,
        dimensions: [metadata.width, metadata.height],
      });
      imageComposites.push({
        input: await sharp(contents)
          .resize(cardWidth, imageHeight, { fit: "cover" })
          .composite([{ input: roundedImageMask, blend: "dest-in" }])
          .png()
          .toBuffer(),
        left: x,
        top: y,
      });
    } else {
      const isAssignment = item.kind === "assignment";
      const contentSlot = Number(item.binding.match(/thumbnail-slot-(\d+)/)?.[1]);
      const fill = isAssignment ? "#fffbc6" : contentSlot % 2 === 0 ? "#ffd301" : "#67b6ff";
      baseParts.push(`<rect x="${x + 2}" y="${y + 2}" width="${cardWidth - 4}" height="${imageHeight - 2}" rx="15" fill="${fill}"/>`);
      baseParts.push(`<rect x="${x + 72}" y="${y + 72}" width="${cardWidth - 144}" height="136" rx="22" fill="#fff" stroke="#0e1116" stroke-width="4" stroke-dasharray="12 10"/>`);
      baseParts.push(`<text x="${x + cardWidth / 2}" y="${y + 132}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="21" font-weight="800" fill="#536170">${isAssignment ? "ASSIGNMENT THUMBNAIL" : "LESSON THUMBNAIL"}</text>`);
      baseParts.push(`<text x="${x + cardWidth / 2}" y="${y + 172}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="900" fill="#0e1116">PENDING</text>`);
    }

    const badgeFill = item.status === "approved" ? "#22863a" : "#ff6e00";
    const badgeLabel = item.status.toUpperCase();
    const badgeWidth = item.status === "approved" ? 132 : 118;
    overlayParts.push(`<rect x="${x + 14}" y="${y + 14}" width="${badgeWidth}" height="38" rx="19" fill="${badgeFill}" stroke="#fff" stroke-width="3"/>`);
    overlayParts.push(`<text x="${x + 14 + badgeWidth / 2}" y="${y + 40}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="900" fill="#fff">${badgeLabel}</text>`);
    overlayParts.push(`<rect x="${x}" y="${y + imageHeight}" width="${cardWidth}" height="${footerHeight}" rx="0" fill="#fff"/>`);
    overlayParts.push(`<text x="${x + 16}" y="${y + imageHeight + 27}" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="900" fill="#536170">${String(item.visible_order).padStart(2, "0")} · ${item.kind.toUpperCase()}</text>`);
    overlayParts.push(textElements(wrapTitle(item.title), x + 16, y + imageHeight + 53, { fontSize: 19, lineHeight: 21 }));
    overlayParts.push(`<rect x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}" rx="18" fill="none" stroke="#0e1116" stroke-width="4"/>`);
  }

  const baseSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${baseParts.join("")}</svg>`);
  const overlaySvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${overlayParts.join("")}</svg>`);
  const board = await sharp(baseSvg)
    .composite([...imageComposites, { input: overlaySvg, left: 0, top: 0 }])
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();

  const evidence = Buffer.from(`${JSON.stringify({
    schema_version: "bmh-thumbnail-redesign-review-evidence/v1",
    review_index: "review-index.json",
    review_index_sha256: sha256(indexBytes),
    board: "approved-and-pending-review-board.png",
    board_sha256: sha256(board),
    board_dimensions: [width, height],
    counts: { total: 25, approved: 15, pending: 10 },
    approved_assets: approvedEvidence,
    pending_items: index.items.filter((item) => item.status === "pending").map(({ visible_order, title, kind, binding }) => ({ visible_order, title, kind, binding })),
  }, null, 2)}\n`);

  return { board, evidence };
}

async function assertCurrent(filePath, expected, label) {
  let actual;
  try {
    actual = await readFile(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error(`${label} is missing; run with --write`);
    throw error;
  }
  if (!actual.equals(expected)) {
    throw new Error(`${label} is stale; run with --write`);
  }
}

const built = await build();
if (mode === "--write") {
  await writeFile(boardPath, built.board);
  await writeFile(evidencePath, built.evidence);
  console.log(JSON.stringify({ mode: "write", approved: 15, pending: 10, board: path.relative(repoRoot, boardPath) }, null, 2));
} else {
  await assertCurrent(boardPath, built.board, "Thumbnail review board");
  await assertCurrent(evidencePath, built.evidence, "Thumbnail review evidence");
  console.log(JSON.stringify({ mode: "check", approved: 15, pending: 10, status: "current" }, null, 2));
}
