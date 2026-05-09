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
});

