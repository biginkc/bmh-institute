import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderQuizReview, reviewSha256 } from "./quiz-review-surface.mjs";

const ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const MANIFEST_PATH = path.join(ROOT, "content/course-manifests/bmh-employee-training.v1.json");
const OUTPUT_PATH = path.join(ROOT, "docs/course-production/quiz-content-review.v1.md");
export { renderQuizReview, reviewSha256 } from "./quiz-review-surface.mjs";

async function main() {
  let mode = "--check";
  let manifestPath = MANIFEST_PATH;
  let outputPath = OUTPUT_PATH;
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--check" || token === "--write") {
      mode = token;
      continue;
    }
    const equals = token.match(/^--(manifest|out)=(.+)$/);
    if (equals) {
      if (equals[1] === "manifest") manifestPath = path.resolve(equals[2]);
      else outputPath = path.resolve(equals[2]);
      continue;
    }
    const split = token.match(/^--(manifest|out)$/);
    if (split && args[index + 1] && !args[index + 1].startsWith("--")) {
      if (split[1] === "manifest") manifestPath = path.resolve(args[index + 1]);
      else outputPath = path.resolve(args[index + 1]);
      index += 1;
      continue;
    }
    throw new Error(
      "Usage: node scripts/course-content/build-quiz-review.mjs [--check|--write] [--manifest PATH] [--out PATH]",
    );
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const markdown = renderQuizReview(manifest);
  if (mode === "--write") {
    await writeFile(outputPath, markdown);
    console.log(`Wrote ${path.relative(ROOT, outputPath)} (${reviewSha256(markdown)})`);
    return;
  }
  const existing = await readFile(outputPath, "utf8");
  if (existing !== markdown) throw new Error("Quiz review surface is stale");
  console.log(`Verified ${path.relative(ROOT, outputPath)} (${reviewSha256(markdown)})`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
