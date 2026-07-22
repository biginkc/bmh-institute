import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { validateCourseManifest } from "../../src/lib/course-import/manifest";
import { atomicImportOperations } from "../../src/lib/course-import/execute";
import { buildImportPlan, deterministicImportId } from "../../src/lib/course-import/operations";
import {
  buildReleasedQuizGraph,
  extractQuizGraph,
  releasedQuizGraphSha256,
  releasedQuizRollbackConfirmation,
  releasedQuizRevisionConfirmation,
} from "../../src/lib/course-import/released-quiz-revision";

const IMPORT_ID = "bmh-employee-training-v1";
const LEGACY_PATH = resolve(
  "content/course-manifests/archive/bmh-employee-training.legacy-release-20260721.v1.json",
);
const ACTIVE_PATH = resolve("content/course-manifests/bmh-employee-training.v1.json");

function sqlJson(value: unknown) {
  return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
}

function sqlText(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

async function loadPlan(path: string) {
  const bytes = await readFile(path);
  const parsed = JSON.parse(bytes.toString("utf8")) as unknown;
  const validated = validateCourseManifest(parsed, { gate: "draft" });
  if (!validated.ok) throw new Error(validated.errors.join("\n"));
  return {
    bytes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    plan: buildImportPlan(validated.value, { allowUnapprovedAssetPlaceholders: true }),
  };
}

async function sha256(path: string) {
  return createHash("sha256").update(await readFile(resolve(path))).digest("hex");
}

async function main() {
  const [legacy, active] = await Promise.all([loadPlan(LEGACY_PATH), loadPlan(ACTIVE_PATH)]);
  const legacyGraph = extractQuizGraph(legacy.plan);
  const activeGraph = buildReleasedQuizGraph(active.plan);
  if (legacyGraph.quizzes.length !== 19 || legacyGraph.questions.length !== 342) {
    throw new Error("Legacy rehearsal fixture must contain exactly 19 quizzes and 342 questions.");
  }

  const programId = deterministicImportId(IMPORT_ID, "program-bmh-employee-training");
  const qaRoleId = deterministicImportId(IMPORT_ID, "role-group-bmh-content-qa");
  const employeeRoleId = deterministicImportId(IMPORT_ID, "rehearsal-employee-role");
  const humanizingQuizId = deterministicImportId(IMPORT_ID, "quiz-slot-04");
  const humanizingLessonId = deterministicImportId(IMPORT_ID, "lesson-quiz-slot-04");
  const reviewerQuestionId = String(activeGraph.questions[0].id);
  const reviewerAnswerOptionId = String(activeGraph.answer_options.find(
    (option) => option.question_id === reviewerQuestionId,
  )?.id);
  if (!reviewerAnswerOptionId) throw new Error("Rehearsal graph needs an answer option for reviewer evidence.");
  const evidence = {
    operation: "release",
    question_bank_sha256: await sha256("content/quiz-generation/question-bank.v1.json"),
    approval_request_sha256: await sha256("docs/course-production/quiz-content-review-request.v1.json"),
    approval_ledger_sha256: await sha256("docs/course-production/quiz-approvals.json"),
    rollback_sha256: createHash("sha256").update("rehearsal rollback").digest("hex"),
    client_graph_sha256: releasedQuizGraphSha256(activeGraph),
  };
  const forwardConfirmation = releasedQuizRevisionConfirmation({
    importId: IMPORT_ID,
    priorManifestSha256: legacy.sha256,
    manifestSha256: active.sha256,
  });
  const stalePriorManifestSha256 = "0".repeat(64);
  const stalePriorConfirmation = releasedQuizRevisionConfirmation({
    importId: IMPORT_ID,
    priorManifestSha256: stalePriorManifestSha256,
    manifestSha256: active.sha256,
  });
  const rollbackConfirmation = releasedQuizRollbackConfirmation({
    importId: IMPORT_ID,
    expectedRevision: 2,
    manifestSha256: active.sha256,
    priorManifestSha256: legacy.sha256,
    rollbackSha256: evidence.rollback_sha256,
  });

  const sql = `
begin;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('bmh.apply_import_id', ${sqlText(IMPORT_ID)}, true);
select public.fn_apply_course_import(${sqlText(IMPORT_ID)}, ${sqlJson(atomicImportOperations(legacy.plan))});
select set_config('bmh.apply_import_id', '', true);

insert into public.role_groups (id, name, description)
values (${sqlText(employeeRoleId)}::uuid, 'Quiz revision rehearsal employee', 'Transaction-scoped rehearsal role');

select set_config('bmh.release_import_id', ${sqlText(IMPORT_ID)}, true);
insert into public.content_import_release_records (
  import_id, program_id, qa_role_group_id, employee_role_group_id,
  manifest_sha256, reconciliation_sha256, catalog_sha256,
  rollback_rehearsal_sha256, chrome_desktop_sha256, chrome_mobile_sha256,
  admin_happy_path_sha256, approval_sha256, approved_by, evidence
) values (
  ${sqlText(IMPORT_ID)}, ${sqlText(programId)}::uuid, ${sqlText(qaRoleId)}::uuid,
  ${sqlText(employeeRoleId)}::uuid, ${sqlText(legacy.sha256)}, ${sqlText("1".repeat(64))},
  public.fn_course_import_catalog_sha256(${sqlText(IMPORT_ID)}), ${sqlText("2".repeat(64))},
  ${sqlText("3".repeat(64))}, ${sqlText("4".repeat(64))}, ${sqlText("5".repeat(64))},
  ${sqlText("6".repeat(64))}, 'Jarrad Henry', '{}'::jsonb
);
update public.courses set is_published = true where content_import_id = ${sqlText(IMPORT_ID)};
update public.programs set is_published = true where content_import_id = ${sqlText(IMPORT_ID)};
insert into public.program_access (program_id, role_group_id)
values (${sqlText(programId)}::uuid, ${sqlText(employeeRoleId)}::uuid);
select set_config('bmh.release_import_id', '', true);

do $$
begin
  begin
    perform public.fn_revise_released_quizzes_v1(
      ${sqlText(IMPORT_ID)}, ${sqlText(legacy.sha256)}, ${sqlText(active.sha256)},
      ${sqlJson(activeGraph.quizzes)}, ${sqlJson(activeGraph.questions)},
      ${sqlJson(activeGraph.answer_options)}, ${sqlJson(evidence)},
      ${sqlText(`${forwardConfirmation}-invalid`)}
    );
    raise exception 'Forward revision unexpectedly accepted a confirmation mismatch.';
  exception when sqlstate '22023' then
    null;
  end;
  if exists (select 1 from public.content_import_release_revisions where import_id = ${sqlText(IMPORT_ID)}) then
    raise exception 'Confirmation-mismatch refusal created a release revision.';
  end if;
end;
$$;

do $$
begin
  begin
    perform public.fn_revise_released_quizzes_v1(
      ${sqlText(IMPORT_ID)}, ${sqlText(stalePriorManifestSha256)}, ${sqlText(active.sha256)},
      ${sqlJson(activeGraph.quizzes)}, ${sqlJson(activeGraph.questions)},
      ${sqlJson(activeGraph.answer_options)}, ${sqlJson(evidence)},
      ${sqlText(stalePriorConfirmation)}
    );
    raise exception 'Forward revision unexpectedly accepted a stale compare-and-swap manifest.';
  exception when sqlstate '40001' then
    null;
  end;
  if exists (select 1 from public.content_import_release_revisions where import_id = ${sqlText(IMPORT_ID)}) then
    raise exception 'Stale compare-and-swap refusal created a release revision.';
  end if;
end;
$$;

do $$
begin
  begin
    update public.quizzes
    set questions_per_attempt = 9
    where id = ${sqlText(humanizingQuizId)}::uuid;
    perform public.fn_revise_released_quizzes_v1(
      ${sqlText(IMPORT_ID)}, ${sqlText(legacy.sha256)}, ${sqlText(active.sha256)},
      ${sqlJson(activeGraph.quizzes)}, ${sqlJson(activeGraph.questions)},
      ${sqlJson(activeGraph.answer_options)}, ${sqlJson(evidence)},
      ${sqlText(forwardConfirmation)}
    );
    raise exception 'Forward revision unexpectedly accepted a drifted legacy graph.';
  exception when sqlstate '40001' then
    null;
  end;
  if exists (
    select 1 from public.quizzes
    where id = ${sqlText(humanizingQuizId)}::uuid and questions_per_attempt is distinct from 10
  ) or exists (
    select 1 from public.content_import_release_revisions where import_id = ${sqlText(IMPORT_ID)}
  ) then
    raise exception 'Drifted-legacy refusal did not restore the exact preflight fixture.';
  end if;
end;
$$;

insert into public.user_quiz_attempts (
  user_id, quiz_id, lesson_id, score, passed, completed_at,
  question_order, answer_orders, responses, answer_results, grading_snapshot_state
)
select profile.id, ${sqlText(humanizingQuizId)}::uuid, ${sqlText(humanizingLessonId)}::uuid,
  100, true, now(), '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'native'
from public.profiles profile order by profile.id limit 1;

do $$
begin
  if not exists (
    select 1 from public.user_quiz_attempts
    where quiz_id = ${sqlText(humanizingQuizId)}::uuid and completed_at is not null
  ) then
    raise exception 'Rehearsal requires a profile and failed to create the completed-attempt fixture.';
  end if;
  begin
    perform public.fn_revise_released_quizzes_v1(
      ${sqlText(IMPORT_ID)}, ${sqlText(legacy.sha256)}, ${sqlText(active.sha256)},
      ${sqlJson(activeGraph.quizzes)}, ${sqlJson(activeGraph.questions)},
      ${sqlJson(activeGraph.answer_options)}, ${sqlJson(evidence)},
      ${sqlText(forwardConfirmation)}
    );
    raise exception 'Forward revision unexpectedly accepted completed quiz activity.';
  exception when sqlstate '23503' then
    null;
  end;
end;
$$;

delete from public.user_quiz_attempts
where quiz_id = ${sqlText(humanizingQuizId)}::uuid and completed_at is not null;

insert into public.user_quiz_attempts (
  user_id, quiz_id, lesson_id, question_order, answer_orders,
  responses, answer_results, grading_snapshot_state
)
select profile.id, ${sqlText(humanizingQuizId)}::uuid, ${sqlText(humanizingLessonId)}::uuid,
  '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'native'
from public.profiles profile order by profile.id limit 1;

do $$
begin
  if not exists (
    select 1 from public.user_quiz_attempts where quiz_id = ${sqlText(humanizingQuizId)}::uuid
  ) then
    raise exception 'Rehearsal requires a profile and failed to create the incomplete attempt fixture.';
  end if;
end;
$$;

select public.fn_revise_released_quizzes_v1(
  ${sqlText(IMPORT_ID)}, ${sqlText(legacy.sha256)}, ${sqlText(active.sha256)},
  ${sqlJson(activeGraph.quizzes)}, ${sqlJson(activeGraph.questions)},
  ${sqlJson(activeGraph.answer_options)}, ${sqlJson(evidence)},
  ${sqlText(forwardConfirmation)}
);

do $$
begin
  if (select manifest_sha256 from public.content_import_release_records where import_id = ${sqlText(IMPORT_ID)}) <> ${sqlText(legacy.sha256)}
    or (select active_revision from public.content_import_active_release_v1 where import_id = ${sqlText(IMPORT_ID)}) <> 2
    or (select active_manifest_sha256 from public.content_import_active_release_v1 where import_id = ${sqlText(IMPORT_ID)}) <> ${sqlText(active.sha256)}
    or (select count(*) from public.questions where quiz_id in (select quiz_id from public.lessons where content_import_id = ${sqlText(IMPORT_ID)})) <> 920
    or exists (select 1 from public.quizzes where id in (select quiz_id from public.lessons where content_import_id = ${sqlText(IMPORT_ID)}) and questions_per_attempt is not null)
    or exists (select 1 from public.user_quiz_attempts where quiz_id = ${sqlText(humanizingQuizId)}::uuid)
  then
    raise exception 'Forward released quiz revision rehearsal did not reconcile exactly.';
  end if;
end;
$$;

do $$
declare
  retry_result jsonb;
begin
  retry_result := public.fn_revise_released_quizzes_v1(
    ${sqlText(IMPORT_ID)}, ${sqlText(legacy.sha256)}, ${sqlText(active.sha256)},
    ${sqlJson(activeGraph.quizzes)}, ${sqlJson(activeGraph.questions)},
    ${sqlJson(activeGraph.answer_options)}, ${sqlJson(evidence)},
    ${sqlText(forwardConfirmation)}
  );
  if retry_result ->> 'status' <> 'already_revised'
    or (select count(*) from public.content_import_release_revisions where import_id = ${sqlText(IMPORT_ID)}) <> 1
  then
    raise exception 'Idempotent revision retry did not return the exact committed revision.';
  end if;
end;
$$;

do $$
begin
  begin
    update public.content_import_release_revisions
    set evidence = evidence
    where import_id = ${sqlText(IMPORT_ID)} and revision = 2;
    raise exception 'Release revision immutability trigger unexpectedly allowed an update.';
  exception when sqlstate '42501' then
    null;
  end;
  begin
    delete from public.content_import_release_revisions
    where import_id = ${sqlText(IMPORT_ID)} and revision = 2;
    raise exception 'Release revision immutability trigger unexpectedly allowed a delete.';
  exception when sqlstate '42501' then
    null;
  end;
  if (select count(*) from public.content_import_release_revisions where import_id = ${sqlText(IMPORT_ID)}) <> 1 then
    raise exception 'Immutability-trigger refusal changed the release revision ledger.';
  end if;
end;
$$;

insert into public.course_import_reviewer_answer_options_v1 (
  answer_option_id, program_id, import_id, reviewer_user_id, question_id
)
select ${sqlText(reviewerAnswerOptionId)}::uuid, ${sqlText(programId)}::uuid,
  ${sqlText(IMPORT_ID)}, profile.id, ${sqlText(reviewerQuestionId)}::uuid
from public.profiles profile order by profile.id limit 1;

do $$
begin
  if not exists (
    select 1 from public.course_import_reviewer_answer_options_v1
    where import_id = ${sqlText(IMPORT_ID)}
  ) then
    raise exception 'Rehearsal failed to create reviewer-evidence fixture.';
  end if;
  begin
    perform public.fn_rollback_released_quiz_revision_v1(
      ${sqlText(IMPORT_ID)}, 2,
      ${sqlJson({ operation: "rollback", rollback_sha256: evidence.rollback_sha256 })},
      ${sqlText(rollbackConfirmation)}
    );
    raise exception 'Rollback unexpectedly accepted reviewer-authored evidence.';
  exception when sqlstate '23503' then
    null;
  end;
end;
$$;

delete from public.course_import_reviewer_answer_options_v1
where import_id = ${sqlText(IMPORT_ID)};

insert into public.user_quiz_attempts (
  user_id, quiz_id, lesson_id, question_order, answer_orders,
  responses, answer_results, grading_snapshot_state
)
select profile.id, ${sqlText(humanizingQuizId)}::uuid, ${sqlText(humanizingLessonId)}::uuid,
  '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'native'
from public.profiles profile order by profile.id limit 1;

do $$
begin
  if not exists (
    select 1 from public.user_quiz_attempts where quiz_id = ${sqlText(humanizingQuizId)}::uuid
  ) then
    raise exception 'Rehearsal failed to create the rollback incomplete-attempt fixture.';
  end if;
end;
$$;

select public.fn_rollback_released_quiz_revision_v1(
  ${sqlText(IMPORT_ID)}, 2,
  ${sqlJson({ operation: "rollback", rollback_sha256: evidence.rollback_sha256 })},
  ${sqlText(rollbackConfirmation)}
);

do $$
begin
  if (select manifest_sha256 from public.content_import_release_records where import_id = ${sqlText(IMPORT_ID)}) <> ${sqlText(legacy.sha256)}
    or (select active_revision from public.content_import_active_release_v1 where import_id = ${sqlText(IMPORT_ID)}) <> 3
    or (select active_manifest_sha256 from public.content_import_active_release_v1 where import_id = ${sqlText(IMPORT_ID)}) <> ${sqlText(legacy.sha256)}
    or (select count(*) from public.questions where quiz_id in (select quiz_id from public.lessons where content_import_id = ${sqlText(IMPORT_ID)})) <> 342
    or exists (select 1 from public.quizzes where id in (select quiz_id from public.lessons where content_import_id = ${sqlText(IMPORT_ID)}) and questions_per_attempt <> 10)
    or exists (select 1 from public.user_quiz_attempts where quiz_id = ${sqlText(humanizingQuizId)}::uuid)
  then
    raise exception 'Released quiz revision rollback rehearsal did not restore the exact legacy graph.';
  end if;
end;
$$;

do $$
begin
  begin
    perform public.fn_rollback_released_quiz_revision_v1(
      ${sqlText(IMPORT_ID)}, 3,
      ${sqlJson({ operation: "rollback", rollback_sha256: evidence.rollback_sha256 })},
      'ROLLBACK-RELEASED-QUIZZES:' || ${sqlText(IMPORT_ID)} || ':3:'
        || ${sqlText(legacy.sha256)} || ':' || ${sqlText(active.sha256)} || ':'
        || ${sqlText(evidence.rollback_sha256)}
    );
    raise exception 'Second rollback unexpectedly succeeded.';
  exception when sqlstate '22023' then
    null;
  end;
  if (select active_revision from public.content_import_active_release_v1 where import_id = ${sqlText(IMPORT_ID)}) <> 3
    or (select count(*) from public.questions where quiz_id in (
      select quiz_id from public.lessons where content_import_id = ${sqlText(IMPORT_ID)}
    )) <> 342
  then
    raise exception 'Refused second rollback changed the released graph.';
  end if;
end;
$$;

rollback;
select jsonb_build_object(
  'status', 'passed',
  'forward_revision', 2,
  'rollback_revision', 3,
  'forward_questions', 920,
  'rollback_questions', 342,
  'legacy_manifest_sha256', ${sqlText(legacy.sha256)},
  'active_manifest_sha256', ${sqlText(active.sha256)}
) as released_quiz_revision_rehearsal;
`;
  process.stdout.write(sql);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
