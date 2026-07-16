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

test("all 19 learner guides are approved, deterministic, and structurally accessible", async () => {
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
    assert.match(pdfInfo, /Tagged:\s+yes/);
    assert.match(pdfInfo, /Metadata Stream:\s+yes/);
    assert.match(pdfInfo, /Pages:\s+2/);
    assert.match(pdfInfo, /Page size:\s+612 x 792 pts \(letter\)/);
    assert.match(pdfInfo, /Encrypted:\s+no/);
    assert.match(pdfInfo, /JavaScript:\s+no/);
    assert.match(pdfInfo, /PDF version:\s+1\.7/);
    assert.match(pdfInfo, new RegExp(String.raw`Title:\s+${escapeRegExp(lesson.title)}`));

    const { stdout: fontInfo } = await execFileAsync("pdffonts", [assetPath]);
    const fontRows = fontInfo.trim().split("\n").slice(2).filter(Boolean);
    assert.ok(fontRows.length >= 2, `${lesson.source_key} embeds regular and bold fonts`);
    for (const row of fontRows) {
      assert.match(row, /\s+yes\s+yes\s+yes\s+\d+\s+\d+$/, `${lesson.source_key} font is embedded, subset, and Unicode mapped`);
    }

    const source = bytes.toString("latin1");
    assert.match(source, /\/StructTreeRoot\s+\d+\s+0\s+R/);
    assert.match(source, /\/MarkInfo\s*<<[\s\S]*?\/Marked\s+true[\s\S]*?\/Suspects\s+false[\s\S]*?>>/);
    assert.match(source, /\/Lang\s+\(en(?:\\055|-)US\)/);
    assert.equal((source.match(/\/Tabs\s+\/S/g) ?? []).length, 2);
    assert.equal((source.match(/\/StructParents\s+\d+/g) ?? []).length, 2);
    for (const role of ["Document", "H1", "H2", "L", "LI", "P", "Note", "Div"]) {
      assert.match(source, new RegExp(String.raw`/S\s+/${role}\b`), `${lesson.source_key} includes /${role} semantics`);
    }
    assert.ok((source.match(/\/S\s+\/LI\b/g) ?? []).length >= 6, `${lesson.source_key} exposes list items individually`);
    assert.ok((source.match(/\/S\s+\/H2\b/g) ?? []).length >= 4, `${lesson.source_key} exposes its section hierarchy`);
    assert.match(source, /<dc:language><rdf:Bag><rdf:li>en-US<\/rdf:li><\/rdf:Bag><\/dc:language>/);
    assert.doesNotMatch(source, /pdfuaid:part/, "do not make an unverified PDF/UA conformance claim");

    const { stdout: text } = await execFileAsync("pdftotext", ["-layout", assetPath, "-"]);
    const normalizedText = text.replace(/\s+/g, " ");
    assert.match(normalizedText, new RegExp(escapeRegExp(lesson.title)));
    assert.match(text, /Learning objectives/);
    assert.match(text, /Key ideas/);
    assert.match(text, /Practice and reflection/);
    assert.match(text, /Current written SOP/);
    assert.match(text, /Quick review/);
    assert.match(text, /Manager review notes/);

    const orderedLabels = [
      lesson.title,
      "Learning objectives",
      "Key ideas",
      "Practice and reflection",
      "Current written SOP",
      "Quick review",
      "Manager review notes",
    ];
    let cursor = -1;
    for (const label of orderedLabels) {
      const next = normalizedText.indexOf(label, cursor + 1);
      assert.ok(next > cursor, `${lesson.source_key} reading order includes ${label}`);
      cursor = next;
    }
  }
});

test("learner-guide text palette meets WCAG AA normal-text contrast", () => {
  const checks = [
    ["ink on white", "#111827", "#FFFFFF"],
    ["muted on white", "#4B5563", "#FFFFFF"],
    ["blue heading on white", "#3556B8", "#FFFFFF"],
    ["ink on blue soft", "#111827", "#EEF2FF"],
    ["muted on blue soft", "#4B5563", "#EEF2FF"],
    ["ink on cream", "#111827", "#FFF8E8"],
    ["muted on cream", "#4B5563", "#FFF8E8"],
  ];
  for (const [label, foreground, background] of checks) {
    assert.ok(contrastRatio(foreground, background) >= 4.5, label);
  }
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function contrastRatio(foreground, background) {
  const values = [foreground, background].map((hex) => {
    const rgb = hex.slice(1).match(/.{2}/g).map((pair) => Number.parseInt(pair, 16) / 255);
    const channels = rgb.map((channel) => channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4);
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  });
  const [lighter, darker] = values.sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}
