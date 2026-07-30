import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const manifest = JSON.parse(await readFile(new URL("./bmh-employee-training.v1.json", import.meta.url), "utf8"));
const routeSource = await readFile(
  join(process.cwd(), "src/app/(dashboard)/lessons/[lessonId]/page.tsx"),
  "utf8",
);

test("released lesson inventory preserves the routing/video contract", () => {
  const lessons = manifest.program.courses.flatMap((course) =>
    course.modules.flatMap((module) => module.lessons),
  );
  const contentLessons = lessons.filter((lesson) => lesson.type === "content");
  const quizLessons = lessons.filter((lesson) => lesson.type === "quiz");
  assert.equal(contentLessons.length, 19);
  assert.equal(quizLessons.length, 19);
  assert.ok(contentLessons.every((lesson) =>
    lesson.blocks.some((block) =>
      block.type === "video" &&
      typeof block.content?.asset_key === "string" &&
      typeof block.content?.poster_asset_key === "string" &&
      typeof block.content?.caption_asset_key === "string" &&
      Number.isFinite(block.content?.duration_seconds),
    ),
  ));
  assert.ok(routeSource.includes("?part=quiz"));
  assert.ok(routeSource.includes("requestedPartLocked"));
  assert.ok(routeSource.includes("Quiz locked"));

  const counts = { single_choice: 0, true_false: 0, multi_select: 0 };
  const visit = (value) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== "object") return;
    if (Object.hasOwn(counts, value.question_type)) counts[value.question_type] += 1;
    Object.values(value).forEach(visit);
  };
  visit(manifest);
  assert.deepEqual(counts, { single_choice: 919, true_false: 1, multi_select: 0 });
});
