import Link from "next/link";
import { notFound } from "next/navigation";

import { Card } from "@/components/bmh-ds";
import { PageHeader } from "@/components/page-header";
import { requireAdmin } from "@/lib/auth/guard";
import { parseAssignmentRubric } from "@/lib/assignments/rubric";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { LessonDetailsForm } from "./lesson-details-form";
import { BlocksEditor, type BlockRow } from "./blocks-editor";
import { QuizEditor, type QuestionRow, type QuizSettings } from "./quiz-editor";
import {
  AssignmentEditor,
  type AssignmentSettings,
} from "./assignment-editor";
import { LessonEditorTabs } from "./lesson-editor-tabs";

export default async function EditLessonPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  await requireAdmin();
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
      thumbnail_path,
      content_import_id,
      thumbnail_asset_key,
      thumbnail_approved_path,
      thumbnail_approved_sha256,
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

  const editor =
    lessonType === "content" ? (
      <ContentLessonEditor lessonId={lessonId} />
    ) : lessonType === "quiz" ? (
      <QuizLessonEditor
        lessonId={lessonId}
        quizId={lesson.quiz_id as string | null}
      />
    ) : (
      <AssignmentLessonEditor
        lessonId={lessonId}
        assignmentId={lesson.assignment_id as string | null}
      />
    );

  const details = (
    <Card padding="md">
      <PanelHeading
        title="Lesson details"
        description="Update the title, description, and completion requirement."
      />
      <LessonDetailsForm
        lessonId={lessonId}
        defaultTitle={lesson.title as string}
        defaultDescription={lesson.description as string | null}
        defaultRequired={lesson.is_required_for_completion as boolean}
        defaultThumbnailPath={lesson.thumbnail_path as string | null}
        contentImportId={lesson.content_import_id as string | null}
      />
    </Card>
  );

  return (
    <main className="w-full flex-1 px-5 py-8 md:px-7 md:pb-16">
      <Link
        href={courseId ? `/admin/courses/${courseId}/edit` : "/admin/courses"}
        className="font-[family-name:var(--font-body)] text-sm font-bold text-[var(--action)] transition-colors hover:text-[var(--action-hover)]"
      >
        ← {moduleRow ? `Back to course (module: ${moduleRow.title})` : "Back to courses"}
      </Link>
      <div className="mb-7 mt-3">
        <PageHeader
          title={lesson.title as string}
          description={`Edit this ${lessonType} lesson and keep learner-facing content current.`}
          breadcrumb={[{ label: "Admin" }, { label: "Lessons" }]}
        />
      </div>

      <LessonEditorTabs
        lessonType={lessonType}
        editor={editor}
        details={details}
      />
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

  return <BlocksEditor lessonId={lessonId} initialBlocks={blockRows} />;
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
      <Card padding="md">
        <PanelHeading
          title="Quiz"
          description="This quiz lesson has no quiz row. Delete and recreate the lesson."
        />
      </Card>
    );
  }

  const supabase = createAdminClient();
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
      <Card padding="md">
        <PanelHeading
          title="Quiz unavailable"
          description="The quiz row couldn't be loaded."
        />
      </Card>
    );
  }

  return (
    <Card padding="md">
      <PanelHeading
        title="Quiz"
        description="Settings, questions, and answer options. Correct answers stay hidden from learners."
      />
      <QuizEditor
        lessonId={lessonId}
        quiz={quiz as QuizSettings}
        questions={(questions ?? []) as QuestionRow[]}
      />
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
      <Card padding="md">
        <PanelHeading
          title="Assignment"
          description="This assignment lesson has no assignment row. Delete and recreate the lesson."
        />
      </Card>
    );
  }

  const supabase = await createClient();
  const { data: asn } = await supabase
    .from("assignments")
    .select("id, title, instructions, submission_type, requires_review, rubric")
    .eq("id", assignmentId)
    .maybeSingle();

  if (!asn) {
    return (
      <Card padding="md">
        <PanelHeading
          title="Assignment unavailable"
          description="The assignment row couldn't be loaded."
        />
      </Card>
    );
  }

  const parsedRubric = parseAssignmentRubric(asn.rubric);
  if (!parsedRubric.ok) {
    return (
      <Card padding="md">
        <PanelHeading
          title="Assignment data needs repair"
          description="The saved review rubric is invalid. Repair the assignment data before editing or reviewing submissions."
        />
      </Card>
    );
  }

  return (
    <Card padding="md">
      <PanelHeading
        title="Assignment"
        description="Set what the learner submits and whether an admin must review it."
      />
      <AssignmentEditor
        lessonId={lessonId}
        assignment={{
          ...(asn as Omit<AssignmentSettings, "rubric">),
          rubric: parsedRubric.items,
        }}
      />
    </Card>
  );
}

function PanelHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-5">
      <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-[var(--ink-900)]">
        {title}
      </h2>
      <p className="mt-1 font-[family-name:var(--font-body)] text-sm font-semibold leading-relaxed text-[var(--text-muted)]">
        {description}
      </p>
    </div>
  );
}

function firstRow<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}
