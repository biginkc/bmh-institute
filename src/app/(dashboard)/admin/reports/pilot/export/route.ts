import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/guard";
import {
  summarizePilotMonitoring,
  type PilotMonitoringSummary,
} from "@/lib/pilot-monitoring/summary";
import { createClient } from "@/lib/supabase/server";
import { loadAdminLessonCompletions } from "../../../../lesson-state-rpc";

export async function GET() {
  await requireAdmin();
  const supabase = await createClient();

  const [
    profilesRes,
    userRoleGroupsRes,
    requiredLessonsRes,
    quizAttemptsRes,
    submissionsRes,
    courseCertsRes,
    programCertsRes,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, full_name, system_role, status"),
    supabase.from("user_role_groups").select("user_id, role_group_id"),
    supabase
      .from("lessons")
      .select("id, title, is_required_for_completion, modules!inner(course_id)")
      .eq("is_required_for_completion", true),
    supabase
      .from("user_quiz_attempts")
      .select("user_id, passed, score, completed_at"),
    supabase
      .from("assignment_submissions")
      .select("user_id, status, submitted_at"),
    supabase.from("certificates").select("user_id, course_id, issued_at"),
    supabase
      .from("program_certificates")
      .select("user_id, program_id, issued_at"),
  ]);

  const profiles = (profilesRes.data ?? []) as Profile[];
  const userRoleGroups = (userRoleGroupsRes.data ?? []) as UserRoleGroup[];
  const requiredLessons = (requiredLessonsRes.data ?? []) as RequiredLessonRow[];
  const quizAttempts = (quizAttemptsRes.data ?? []) as QuizAttempt[];
  const submissions = (submissionsRes.data ?? []) as Submission[];
  const courseCerts = (courseCertsRes.data ?? []) as CourseCert[];
  const programCerts = (programCertsRes.data ?? []) as ProgramCert[];
  const completionResult = await loadAdminLessonCompletions(supabase, {
    userIds: profiles.map((profile) => profile.id),
    lessonIds: requiredLessons.map((lesson) => lesson.id),
  });
  if (!completionResult.ok) {
    return NextResponse.json(
      {
        error:
          "Current learner completion could not be verified. Try the export again.",
      },
      { status: 503, headers: { "retry-after": "5" } },
    );
  }
  const completions: Completion[] = completionResult.completions.map(
    (completion) => ({
      user_id: completion.userId,
      lesson_id: completion.lessonId,
      completed_at: completion.completedAt,
    }),
  );
  const roleGroupIdsByUserId = new Map<string, string[]>();

  for (const row of userRoleGroups) {
    const values = roleGroupIdsByUserId.get(row.user_id) ?? [];
    values.push(row.role_group_id);
    roleGroupIdsByUserId.set(row.user_id, values);
  }

  const summary = summarizePilotMonitoring({
    now: new Date(),
    learners: profiles.map((profile) => ({
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      systemRole: profile.system_role,
      status: profile.status,
      roleGroupIds: roleGroupIdsByUserId.get(profile.id) ?? [],
    })),
    requiredLessons: requiredLessons.map((lesson) => {
      const moduleRow = Array.isArray(lesson.modules)
        ? lesson.modules[0]
        : lesson.modules;
      return {
        id: lesson.id,
        title: lesson.title,
        courseId: moduleRow?.course_id ?? "",
      };
    }),
    completions: completions.map((completion) => ({
      userId: completion.user_id,
      lessonId: completion.lesson_id,
      completedAt: completion.completed_at,
    })),
    quizAttempts: quizAttempts.map((attempt) => ({
      userId: attempt.user_id,
      passed: attempt.passed,
      score: attempt.score,
      completedAt: attempt.completed_at,
    })),
    submissions: submissions.map((submission) => ({
      userId: submission.user_id,
      status: submission.status,
      submittedAt: submission.submitted_at,
    })),
    courseCertificates: courseCerts.map((certificate) => ({
      userId: certificate.user_id,
      courseId: certificate.course_id,
      issuedAt: certificate.issued_at,
    })),
    programCertificates: programCerts.map((certificate) => ({
      userId: certificate.user_id,
      programId: certificate.program_id,
      issuedAt: certificate.issued_at,
    })),
  });

  return new NextResponse(toPilotMonitoringCsv(summary), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="bmh-institute-learner-status-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

export function toPilotMonitoringCsv(summary: PilotMonitoringSummary): string {
  const rows = [
    [
      "learner",
      "email",
      "status",
      "required_lessons",
      "progress_percent",
      "pending_submissions",
      "needs_revision_submissions",
      "quizzes_passed",
      "certificates_issued",
      "last_activity",
      "action",
    ],
    ...summary.rows.map((row) => [
      row.name,
      row.email,
      row.statusLabel,
      row.progressLabel,
      String(row.progressPercent),
      String(row.pendingSubmissions),
      String(row.needsRevisionSubmissions),
      String(row.quizzesPassed),
      String(row.certificatesIssued),
      row.lastActivity ?? "",
      row.actionLabel,
    ]),
  ];

  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

export const toLearnerMonitoringCsv = toPilotMonitoringCsv;

function csvCell(value: string): string {
  if (!/[",\n]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}

type Profile = {
  id: string;
  email: string;
  full_name: string;
  system_role: "owner" | "admin" | "learner";
  status: "active" | "invited" | "suspended";
};

type UserRoleGroup = {
  user_id: string;
  role_group_id: string;
};

type RequiredLessonRow = {
  id: string;
  title: string;
  is_required_for_completion: boolean;
  modules: { course_id: string } | Array<{ course_id: string }> | null;
};

type Completion = {
  user_id: string;
  lesson_id: string;
  completed_at: string | null;
};

type QuizAttempt = {
  user_id: string;
  passed: boolean | null;
  score: number | null;
  completed_at: string | null;
};

type Submission = {
  user_id: string;
  status: "submitted" | "approved" | "needs_revision";
  submitted_at: string;
};

type CourseCert = { user_id: string; course_id: string; issued_at: string };

type ProgramCert = {
  user_id: string;
  program_id: string;
  issued_at: string;
};
