export type PilotMonitoringStatusKey =
  | "blocked"
  | "needs_revision"
  | "needs_review"
  | "not_started"
  | "in_progress"
  | "certified";

export type PilotMonitoringLearnerInput = {
  id: string;
  email: string;
  fullName: string;
  systemRole: "owner" | "admin" | "learner";
  status: "active" | "invited" | "suspended";
  roleGroupIds: string[];
};

export type PilotMonitoringRequiredLessonInput = {
  id: string;
  courseId: string;
  title: string;
};

export type PilotMonitoringCompletionInput = {
  userId: string;
  lessonId: string;
  completedAt: string;
};

export type PilotMonitoringQuizAttemptInput = {
  userId: string;
  passed: boolean | null;
  score: number | null;
  completedAt: string | null;
};

export type PilotMonitoringSubmissionInput = {
  userId: string;
  status: "submitted" | "approved" | "needs_revision";
  submittedAt: string;
};

export type PilotMonitoringCourseCertificateInput = {
  userId: string;
  courseId: string;
  issuedAt: string;
};

export type PilotMonitoringProgramCertificateInput = {
  userId: string;
  programId: string;
  issuedAt: string;
};

export type PilotMonitoringRow = {
  userId: string;
  name: string;
  email: string;
  statusKey: PilotMonitoringStatusKey;
  statusLabel: string;
  progressLabel: string;
  progressPercent: number;
  requiredLessonsDone: number;
  requiredLessonsTotal: number;
  pendingSubmissions: number;
  needsRevisionSubmissions: number;
  quizzesPassed: number;
  certificatesIssued: number;
  lastActivity: string | null;
  actionLabel: string;
  actionHref: string;
};

export type PilotMonitoringSummary = {
  totals: {
    learners: number;
    blocked: number;
    needsRevision: number;
    needsReview: number;
    notStarted: number;
    inProgress: number;
    certified: number;
  };
  rows: PilotMonitoringRow[];
};

export function summarizePilotMonitoring({
  learners,
  requiredLessons,
  completions,
  quizAttempts,
  submissions,
  courseCertificates,
  programCertificates,
}: {
  now: Date;
  learners: PilotMonitoringLearnerInput[];
  requiredLessons: PilotMonitoringRequiredLessonInput[];
  completions: PilotMonitoringCompletionInput[];
  quizAttempts: PilotMonitoringQuizAttemptInput[];
  submissions: PilotMonitoringSubmissionInput[];
  courseCertificates: PilotMonitoringCourseCertificateInput[];
  programCertificates: PilotMonitoringProgramCertificateInput[];
}): PilotMonitoringSummary {
  const requiredLessonIds = new Set(requiredLessons.map((lesson) => lesson.id));
  const completionsByUser = groupBy(completions, (completion) => completion.userId);
  const attemptsByUser = groupBy(quizAttempts, (attempt) => attempt.userId);
  const submissionsByUser = groupBy(submissions, (submission) => submission.userId);
  const courseCertsByUser = groupBy(
    courseCertificates,
    (certificate) => certificate.userId,
  );
  const programCertsByUser = groupBy(
    programCertificates,
    (certificate) => certificate.userId,
  );

  const rows = learners
    .filter((learner) => learner.systemRole === "learner")
    .map((learner) => {
      const userCompletions = completionsByUser.get(learner.id) ?? [];
      const userAttempts = attemptsByUser.get(learner.id) ?? [];
      const userSubmissions = submissionsByUser.get(learner.id) ?? [];
      const userCourseCerts = courseCertsByUser.get(learner.id) ?? [];
      const userProgramCerts = programCertsByUser.get(learner.id) ?? [];
      const completedRequiredLessonIds = new Set(
        userCompletions
          .filter((completion) => requiredLessonIds.has(completion.lessonId))
          .map((completion) => completion.lessonId),
      );
      const requiredLessonsDone = completedRequiredLessonIds.size;
      const requiredLessonsTotal = requiredLessonIds.size;
      const progressPercent =
        requiredLessonsTotal === 0
          ? 0
          : Math.round((requiredLessonsDone / requiredLessonsTotal) * 100);
      const pendingSubmissions = userSubmissions.filter(
        (submission) => submission.status === "submitted",
      ).length;
      const needsRevisionSubmissions = userSubmissions.filter(
        (submission) => submission.status === "needs_revision",
      ).length;
      const quizzesPassed = userAttempts.filter(
        (attempt) => attempt.passed === true,
      ).length;
      const certificatesIssued = userCourseCerts.length + userProgramCerts.length;
      const lastActivity = latest([
        ...userCompletions.map((completion) => completion.completedAt),
        ...userAttempts
          .map((attempt) => attempt.completedAt)
          .filter((value): value is string => !!value),
        ...userSubmissions.map((submission) => submission.submittedAt),
        ...userCourseCerts.map((certificate) => certificate.issuedAt),
        ...userProgramCerts.map((certificate) => certificate.issuedAt),
      ]);
      const status = pickStatus({
        learner,
        requiredLessonsDone,
        requiredLessonsTotal,
        pendingSubmissions,
        needsRevisionSubmissions,
        certificatesIssued,
      });

      return {
        userId: learner.id,
        name: learner.fullName || learner.email,
        email: learner.email,
        statusKey: status.key,
        statusLabel: status.label,
        progressLabel: `${requiredLessonsDone}/${requiredLessonsTotal}`,
        progressPercent,
        requiredLessonsDone,
        requiredLessonsTotal,
        pendingSubmissions,
        needsRevisionSubmissions,
        quizzesPassed,
        certificatesIssued,
        lastActivity,
        actionLabel: status.actionLabel,
        actionHref: status.actionHref(learner.id),
      };
    })
    .sort(compareRows);

  return {
    totals: {
      learners: rows.length,
      blocked: rows.filter((row) => row.statusKey === "blocked").length,
      needsRevision: rows.filter((row) => row.statusKey === "needs_revision").length,
      needsReview: rows.filter((row) => row.statusKey === "needs_review").length,
      notStarted: rows.filter((row) => row.statusKey === "not_started").length,
      inProgress: rows.filter((row) => row.statusKey === "in_progress").length,
      certified: rows.filter((row) => row.statusKey === "certified").length,
    },
    rows,
  };
}

function pickStatus({
  learner,
  requiredLessonsDone,
  requiredLessonsTotal,
  pendingSubmissions,
  needsRevisionSubmissions,
  certificatesIssued,
}: {
  learner: PilotMonitoringLearnerInput;
  requiredLessonsDone: number;
  requiredLessonsTotal: number;
  pendingSubmissions: number;
  needsRevisionSubmissions: number;
  certificatesIssued: number;
}): {
  key: PilotMonitoringStatusKey;
  label: string;
  actionLabel: string;
  actionHref: (userId: string) => string;
} {
  if (learner.status === "suspended" || learner.roleGroupIds.length === 0) {
    return {
      key: "blocked",
      label: "Needs access",
      actionLabel: "Review access",
      actionHref: (userId) => `/admin/users/${userId}/edit`,
    };
  }
  if (needsRevisionSubmissions > 0) {
    return {
      key: "needs_revision",
      label: "Needs revision",
      actionLabel: "Review revision",
      actionHref: () => "/admin/submissions?status=needs_revision",
    };
  }
  if (pendingSubmissions > 0) {
    return {
      key: "needs_review",
      label: "Needs review",
      actionLabel: "Review submissions",
      actionHref: () => "/admin/submissions",
    };
  }
  if (
    requiredLessonsTotal > 0 &&
    requiredLessonsDone >= requiredLessonsTotal &&
    certificatesIssued > 0
  ) {
    return {
      key: "certified",
      label: "Certified",
      actionLabel: "View learner",
      actionHref: (userId) => `/admin/reports/users/${userId}`,
    };
  }
  if (requiredLessonsDone === 0) {
    return {
      key: "not_started",
      label: "Not started",
      actionLabel: "View learner",
      actionHref: (userId) => `/admin/reports/users/${userId}`,
    };
  }
  return {
    key: "in_progress",
    label: "In progress",
    actionLabel: "View learner",
    actionHref: (userId) => `/admin/reports/users/${userId}`,
  };
}

function compareRows(a: PilotMonitoringRow, b: PilotMonitoringRow): number {
  const priority: Record<PilotMonitoringStatusKey, number> = {
    blocked: 0,
    needs_revision: 1,
    needs_review: 2,
    not_started: 3,
    in_progress: 4,
    certified: 5,
  };
  const statusDelta = priority[a.statusKey] - priority[b.statusKey];
  if (statusDelta !== 0) return statusDelta;
  if (a.lastActivity && b.lastActivity) {
    return b.lastActivity.localeCompare(a.lastActivity);
  }
  if (a.lastActivity) return -1;
  if (b.lastActivity) return 1;
  return a.name.localeCompare(b.name);
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const group = groups.get(k) ?? [];
    group.push(item);
    groups.set(k, group);
  }
  return groups;
}

function latest(values: string[]): string | null {
  return values.sort((a, b) => b.localeCompare(a))[0] ?? null;
}

