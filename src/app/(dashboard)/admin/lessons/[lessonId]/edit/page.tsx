import Link from "next/link";
import { notFound } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

import { LessonDetailsForm } from "./lesson-details-form";
import { BlocksEditor, type BlockRow } from "./blocks-editor";
import { QuizEditor, type QuestionRow, type QuizSettings } from "./quiz-editor";
import {
  AssignmentEditor,
  type AssignmentSettings,
} from "./assignment-editor";

export default async function EditLessonPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  const supabase = await createClient();

  const { data: lesson } = await supabase
    .from("lessons")
    .select(
      `
      id,
      title,
      description,
      lesson_type,
      quiz_id,
      assignment_id,
      is_required_for_completion,
      module_id,
      modules ( id, title, course_id )
    `,
    )
    .eq("id", lessonId)
    .maybeSingle();

  if (!lesson) notFound();

  const moduleRow = firstRow(lesson.modules) as
    | { id: string; title: string; course_id: string }
    | null;
  const courseId = moduleRow?.course_id;

  const lessonType = lesson.lesson_type as "content" | "quiz" | "assignment";

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6 md:p-10">
      <Link
        href={courseId ? `/admin/courses/${courseId}/edit` : "/admin/courses"}
        className="text-muted-foreground hover:text-foreground text-xs"
      >
        ← {moduleRow ? `Back to course (module: ${moduleRow.title})` : "Back to courses"}
      </Link>
      <h1 className="mt-3 text-2xl font-semibold">Edit lesson</h1>
      <p className="text-muted-foreground mb-8 mt-1 text-sm">
        Lesson type: {lessonType}.
      </p>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>Title, description, required flag.</CardDescription>
        </CardHeader>
        <CardContent>
          <LessonDetailsForm
            lessonId={lessonId}
            defaultTitle={lesson.title as string}
            defaultDescription={lesson.description as string | null}
            defaultRequired={lesson.is_required_for_completion as boolean}
          />
        </CardContent>
      </Card>

      {lessonType === "content" ? (
        <ContentLessonEditor lessonId={lessonId} />
      ) : null}

      {lessonType === "quiz" ? (
        <QuizLessonEditor
          lessonId={lessonId}
          quizId={lesson.quiz_id as string | null}
        />
      ) : null}

      {lessonType === "assignment" ? (
        <AssignmentLessonEditor
          lessonId={lessonId}
          assignmentId={lesson.assignment_id as string | null}
        />
      ) : null}
    </main>
  );
}

async function ContentLessonEditor({ lessonId }: { lessonId: string }) {
  const supabase = await createClient();
  const { data: blocks } = await supabase
    .from("content_blocks")
    .select("id, block_type, content, sort_order, is_required_for_completion")
    .eq("lesson_id", lessonId)
    .order("sort_order");

  const blockRows = (blocks ?? []) as BlockRow[];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Content blocks</CardTitle>
        <CardDescription>
          Stack any mix of text, video, image, PDF, audio, download, callout,
          external link, embed, or divider.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <BlocksEditor lessonId={lessonId} initialBlocks={blockRows} />
      </CardContent>
    </Card>
  );
}

async function QuizLessonEditor({
  lessonId,
  quizId,
}: {
  lessonId: string;
  quizId: string | null;
}) {
  if (!quizId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Quiz</CardTitle>
          <CardDescription>
            This quiz lesson has no quiz row. Delete and recreate the lesson.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const supabase = await createClient();
  const [{ data: quiz }, { data: questions }] = await Promise.all([
    supabase
      .from("quizzes")
      .select(
        "id, title, description, passing_score, randomize_questions, randomize_answers, questions_per_attempt, max_attempts, retake_cooldown_hours, show_correct_answers_after",
      )
      .eq("id", quizId)
      .maybeSingle(),
    supabase
      .from("questions")
      .select(
        `
        id,
        question_text,
        question_type,
        explanation,
        points,
        sort_order,
        answer_options ( id, option_text, is_correct, sort_order )
      `,
      )
      .eq("quiz_id", quizId)
      .order("sort_order"),
  ]);

  if (!quiz) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Quiz unavailable</CardTitle>
          <CardDescription>The quiz row couldn&apos;t be loaded.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quiz</CardTitle>
        <CardDescription>
          Settings, questions, and answer options. Radio for single-choice and
          true/false; checkbox for multi-select.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <QuizEditor
          lessonId={lessonId}
          quiz={quiz as QuizSettings}
          questions={(questions ?? []) as QuestionRow[]}
        />
      </CardContent>
    </Card>
  );
}

async function AssignmentLessonEditor({
  lessonId,
  assignmentId,
}: {
  lessonId: string;
  assignmentId: string | null;
}) {
  if (!assignmentId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Assignment</CardTitle>
          <CardDescription>
            This assignment lesson has no assignment row. Delete and recreate the lesson.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const supabase = await createClient();
  const { data: asn } = await supabase
    .from("assignments")
    .select("id, title, instructions, submission_type, requires_review")
    .eq("id", assignmentId)
    .maybeSingle();

  if (!asn) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Assignment unavailable</CardTitle>
          <CardDescription>
            The assignment row couldn&apos;t be loaded.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assignment</CardTitle>
        <CardDescription>
          What the learner submits and whether it needs review.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AssignmentEditor
          lessonId={lessonId}
          assignment={asn as AssignmentSettings}
        />
      </CardContent>
    </Card>
  );
}

function firstRow<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}
