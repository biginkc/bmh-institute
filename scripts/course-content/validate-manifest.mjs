import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const REQUIRED_HELD_ASSETS = new Map([
  ["video-slot-01-welcome", "493de8a5e0663ad577ba46d6d5befce33e9640f250677095094978714d22ac72"],
  ["video-slot-01-mindset", "b0cad612499dbd2d867c906c1ad8a8e3e13fcded333fa973fa6d19339fa930da"],
  ["video-slot-02-terms", "17cac99f171edfb773f85eaaa6719e09ffe1295abec5b062554c72958747c0bb"],
  ["video-slot-10-objection-scripts", "59c745ccca7387f82d0b13eaf95439f9f6a50a8f727ad3c1db4fb839050b1ebb"],
  ["video-slot-15-closing", "6e3aa1b007117b303a05906ca8443a8b9bc38f7c44bd61475c5437b99e7c90d2"],
  ["video-slot-16-kpis", "439f8d06d2e449637509f0f21f9d0b4a5464c65aec1995fca7147e4e4e67310b"],
  ["video-slot-17-compensation", "cecad85478bb1a8ba5bfed7404dc045440c567ed0eaaa90b11b644e124b27846"],
  ["video-slot-18-operator", "6e6a3f257ff8cf3ef201de775de47c6e7833e3abd673e44bb8d4d5ac3aafa048"],
  ["video-slot-19-career", "1ddcf7b1b0b45bbc90ec14b3660b3d5f5a284b5095dd0d0682164924ce1a3da9"],
]);

const STALE_COMPENSATION_PATTERN = /\$\s*\d|hourly base|appointment bonus|commission tier|tiered commission/i;
const STALE_CAREER_GROWTH_PATTERN = /\b(?:role ladder|career ladder|promotion|promoted|readiness|first consideration|management path|closer path|acquisitions? role|90(?:-plus)? days?|six months?|one year|commission|compensation|salary|pay increase|earning potential|higher earnings?|daily (?:numbers?|targets?|quotas?)|dial quotas?|hit(?:ting)? (?:their )?numbers every day|guarante(?:e|ed|es)|own(?:s|ing)? (?:the )?(?:entire )?team(?:'s)? performance)\b/i;
const CAREER_GROWTH_GROUNDING = new Map([
  ["practice", /\b(?:practic(?:e|ing)|repetition|development loop)\b/i],
  ["feedback", /\b(?:feedback|coach(?:ing|ability|able)|defensive)\b/i],
  ["capability", /\b(?:capabilit(?:y|ies)|skills?|reliable|consistently)\b/i],
  ["current role", /\b(?:current (?:written )?role|role plan|role expectations|assigned responsibilities|manager|documented|ownership)\b/i],
]);
const STACK_CONFIRMATION_SCHEMA = "bmh-operating-stack-confirmation/v1";
const REQUIRED_STACK_EVIDENCE = new Set([
  "projects/BMH Training Course.md",
  "_Active.md",
  "BMH Training Course/Thinkific/_master-transcripts.md",
]);
const REQUIRED_STACK_RECHECK_TRIGGERS = new Set([
  "before_publication",
  "confirmation_expiry",
  "source_evidence_changed",
  "employee_manual_voice_or_text_workflow_changed",
  "jitter_employee_access_authorized",
  "course_dialpad_content_changed",
  "approved_video_cut_or_derivative_changed",
]);
const STACK_ASSETS_BY_IMPORT = new Map([
  [
    "bmh-employee-training-v1",
    [
      "video-slot-03-tech-stack",
      "caption-video-slot-03-tech-stack",
      "transcript-video-slot-03-tech-stack",
      "video-slot-18-mission-control",
      "caption-video-slot-18-mission-control",
      "transcript-video-slot-18-mission-control",
      "guide-slot-03",
      "guide-slot-18",
    ],
  ],
  [
    "bmh-employee-training-canary-v1",
    [
      "video-slot-03-tech-stack",
      "caption-video-slot-03-tech-stack",
      "transcript-video-slot-03-tech-stack",
      "guide-slot-03",
    ],
  ],
]);

export function collectDialPadReferences(value, jsonPath = "$", references = []) {
  if (typeof value === "string") {
    if (/DialPad/i.test(value)) references.push([jsonPath, value]);
    return references;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectDialPadReferences(item, `${jsonPath}[${index}]`, references),
    );
    return references;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      collectDialPadReferences(item, `${jsonPath}.${key}`, references);
    }
  }
  return references;
}

export function dialPadReferenceSha256(manifest) {
  return createHash("sha256")
    .update(JSON.stringify(collectDialPadReferences(manifest)))
    .digest("hex");
}

export function validateCareerGrowthAssessment(quiz) {
  const issues = [];
  if (!quiz || !Array.isArray(quiz.questions)) {
    return ["Career Growth assessment is missing"];
  }
  if (quiz.questions.length !== 18) {
    issues.push(`Career Growth assessment must contain exactly 18 questions, found ${quiz.questions.length}`);
  }

  const questionTypes = new Set();
  const coveredConcepts = new Set();
  for (const question of quiz.questions) {
    questionTypes.add(question.question_type);
    const serialized = JSON.stringify(question);
    if (STALE_CAREER_GROWTH_PATTERN.test(serialized)) {
      issues.push(`${question.source_key} contains a stale role-ladder or outcome promise`);
    }

    const correctAnswers = question.options
      ?.filter((option) => option.is_correct)
      .map((option) => option.option_text)
      .join(" ") ?? "";
    const groundingText = `${question.explanation ?? ""} ${correctAnswers}`;
    const matches = [...CAREER_GROWTH_GROUNDING]
      .filter(([, pattern]) => pattern.test(groundingText))
      .map(([concept]) => concept);
    if (matches.length === 0) {
      issues.push(`${question.source_key} is not grounded in the locked Career Growth lesson concepts`);
    }
    matches.forEach((concept) => coveredConcepts.add(concept));
  }

  for (const questionType of ["single_choice", "multi_select", "true_false"]) {
    if (!questionTypes.has(questionType)) {
      issues.push(`Career Growth assessment needs ${questionType} questions`);
    }
  }
  for (const concept of CAREER_GROWTH_GROUNDING.keys()) {
    if (!coveredConcepts.has(concept)) {
      issues.push(`Career Growth assessment does not cover ${concept}`);
    }
  }
  return issues;
}

export function validateStackConfirmation(
  manifest,
  confirmation,
  now = new Date(),
) {
  const issues = [];
  if (!confirmation || typeof confirmation !== "object") {
    return ["confirmation record is missing"];
  }
  if (confirmation.schema_version !== STACK_CONFIRMATION_SCHEMA) {
    issues.push("confirmation schema is unsupported");
  }
  if (confirmation.status !== "confirmed") {
    issues.push("confirmation status is not confirmed");
  }
  if (!confirmation.confirmation_id?.trim()) {
    issues.push("confirmation ID is missing");
  }
  if (confirmation.decision !== "retain-dialpad-for-employee-manual-workflow") {
    issues.push("confirmation decision does not retain the scoped employee workflow");
  }

  const nowMs = new Date(now).getTime();
  const confirmedAtMs = Date.parse(confirmation.confirmed_at);
  const expiresAtMs = Date.parse(confirmation.expires_at);
  if (!Number.isFinite(nowMs)) issues.push("validation time is invalid");
  if (!Number.isFinite(confirmedAtMs) || confirmedAtMs > nowMs) {
    issues.push("confirmation timestamp is invalid or in the future");
  }
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) {
    issues.push("confirmation is expired or has an invalid expiry");
  }
  if (
    Number.isFinite(confirmedAtMs) &&
    Number.isFinite(expiresAtMs) &&
    (expiresAtMs <= confirmedAtMs || expiresAtMs - confirmedAtMs > 8 * 24 * 60 * 60 * 1000)
  ) {
    issues.push("confirmation validity window must be positive and no longer than eight days");
  }

  const employee = confirmation.scope?.employee_manual_workflow;
  const boundaries = confirmation.scope?.system_boundaries;
  if (
    employee?.outbound_voice !== "DialPad" ||
    employee?.outbound_text !== "DialPad after manager approval" ||
    employee?.seller_email !== "Gmail after manager approval"
  ) {
    issues.push("employee manual workflow scope is incomplete or changed");
  }
  if (
    boundaries?.sandra_messaging_provider_internal !== "Sendillo" ||
    boundaries?.jitter_voice_provider_internal !== "Telnyx" ||
    boundaries?.jitter_employee_readiness !==
      "not employee-ready; Jarrad-only until Phase 2 exit"
  ) {
    issues.push("Sandra/Jitter provider boundaries are incomplete or changed");
  }

  const evidenceByPath = new Map(
    (confirmation.source_evidence ?? []).map((source) => [source.vault_path, source]),
  );
  for (const vaultPath of REQUIRED_STACK_EVIDENCE) {
    const source = evidenceByPath.get(vaultPath);
    if (
      !source ||
      !/^[a-f0-9]{64}$/.test(source.sha256 ?? "") ||
      !source.observed_updated ||
      !source.evidence?.trim()
    ) {
      issues.push(`source evidence is incomplete for ${vaultPath}`);
    }
  }
  const evidenceSha256 = createHash("sha256")
    .update(JSON.stringify(confirmation.source_evidence ?? []))
    .digest("hex");
  if (confirmation.source_evidence_sha256 !== evidenceSha256) {
    issues.push("source evidence checksum does not match the confirmation record");
  }

  const snapshot = (confirmation.manifest_snapshots ?? []).find(
    (candidate) => candidate.import_id === manifest.import_id,
  );
  const references = collectDialPadReferences(manifest);
  if (!snapshot) {
    issues.push(`manifest snapshot is missing for ${manifest.import_id}`);
  } else {
    if (snapshot.dialpad_reference_count !== references.length) {
      issues.push("DialPad reference count does not match the manifest");
    }
    if (snapshot.dialpad_reference_sha256 !== dialPadReferenceSha256(manifest)) {
      issues.push("DialPad reference checksum does not match the manifest");
    }
  }

  const assetsByKey = new Map((manifest.assets ?? []).map((asset) => [asset.source_key, asset]));
  const auditedByKey = new Map(
    (confirmation.audited_assets ?? []).map((asset) => [asset.source_key, asset]),
  );
  const requiredAssetKeys = STACK_ASSETS_BY_IMPORT.get(manifest.import_id);
  if (!requiredAssetKeys) {
    issues.push(`confirmation does not support import ${manifest.import_id}`);
  } else {
    for (const sourceKey of requiredAssetKeys) {
      const manifestAsset = assetsByKey.get(sourceKey);
      const auditedAsset = auditedByKey.get(sourceKey);
      if (!manifestAsset || !auditedAsset) {
        issues.push(`audited stack asset is missing: ${sourceKey}`);
        continue;
      }
      if (
        auditedAsset.local_path !== manifestAsset.local_path ||
        auditedAsset.checksum_sha256 !== manifestAsset.checksum_sha256 ||
        manifestAsset.approval_status !== "approved"
      ) {
        issues.push(`audited stack asset drifted: ${sourceKey}`);
      }
      if (
        !auditedAsset.audit_result?.trim() ||
        (manifestAsset.kind === "video"
          ? auditedAsset.dialpad_reference_count !== null
          : !Number.isInteger(auditedAsset.dialpad_reference_count))
      ) {
        issues.push(`audited stack result is incomplete: ${sourceKey}`);
      }
    }
  }

  const triggerSet = new Set(confirmation.recheck_triggers ?? []);
  for (const trigger of REQUIRED_STACK_RECHECK_TRIGGERS) {
    if (!triggerSet.has(trigger)) issues.push(`recheck trigger is missing: ${trigger}`);
  }
  return issues;
}

function normalizedQuestion(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function allLessons(manifest) {
  return manifest.program.courses.flatMap((course) =>
    course.modules.flatMap((module) => module.lessons),
  );
}

function allBlocks(manifest) {
  return allLessons(manifest).flatMap((lesson) => lesson.blocks ?? []);
}

function pushDuplicateErrors(items, keyFor, label, errors) {
  const seen = new Set();
  for (const item of items) {
    const key = keyFor(item);
    if (seen.has(key)) errors.push(`Duplicate ${label}: ${key}`);
    seen.add(key);
  }
}

function validateSortOrder(items, context, errors) {
  const orders = items.map((item) => item.sort_order);
  if (new Set(orders).size !== orders.length) {
    errors.push(`${context} has duplicate sort_order values`);
  }
}

export async function loadManifest(urlOrPath) {
  const raw = await readFile(urlOrPath, "utf8");
  return JSON.parse(raw);
}

export function summarizeManifest(manifest) {
  const lessons = allLessons(manifest);
  const blocks = allBlocks(manifest);
  const assets = manifest.assets ?? [];
  return {
    modules: manifest.program.courses.reduce(
      (count, course) => count + course.modules.length,
      0,
    ),
    contentLessons: lessons.filter((lesson) => lesson.type === "content").length,
    quizLessons: lessons.filter((lesson) => lesson.type === "quiz").length,
    assignmentLessons: lessons.filter((lesson) => lesson.type === "assignment").length,
    videos: blocks.filter((block) => block.type === "video").length,
    quizQuestions: lessons.reduce(
      (count, lesson) => count + (lesson.quiz?.questions.length ?? 0),
      0,
    ),
    flashcards: blocks.reduce(
      (count, block) => count + (block.type === "flashcard" ? block.content.cards.length : 0),
      0,
    ),
    rolePlays: blocks.filter((block) => block.type === "role_play").length,
    posterAssets: assets.filter((asset) => /^poster-video-slot-/.test(asset.source_key)).length,
    posterReferences: blocks.filter((block) => block.type === "video" && block.content.poster_asset_key).length,
    guideAssets: assets.filter((asset) => /^guide-slot-/.test(asset.source_key)).length,
    guideBlocks: blocks.filter((block) => block.type === "download" && /^block-guide-pdf-slot-/.test(block.source_key)).length,
  };
}

export function validateManifest(
  manifest,
  { stackConfirmation = null, now = new Date() } = {},
) {
  const errors = [];
  const publicationBlockers = [];
  const warnings = [];

  if (manifest.schema_version !== 1) errors.push("schema_version must be 1");
  if (manifest.status !== "draft") errors.push("manifest status must remain draft");
  if (manifest.program.is_published !== false) errors.push("program must be unpublished");

  const courses = manifest.program.courses ?? [];
  if (courses.length !== 1) errors.push(`Expected 1 course, found ${courses.length}`);
  for (const course of courses) {
    if (course.is_published !== false) errors.push(`${course.source_key} must be unpublished`);
    if (course.certificate_enabled !== false) {
      errors.push(`${course.source_key} course certificate must be disabled`);
    }
    validateSortOrder(course.modules, course.source_key, errors);
    for (const courseModule of course.modules) {
      validateSortOrder(courseModule.lessons, courseModule.source_key, errors);
    }
  }

  const summary = summarizeManifest(manifest);
  const expected = {
    modules: 6,
    contentLessons: 19,
    quizLessons: 19,
    assignmentLessons: 6,
    videos: 29,
    quizQuestions: 342,
    flashcards: 152,
    rolePlays: 6,
    posterAssets: 29,
    posterReferences: 29,
    guideAssets: 19,
    guideBlocks: 19,
  };
  for (const [field, count] of Object.entries(expected)) {
    if (summary[field] !== count) errors.push(`Expected ${count} ${field}, found ${summary[field]}`);
  }

  const assets = manifest.assets ?? [];
  const lessons = allLessons(manifest);
  const blocks = allBlocks(manifest);
  const allSourceKeyItems = [
    manifest.program,
    ...courses,
    ...courses.flatMap((course) => course.modules),
    ...lessons,
    ...blocks,
    ...lessons.flatMap((lesson) => lesson.quiz ? [lesson.quiz, ...lesson.quiz.questions, ...lesson.quiz.questions.flatMap((question) => question.options)] : []),
    ...lessons.flatMap((lesson) => lesson.assignment ? [lesson.assignment] : []),
    ...assets,
  ];
  pushDuplicateErrors(allSourceKeyItems, (item) => item.source_key, "source_key", errors);

  const assetsByKey = new Map(assets.map((asset) => [asset.source_key, asset]));
  const referencedAssets = new Set([
    manifest.program.thumbnail_asset_key,
    ...courses.map((course) => course.thumbnail_asset_key),
    ...lessons.map((lesson) => lesson.thumbnail_asset_key),
  ].filter(Boolean));

  for (const block of blocks) {
    if (block.content?.asset_key) referencedAssets.add(block.content.asset_key);
    if (block.type === "video") {
      for (const field of ["asset_key", "poster_asset_key", "caption_asset_key", "transcript_asset_key"]) {
        const key = block.content[field];
        if (key) referencedAssets.add(key);
      }
      const poster = assetsByKey.get(block.content.poster_asset_key);
      if (!poster || poster.kind !== "image" || !/^poster-video-slot-/.test(poster.source_key)) {
        errors.push(`${block.source_key} does not map to a dedicated poster asset`);
      }
    }
    if (block.type === "flashcard") {
      const cards = block.content.cards ?? [];
      if (cards.length < 8 || cards.length > 15) {
        errors.push(`${block.source_key} must contain 8 to 15 flashcards`);
      }
      for (const card of cards) {
        if (!card.front?.trim() || !card.back?.trim()) {
          errors.push(`${block.source_key} contains an empty flashcard side`);
        }
      }
    }
    if (block.type === "role_play" && /^pending:/i.test(block.content.scenario_id)) {
      publicationBlockers.push(`${block.source_key} needs a production Closer Lab scenario ID`);
    }
  }

  for (const key of referencedAssets) {
    if (!assetsByKey.has(key)) errors.push(`Referenced asset is missing from inventory: ${key}`);
  }
  for (const asset of assets) {
    if (asset.kind === "video" && asset.checksum_sha256 && !asset.storage_path.includes(asset.checksum_sha256)) {
      errors.push(`${asset.source_key} storage path is not checksum-derived`);
    }
    if (asset.approval_status === "hold") {
      publicationBlockers.push(`${asset.source_key} is pending Jarrad approval`);
    } else if (asset.approval_status === "missing") {
      publicationBlockers.push(`${asset.source_key} has not been produced`);
    }
  }

  const heldVideos = assets.filter(
    (asset) => asset.kind === "video" && asset.approval_status === "hold",
  );
  if (heldVideos.length !== REQUIRED_HELD_ASSETS.size) {
    errors.push(`Expected ${REQUIRED_HELD_ASSETS.size} held videos, found ${heldVideos.length}`);
  }
  for (const [sourceKey, checksum] of REQUIRED_HELD_ASSETS) {
    const asset = assetsByKey.get(sourceKey);
    if (!asset || asset.approval_status !== "hold" || asset.checksum_sha256 !== checksum) {
      errors.push(`${sourceKey} does not match the locked held-video record`);
    }
  }

  const questionTexts = [];
  for (const lesson of lessons) {
    if (lesson.type === "content") {
      if (!lesson.blocks?.length || lesson.quiz || lesson.assignment) {
        errors.push(`${lesson.source_key} must contain only content blocks`);
      }
      const guides = lesson.blocks?.filter(
        (block) => block.type === "download" && /^block-guide-pdf-slot-/.test(block.source_key),
      ) ?? [];
      if (guides.length !== 1) {
        errors.push(`${lesson.source_key} must contain exactly one accessible guide download`);
      } else {
        const guideBlock = guides[0];
        const guideAsset = assetsByKey.get(guideBlock.content.asset_key);
        if (!guideBlock.required || !guideAsset || guideAsset.kind !== "pdf" || guideBlock.content.file_path !== guideAsset.storage_path) {
          errors.push(`${lesson.source_key} guide download is not required or correctly mapped`);
        }
      }
    } else if (lesson.type === "quiz") {
      if (!lesson.quiz || lesson.blocks || lesson.assignment) {
        errors.push(`${lesson.source_key} must contain only quiz configuration`);
        continue;
      }
      const quiz = lesson.quiz;
      if (quiz.questions.length < 15 || quiz.questions.length > 20) {
        errors.push(`${quiz.source_key} must contain 15 to 20 curated questions`);
      }
      if (quiz.passing_score !== 80 || quiz.questions_per_attempt !== 10) {
        errors.push(`${quiz.source_key} must use an 80% passing score and 10 questions per attempt`);
      }
      if (!quiz.randomize_questions || !quiz.randomize_answers || quiz.max_attempts !== null || quiz.retake_cooldown_hours !== 0 || quiz.show_correct_answers_after !== "after_pass") {
        errors.push(`${quiz.source_key} does not match the locked attempt policy`);
      }
      validateSortOrder(quiz.questions, quiz.source_key, errors);
      for (const question of quiz.questions) {
        questionTexts.push(question.question_text);
        validateSortOrder(question.options, question.source_key, errors);
        const correct = question.options.filter((option) => option.is_correct).length;
        if (question.question_type === "multi_select" ? correct < 2 : correct !== 1) {
          errors.push(`${question.source_key} has an invalid number of correct options`);
        }
        if (!question.explanation?.trim()) {
          errors.push(`${question.source_key} needs a learner explanation`);
        }
      }
    } else if (lesson.type === "assignment") {
      if (!lesson.assignment || lesson.blocks || lesson.quiz) {
        errors.push(`${lesson.source_key} must contain only assignment configuration`);
      } else if (!lesson.assignment.requires_review || lesson.assignment.rubric.length < 3) {
        errors.push(`${lesson.assignment.source_key} needs review and at least 3 rubric criteria`);
      }
    }
  }
  pushDuplicateErrors(questionTexts, normalizedQuestion, "question text", errors);

  const serialized = JSON.stringify(manifest);
  if (/Cold Call Blueprint/i.test(serialized)) errors.push("Wrong-track Cold Call Blueprint is referenced");
  const compensationAndCareer = lessons
    .filter((lesson) => /slot-(?:17|19)$/.test(lesson.source_key))
    .map((lesson) => JSON.stringify(lesson))
    .join(" ");
  if (STALE_COMPENSATION_PATTERN.test(compensationAndCareer)) errors.push("Stale compensation promise detected");
  if (/What is the specific daily target range for dial count/i.test(serialized)) {
    errors.push("Removed KPI daily-scoreboard question is present");
  }
  const kpiLesson = lessons.find((lesson) => lesson.source_key === "lesson-quiz-slot-16");
  const kpiQuestions = JSON.stringify(kpiLesson?.quiz?.questions ?? []);
  if (/target percentage|drops below what percentage|daily target range/i.test(kpiQuestions)) {
    errors.push("Removed KPI numeric target content is present");
  }
  const missionControlLesson = lessons.find((lesson) => lesson.source_key === "lesson-quiz-slot-18");
  const missionControlQuestions = JSON.stringify(missionControlLesson?.quiz?.questions ?? []);
  if (/how many dials should you aim|110 to 150 dials|150 to 200 total dials/i.test(missionControlQuestions)) {
    errors.push("Fixed daily dial targets are present in Mission Control assessment content");
  }
  const careerGrowthLesson = lessons.find((lesson) => lesson.source_key === "lesson-quiz-slot-19");
  errors.push(...validateCareerGrowthAssessment(careerGrowthLesson?.quiz));
  if (/DialPad/i.test(serialized)) {
    const stackIssues = validateStackConfirmation(manifest, stackConfirmation, now);
    if (stackIssues.length > 0) {
      publicationBlockers.push(
        `DialPad references require a valid current-stack confirmation: ${stackIssues.join("; ")}`,
      );
    } else {
      warnings.push(
        `DialPad employee workflow confirmation ${stackConfirmation.confirmation_id} expires ${stackConfirmation.expires_at} and must still be rechecked before publication`,
      );
    }
  }

  if (publicationBlockers.length === 0) {
    warnings.push("Draft has no publication blockers. Confirm approvals were intentionally cleared.");
  }

  return { errors, publicationBlockers, warnings, summary };
}

async function main() {
  const manifestPath = process.argv[2];
  if (!manifestPath) {
    throw new Error(
      "Usage: node scripts/course-content/validate-manifest.mjs <manifest.json> [stack-confirmation.json]",
    );
  }
  const manifest = await loadManifest(manifestPath);
  const confirmationPath =
    process.argv[3] ??
    join(dirname(manifestPath), "bmh-operating-stack-confirmation.v1.json");
  let stackConfirmation = null;
  try {
    stackConfirmation = await loadManifest(confirmationPath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const report = validateManifest(manifest, { stackConfirmation });
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.errors.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
