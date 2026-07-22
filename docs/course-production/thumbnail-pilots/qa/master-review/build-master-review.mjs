import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import sharp from "sharp";

export const DEFAULT_MASTER_REVIEW_DIRECTORY =
  "docs/course-production/thumbnail-pilots/qa/master-review";
export const DEFAULT_MASTER_REVIEW_INDEX_PATH =
  `${DEFAULT_MASTER_REVIEW_DIRECTORY}/master-review-index.json`;
export const DEFAULT_MASTER_REVIEW_SHEET_PATHS = Object.freeze(
  Array.from({ length: 4 }, (_, index) =>
    `${DEFAULT_MASTER_REVIEW_DIRECTORY}/master-review-sheet-${String(index + 1).padStart(2, "0")}.png`,
  ),
);
export const DEFAULT_LEDGER_PATH =
  "docs/course-production/thumbnail-pilots/production-ledger.json";
export const DEFAULT_INVENTORY_PATH =
  "docs/course-production/thumbnail-pilots/production-inventory.json";

const DEFAULT_REPO_ROOT = path.resolve(
  fileURLToPath(new URL("../../../../../", import.meta.url)),
);
const SHA256 = /^[a-f0-9]{64}$/;
const SHEET_WIDTH = 1360;
const SHEET_HEIGHT = 1992;
const HEADER_HEIGHT = 72;
const CELL_WIDTH = 640;
const ART_HEIGHT = 360;
const CELL_HEIGHT = 465;
const COLUMN_GAP = 40;
const LEFT_MARGIN = 20;
const TOP_MARGIN = 82;
const ROW_GAP = 10;
const APPROVED_HISTORICAL_INDEX_SHA256 =
  "da0b7a3467a8f7f31e94f7eddde8fa80e3715a73e68b3cf653178ad9257cdfd3";
const LOCKED_NON_ARTWORK_STATUS_PROJECTION_SHA256 =
  "176d6367fb10c4df42ded8f48bd5d5d942bed3d6fccf628d589f238d9c322699";

// A deliberately tiny in-repo font. Rendering never consults a host font,
// locale, browser, or SVG text engine, so the review bytes are portable.
const GLYPHS = Object.freeze({
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  a: ["00000", "01110", "00001", "01111", "10001", "10011", "01101"],
  b: ["10000", "10000", "10110", "11001", "10001", "10001", "11110"],
  c: ["00000", "01110", "10001", "10000", "10000", "10001", "01110"],
  d: ["00001", "00001", "01101", "10011", "10001", "10001", "01111"],
  e: ["00000", "01110", "10001", "11111", "10000", "10001", "01110"],
  f: ["00110", "01001", "01000", "11100", "01000", "01000", "01000"],
  g: ["00000", "01111", "10001", "10001", "01111", "00001", "01110"],
  h: ["10000", "10000", "10110", "11001", "10001", "10001", "10001"],
  i: ["00100", "00000", "01100", "00100", "00100", "00100", "01110"],
  j: ["00010", "00000", "00110", "00010", "00010", "10010", "01100"],
  k: ["10000", "10001", "10010", "11100", "10010", "10001", "10001"],
  l: ["01100", "00100", "00100", "00100", "00100", "00100", "01110"],
  m: ["00000", "11010", "10101", "10101", "10101", "10101", "10101"],
  n: ["00000", "10110", "11001", "10001", "10001", "10001", "10001"],
  o: ["00000", "01110", "10001", "10001", "10001", "10001", "01110"],
  p: ["00000", "11110", "10001", "10001", "11110", "10000", "10000"],
  q: ["00000", "01101", "10011", "10001", "01111", "00001", "00001"],
  r: ["00000", "10110", "11001", "10000", "10000", "10000", "10000"],
  s: ["00000", "01111", "10000", "01110", "00001", "00001", "11110"],
  t: ["01000", "01000", "11100", "01000", "01000", "01001", "00110"],
  u: ["00000", "10001", "10001", "10001", "10001", "10011", "01101"],
  v: ["00000", "10001", "10001", "10001", "10001", "01010", "00100"],
  w: ["00000", "10001", "10001", "10101", "10101", "10101", "01010"],
  x: ["00000", "10001", "01010", "00100", "01010", "10001", "10001"],
  y: ["00000", "10001", "10001", "01111", "00001", "10001", "01110"],
  z: ["00000", "11111", "00010", "00100", "01000", "10000", "11111"],
});

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function repoPath(root, relativePath) {
  if (path.isAbsolute(relativePath) || relativePath.includes("\\")) {
    throw new Error(`Review paths must be portable repo-relative POSIX paths: ${relativePath}`);
  }
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Review path escapes the repository: ${relativePath}`);
  }
  return resolved;
}

function canonicalJson(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function immutableLedgerMasterInputs(ledger) {
  return {
    schema_version: ledger.schema_version,
    palette_rgb: ledger.palette_rgb,
    masters: ledger.masters.map((master) => ({
      id: master.id,
      kind: master.kind,
      flat_master_path: master.flat_master_path,
      flat_master_sha256: master.flat_master_sha256,
    })),
  };
}

export function artworkReviewInventoryProjection(inventory) {
  const projected = structuredClone(inventory);
  for (const lesson of projected.lessons ?? []) {
    for (const evidence of lesson.master?.video_evidence ?? []) {
      delete evidence.approval_status;
    }
    for (const poster of lesson.posters ?? []) {
      for (const evidence of poster.direct_master?.video_evidence ?? []) {
        delete evidence.approval_status;
      }
    }
  }
  return projected;
}

async function approvedHistoricalSurfaceBinding({
  root,
  ledger,
  inventoryPath,
  indexPath,
  sheetPaths,
}) {
  const approvalRecord = ledger.final_approval;
  if (ledger.status !== "finalized" || approvalRecord?.status !== "approved") return null;
  if (!SHA256.test(approvalRecord.evidence_sha256 ?? "")) {
    throw new Error("Final artwork approval has no exact evidence SHA");
  }

  const approvalBytes = await readFile(repoPath(root, approvalRecord.evidence));
  if (sha256(approvalBytes) !== approvalRecord.evidence_sha256) {
    throw new Error("Final artwork approval evidence drifted from the production ledger");
  }
  const approval = JSON.parse(approvalBytes);
  const requestBinding = approval.request_binding;
  if (approval.decision !== "approved" || !SHA256.test(requestBinding?.request_sha256 ?? "")) {
    throw new Error("Final artwork approval request binding is invalid");
  }

  const requestBytes = await readFile(repoPath(root, requestBinding.request_path));
  if (sha256(requestBytes) !== requestBinding.request_sha256) {
    throw new Error("Final artwork review request drifted from its approval binding");
  }
  const request = JSON.parse(requestBytes);
  const approvedSurface = request.master_review_surface;
  const approvedSheets = approvedSurface?.sheets?.map((sheet) => sheet.path);
  const targetsApprovedSurface = approvedSurface?.index_path === indexPath
    && JSON.stringify(approvedSheets) === JSON.stringify(sheetPaths);
  if (!targetsApprovedSurface) return null;

  const inventorySnapshot = request.inventory_snapshot;
  if (
    inventorySnapshot?.path !== inventoryPath
    || !SHA256.test(inventorySnapshot?.sha256 ?? "")
    || !SHA256.test(approvedSurface?.index_sha256 ?? "")
    || !approvedSurface.sheets.every((sheet) => SHA256.test(sheet.sha256 ?? ""))
  ) {
    throw new Error("Final artwork review request has an invalid inventory snapshot binding");
  }
  return {
    indexSha256: approvedSurface.index_sha256,
    inventorySha256: inventorySnapshot.sha256,
    sheetSha256ByPath: new Map(approvedSurface.sheets.map((sheet) => [sheet.path, sheet.sha256])),
  };
}

async function approvedHistoricalSurfaceCompatibility({
  root,
  built,
  ledgerPath,
  inventoryPath,
  indexPath,
  sheetPaths,
}) {
  const [ledgerBytes, inventoryBytes] = await Promise.all([
    readFile(repoPath(root, ledgerPath)),
    readFile(repoPath(root, inventoryPath)),
  ]);
  const ledger = JSON.parse(ledgerBytes);
  const inventory = JSON.parse(inventoryBytes);
  const binding = await approvedHistoricalSurfaceBinding({
    root,
    ledger,
    inventoryPath,
    indexPath,
    sheetPaths,
  });
  if (!binding) return { bound: false, result: null };

  const projectionSha256 = sha256(canonicalJson(artworkReviewInventoryProjection(inventory)));
  if (projectionSha256 !== LOCKED_NON_ARTWORK_STATUS_PROJECTION_SHA256) {
    return { bound: true, result: null };
  }

  const actualIndex = await readFile(repoPath(root, indexPath)).catch(() => null);
  if (!actualIndex || sha256(actualIndex) !== binding.indexSha256) {
    return { bound: true, result: null };
  }
  const historicalIndex = JSON.parse(actualIndex);
  if (historicalIndex.source_bindings?.inventory_sha256 !== binding.inventorySha256) {
    return { bound: true, result: null };
  }
  const compatibleIndex = structuredClone(built.index);
  compatibleIndex.source_bindings.inventory_sha256 = binding.inventorySha256;
  const compatibleIndexBytes = canonicalJson(compatibleIndex);
  if (!actualIndex.equals(compatibleIndexBytes)) {
    return { bound: true, result: null };
  }

  for (const sheet of built.sheets) {
    const actual = await readFile(repoPath(root, sheet.path)).catch(() => null);
    if (
      !actual
      || !actual.equals(sheet.contents)
      || sha256(actual) !== binding.sheetSha256ByPath.get(sheet.path)
    ) {
      return { bound: true, result: null };
    }
  }
  return {
    bound: true,
    result: { ...built, index: compatibleIndex, indexBytes: actualIndex },
  };
}

function normalizeLabel(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9 -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function characterLabel(characterId) {
  if (characterId === "andrea-approved") return "Andrea";
  if (characterId === "recurring-seller-approved") return "Seller";
  throw new Error(`Unsupported artwork character: ${characterId}`);
}

function inventoryDescriptors(inventory) {
  const descriptors = new Map();
  const add = (masterId, title, characterId, source) => {
    if (!masterId || descriptors.has(masterId)) {
      throw new Error(`Inventory master descriptor is missing or duplicated: ${masterId}`);
    }
    descriptors.set(masterId, {
      title,
      character: characterLabel(characterId),
      inventory_source: source,
    });
  };

  add(
    inventory.course_cover?.id,
    "BMH Employee Training - Course Cover",
    inventory.course_cover?.art_direction?.character_id,
    "course_cover",
  );
  for (const lesson of inventory.lessons ?? []) {
    add(
      lesson.master?.id,
      lesson.title,
      lesson.master?.art_direction?.character_id,
      `lesson:${lesson.slot}`,
    );
    for (const poster of lesson.posters ?? []) {
      if (!poster.direct_master) continue;
      add(
        poster.direct_master.id,
        `${poster.video_title} - Video Poster`,
        poster.direct_master.art_direction?.character_id,
        `video_poster:${poster.video_asset_key}`,
      );
    }
  }
  return descriptors;
}

function wrapLabel(value, width, maxLines) {
  const words = normalizeLabel(value).split(" ").filter(Boolean);
  const lines = [];
  for (const word of words) {
    if (word.length > width) throw new Error(`Review label word is too long: ${word}`);
    const candidate = lines.length === 0 ? word : `${lines.at(-1)} ${word}`;
    if (candidate.length <= width) {
      if (lines.length === 0) lines.push(candidate);
      else lines[lines.length - 1] = candidate;
    } else {
      lines.push(word);
    }
  }
  if (lines.length > maxLines) throw new Error(`Review label needs more than ${maxLines} lines: ${value}`);
  return lines;
}

function fillRect(canvas, x, y, width, height, colorIndex) {
  for (let row = Math.max(0, y); row < Math.min(SHEET_HEIGHT, y + height); row += 1) {
    canvas.fill(colorIndex, row * SHEET_WIDTH + Math.max(0, x), row * SHEET_WIDTH + Math.min(SHEET_WIDTH, x + width));
  }
}

function drawText(canvas, text, { x, y, scale, colorIndex }) {
  const normalized = normalizeLabel(text);
  for (const [characterIndex, character] of [...normalized].entries()) {
    const glyph = GLYPHS[character];
    if (!glyph) throw new Error(`Unsupported deterministic review glyph: ${character}`);
    for (const [rowIndex, row] of glyph.entries()) {
      for (const [columnIndex, pixel] of [...row].entries()) {
        if (pixel !== "1") continue;
        fillRect(
          canvas,
          x + (characterIndex * 6 + columnIndex) * scale,
          y + rowIndex * scale,
          scale,
          scale,
          colorIndex,
        );
      }
    }
  }
}

function textWidth(text, scale) {
  const normalized = normalizeLabel(text);
  return normalized.length === 0 ? 0 : (normalized.length * 6 - 1) * scale;
}

function paletteLookup(palette) {
  return new Map(palette.map((color, index) => [color.join(","), index]));
}

async function renderContainedMaster(contents, palette, width = CELL_WIDTH, height = ART_HEIGHT) {
  const { data, info } = await sharp(contents)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (!info.width || !info.height || info.channels !== 3) {
    throw new Error("Cannot decode a flat artwork master as RGB pixels");
  }
  const lookup = paletteLookup(palette);
  const white = lookup.get("255,255,255");
  if (!Number.isInteger(white)) throw new Error("Artwork palette is missing pure white");
  const target = new Uint8Array(width * height).fill(white);
  const ratio = Math.min(width / info.width, height / info.height);
  const targetWidth = Math.max(1, Math.floor(info.width * ratio));
  const targetHeight = Math.max(1, Math.floor(info.height * ratio));
  const left = Math.floor((width - targetWidth) / 2);
  const top = Math.floor((height - targetHeight) / 2);
  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = Math.min(info.height - 1, Math.floor((y * info.height) / targetHeight));
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = Math.min(info.width - 1, Math.floor((x * info.width) / targetWidth));
      const offset = (sourceY * info.width + sourceX) * 3;
      const key = `${data[offset]},${data[offset + 1]},${data[offset + 2]}`;
      const colorIndex = lookup.get(key);
      if (!Number.isInteger(colorIndex)) {
        throw new Error(`Flat master contains a color outside the locked palette: ${key}`);
      }
      target[(top + y) * width + left + x] = colorIndex;
    }
  }
  return target;
}

function compositeIndexed(canvas, source, sourceWidth, sourceHeight, left, top) {
  for (let y = 0; y < sourceHeight; y += 1) {
    canvas.set(
      source.subarray(y * sourceWidth, (y + 1) * sourceWidth),
      (top + y) * SHEET_WIDTH + left,
    );
  }
}

async function encodePortableRgbPng(pixels, width, height, palette) {
  if (pixels.length !== width * height) throw new Error("Review PNG dimensions do not match its pixel buffer");
  const rgb = Buffer.alloc(width * height * 3);
  for (let index = 0; index < pixels.length; index += 1) {
    const color = palette[pixels[index]];
    if (!color) throw new Error(`Review pixel references missing palette index ${pixels[index]}`);
    rgb[index * 3] = color[0];
    rgb[index * 3 + 1] = color[1];
    rgb[index * 3 + 2] = color[2];
  }
  return sharp(rgb, { raw: { width, height, channels: 3 } })
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();
}

async function buildSheet({ records, sheetNumber, palette }) {
  const lookup = paletteLookup(palette);
  const color = (rgb) => {
    const value = lookup.get(rgb);
    if (!Number.isInteger(value)) throw new Error(`Review palette is missing ${rgb}`);
    return value;
  };
  const blue = color("103,182,255");
  const yellow = color("255,211,1");
  const cream = color("254,255,198");
  const white = color("255,255,255");
  const black = color("0,0,0");
  const canvas = new Uint8Array(SHEET_WIDTH * SHEET_HEIGHT).fill(cream);
  fillRect(canvas, 0, 0, SHEET_WIDTH, HEADER_HEIGHT, blue);
  fillRect(canvas, 0, HEADER_HEIGHT - 6, SHEET_WIDTH, 6, yellow);
  const first = (sheetNumber - 1) * 7 + 1;
  const last = first + records.length - 1;
  const header = `bmh masters ${String(first).padStart(2, "0")}-${String(last).padStart(2, "0")} of 28`;
  drawText(canvas, header, {
    x: Math.floor((SHEET_WIDTH - textWidth(header, 4)) / 2),
    y: 18,
    scale: 4,
    colorIndex: black,
  });

  for (const [index, record] of records.entries()) {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const left = LEFT_MARGIN + column * (CELL_WIDTH + COLUMN_GAP);
    const top = TOP_MARGIN + row * (CELL_HEIGHT + ROW_GAP);
    fillRect(canvas, left - 3, top - 3, CELL_WIDTH + 6, CELL_HEIGHT + 6, black);
    fillRect(canvas, left, top, CELL_WIDTH, CELL_HEIGHT, white);
    compositeIndexed(canvas, record.rendered, CELL_WIDTH, ART_HEIGHT, left, top);
    fillRect(canvas, left, top + ART_HEIGHT, CELL_WIDTH, 3, black);
    const titleLines = wrapLabel(`${String(record.position).padStart(2, "0")} ${record.title}`, 34, 2);
    for (const [lineIndex, line] of titleLines.entries()) {
      drawText(canvas, line, {
        x: left + 10,
        y: top + ART_HEIGHT + 10 + lineIndex * 24,
        scale: 3,
        colorIndex: black,
      });
    }
    const detailY = top + ART_HEIGHT + 12 + titleLines.length * 24;
    drawText(canvas, record.master_id, {
      x: left + 10,
      y: detailY,
      scale: 2,
      colorIndex: black,
    });
    drawText(canvas, `character ${record.character}`, {
      x: left + 10,
      y: detailY + 18,
      scale: 1,
      colorIndex: black,
    });
    drawText(canvas, `sha256 ${record.flat_master_sha256}`, {
      x: left + 10,
      y: detailY + 28,
      scale: 1,
      colorIndex: black,
    });
  }
  return encodePortableRgbPng(canvas, SHEET_WIDTH, SHEET_HEIGHT, palette);
}

export async function buildMasterReviewSurface({
  root = DEFAULT_REPO_ROOT,
  ledgerPath = DEFAULT_LEDGER_PATH,
  inventoryPath = DEFAULT_INVENTORY_PATH,
  indexPath = DEFAULT_MASTER_REVIEW_INDEX_PATH,
  sheetPaths = DEFAULT_MASTER_REVIEW_SHEET_PATHS,
} = {}) {
  root = path.resolve(root);
  if (!Array.isArray(sheetPaths) || sheetPaths.length !== 4 || new Set(sheetPaths).size !== 4) {
    throw new Error("Master review requires exactly four distinct sheet paths");
  }
  const [ledgerBytes, inventoryBytes] = await Promise.all([
    readFile(repoPath(root, ledgerPath)),
    readFile(repoPath(root, inventoryPath)),
  ]);
  const ledger = JSON.parse(ledgerBytes);
  const inventory = JSON.parse(inventoryBytes);
  if (ledger.schema_version !== "bmh-artwork-production-ledger/v1") {
    throw new Error(`Unsupported artwork ledger schema: ${ledger.schema_version}`);
  }
  if (inventory.schema_version !== "bmh-artwork-production/v4-candidate") {
    throw new Error(`Unsupported artwork inventory schema: ${inventory.schema_version}`);
  }
  if (!Array.isArray(ledger.palette_rgb) || ledger.palette_rgb.length !== 8) {
    throw new Error("Artwork ledger must bind the locked eight-color palette");
  }
  if (!Array.isArray(ledger.masters) || ledger.masters.length !== 28) {
    throw new Error(`Master review requires exactly 28 ledger masters; found ${ledger.masters?.length}`);
  }
  const descriptors = inventoryDescriptors(inventory);
  if (descriptors.size !== 28) {
    throw new Error(`Artwork inventory must describe exactly 28 masters; found ${descriptors.size}`);
  }

  const records = [];
  for (const [index, master] of ledger.masters.entries()) {
    const descriptor = descriptors.get(master.id);
    if (!descriptor) throw new Error(`Ledger master is absent from inventory: ${master.id}`);
    if (!SHA256.test(master.flat_master_sha256 ?? "")) {
      throw new Error(`Ledger master has no exact flat-master SHA: ${master.id}`);
    }
    const contents = await readFile(repoPath(root, master.flat_master_path));
    const actualSha256 = sha256(contents);
    if (actualSha256 !== master.flat_master_sha256) {
      throw new Error(`Flat master drifted from the production ledger: ${master.id}`);
    }
    records.push({
      position: index + 1,
      sheet_number: Math.floor(index / 7) + 1,
      sheet_position: (index % 7) + 1,
      row: Math.floor((index % 7) / 2) + 1,
      column: ((index % 7) % 2) + 1,
      master_id: master.id,
      master_kind: master.kind,
      title: descriptor.title,
      character: descriptor.character,
      inventory_source: descriptor.inventory_source,
      flat_master_path: master.flat_master_path,
      flat_master_sha256: actualSha256,
      rendered: await renderContainedMaster(contents, ledger.palette_rgb),
    });
  }
  if (records.some((record) => !record.title || !record.character)) {
    throw new Error("Every master review position must have a human title and character label");
  }
  const unknownDescriptors = [...descriptors.keys()].filter(
    (masterId) => !records.some((record) => record.master_id === masterId),
  );
  if (unknownDescriptors.length) {
    throw new Error(`Inventory contains masters missing from the ledger: ${unknownDescriptors.join(", ")}`);
  }

  const sheets = [];
  for (let sheetIndex = 0; sheetIndex < 4; sheetIndex += 1) {
    const sheetRecords = records.slice(sheetIndex * 7, sheetIndex * 7 + 7);
    const contents = await buildSheet({
      records: sheetRecords,
      sheetNumber: sheetIndex + 1,
      palette: ledger.palette_rgb,
    });
    sheets.push({
      sheet_number: sheetIndex + 1,
      path: sheetPaths[sheetIndex],
      sha256: sha256(contents),
      contents,
      positions: sheetRecords.map((record) => record.position),
    });
  }

  const index = {
    schema_version: "bmh-artwork-master-review/v1",
    purpose: "human review of the 28 exact flat artwork masters before manifest promotion",
    source_bindings: {
      ledger_path: ledgerPath,
      ledger_master_inputs_sha256: sha256(canonicalJson(immutableLedgerMasterInputs(ledger))),
      inventory_path: inventoryPath,
      inventory_sha256: sha256(inventoryBytes),
    },
    layout: {
      sheet_count: 4,
      masters_per_sheet: 7,
      columns: 2,
      rows: 4,
      sheet_dimensions: [SHEET_WIDTH, SHEET_HEIGHT],
      displayed_master_dimensions: [CELL_WIDTH, ART_HEIGHT],
      resize: "portable integer nearest-neighbor contain; no crop",
      label_renderer: "embedded 5x7 bitmap glyphs; no host fonts",
      png_encoder: "fixed RGB PNG encoding from exact palette indices; compression 9; adaptive filtering disabled",
    },
    counts: {
      masters: records.length,
      lesson_masters: records.filter((record) => record.master_kind === "lesson-master").length,
      direct_video_poster_masters: records.filter((record) => record.master_kind === "direct-poster-master").length,
      course_cover_masters: records.filter((record) => record.master_kind === "course-cover-master").length,
    },
    sheets: sheets.map(({ contents: _contents, ...sheet }) => sheet),
    masters: records.map(({ rendered: _rendered, ...record }) => ({
      ...record,
      sheet_path: sheetPaths[record.sheet_number - 1],
    })),
  };
  const indexBytes = canonicalJson(index);
  return { index, indexBytes, sheets };
}

async function writeAtomic(filename, contents) {
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.tmp-${process.pid}`;
  await writeFile(temporary, contents);
  await rename(temporary, filename);
}

export async function writeMasterReviewSurface(options = {}) {
  const root = path.resolve(options.root ?? DEFAULT_REPO_ROOT);
  const built = await buildMasterReviewSurface({ ...options, root });
  const ledgerPath = options.ledgerPath ?? DEFAULT_LEDGER_PATH;
  const inventoryPath = options.inventoryPath ?? DEFAULT_INVENTORY_PATH;
  const indexPath = options.indexPath ?? DEFAULT_MASTER_REVIEW_INDEX_PATH;
  const sheetPaths = options.sheetPaths ?? DEFAULT_MASTER_REVIEW_SHEET_PATHS;
  const historical = await approvedHistoricalSurfaceCompatibility({
    root,
    built,
    ledgerPath,
    inventoryPath,
    indexPath,
    sheetPaths,
  });
  if (historical.result) return historical.result;
  const existingIndex = await readFile(repoPath(root, indexPath)).catch(() => null);
  const targetsCanonicalSurface = indexPath === DEFAULT_MASTER_REVIEW_INDEX_PATH
    && JSON.stringify(sheetPaths) === JSON.stringify(DEFAULT_MASTER_REVIEW_SHEET_PATHS);
  const protectedHistoricalIndex = targetsCanonicalSurface
    && existingIndex
    && sha256(existingIndex) === APPROVED_HISTORICAL_INDEX_SHA256;
  if (historical.bound || protectedHistoricalIndex) {
    throw new Error("Approved historical master review surface is immutable");
  }
  for (const sheet of built.sheets) {
    await writeAtomic(repoPath(root, sheet.path), sheet.contents);
  }
  await writeAtomic(
    repoPath(root, indexPath),
    built.indexBytes,
  );
  return built;
}

export async function validateMasterReviewSurface(options = {}) {
  const root = path.resolve(options.root ?? DEFAULT_REPO_ROOT);
  const built = await buildMasterReviewSurface({ ...options, root });
  const stale = [];
  for (const sheet of built.sheets) {
    const actual = await readFile(repoPath(root, sheet.path)).catch(() => null);
    if (!actual || !actual.equals(sheet.contents)) stale.push(sheet.path);
  }
  const indexPath = options.indexPath ?? DEFAULT_MASTER_REVIEW_INDEX_PATH;
  const actualIndex = await readFile(repoPath(root, indexPath)).catch(() => null);
  if (!actualIndex || !actualIndex.equals(built.indexBytes)) stale.push(indexPath);
  if (stale.length) {
    const historical = await approvedHistoricalSurfaceCompatibility({
      root,
      built,
      ledgerPath: options.ledgerPath ?? DEFAULT_LEDGER_PATH,
      inventoryPath: options.inventoryPath ?? DEFAULT_INVENTORY_PATH,
      indexPath,
      sheetPaths: options.sheetPaths ?? DEFAULT_MASTER_REVIEW_SHEET_PATHS,
    });
    if (historical.result) return historical.result;
  }
  if (stale.length) throw new Error(`Master review surface is missing or stale: ${stale.join(", ")}`);
  return built;
}

async function main() {
  const [mode, ...rest] = process.argv.slice(2);
  if (!['--write', '--check'].includes(mode) || rest.length) {
    throw new Error("Usage: node build-master-review.mjs --write|--check");
  }
  const result = mode === "--write"
    ? await writeMasterReviewSurface()
    : await validateMasterReviewSurface();
  process.stdout.write(`${JSON.stringify({
    mode: mode.slice(2),
    masters: result.index.counts.masters,
    sheets: result.sheets.map(({ path: sheetPath, sha256: checksum }) => ({ path: sheetPath, sha256: checksum })),
    index_path: DEFAULT_MASTER_REVIEW_INDEX_PATH,
    index_sha256: sha256(result.indexBytes),
  }, null, 2)}\n`);
}

const isMain = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
  : false;
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
