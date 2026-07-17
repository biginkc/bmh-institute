#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const LOCKED_BACKGROUND_RGB = new Set(["103,182,255", "255,211,1"]);
const EXPECTED_SLUGS = new Set([
  "orientation",
  "opening-the-call",
  "objection-architecture",
]);

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const configPath =
  process.argv[2] ??
  "docs/course-production/thumbnail-pilots/v6-derivative-config.json";
const checkOnly = process.argv.includes("--check");
const unexpected = process.argv
  .slice(2)
  .filter((arg) => arg !== configPath && arg !== "--check");
if (unexpected.length > 0)
  throw new Error(`Unexpected argument(s): ${unexpected.join(", ")}`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function repoPath(relativePath) {
  assert(
    typeof relativePath === "string" && relativePath.length > 0,
    "Repository path is required",
  );
  assert(
    !path.isAbsolute(relativePath),
    `Path must be repository-relative: ${relativePath}`,
  );
  const resolved = path.resolve(root, relativePath);
  assert(
    resolved.startsWith(`${root}${path.sep}`),
    `Path escapes repository: ${relativePath}`,
  );
  return resolved;
}

function validateRgb(value, label) {
  assert(
    Array.isArray(value) &&
      value.length === 3 &&
      value.every(
        (channel) =>
          Number.isInteger(channel) && channel >= 0 && channel <= 255,
      ),
    `${label} must be an RGB triplet`,
  );
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function nearest(red, green, blue, palette) {
  let selected = palette[0];
  let selectedDistance = Number.POSITIVE_INFINITY;
  for (const color of palette) {
    const distance =
      (red - color[0]) ** 2 + (green - color[1]) ** 2 + (blue - color[2]) ** 2;
    if (distance < selectedDistance) {
      selected = color;
      selectedDistance = distance;
    }
  }
  return selected;
}

async function quantize(input, palette, background) {
  const { data, info } = await sharp(input)
    .flatten({
      background: { r: background[0], g: background[1], b: background[2] },
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let offset = 0; offset < data.length; offset += 3) {
    const color = nearest(
      data[offset],
      data[offset + 1],
      data[offset + 2],
      palette,
    );
    data[offset] = color[0];
    data[offset + 1] = color[1];
    data[offset + 2] = color[2];
  }
  return { data, width: info.width, height: info.height };
}

function rawImage(flat) {
  return sharp(flat.data, {
    raw: { width: flat.width, height: flat.height, channels: 3 },
  });
}

async function flattenPng(flat) {
  return rawImage(flat)
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
}

function validateBox(value, label, width, height) {
  assert(
    Array.isArray(value) &&
      value.length === 4 &&
      value.every((item) => Number.isInteger(item) && item >= 0),
    `${label} must be a non-negative [left, top, width, height] tuple`,
  );
  const [left, top, boxWidth, boxHeight] = value;
  assert(
    boxWidth > 0 && boxHeight > 0,
    `${label} must have positive dimensions`,
  );
  assert(
    left + boxWidth <= width && top + boxHeight <= height,
    `${label} escapes the source image`,
  );
  return value;
}

function matchesRgb(data, offset, color) {
  return (
    data[offset] === color[0] &&
    data[offset + 1] === color[1] &&
    data[offset + 2] === color[2]
  );
}

function lockCharacterPixels(
  target,
  source,
  sourceBackground,
  box,
  targetBackground,
) {
  assert(
    target.width === source.width && target.height === source.height,
    "Character lock source dimensions drifted",
  );
  const [left, top, width, height] = box;
  let copiedPixels = 0;
  const lockedPixels = [];

  for (let row = top; row < top + height; row += 1) {
    for (let column = left; column < left + width; column += 1) {
      const offset = (row * target.width + column) * 3;
      target.data[offset] = targetBackground[0];
      target.data[offset + 1] = targetBackground[1];
      target.data[offset + 2] = targetBackground[2];
      if (matchesRgb(source.data, offset, sourceBackground)) continue;
      target.data[offset] = source.data[offset];
      target.data[offset + 1] = source.data[offset + 1];
      target.data[offset + 2] = source.data[offset + 2];
      lockedPixels.push(
        source.data[offset],
        source.data[offset + 1],
        source.data[offset + 2],
      );
      copiedPixels += 1;
    }
  }

  assert(
    copiedPixels > 1_000,
    "Character lock did not contain a substantive character layer",
  );
  return {
    copied_pixels: copiedPixels,
    pixel_sha256: sha256(Buffer.from(lockedPixels)),
  };
}

function clearExteriorBackground(flat, background) {
  const pixelCount = flat.width * flat.height;
  const visited = new Uint8Array(pixelCount);
  const queue = new Uint32Array(pixelCount);
  let head = 0;
  let tail = 0;

  const enqueue = (index) => {
    if (visited[index]) return;
    const offset = index * 3;
    if (
      flat.data[offset] === 0 &&
      flat.data[offset + 1] === 0 &&
      flat.data[offset + 2] === 0
    ) {
      return;
    }
    visited[index] = 1;
    queue[tail] = index;
    tail += 1;
  };

  for (let column = 0; column < flat.width; column += 1) {
    enqueue(column);
    enqueue((flat.height - 1) * flat.width + column);
  }
  for (let row = 1; row < flat.height - 1; row += 1) {
    enqueue(row * flat.width);
    enqueue(row * flat.width + flat.width - 1);
  }

  while (head < tail) {
    const index = queue[head];
    head += 1;
    const column = index % flat.width;
    const row = Math.floor(index / flat.width);
    const offset = index * 3;
    flat.data[offset] = background[0];
    flat.data[offset + 1] = background[1];
    flat.data[offset + 2] = background[2];
    if (column > 0) enqueue(index - 1);
    if (column + 1 < flat.width) enqueue(index + 1);
    if (row > 0) enqueue(index - flat.width);
    if (row + 1 < flat.height) enqueue(index + flat.width);
  }

  assert(
    tail > pixelCount / 2,
    "Exterior background clear did not reach most of the canvas",
  );
  assert(
    tail < pixelCount,
    "Exterior background clear erased the entire illustration",
  );
  return { cleared_pixels: tail };
}

function dilateBlackContours(flat, radius) {
  assert(
    Number.isInteger(radius) && radius >= 1 && radius <= 2,
    "Black contour dilation radius must be one or two pixels",
  );
  const original = Buffer.from(flat.data);
  let addedPixels = 0;

  for (let row = 0; row < flat.height; row += 1) {
    for (let column = 0; column < flat.width; column += 1) {
      const offset = (row * flat.width + column) * 3;
      if (!matchesRgb(original, offset, [0, 0, 0])) continue;
      for (
        let targetRow = Math.max(0, row - radius);
        targetRow <= Math.min(flat.height - 1, row + radius);
        targetRow += 1
      ) {
        for (
          let targetColumn = Math.max(0, column - radius);
          targetColumn <= Math.min(flat.width - 1, column + radius);
          targetColumn += 1
        ) {
          const rowDistance = Math.abs(targetRow - row);
          const columnDistance = Math.abs(targetColumn - column);
          const checkerboardDiagonal =
            radius === 1 &&
            rowDistance === 1 &&
            columnDistance === 1 &&
            (row + column) % 2 === 0;
          if (rowDistance + columnDistance > radius && !checkerboardDiagonal)
            continue;
          const targetOffset = (targetRow * flat.width + targetColumn) * 3;
          if (!matchesRgb(flat.data, targetOffset, [0, 0, 0])) addedPixels += 1;
          flat.data[targetOffset] = 0;
          flat.data[targetOffset + 1] = 0;
          flat.data[targetOffset + 2] = 0;
        }
      }
    }
  }

  assert(
    addedPixels > 0,
    "Black contour dilation did not change the illustration",
  );
  return {
    radius,
    pattern: "cross-plus-checkerboard-diagonals",
    added_pixels: addedPixels,
  };
}

async function normalize16x9(flatMaster, palette, background) {
  const resized = await sharp(flatMaster)
    .removeAlpha()
    .resize(1280, 720, {
      fit: "contain",
      position: "centre",
      background: { r: background[0], g: background[1], b: background[2] },
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer();
  return quantize(resized, palette, background);
}

async function encodeLosslessWebp(flat) {
  return rawImage(flat).webp({ lossless: true, effort: 6 }).toBuffer();
}

async function encodeCard(normalized, background) {
  assert(
    normalized.width === 1280 && normalized.height === 720,
    "Normalized master must be 1280x720",
  );
  const canvas = Buffer.alloc(1280 * 800 * 3);
  for (let offset = 0; offset < canvas.length; offset += 3) {
    canvas[offset] = background[0];
    canvas[offset + 1] = background[1];
    canvas[offset + 2] = background[2];
  }
  for (let row = 0; row < 720; row += 1) {
    normalized.data.copy(
      canvas,
      (row + 40) * 1280 * 3,
      row * 1280 * 3,
      (row + 1) * 1280 * 3,
    );
  }
  return sharp(canvas, { raw: { width: 1280, height: 800, channels: 3 } })
    .webp({ lossless: true, effort: 6 })
    .toBuffer();
}

async function atomicWrite(relativePath, contents) {
  const target = repoPath(relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}`;
  await writeFile(temporary, contents);
  await rename(temporary, target);
}

async function inspect(
  contents,
  expectedWidth,
  expectedHeight,
  palette,
  padding,
) {
  const metadata = await sharp(contents).metadata();
  assert(
    metadata.width === expectedWidth && metadata.height === expectedHeight,
    "Derivative dimensions drifted",
  );
  assert(!metadata.hasAlpha, "Derivative may not contain alpha");
  if (metadata.format === "webp") {
    const riff = contents.toString("ascii");
    assert(
      riff.includes("VP8L") && !riff.includes("ANIM"),
      "Derivative must be lossless non-animated WebP",
    );
  }
  const { data, info } = await sharp(contents)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const allowed = new Set(palette.map((color) => color.join(",")));
  for (let offset = 0; offset < data.length; offset += 3) {
    assert(
      allowed.has(`${data[offset]},${data[offset + 1]},${data[offset + 2]}`),
      "Derivative contains an unlocked color",
    );
  }
  if (padding) {
    for (const row of [
      ...Array(40).keys(),
      ...Array.from({ length: 40 }, (_, index) => 760 + index),
    ]) {
      for (let column = 0; column < 1280; column += 1) {
        const offset = (row * info.width + column) * 3;
        assert(
          data[offset] === padding[0] &&
            data[offset + 1] === padding[1] &&
            data[offset + 2] === padding[2],
          "Lesson card padding color drifted",
        );
      }
    }
  }
  return { pixel_sha256: sha256(data) };
}

const configAbsolutePath = repoPath(configPath);
const configInfo = await lstat(configAbsolutePath);
assert(
  configInfo.isFile() && !configInfo.isSymbolicLink(),
  "Derivative config must be a regular file",
);
const configBytes = await readFile(configAbsolutePath);
const config = JSON.parse(configBytes);
assert(
  config.schema_version === "bmh-thumbnail-pilot-derivatives/v2" ||
    config.schema_version === "bmh-thumbnail-pilot-derivatives/v3",
  "Derivative config schema is invalid",
);
const palette = config.palette_rgb.map((color, index) =>
  validateRgb(color, `palette_rgb[${index}]`),
);
assert(
  new Set(palette.map((color) => color.join(","))).size === palette.length,
  "Palette colors must be unique",
);
assert(
  Array.isArray(config.pilots) && config.pilots.length === 3,
  "Exactly three pilots are required",
);
assert(
  config.pilots.every((pilot) => EXPECTED_SLUGS.has(pilot.slug)) &&
    new Set(config.pilots.map((pilot) => pilot.slug)).size ===
      EXPECTED_SLUGS.size,
  "The three expected pilot slugs are required exactly once",
);
const configuredPaths = config.pilots.flatMap((pilot) => [
  pilot.source_path,
  pilot.flat_master_path,
  pilot.lesson_card_path,
  pilot.video_poster_path,
]);
assert(
  configuredPaths.every(
    (configuredPath) =>
      typeof configuredPath === "string" && configuredPath.length > 0,
  ) && new Set(configuredPaths).size === configuredPaths.length,
  "Pilot source and output paths must be present and globally unique",
);

const records = [];
for (const pilot of config.pilots) {
  const background = validateRgb(
    pilot.background_rgb,
    `${pilot.slug} background_rgb`,
  );
  assert(
    LOCKED_BACKGROUND_RGB.has(background.join(",")) &&
      palette.some((color) => color.join(",") === background.join(",")),
    `${pilot.slug} background must be the locked blue or yellow palette color`,
  );
  const sourcePath = repoPath(pilot.source_path);
  const sourceInfo = await lstat(sourcePath);
  assert(
    sourceInfo.isFile() && !sourceInfo.isSymbolicLink(),
    `${pilot.slug} source must be a regular file`,
  );
  const source = await readFile(sourcePath);
  const sourceMetadata = await sharp(source).metadata();
  assert(
    sourceMetadata.format === "png" &&
      !sourceMetadata.hasAlpha &&
      sourceMetadata.width === 1672 &&
      sourceMetadata.height === 941,
    `${pilot.slug} source must be an opaque 1672x941 PNG`,
  );

  const flat = await quantize(source, palette, background);
  const backgroundClear = pilot.clear_exterior_background
    ? clearExteriorBackground(flat, background)
    : null;
  const contourDilation = pilot.black_contour_dilation_radius
    ? dilateBlackContours(flat, pilot.black_contour_dilation_radius)
    : null;
  let characterLock = null;
  if (pilot.character_lock) {
    assert(
      config.schema_version === "bmh-thumbnail-pilot-derivatives/v3",
      "Character locks require derivative schema v3",
    );
    const lockSourcePath = repoPath(pilot.character_lock.source_path);
    const lockSourceInfo = await lstat(lockSourcePath);
    assert(
      lockSourceInfo.isFile() && !lockSourceInfo.isSymbolicLink(),
      `${pilot.slug} character lock source must be a regular file`,
    );
    const lockSource = await readFile(lockSourcePath);
    const lockSourceMetadata = await sharp(lockSource).metadata();
    assert(
      lockSourceMetadata.format === "png" &&
        !lockSourceMetadata.hasAlpha &&
        lockSourceMetadata.width === sourceMetadata.width &&
        lockSourceMetadata.height === sourceMetadata.height,
      `${pilot.slug} character lock source must match the opaque PNG source dimensions`,
    );
    const lockBackground = validateRgb(
      pilot.character_lock.source_background_rgb,
      `${pilot.slug} character_lock source_background_rgb`,
    );
    assert(
      LOCKED_BACKGROUND_RGB.has(lockBackground.join(",")) &&
        palette.some((color) => color.join(",") === lockBackground.join(",")),
      `${pilot.slug} character lock background must be a locked palette background`,
    );
    const lockBox = validateBox(
      pilot.character_lock.box,
      `${pilot.slug} character_lock box`,
      sourceMetadata.width,
      sourceMetadata.height,
    );
    const lockFlat = await quantize(lockSource, palette, lockBackground);
    const lockInspection = lockCharacterPixels(
      flat,
      lockFlat,
      lockBackground,
      lockBox,
      background,
    );
    characterLock = {
      source_path: pilot.character_lock.source_path,
      source_sha256: sha256(lockSource),
      source_background_rgb: lockBackground,
      box: lockBox,
      ...lockInspection,
    };
  }
  const flatMaster = await flattenPng(flat);
  const normalized = await normalize16x9(flatMaster, palette, background);
  const poster = await encodeLosslessWebp(normalized);
  const card = await encodeCard(normalized, background);

  const flatInspection = await inspect(
    flatMaster,
    sourceMetadata.width,
    sourceMetadata.height,
    palette,
    null,
  );
  const cardInspection = await inspect(card, 1280, 800, palette, background);
  const posterInspection = await inspect(poster, 1280, 720, palette, null);

  const outputs = [
    [pilot.flat_master_path, flatMaster],
    [pilot.lesson_card_path, card],
    [pilot.video_poster_path, poster],
  ];
  if (checkOnly) {
    for (const [relativePath, expected] of outputs) {
      const actual = await readFile(repoPath(relativePath));
      assert(
        actual.equals(expected),
        `${relativePath} differs from deterministic output`,
      );
    }
  } else {
    for (const [relativePath, contents] of outputs)
      await atomicWrite(relativePath, contents);
  }

  records.push({
    slug: pilot.slug,
    background_rgb: background,
    source: {
      path: pilot.source_path,
      dimensions: [sourceMetadata.width, sourceMetadata.height],
      sha256: sha256(source),
    },
    ...(backgroundClear ? { exterior_background_clear: backgroundClear } : {}),
    ...(contourDilation ? { black_contour_dilation: contourDilation } : {}),
    ...(characterLock ? { character_lock: characterLock } : {}),
    flat_master: {
      path: pilot.flat_master_path,
      dimensions: [sourceMetadata.width, sourceMetadata.height],
      sha256: sha256(flatMaster),
      ...flatInspection,
    },
    lesson_card: {
      path: pilot.lesson_card_path,
      dimensions: [1280, 800],
      sha256: sha256(card),
      ...cardInspection,
    },
    video_poster: {
      path: pilot.video_poster_path,
      dimensions: [1280, 720],
      sha256: sha256(poster),
      ...posterInspection,
    },
  });
}

const report = {
  schema_version:
    config.schema_version === "bmh-thumbnail-pilot-derivatives/v3"
      ? "bmh-thumbnail-pilot-derivative-report/v3"
      : "bmh-thumbnail-pilot-derivative-report/v2",
  config_path: configPath,
  config_sha256: sha256(configBytes),
  mode: checkOnly ? "check" : "write",
  records,
};
assert(
  configPath.endsWith("-derivative-config.json"),
  "Derivative config filename must end with -derivative-config.json",
);
const reportPath = configPath.replace(
  /-derivative-config\.json$/,
  "-derivative-report.json",
);
if (!checkOnly)
  await atomicWrite(
    reportPath,
    Buffer.from(`${JSON.stringify(report, null, 2)}\n`),
  );
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
