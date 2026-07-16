import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuizRunner, type QuizQuestion } from "./quiz-runner";
import { submitQuizAttempt } from "./quiz-actions";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

vi.mock("./quiz-actions", () => ({
  submitQuizAttempt: vi.fn(),
}));

const questions: QuizQuestion[] = [
  {
    id: "single",
    question_text: "Which opening builds trust?",
    question_type: "single_choice",
    options: [
      { id: "single-a", option_text: "Lead with the offer" },
      { id: "single-b", option_text: "Ask one clear question" },
    ],
  },
  {
    id: "truth",
    question_text: "Mirroring means repeating every word.",
    question_type: "true_false",
    options: [
      { id: "true", option_text: "True" },
      { id: "false", option_text: "False" },
    ],
  },
  {
    id: "multi",
    question_text: "Choose the useful next steps.",
    question_type: "multi_select",
    options: [
      { id: "multi-a", option_text: "Slow down" },
      { id: "multi-b", option_text: "Confirm the concern" },
      { id: "multi-c", option_text: "Interrupt" },
    ],
  },
];

function renderRunner(overrideQuestions = questions) {
  return render(
    <QuizRunner
      quizId="quiz-1"
      lessonId="lesson-1"
      passingScore={80}
      questions={overrideQuestions}
      backHref="/courses/course-1"
      attemptsUsed={1}
      attemptsLeft={2}
    />,
  );
}

describe("<QuizRunner />", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps all three question types selectable and submits the same response payload", async () => {
    const user = userEvent.setup();
    vi.mocked(submitQuizAttempt).mockResolvedValue({
      ok: true,
      score: 100,
      passed: true,
      earnedPoints: 3,
      totalPoints: 3,
      attemptId: "attempt-1",
    });
    renderRunner();

    expect(screen.getByText("Attempt 2 of 3")).toBeInTheDocument();
    expect(screen.getByText("Select all that apply")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Ask one clear question"));
    await user.click(screen.getByLabelText("False"));
    await user.click(screen.getByLabelText("Slow down"));
    await user.click(screen.getByLabelText("Confirm the concern"));
    await user.click(screen.getByRole("button", { name: "Submit quiz" }));

    await waitFor(() =>
      expect(submitQuizAttempt).toHaveBeenCalledWith({
        quizId: "quiz-1",
        lessonId: "lesson-1",
        responses: {
          single: ["single-b"],
          truth: ["false"],
          multi: ["multi-a", "multi-b"],
        },
      }),
    );
    expect(await screen.findByRole("heading", { name: "Passed" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Andrea" })).toHaveAttribute(
      "src",
      "/brand/mascot/face-laugh.png",
    );
  });

  it("preserves the answer-every-question validation", async () => {
    const user = userEvent.setup();
    const { toast } = await import("sonner");
    renderRunner();

    await user.click(screen.getByRole("button", { name: "Submit quiz" }));

    expect(toast.error).toHaveBeenCalledWith(
      "Answer every question before submitting.",
    );
    expect(submitQuizAttempt).not.toHaveBeenCalled();
  });

  it("shows the worried retry state and resets answers for another attempt", async () => {
    const user = userEvent.setup();
    vi.mocked(submitQuizAttempt).mockResolvedValue({
      ok: true,
      score: 50,
      passed: false,
      earnedPoints: 1,
      totalPoints: 2,
      attemptId: "attempt-2",
    });
    renderRunner([questions[0]]);

    await user.click(screen.getByLabelText("Lead with the offer"));
    await user.click(screen.getByRole("button", { name: "Submit quiz" }));

    expect(
      await screen.findByRole("heading", { name: "Keep going" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Andrea" })).toHaveAttribute(
      "src",
      "/brand/mascot/face-worried.png",
    );

    await user.click(screen.getByRole("button", { name: "Retake quiz" }));

    expect(screen.getByRole("heading", { name: "Quiz" })).toBeInTheDocument();
    expect(screen.getByLabelText("Lead with the offer")).not.toBeChecked();
  });

  it("uses the branded empty state when an admin has not added questions", () => {
    renderRunner([]);

    expect(screen.getByRole("heading", { name: "No questions yet" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Andrea" })).toHaveAttribute(
      "src",
      "/brand/mascot/face-curious.png",
    );
  });
});
