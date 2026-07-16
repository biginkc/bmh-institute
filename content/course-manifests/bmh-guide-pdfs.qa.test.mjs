import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const ROOT = resolve(import.meta.dirname, "../..");
const MANIFEST_PATH = resolve(import.meta.dirname, "bmh-employee-training.v1.json");

test("all 19 learner guides are approved, immutable, and visually renderable", async () => {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  const lessons = manifest.program.courses
    .flatMap((course) => course.modules)
    .flatMap((courseModule) => courseModule.lessons)
    .filter((lesson) => lesson.type === "content");
  const assets = new Map(manifest.assets.map((asset) => [asset.source_key, asset]));

  assert.equal(lessons.length, 19);
  for (const lesson of lessons) {
    const guideBlock = lesson.blocks.find((block) =>
      block.source_key.startsWith("block-guide-pdf-slot-"),
    );
    assert.ok(guideBlock, `${lesson.source_key} has a guide block`);
    const asset = assets.get(guideBlock.content.asset_key);
    assert.ok(asset, `${lesson.source_key} has a guide asset`);
    assert.equal(asset.approval_status, "approved");
    assert.match(asset.local_path, /^output\/pdf\/slot-[0-9]{2}-learner-guide\.pdf$/);

    const assetPath = resolve(ROOT, asset.local_path);
    const [bytes, fileStat] = await Promise.all([
      readFile(assetPath),
      stat(assetPath),
    ]);
    const checksum = createHash("sha256").update(bytes).digest("hex");
    assert.equal(checksum, asset.checksum_sha256);
    assert.equal(fileStat.size, asset.size_bytes);
    assert.ok(asset.storage_path.includes(checksum));

    const { stdout: pdfInfo } = await execFileAsync("pdfinfo", [assetPath]);
    assert.match(pdfInfo, /Pages:\s+[1-9]/);
    assert.match(pdfInfo, new RegExp(String.raw`Title:\s+${escapeRegExp(lesson.title)}`));

    const { stdout: text } = await execFileAsync("pdftotext", [assetPath, "-"]);
    assert.match(text, new RegExp(escapeRegExp(lesson.title)));
    assert.match(text, /Learning objectives/);
    assert.match(text, /Key ideas/);
    assert.match(text, /Practice and reflection/);
    assert.match(text, /Current written SOP/);
  }
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
