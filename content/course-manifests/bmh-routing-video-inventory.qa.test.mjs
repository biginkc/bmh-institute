import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const manifest = JSON.parse(await readFile(new URL("./bmh-employee-training.v1.json", import.meta.url), "utf8"));

test("released quiz inventory has the routing/video contract", () => {
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
