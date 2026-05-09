import { describe, expect, it } from "vitest";

import { summarizePilotMonitoring } from "./summary";

const NOW = new Date("2026-05-09T12:00:00.000Z");

describe("summarizePilotMonitoring", () => {
  it("marks learners without role groups as blocked before progress states", () => {
    const summary = summarizePilotMonitoring({
      now: NOW,
      learners: [learner({ id: "learner-1", roleGroupIds: [] })],
      requiredLessons: [lesson({ courseId: "course-1" })],
      completions: [{ userId: "learner-1", lessonId: "lesson-1", completedAt: "2026-05-09T10:00:00.000Z" }],
      quizAttempts: [],
      submissions: [],
      courseCertificates: [],
      programCertificates: [],
    });

    expect(summary.rows[0]).toEqual(
      expect.objectContaining({
        statusKey: "blocked",
        statusLabel: "Needs access",
        actionHref: "/admin/users/learner-1/edit",
      }),
    );
    expect(summary.totals.blocked).toBe(1);
  });

  it("marks assigned learners with no activity as not started", () => {
    const summary = summarizePilotMonitoring({
      now: NOW,
      learners: [learner()],
      requiredLessons: [lesson()],
      completions: [],
      quizAttempts: [],
      submissions: [],
      courseCertificates: [],
      programCertificates: [],
    });

    expect(summary.rows[0]).toEqual(
      expect.objectContaining({
        statusKey: "not_started",
        statusLabel: "Not started",
        progressLabel: "0/1",
      }),
    );
    expect(summary.totals.notStarted).toBe(1);
  });

  it("marks learners with partial required lesson progress as in progress", () => {
    const summary = summarizePilotMonitoring({
      now: NOW,
      learners: [learner()],
      requiredLessons: [lesson(), lesson({ id: "lesson-2" })],
      completions: [
        {
          userId: "learner-1",
          lessonId: "lesson-1",
          completedAt: "2026-05-09T10:00:00.000Z",
        },
      ],
      quizAttempts: [],
      submissions: [],
      courseCertificates: [],
      programCertificates: [],
    });

    expect(summary.rows[0]).toEqual(
      expect.objectContaining({
        statusKey: "in_progress",
        statusLabel: "In progress",
        progressLabel: "1/2",
        progressPercent: 50,
      }),
    );
  });

  it("prioritizes pending review over passive progress", () => {
    const summary = summarizePilotMonitoring({
      now: NOW,
      learners: [learner()],
      requiredLessons: [lesson()],
      completions: [
        {
          userId: "learner-1",
          lessonId: "lesson-1",
          completedAt: "2026-05-09T09:00:00.000Z",
        },
      ],
      quizAttempts: [],
      submissions: [
        {
          userId: "learner-1",
          status: "submitted",
          submittedAt: "2026-05-09T11:00:00.000Z",
        },
      ],
      courseCertificates: [],
      programCertificates: [],
    });

    expect(summary.rows[0]).toEqual(
      expect.objectContaining({
        statusKey: "needs_review",
        statusLabel: "Needs review",
        pendingSubmissions: 1,
        actionHref: "/admin/submissions",
      }),
    );
    expect(summary.totals.needsReview).toBe(1);
  });

  it("prioritizes needs revision over pending review", () => {
    const summary = summarizePilotMonitoring({
      now: NOW,
      learners: [learner()],
      requiredLessons: [lesson()],
      completions: [],
      quizAttempts: [],
      submissions: [
        {
          userId: "learner-1",
          status: "submitted",
          submittedAt: "2026-05-09T10:00:00.000Z",
        },
        {
          userId: "learner-1",
          status: "needs_revision",
          submittedAt: "2026-05-09T11:00:00.000Z",
        },
      ],
      courseCertificates: [],
      programCertificates: [],
    });

    expect(summary.rows[0]).toEqual(
      expect.objectContaining({
        statusKey: "needs_revision",
        statusLabel: "Needs revision",
        pendingSubmissions: 1,
        needsRevisionSubmissions: 1,
        actionHref: "/admin/submissions?status=needs_revision",
      }),
    );
    expect(summary.totals.needsRevision).toBe(1);
  });

  it("marks completed required lessons with certificates as certified", () => {
    const summary = summarizePilotMonitoring({
      now: NOW,
      learners: [learner()],
      requiredLessons: [lesson()],
      completions: [
        {
          userId: "learner-1",
          lessonId: "lesson-1",
          completedAt: "2026-05-09T10:00:00.000Z",
        },
      ],
      quizAttempts: [],
      submissions: [],
      courseCertificates: [
        {
          userId: "learner-1",
          courseId: "course-1",
          issuedAt: "2026-05-09T10:05:00.000Z",
        },
      ],
      programCertificates: [],
    });

    expect(summary.rows[0]).toEqual(
      expect.objectContaining({
        statusKey: "certified",
        statusLabel: "Certified",
        certificatesIssued: 1,
      }),
    );
    expect(summary.totals.certified).toBe(1);
  });
});

function learner(overrides: Partial<Learner> = {}): Learner {
  return {
    id: "learner-1",
    email: "learner@example.com",
    fullName: "Learner One",
    systemRole: "learner",
    status: "active",
    roleGroupIds: ["role-group-1"],
    ...overrides,
  };
}

function lesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: "lesson-1",
    courseId: "course-1",
    title: "Required Lesson",
    ...overrides,
  };
}

type Learner = {
  id: string;
  email: string;
  fullName: string;
  systemRole: "owner" | "admin" | "learner";
  status: "active" | "invited" | "suspended";
  roleGroupIds: string[];
};

type Lesson = {
  id: string;
  courseId: string;
  title: string;
};

