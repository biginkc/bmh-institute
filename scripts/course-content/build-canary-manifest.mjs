import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const FULL_IMPORT_ID = "bmh-employee-training-v1";
const CANARY_IMPORT_ID = "bmh-employee-training-canary-v1";
const FULL_STORAGE_PREFIX = "courses/bmh-employee-training/v1/";
const CANARY_STORAGE_PREFIX = "courses/bmh-employee-training-canary/v1/";
const TECH_STACK_LESSON_KEYS = new Set([
  "lesson-content-slot-03",
  "lesson-quiz-slot-03",
]);
const ASSET_REFERENCE_FIELDS = [
  "asset_key",
  "poster_asset_key",
  "caption_asset_key",
  "transcript_asset_key",
];
const RESOLVED_ASSET_REFERENCE_FIELDS = [
  ["asset_key", "file_path"],
  ["poster_asset_key", "poster_path"],
  ["caption_asset_key", "caption_path"],
  ["transcript_asset_key", "transcript_path"],
];

export function buildTechStackCanary(fullManifest) {
  if (fullManifest.import_id !== FULL_IMPORT_ID) {
    throw new Error(`Expected source import_id ${FULL_IMPORT_ID}.`);
  }
  const manifest = structuredClone(fullManifest);
  const course = manifest.program.courses[0];
  const sourceModule = course.modules.find((courseModule) =>
    courseModule.lessons.some((lesson) => lesson.source_key === "lesson-content-slot-03"),
  );
  if (!sourceModule) throw new Error("Tech Stack source module is missing.");
  const lessons = sourceModule.lessons.filter((lesson) =>
    TECH_STACK_LESSON_KEYS.has(lesson.source_key),
  );
  if (lessons.length !== TECH_STACK_LESSON_KEYS.size) {
    throw new Error("Tech Stack content and quiz lessons are both required for the canary.");
  }

  manifest.import_id = CANARY_IMPORT_ID;
  manifest.qa_role_group = {
    ...manifest.qa_role_group,
    source_key: "qa-role-group-bmh-content-canary",
    name: "BMH Content QA - Tech Stack Canary",
    description: "Private access group for the isolated Tech Stack import canary.",
  };
  manifest.program = {
    ...manifest.program,
    title: `${manifest.program.title} - Canary`,
    is_published: false,
    courses: [{
      ...course,
      title: `${course.title} - Canary`,
      is_published: false,
      modules: [{ ...sourceModule, lessons }],
    }],
  };

  const requiredAssetKeys = collectAssetKeys(manifest);
  manifest.assets = manifest.assets
    .filter((asset) => requiredAssetKeys.has(asset.source_key))
    .map((asset) => {
      if (!asset.storage_path.startsWith(FULL_STORAGE_PREFIX)) {
        throw new Error(`${asset.source_key} is outside the full-course storage prefix.`);
      }
      return {
        ...asset,
        storage_path: `${CANARY_STORAGE_PREFIX}${asset.storage_path.slice(FULL_STORAGE_PREFIX.length)}`,
      };
    });
  const foundAssetKeys = new Set(manifest.assets.map((asset) => asset.source_key));
  const missing = [...requiredAssetKeys].filter((key) => !foundAssetKeys.has(key));
  if (missing.length > 0) throw new Error(`Canary references missing assets: ${missing.join(", ")}`);
  const assetsByKey = new Map(manifest.assets.map((asset) => [asset.source_key, asset]));
  for (const courseModule of manifest.program.courses[0].modules) {
    for (const lesson of courseModule.lessons) {
      for (const block of lesson.blocks ?? []) {
        for (const [keyField, pathField] of RESOLVED_ASSET_REFERENCE_FIELDS) {
          const key = block.content?.[keyField];
          if (typeof key !== "string" || block.content?.[pathField] === undefined) continue;
          const asset = assetsByKey.get(key);
          if (!asset) throw new Error(`Canary block ${block.source_key} references missing asset ${key}.`);
          block.content[pathField] = asset.storage_path;
        }
      }
    }
  }
  return manifest;
}

function collectAssetKeys(manifest) {
  const keys = new Set();
  addKey(keys, manifest.program.thumbnail_asset_key);
  for (const course of manifest.program.courses) {
    addKey(keys, course.thumbnail_asset_key);
    for (const courseModule of course.modules) {
      for (const lesson of courseModule.lessons) {
        addKey(keys, lesson.thumbnail_asset_key);
        for (const block of lesson.blocks ?? []) {
          for (const field of ASSET_REFERENCE_FIELDS) addKey(keys, block.content?.[field]);
        }
      }
    }
  }
  return keys;
}

function addKey(keys, value) {
  if (typeof value === "string" && value) keys.add(value);
}

async function main() {
  const inputPath = process.argv[2] ?? "content/course-manifests/bmh-employee-training.v1.json";
  const outputPath = process.argv[3] ?? "content/course-manifests/bmh-employee-training-canary.v1.json";
  const fullManifest = JSON.parse(await readFile(inputPath, "utf8"));
  const canary = buildTechStackCanary(fullManifest);
  await writeFile(outputPath, `${JSON.stringify(canary, null, 2)}\n`, "utf8");
  console.log(`Wrote Tech Stack canary manifest to ${outputPath} with ${canary.assets.length} assets.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
