import { describe, expect, it } from "vitest";

import { toPilotMonitoringCsv } from "./route";

describe("toPilotMonitoringCsv", () => {
  it("exports pilot monitoring rows with escaped csv cells", () => {
    const csv = toPilotMonitoringCsv({
      totals: {
        learners: 1,
        blocked: 0,
        needsRevision: 0,
        needsReview: 1,
        notStarted: 0,
        inProgress: 0,
        certified: 0,
      },
      rows: [
        {
          userId: "learner-1",
          name: "Learner, One",
          email: "learner@example.com",
          statusKey: "needs_review",
          statusLabel: "Needs review",
          progressLabel: "1/2",
          progressPercent: 50,
          requiredLessonsDone: 1,
          requiredLessonsTotal: 2,
          pendingSubmissions: 1,
          needsRevisionSubmissions: 0,
          quizzesPassed: 1,
          certificatesIssued: 0,
          lastActivity: "2026-05-09T11:00:00.000Z",
          actionLabel: "Review submissions",
          actionHref: "/admin/submissions",
        },
      ],
    });

    expect(csv).toContain(
      '"Learner, One",learner@example.com,Needs review,1/2,50,1,0,1,0,2026-05-09T11:00:00.000Z,Review submissions',
    );
  });

  it("neutralizes every spreadsheet formula prefix in learner-controlled cells", () => {
    const prefixes = [
      "=",
      "+",
      "-",
      "@",
      "\t",
      "\r",
      "\n",
      "\0",
      "\uFF1D",
      "\uFF0B",
      "\uFF0D",
      "\uFF20",
    ];
    const csv = toPilotMonitoringCsv({
      totals: {
        learners: prefixes.length,
        blocked: 0,
        needsRevision: 0,
        needsReview: 0,
        notStarted: prefixes.length,
        inProgress: 0,
        certified: 0,
      },
      rows: prefixes.map((prefix, index) => ({
        userId: `learner-${index}`,
        name: `${prefix}DANGEROUS()`,
        email: `learner-${index}@example.com`,
        statusKey: "not_started" as const,
        statusLabel: "Not started",
        progressLabel: "0/1",
        progressPercent: 0,
        requiredLessonsDone: 0,
        requiredLessonsTotal: 1,
        pendingSubmissions: 0,
        needsRevisionSubmissions: 0,
        quizzesPassed: 0,
        certificatesIssued: 0,
        lastActivity: null,
        actionLabel: "Start course",
        actionHref: "/dashboard",
      })),
    });

    for (const prefix of prefixes) {
      const exportedPrefix = prefix === "\0" ? "\uFFFD" : prefix;
      expect(csv).toContain(`'${exportedPrefix}DANGEROUS()`);
      expect(csv).not.toContain(`\n${prefix}DANGEROUS()`);
    }
    expect(csv).not.toContain("\0");
  });
});
