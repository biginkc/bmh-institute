import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { CourseImportManifest, ImportBlock, ImportLesson } from "./manifest";

/**
 * The invariant nothing in this repo asserted before: EVERY instructional
 * lesson in the canonical BMH release ends in a required Closer Lab voice
 * check.
 *
 * Which "19" this is about
 * -----------------------
 * The release has 44 lesson rows: 19 instructional (`type: "content"`), 19
 * checkpoint quizzes (`type: "quiz"`), and 6 section assignments
 * (`type: "assignment"`). This file is ONLY about the 19 instructional
 * lessons. Quiz and assignment lessons are assessments in their own right
 * and are deliberately out of scope -- do not "fix" a failure here by
 * widening the denominator to 44.
 *
 * Why the existing suite missed the gap
 * ------------------------------------
 * `summarizeManifest()` / `validateManifest()` only ever asserted the
 * AGGREGATE `rolePlays: 18`, and `bmh-employee-training.qa.test.mjs` only
 * asserted the frozen sales-role-play sub-namespace is exactly 6. An
 * aggregate count of 18 is satisfied just as happily by "17 lessons covered,
 * one of them twice" as by "18 lessons covered" -- which is exactly the
 * state the manual inventory audit found. Counting blocks can never catch a
 * per-lesson hole; only iterating the lessons can.
 *
 * Why both layers are asserted here, in one file
 * ----------------------------------------------
 * Coverage can regress down two INDEPENDENT paths:
 *   1. the manifest (`bmh-employee-training.v1.json`) loses a block, or
 *   2. production loses one, because no migration ever bound it.
 * Asserting only the manifest would let a manifest-only edit look "fixed"
 * while learners still see no oral check. Asserting only the migrations
 * would let the manifest drift out of sync with what is live. Keeping both
 * halves in one file is deliberate: it stops someone satisfying one half and
 * concluding the invariant holds.
 *
 * Note this is a unit test, not `*.integration.test.ts`. The integration
 * suite is hard-bound to the disposable TEST project
 * (`src/lib/testing/integration-environment.ts` pins ref
 * `jvaabkchkihkjllehmft`) and TRUNCATEs shared tables per test -- the
 * released 44-lesson course does not exist there, so it cannot answer a
 * question about production content. The committed manifest plus the
 * committed production-binding migrations ARE the checked-in record of what
 * is live, they need no credentials, and they gate the pre-commit hook.
 */

const MANIFEST_PATH = resolve(
  process.cwd(),
  "content/course-manifests/bmh-employee-training.v1.json",
);
const MIGRATIONS_DIR = resolve(process.cwd(), "supabase/migrations");
const CLOSER_LAB_LEDGER_PATH = resolve(
  process.cwd(),
  "docs/course-production/closer-lab-production-mapping.json",
);

// The locked shape of the canonical release. Named as constants so a failure
// message can say which denominator moved.
const EXPECTED_INSTRUCTIONAL_LESSONS = 19;
const EXPECTED_TOTAL_LESSON_ROWS = 44;

function loadManifest(): CourseImportManifest {
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as CourseImportManifest;
}

function allLessons(manifest: CourseImportManifest): ImportLesson[] {
  return manifest.program.courses
    .flatMap((course) => course.modules)
    .flatMap((courseModule) => courseModule.lessons);
}

function instructionalLessons(manifest: CourseImportManifest): ImportLesson[] {
  // "Instructional" is `type: "content"` in the manifest, which the importer
  // writes to `lessons.lesson_type`. Derived, never a hardcoded title list,
  // so adding or retitling a lesson tightens this test instead of bypassing it.
  return allLessons(manifest).filter((lesson) => lesson.type === "content");
}

/**
 * A lesson is covered when it carries at least one role_play block that is
 * required for completion. `required` is the manifest field the importer
 * maps onto `content_blocks.is_required_for_completion` (see
 * `023_atomic_course_import_apply.sql`), and both oral-check insert
 * migrations hardcode `true` for that column. An optional voice block would
 * not gate completion, so it does not count as coverage.
 */
function requiredRolePlayBlocks(lesson: ImportLesson): ImportBlock[] {
  return (lesson.blocks ?? []).filter(
    (block) => block.type === "role_play" && block.required === true,
  );
}

function describeLesson(lesson: ImportLesson): string {
  return `${lesson.title} (${lesson.source_key})`;
}

type ProductionBinding = {
  migration: string;
  blockSourceKeys: Set<string>;
  lessonSourceKeys: Set<string>;
};

/**
 * Every forward migration that inserts role_play rows into
 * `public.content_blocks` and declares which lessons it touched in its audit
 * receipt (`'lesson_source_keys', jsonb_build_array(...)`).
 *
 * Discovered by content, not by filename, so a future oral-check migration
 * that follows the same receipt convention is picked up automatically
 * whatever it is called. Rollback migrations repeat the same
 * `lesson_source_keys` list but perform no insert, so the insert check is
 * what excludes them -- a rollback must never be read as coverage.
 */
function productionBindings(): ProductionBinding[] {
  const bindings: ProductionBinding[] = [];
  for (const filename of readdirSync(MIGRATIONS_DIR).sort()) {
    if (!filename.endsWith(".sql")) continue;
    const sql = readFileSync(resolve(MIGRATIONS_DIR, filename), "utf8");
    const insertsRolePlayBlocks =
      /insert into public\.content_blocks[\s\S]{0,600}?'role_play'/.test(sql);
    const receiptMarker = "'lesson_source_keys', jsonb_build_array(";
    const receiptStart = sql.indexOf(receiptMarker);
    if (!insertsRolePlayBlocks || receiptStart < 0) continue;

    const receiptOpen = receiptStart + receiptMarker.length;
    const receiptClose = sql.indexOf(")", receiptOpen);
    expect(
      receiptClose,
      `${filename} has an unterminated lesson_source_keys receipt array`,
    ).toBeGreaterThan(receiptOpen);
    const receipt = sql.slice(receiptOpen, receiptClose);

    bindings.push({
      migration: filename,
      blockSourceKeys: new Set(
        [...sql.matchAll(/'source_key',\s*'(block-[a-z0-9-]+)'/g)].map(
          (match) => match[1],
        ),
      ),
      lessonSourceKeys: new Set(
        [...receipt.matchAll(/'(lesson-[a-z0-9-]+)'/g)].map((match) => match[1]),
      ),
    });
  }
  return bindings;
}

/**
 * The 6 frozen sales-role-play blocks (`block-role-play-*`) reached
 * production through the original released course import rather than a
 * post-release migration, so their production identity is pinned by the
 * finalized Closer Lab mapping ledger. Read from the ledger rather than
 * hardcoded here so a block dropped from that ledger stops counting as
 * production-bound.
 */
function frozenReleasedBlockSourceKeys(): Set<string> {
  const ledger = JSON.parse(readFileSync(CLOSER_LAB_LEDGER_PATH, "utf8")) as {
    status: string;
    records: { block_source_key: string }[];
  };
  expect(
    ledger.status,
    "the Closer Lab production mapping ledger must still be finalized for its records to count as production-bound",
  ).toBe("finalized");
  return new Set(ledger.records.map((record) => record.block_source_key));
}

describe("every instructional lesson ends in a required Closer Lab oral check", () => {
  it("keeps the 19-instructional-lesson denominator distinct from the 44 course rows", () => {
    const manifest = loadManifest();
    expect(allLessons(manifest)).toHaveLength(EXPECTED_TOTAL_LESSON_ROWS);
    expect(instructionalLessons(manifest)).toHaveLength(
      EXPECTED_INSTRUCTIONAL_LESSONS,
    );
  });

  it("covers all 19 instructional lessons in the manifest", () => {
    const manifest = loadManifest();
    const lessons = instructionalLessons(manifest);
    const uncovered = lessons.filter(
      (lesson) => requiredRolePlayBlocks(lesson).length === 0,
    );

    expect(
      uncovered.map(describeLesson),
      `${uncovered.length} of ${lessons.length} instructional lessons have no required role_play block in ` +
        "content/course-manifests/bmh-employee-training.v1.json. Every instructional lesson must end in a " +
        "required Closer Lab voice check. Note this is the 19-instructional-lesson denominator, not the 44 " +
        "total lesson rows (19 content + 19 quiz + 6 assignment), and not the aggregate rolePlays count in " +
        "summarizeManifest() -- that aggregate stays green while a lesson goes uncovered, which is how this " +
        "gap survived. Missing: " +
        (uncovered.map(describeLesson).join(", ") || "none"),
    ).toEqual([]);
  });

  it("covers all 19 instructional lessons in production, via a released import block or an insert migration", () => {
    const manifest = loadManifest();
    const lessons = instructionalLessons(manifest);
    const frozen = frozenReleasedBlockSourceKeys();
    const bindings = productionBindings();

    const unbound = lessons.filter((lesson) => {
      const blocks = requiredRolePlayBlocks(lesson);
      if (blocks.length === 0) return true;
      return !blocks.some(
        (block) =>
          frozen.has(block.source_key) ||
          bindings.some(
            (binding) =>
              binding.blockSourceKeys.has(block.source_key) &&
              binding.lessonSourceKeys.has(lesson.source_key),
          ),
      );
    });

    expect(
      unbound.map(describeLesson),
      `${unbound.length} of ${lessons.length} instructional lessons have no required role_play block that is ` +
        "provably bound into production. A block counts as bound only if it is either in the finalized Closer Lab " +
        "production mapping ledger (the 6 blocks that shipped with the released import) or inserted by a forward " +
        "migration whose audit receipt also names that lesson. A manifest edit alone does not put a voice check in " +
        "front of a learner. Unbound: " +
        (unbound.map(describeLesson).join(", ") || "none"),
    ).toEqual([]);
  });

  it("keeps the manifest and the production bindings in exact agreement", () => {
    const manifest = loadManifest();
    const manifestBlocks = new Set(
      instructionalLessons(manifest)
        .flatMap(requiredRolePlayBlocks)
        .map((block) => block.source_key),
    );
    const productionBlocks = new Set([
      ...frozenReleasedBlockSourceKeys(),
      ...productionBindings().flatMap((binding) => [...binding.blockSourceKeys]),
    ]);

    const manifestOnly = [...manifestBlocks].filter(
      (key) => !productionBlocks.has(key),
    );
    const productionOnly = [...productionBlocks].filter(
      (key) => !manifestBlocks.has(key),
    );

    expect(
      manifestOnly,
      "these role_play blocks exist in the manifest but nothing binds them into production -- the manifest is " +
        `ahead of the database: ${manifestOnly.join(", ") || "none"}`,
    ).toEqual([]);
    expect(
      productionOnly,
      "these role_play blocks are bound into production but are missing from the manifest -- the manifest is " +
        `behind the database: ${productionOnly.join(", ") || "none"}`,
    ).toEqual([]);
  });
});
