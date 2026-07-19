import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import sharp from "sharp";

import {
  DEFAULT_MASTER_REVIEW_INDEX_PATH,
  DEFAULT_MASTER_REVIEW_SHEET_PATHS,
  buildMasterReviewSurface,
  validateMasterReviewSurface,
} from "./build-master-review.mjs";

const root = path.resolve(fileURLToPath(new URL("../../../../../", import.meta.url)));
const sha256 = (contents) => createHash("sha256").update(contents).digest("hex");

test("the review surface binds all 28 actual flat masters into four readable sheets", async () => {
  const built = await buildMasterReviewSurface({ root });
  assert.equal(built.index.schema_version, "bmh-artwork-master-review/v1");
  assert.deepEqual(built.index.counts, {
    masters: 28,
    lesson_masters: 19,
    direct_video_poster_masters: 8,
    course_cover_masters: 1,
  });
  assert.equal(built.sheets.length, 4);
  assert.deepEqual(built.sheets.map((sheet) => sheet.path), [...DEFAULT_MASTER_REVIEW_SHEET_PATHS]);
  assert.deepEqual(built.sheets.map((sheet) => sheet.positions), [
    [1, 2, 3, 4, 5, 6, 7],
    [8, 9, 10, 11, 12, 13, 14],
    [15, 16, 17, 18, 19, 20, 21],
    [22, 23, 24, 25, 26, 27, 28],
  ]);
  assert.equal(new Set(built.index.masters.map((master) => master.master_id)).size, 28);
  assert.equal(new Set(built.index.masters.map((master) => master.flat_master_path)).size, 28);
  assert.ok(built.index.masters.every((master) => master.title.length > 3));
  assert.ok(built.index.masters.every((master) => ["Andrea", "Seller"].includes(master.character)));
  for (const master of built.index.masters) {
    assert.equal(master.row, Math.floor((master.sheet_position - 1) / 2) + 1);
    assert.equal(master.column, ((master.sheet_position - 1) % 2) + 1);
  }

  for (const master of built.index.masters) {
    const contents = await readFile(path.join(root, master.flat_master_path));
    assert.equal(sha256(contents), master.flat_master_sha256, master.master_id);
    assert.equal(master.sheet_path, DEFAULT_MASTER_REVIEW_SHEET_PATHS[master.sheet_number - 1]);
  }
  for (const sheet of built.sheets) {
    assert.match(sheet.sha256, /^[a-f0-9]{64}$/);
    const metadata = await sharp(sheet.contents).metadata();
    assert.equal(metadata.width, 1360);
    assert.equal(metadata.height, 1992);
    assert.equal(metadata.space, "srgb");
    assert.equal(metadata.isPalette, false);
  }
});

test("build is deterministic and check exact-byte-validates every generated file", async () => {
  const first = await buildMasterReviewSurface({ root });
  const second = await buildMasterReviewSurface({ root });
  assert.ok(first.indexBytes.equals(second.indexBytes));
  assert.deepEqual(
    first.sheets.map((sheet) => sheet.sha256),
    second.sheets.map((sheet) => sheet.sha256),
  );
  for (let index = 0; index < first.sheets.length; index += 1) {
    assert.ok(first.sheets[index].contents.equals(second.sheets[index].contents));
  }

  const checked = await validateMasterReviewSurface({ root });
  const storedIndex = await readFile(path.join(root, DEFAULT_MASTER_REVIEW_INDEX_PATH));
  assert.ok(storedIndex.equals(checked.indexBytes));
  for (const sheet of checked.sheets) {
    const storedSheet = await readFile(path.join(root, sheet.path));
    assert.ok(storedSheet.equals(sheet.contents), sheet.path);
  }
});
