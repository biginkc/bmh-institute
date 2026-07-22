import { randomBytes, randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

const url = process.env.TEST_SUPABASE_URL;
const anonKey = process.env.TEST_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const envPresent = Boolean(url && anonKey && serviceRoleKey);

const admin = envPresent
  ? createClient(url!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

type RpcResult = {
  data: Array<{
    responses: Record<string, string[]>;
    completed_at: string | null;
    already_answered: boolean;
  }> | null;
  error: { message: string } | null;
};

function recordAnswer(
  client: SupabaseClient,
  attemptId: string,
  questionId: string,
  selected: string[],
): PromiseLike<RpcResult> {
  return client.rpc("fn_record_quiz_answer", {
    p_attempt_id: attemptId,
    p_question_id: questionId,
    p_selected: selected,
  }) as unknown as PromiseLike<RpcResult>;
}

async function waitForProfile(userId: string): Promise<void> {
  if (!admin) return;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data } = await admin
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (data) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Test learner profile was not created.");
}

describe.skipIf(!envPresent)("atomic quiz answer recording", () => {
  it("enforces ownership and first-answer locks while preserving concurrent answers", async () => {
    if (!admin || !url || !anonKey) {
      throw new Error("Integration clients unavailable.");
    }
    const suffix = randomBytes(8).toString("hex");
    const password = `${randomBytes(24).toString("base64url")}!Aa1`;
    const ownerEmail = `quiz-answer-owner-${suffix}@bmh.invalid`;
    const otherEmail = `quiz-answer-other-${suffix}@bmh.invalid`;
    let ownerId: string | null = null;
    let otherId: string | null = null;
    let courseId: string | null = null;
    let quizId: string | null = null;
    let roleGroupId: string | null = null;
    try {
      const ownerCreated = await admin.auth.admin.createUser({
        email: ownerEmail,
        password,
        email_confirm: true,
      });
      if (ownerCreated.error || !ownerCreated.data.user) {
        throw ownerCreated.error ?? new Error("Owner learner creation failed.");
      }
      ownerId = ownerCreated.data.user.id;

      const otherCreated = await admin.auth.admin.createUser({
        email: otherEmail,
        password,
        email_confirm: true,
      });
      if (otherCreated.error || !otherCreated.data.user) {
        throw otherCreated.error ?? new Error("Other learner creation failed.");
      }
      otherId = otherCreated.data.user.id;
      await Promise.all([waitForProfile(ownerId), waitForProfile(otherId)]);

      const owner = createClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const other = createClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const anonymous = createClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const [ownerSignIn, otherSignIn] = await Promise.all([
        owner.auth.signInWithPassword({ email: ownerEmail, password }),
        other.auth.signInWithPassword({ email: otherEmail, password }),
      ]);
      if (ownerSignIn.error) throw ownerSignIn.error;
      if (otherSignIn.error) throw otherSignIn.error;

      const course = await admin
        .from("courses")
        .insert({ title: `Quiz answer integration ${suffix}`, is_published: true })
        .select("id")
        .single();
      if (course.error || !course.data) throw course.error;
      courseId = course.data.id;
      const roleGroup = await admin
        .from("role_groups")
        .insert({ name: `Quiz answer integration ${suffix}` })
        .select("id")
        .single();
      if (roleGroup.error || !roleGroup.data) throw roleGroup.error;
      roleGroupId = roleGroup.data.id;
      const access = await admin.from("course_access").insert({
        course_id: courseId,
        role_group_id: roleGroupId,
      });
      if (access.error) throw access.error;
      const memberships = await admin.from("user_role_groups").insert([
        { user_id: ownerId, role_group_id: roleGroupId },
        { user_id: otherId, role_group_id: roleGroupId },
      ]);
      if (memberships.error) throw memberships.error;
      const courseModule = await admin
        .from("modules")
        .insert({ course_id: courseId, title: "Quiz answer module" })
        .select("id")
        .single();
      if (courseModule.error || !courseModule.data) throw courseModule.error;
      const quiz = await admin
        .from("quizzes")
        .insert({ title: `Quiz answer integration ${suffix}` })
        .select("id")
        .single();
      if (quiz.error || !quiz.data) throw quiz.error;
      quizId = quiz.data.id;
      const lesson = await admin
        .from("lessons")
        .insert({
          module_id: courseModule.data.id,
          title: "Quiz answer lesson",
          lesson_type: "quiz",
          quiz_id: quizId,
        })
        .select("id")
        .single();
      if (lesson.error || !lesson.data) throw lesson.error;
      const questions = await admin
        .from("questions")
        .insert([
          {
            quiz_id: quizId,
            question_text: "First question",
            question_type: "single_choice",
            sort_order: 1,
          },
          {
            quiz_id: quizId,
            question_text: "Second question",
            question_type: "single_choice",
            sort_order: 2,
          },
          {
            quiz_id: quizId,
            question_text: "Multi-select question",
            question_type: "multi_select",
            sort_order: 3,
          },
        ])
        .select("id, sort_order");
      if (questions.error || !questions.data) throw questions.error;
      const questionOne = questions.data.find((row) => row.sort_order === 1)?.id;
      const questionTwo = questions.data.find((row) => row.sort_order === 2)?.id;
      const questionMulti = questions.data.find((row) => row.sort_order === 3)?.id;
      if (!questionOne || !questionTwo || !questionMulti) {
        throw new Error("Questions were not created.");
      }
      const options = await admin
        .from("answer_options")
        .insert([
          { question_id: questionOne, option_text: "Q1 A", sort_order: 1 },
          { question_id: questionOne, option_text: "Q1 B", sort_order: 2 },
          { question_id: questionTwo, option_text: "Q2 A", sort_order: 1 },
          { question_id: questionTwo, option_text: "Q2 B", sort_order: 2 },
          { question_id: questionMulti, option_text: "Multi A", sort_order: 1 },
          { question_id: questionMulti, option_text: "Multi B", sort_order: 2 },
        ])
        .select("id, question_id, sort_order");
      if (options.error || !options.data) throw options.error;
      const option = (questionId: string, sortOrder: number) => {
        const id = options.data.find(
          (row) => row.question_id === questionId && row.sort_order === sortOrder,
        )?.id;
        if (!id) throw new Error("Answer option was not created.");
        return id;
      };
      const q1a = option(questionOne, 1);
      const q1b = option(questionOne, 2);
      const q2a = option(questionTwo, 1);
      const q2b = option(questionTwo, 2);
      const multiA = option(questionMulti, 1);
      const multiB = option(questionMulti, 2);

      const createAttempt = async (questionOrder: string[]) => {
        const answerOrders = Object.fromEntries(questionOrder.map((id) => [
          id,
          id === questionOne
            ? [q1a, q1b]
            : id === questionTwo
              ? [q2a, q2b]
              : [multiA, multiB],
        ]));
        const result = await admin
          .from("user_quiz_attempts")
          .insert({
            user_id: ownerId,
            quiz_id: quizId,
            lesson_id: lesson.data.id,
            question_order: questionOrder,
            answer_orders: answerOrders,
            responses: {},
          })
          .select("id")
          .single();
        if (result.error || !result.data) throw result.error;
        return result.data.id;
      };

      const invalidCardinalityAttempt = await createAttempt([questionOne]);
      const invalidCardinality = await recordAnswer(
        owner,
        invalidCardinalityAttempt,
        questionOne,
        [q1a, q1b],
      );
      expect(invalidCardinality.error?.message).toContain(
        "invalid or duplicate answers",
      );
      const invalidCardinalityStored = await admin
        .from("user_quiz_attempts")
        .select("responses")
        .eq("id", invalidCardinalityAttempt)
        .single();
      expect(invalidCardinalityStored.error).toBeNull();
      expect(invalidCardinalityStored.data?.responses).toEqual({});
      const invalidCardinalityCleanup = await admin
        .from("user_quiz_attempts")
        .delete()
        .eq("id", invalidCardinalityAttempt);
      if (invalidCardinalityCleanup.error) throw invalidCardinalityCleanup.error;

      const multiSelectAttempt = await createAttempt([questionMulti]);
      const multiSelect = await recordAnswer(
        owner,
        multiSelectAttempt,
        questionMulti,
        [multiA, multiB],
      );
      expect(multiSelect.error).toBeNull();
      expect(multiSelect.data?.[0].responses).toEqual({
        [questionMulti]: [multiA, multiB],
      });
      const multiSelectCleanup = await admin
        .from("user_quiz_attempts")
        .delete()
        .eq("id", multiSelectAttempt);
      if (multiSelectCleanup.error) throw multiSelectCleanup.error;

      const firstAttempt = await createAttempt([questionOne]);
      const first = await recordAnswer(owner, firstAttempt, questionOne, [q1a]);
      expect(first.error).toBeNull();
      expect(first.data?.[0]).toMatchObject({
        already_answered: false,
        responses: { [questionOne]: [q1a] },
      });
      const replay = await recordAnswer(owner, firstAttempt, questionOne, [q1a]);
      expect(replay.error).toBeNull();
      expect(replay.data?.[0].already_answered).toBe(true);
      const changed = await recordAnswer(owner, firstAttempt, questionOne, [q1b]);
      expect(changed.error?.message).toContain("already been answered");
      const outsideQuestion = await recordAnswer(owner, firstAttempt, questionTwo, [q2a]);
      expect(outsideQuestion.error?.message).toContain("question outside this attempt");
      const outsideOption = await recordAnswer(owner, firstAttempt, questionOne, [randomUUID()]);
      expect(outsideOption.error?.message).toContain("answer outside this attempt");
      const duplicate = await recordAnswer(owner, firstAttempt, questionOne, [q1a, q1a]);
      expect(duplicate.error?.message).toContain("invalid or duplicate answers");
      const wrongOwner = await recordAnswer(other, firstAttempt, questionOne, [q1a]);
      expect(wrongOwner.error?.message).toContain("Attempt not found");
      const anonymousCall = await recordAnswer(anonymous, firstAttempt, questionOne, [q1a]);
      expect(anonymousCall.error?.message).toMatch(/permission denied/i);

      const completed = await admin
        .from("user_quiz_attempts")
        .update({ completed_at: new Date().toISOString(), score: 100, passed: true })
        .eq("id", firstAttempt);
      if (completed.error) throw completed.error;
      const afterCompletion = await recordAnswer(owner, firstAttempt, questionOne, [q1a]);
      expect(afterCompletion.error?.message).toContain("already been submitted");

      const distinctAttempt = await createAttempt([questionOne, questionTwo]);
      const distinctResults = await Promise.all([
        recordAnswer(owner, distinctAttempt, questionOne, [q1a]),
        recordAnswer(owner, distinctAttempt, questionTwo, [q2a]),
      ]);
      expect(distinctResults.every((result) => result.error === null)).toBe(true);
      const distinctStored = await admin
        .from("user_quiz_attempts")
        .select("responses")
        .eq("id", distinctAttempt)
        .single();
      expect(distinctStored.data?.responses).toEqual({
        [questionOne]: [q1a],
        [questionTwo]: [q2a],
      });
      const completeDistinct = await admin
        .from("user_quiz_attempts")
        .update({ completed_at: new Date().toISOString() })
        .eq("id", distinctAttempt);
      if (completeDistinct.error) throw completeDistinct.error;

      const sameQuestionAttempt = await createAttempt([questionOne]);
      const sameQuestionResults = await Promise.all([
        recordAnswer(owner, sameQuestionAttempt, questionOne, [q1a]),
        recordAnswer(owner, sameQuestionAttempt, questionOne, [q1b]),
      ]);
      expect(sameQuestionResults.filter((result) => result.error === null)).toHaveLength(1);
      expect(sameQuestionResults.find((result) => result.error)?.error?.message)
        .toContain("already been answered");
      const sameQuestionStored = await admin
        .from("user_quiz_attempts")
        .select("responses")
        .eq("id", sameQuestionAttempt)
        .single();
      const persistedSelection = (
        sameQuestionStored.data?.responses as Record<string, string[]>
      )[questionOne];
      expect([[q1a], [q1b]]).toContainEqual(persistedSelection);
    } finally {
      const cleanupFailures: string[] = [];
      const userIds = [ownerId, otherId].filter(
        (id): id is string => Boolean(id),
      );
      for (const userId of userIds) {
        const { error } = await admin.auth.admin.deleteUser(userId);
        if (error) cleanupFailures.push(`auth user ${userId}: ${error.message}`);
      }
      if (courseId) {
        const { error } = await admin.from("courses").delete().eq("id", courseId);
        if (error) cleanupFailures.push(`course ${courseId}: ${error.message}`);
      }
      if (quizId) {
        const { error } = await admin.from("quizzes").delete().eq("id", quizId);
        if (error) cleanupFailures.push(`quiz ${quizId}: ${error.message}`);
      }
      if (roleGroupId) {
        const { error } = await admin.from("role_groups").delete().eq("id", roleGroupId);
        if (error) cleanupFailures.push(`role group ${roleGroupId}: ${error.message}`);
      }

      if (userIds.length) {
        const { data, error } = await admin
          .from("profiles")
          .select("id")
          .in("id", userIds);
        if (error) cleanupFailures.push(`profile verification: ${error.message}`);
        for (const row of data ?? []) {
          cleanupFailures.push(`profile ${row.id}: still present`);
        }
      }
      if (courseId) {
        const { data, error } = await admin
          .from("courses")
          .select("id")
          .eq("id", courseId);
        if (error) cleanupFailures.push(`course verification ${courseId}: ${error.message}`);
        if (data?.length) cleanupFailures.push(`course ${courseId}: still present`);
      }
      if (quizId) {
        const { data, error } = await admin
          .from("quizzes")
          .select("id")
          .eq("id", quizId);
        if (error) cleanupFailures.push(`quiz verification ${quizId}: ${error.message}`);
        if (data?.length) cleanupFailures.push(`quiz ${quizId}: still present`);
      }
      if (cleanupFailures.length) {
        throw new Error(`TEST fixture cleanup failed: ${cleanupFailures.join("; ")}`);
      }
    }
  });
});
