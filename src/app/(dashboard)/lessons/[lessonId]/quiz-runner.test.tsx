import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  answerQuizQuestion,
  finalizeQuizAttempt,
  startQuizAttempt,
} from "./quiz-actions";
import { QuizRunner, type QuizQuestion } from "./quiz-runner";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("./quiz-actions", () => ({
  startQuizAttempt: vi.fn(),
  answerQuizQuestion: vi.fn(),
  finalizeQuizAttempt: vi.fn(),
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

const attemptQuestions = questions.map((question, index) => ({
  ...question,
  sort_order: index + 1,
  options: question.options.map((option, optionIndex) => ({
    ...option,
    sort_order: optionIndex + 1,
  })),
}));

const finalPass = {
  ok: true as const,
  score: 100,
  passed: true,
  earnedPoints: 3,
  totalPoints: 3,
  attemptId: "attempt-1",
  review: null,
};

function renderRunner(overrides: Partial<{
  attemptsUsed: number;
  attemptsLeft: number | null;
  retakeCooldownHours: number;
}> = {}) {
  return render(
    <QuizRunner
      quizId="quiz-1"
      lessonId="lesson-1"
      passingScore={80}
      backHref="/courses/course-1"
      attemptsUsed={overrides.attemptsUsed ?? 1}
      attemptsLeft={overrides.attemptsLeft ?? 2}
      retakeCooldownHours={overrides.retakeCooldownHours ?? 0}
    />,
  );
}

function revealFor(questionId: string, correct = true) {
  const map: Record<string, { correct: string[]; explanation: string }> = {
    single: { correct: ["single-b"], explanation: "Ask before pitching." },
    truth: { correct: ["false"], explanation: "Mirroring is selective." },
    multi: { correct: ["multi-a", "multi-b"], explanation: "Both slow the call down." },
  };
  const reveal = correct ? {
    questionId,
    isCorrect: true as const,
    explanation: map[questionId].explanation,
  } : {
    questionId,
    isCorrect: false as const,
  };
  return {
    ok: true as const,
    reveal,
  };
}

async function start(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Start quiz" }));
  await screen.findByRole("heading", { name: questions[0].question_text });
}

async function answerAndNext(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
) {
  await user.click(screen.getByLabelText(label));
  await user.click(screen.getByRole("button", { name: "Check answer" }));
  await screen.findByText("Correct");
  await user.click(screen.getByRole("button", { name: "Next" }));
}

describe("<QuizRunner />", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(startQuizAttempt).mockReset();
    vi.mocked(answerQuizQuestion).mockReset();
    vi.mocked(finalizeQuizAttempt).mockReset();
    vi.mocked(startQuizAttempt).mockResolvedValue({
      ok: true,
      attemptId: "attempt-1",
      questions: attemptQuestions,
      resumed: false,
      responses: {},
      reveals: [],
    });
    vi.mocked(answerQuizQuestion).mockImplementation(async ({ questionId }) =>
      revealFor(questionId));
    vi.mocked(finalizeQuizAttempt).mockResolvedValue(finalPass);
  });

  it("runs single-choice, true/false, and multi-select one at a time through finish", async () => {
    const user = userEvent.setup();
    renderRunner();
    await start(user);

    expect(screen.queryByText(questions[1].question_text)).not.toBeInTheDocument();
    await user.click(screen.getByLabelText("Lead with the offer"));
    await answerAndNext(user, "Ask one clear question");
    expect(await screen.findByRole("heading", { name: questions[1].question_text })).toBeVisible();
    await user.click(screen.getByLabelText("True"));
    await answerAndNext(user, "False");
    expect(await screen.findByText("Select all that apply")).toBeVisible();
    await user.click(screen.getByLabelText("Slow down"));
    await user.click(screen.getByLabelText("Confirm the concern"));
    await user.click(screen.getByLabelText("Interrupt"));
    await user.click(screen.getByLabelText("Interrupt"));
    await user.click(screen.getByRole("button", { name: "Check answer" }));

    expect(await screen.findByText("Both slow the call down.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Finish" }));

    expect(finalizeQuizAttempt).toHaveBeenCalledWith({ attemptId: "attempt-1" });
    expect(answerQuizQuestion).toHaveBeenNthCalledWith(1, {
      attemptId: "attempt-1",
      questionId: "single",
      selected: ["single-b"],
    });
    expect(answerQuizQuestion).toHaveBeenNthCalledWith(2, {
      attemptId: "attempt-1",
      questionId: "truth",
      selected: ["false"],
    });
    expect(answerQuizQuestion).toHaveBeenNthCalledWith(3, {
      attemptId: "attempt-1",
      questionId: "multi",
      selected: ["multi-a", "multi-b"],
    });
    expect(await screen.findByRole("heading", { name: "Passed" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Passed" })).toHaveFocus();
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("img", { name: "Andrea" })).toHaveAttribute(
      "src",
      "/brand/mascot/face-laugh.png",
    );
  });

  it("keeps a wrong answer private and uses accurate locked-answer coaching", async () => {
    const user = userEvent.setup();
    vi.mocked(answerQuizQuestion).mockResolvedValue(revealFor("single", false));
    renderRunner();
    await start(user);
    const mountedAnnouncement = document.querySelector(
      "[data-quiz-feedback-announcement]",
    );
    expect(mountedAnnouncement).toBeEmptyDOMElement();

    await user.click(screen.getByLabelText("Lead with the offer"));
    await user.click(screen.getByRole("button", { name: "Check answer" }));

    expect(await screen.findByText("Incorrect")).toBeVisible();
    expect(screen.getByText("Not quite. That answer is locked — keep going.")).toBeVisible();
    const announcement = document.querySelector("[data-quiz-feedback-announcement]");
    expect(announcement).toHaveTextContent(
      "Incorrect. Not quite. That answer is locked — keep going.",
    );
    expect(announcement).not.toHaveTextContent("Ask before pitching.");
    expect(screen.queryByText("Correct answer")).not.toBeInTheDocument();
    expect(screen.getAllByText("Ask one clear question")).toHaveLength(1);
    expect(screen.queryByText("Ask before pitching.")).not.toBeInTheDocument();
    const wrongOption = screen.getByLabelText("Lead with the offer").closest("label") as HTMLElement;
    expect(wrongOption.style.borderColor).toBe("var(--danger)");
    expect(wrongOption.style.background).toBe("var(--danger-soft)");
    const neutralOption = screen.getByLabelText("Ask one clear question").closest("label") as HTMLElement;
    expect(neutralOption.style.borderColor).toBe("var(--ink-200)");
    expect(neutralOption.style.background).toBe("var(--paper)");
    expect(screen.getByRole("img", { name: "Andrea" })).toHaveAttribute(
      "src",
      "/brand/mascot/face-worried.png",
    );
  });

  it("suppresses a correct explanation that duplicates the selected answer", async () => {
    const user = userEvent.setup();
    vi.mocked(answerQuizQuestion).mockResolvedValue({
      ok: true,
      reveal: {
        questionId: "single",
        isCorrect: true,
        explanation: "Ask one clear question",
      },
    });
    renderRunner();
    await start(user);

    await user.click(screen.getByLabelText("Ask one clear question"));
    await user.click(screen.getByRole("button", { name: "Check answer" }));

    expect(await screen.findByText("Correct")).toBeVisible();
    expect(screen.getAllByText("Ask one clear question")).toHaveLength(1);
    expect(screen.queryByText("Correct answer")).not.toBeInTheDocument();
  });

  it("announces fresh feedback but not history replay through Back", async () => {
    const user = userEvent.setup();
    renderRunner();
    await start(user);
    const mountedAnnouncement = document.querySelector(
      "[data-quiz-feedback-announcement]",
    );
    expect(mountedAnnouncement).toBeEmptyDOMElement();
    await user.click(screen.getByLabelText("Ask one clear question"));
    await user.click(screen.getByRole("button", { name: "Check answer" }));

    expect(await screen.findByText("Correct")).toBeVisible();
    expect(document.querySelectorAll("[data-quiz-feedback-announcement]")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText("Ask before pitching.")).toBeVisible();
    expect(document.querySelectorAll("[data-quiz-feedback-announcement]")).toHaveLength(1);
    expect(document.querySelector("[data-quiz-feedback-announcement]")).toBeEmptyDOMElement();
  });

  it("resumes at the first unanswered question and replays history without a server call", async () => {
    const user = userEvent.setup();
    vi.mocked(startQuizAttempt).mockResolvedValue({
      ok: true,
      attemptId: "attempt-1",
      questions: attemptQuestions,
      resumed: true,
      responses: { single: ["single-b"] },
      reveals: [revealFor("single").reveal],
    });
    renderRunner();

    await user.click(screen.getByRole("button", { name: "Start quiz" }));
    expect(await screen.findByRole("heading", { name: questions[1].question_text })).toBeVisible();
    expect(answerQuizQuestion).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText("Ask before pitching.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("heading", { name: questions[1].question_text })).toBeVisible();
    expect(answerQuizQuestion).not.toHaveBeenCalled();
  });

  it("advances through a sparse resumed answer without dead-ending", async () => {
    const user = userEvent.setup();
    vi.mocked(startQuizAttempt).mockResolvedValue({
      ok: true,
      attemptId: "attempt-1",
      questions: attemptQuestions,
      resumed: true,
      responses: { truth: ["false"] },
      reveals: [revealFor("truth").reveal],
    });
    renderRunner();
    await start(user);
    await answerAndNext(user, "Ask one clear question");
    expect(await screen.findByText("Mirroring is selective.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("heading", { name: questions[2].question_text })).toBeVisible();
  });

  it("retries a failed check with byte-for-byte identical action arguments", async () => {
    const user = userEvent.setup();
    vi.mocked(answerQuizQuestion)
      .mockRejectedValueOnce(new Error("network lost"))
      .mockResolvedValueOnce(revealFor("single"));
    renderRunner();
    await start(user);

    await user.click(screen.getByLabelText("Ask one clear question"));
    await user.click(screen.getByRole("button", { name: "Check answer" }));
    expect(await screen.findByText("Couldn't check that answer")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Correct")).toBeVisible();
    expect(answerQuizQuestion).toHaveBeenCalledTimes(2);
    expect(vi.mocked(answerQuizQuestion).mock.calls[0]).toEqual(
      vi.mocked(answerQuizQuestion).mock.calls[1],
    );
  });

  it("recovers from a rejected check request and keeps Back locked", async () => {
    const user = userEvent.setup();
    vi.mocked(answerQuizQuestion)
      .mockResolvedValueOnce(revealFor("single"))
      .mockRejectedValueOnce(new Error("transport lost"))
      .mockResolvedValueOnce(revealFor("truth"));
    renderRunner();
    await start(user);
    await answerAndNext(user, "Ask one clear question");
    await user.click(screen.getByLabelText("False"));
    await user.click(screen.getByRole("button", { name: "Check answer" }));
    expect(await screen.findByText("Couldn't check that answer")).toBeVisible();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Mirroring is selective.")).toBeVisible();
  });

  it("turns retry-after-landed-write into feedback instead of another error", async () => {
    const user = userEvent.setup();
    vi.mocked(answerQuizQuestion)
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce(revealFor("single"));
    renderRunner();
    await start(user);
    await user.click(screen.getByLabelText("Ask one clear question"));
    await user.click(screen.getByRole("button", { name: "Check answer" }));
    await user.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Ask before pitching.")).toBeVisible();
  });

  it("reloads saved progress after a definitive first-answer-lock conflict", async () => {
    const user = userEvent.setup();
    vi.mocked(answerQuizQuestion).mockResolvedValueOnce({
      ok: false,
      error: "This question has already been answered.",
    });
    vi.mocked(startQuizAttempt)
      .mockResolvedValueOnce({
        ok: true,
        attemptId: "attempt-1",
        questions: attemptQuestions,
        resumed: false,
        responses: {},
        reveals: [],
      })
      .mockResolvedValueOnce({
        ok: true,
        attemptId: "attempt-1",
        questions: attemptQuestions,
        resumed: true,
        responses: { single: ["single-a"] },
        reveals: [revealFor("single", false).reveal],
      });
    renderRunner();
    await start(user);
    await user.click(screen.getByLabelText("Ask one clear question"));
    await user.click(screen.getByRole("button", { name: "Check answer" }));

    expect(await screen.findByText("This question has already been answered.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Reload saved progress" }));
    expect(await screen.findByRole("heading", { name: questions[1].question_text })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText("Incorrect")).toBeVisible();
    expect(screen.queryByText("Correct answer")).not.toBeInTheDocument();
    expect(screen.queryByText("Ask before pitching.")).not.toBeInTheDocument();
    const wrongOption = screen.getByLabelText("Lead with the offer").closest("label") as HTMLElement;
    const neutralOption = screen.getByLabelText("Ask one clear question").closest("label") as HTMLElement;
    expect(wrongOption.style.borderColor).toBe("var(--danger)");
    expect(neutralOption.style.borderColor).toBe("var(--ink-200)");
    expect(document.querySelector("[data-quiz-feedback-announcement]")).toBeEmptyDOMElement();
    expect(startQuizAttempt).toHaveBeenCalledTimes(2);
    expect(answerQuizQuestion).toHaveBeenCalledTimes(1);
  });

  it("retries finalize without losing checked answers", async () => {
    const user = userEvent.setup();
    vi.mocked(startQuizAttempt).mockResolvedValue({
      ok: true,
      attemptId: "attempt-1",
      questions: [attemptQuestions[0]],
      resumed: false,
      responses: {},
      reveals: [],
    });
    vi.mocked(finalizeQuizAttempt)
      .mockRejectedValueOnce(new Error("network lost"))
      .mockResolvedValueOnce({ ...finalPass, earnedPoints: 1, totalPoints: 1 });
    renderRunner();
    await user.click(screen.getByRole("button", { name: "Start quiz" }));
    await user.click(await screen.findByLabelText("Ask one clear question"));
    await user.click(screen.getByRole("button", { name: "Check answer" }));
    await user.click(await screen.findByRole("button", { name: "Finish" }));

    expect(await screen.findByText("Your checked answers are still saved.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try finishing again" }));
    expect(await screen.findByRole("heading", { name: "Passed" })).toBeVisible();
    expect(finalizeQuizAttempt).toHaveBeenCalledTimes(2);
  });

  it("reloads saved progress after a definitive finalize rejection", async () => {
    const user = userEvent.setup();
    vi.mocked(startQuizAttempt)
      .mockResolvedValueOnce({
        ok: true,
        attemptId: "attempt-1",
        questions: [attemptQuestions[0]],
        resumed: false,
        responses: {},
        reveals: [],
      })
      .mockResolvedValueOnce({
        ok: true,
        attemptId: "attempt-1",
        questions: [attemptQuestions[0]],
        resumed: true,
        responses: { single: ["single-b"] },
        reveals: [revealFor("single").reveal],
      });
    vi.mocked(finalizeQuizAttempt).mockResolvedValueOnce({
      ok: false,
      error: "Answer every question before submitting.",
    });
    renderRunner();
    await start(user);
    await user.click(screen.getByLabelText("Ask one clear question"));
    await user.click(screen.getByRole("button", { name: "Check answer" }));
    await user.click(await screen.findByRole("button", { name: "Finish" }));

    expect(await screen.findByText("Answer every question before submitting.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Try finishing again" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Reload saved progress" }));
    expect(await screen.findByText("Ask before pitching.")).toBeVisible();
    expect(startQuizAttempt).toHaveBeenCalledTimes(2);
    expect(finalizeQuizAttempt).toHaveBeenCalledTimes(1);
  });

  it("recovers from a rejected finalize request", async () => {
    const user = userEvent.setup();
    vi.mocked(startQuizAttempt).mockResolvedValue({
      ok: true,
      attemptId: "attempt-1",
      questions: [attemptQuestions[0]],
      resumed: false,
      responses: {},
      reveals: [],
    });
    vi.mocked(finalizeQuizAttempt)
      .mockRejectedValueOnce(new Error("transport lost"))
      .mockResolvedValueOnce({ ...finalPass, earnedPoints: 1, totalPoints: 1 });
    renderRunner();
    await start(user);
    await user.click(screen.getByLabelText("Ask one clear question"));
    await user.click(screen.getByRole("button", { name: "Check answer" }));
    await user.click(await screen.findByRole("button", { name: "Finish" }));
    expect(await screen.findByRole("button", { name: "Try finishing again" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try finishing again" }));
    expect(await screen.findByRole("heading", { name: "Passed" })).toBeVisible();
  });

  it("cannot advance past the maximum reached question", async () => {
    const user = userEvent.setup();
    renderRunner();
    await start(user);
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
    await answerAndNext(user, "Ask one clear question");
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: questions[1].question_text })).toBeVisible();
    expect(screen.queryByRole("heading", { name: questions[2].question_text })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
  });

  it("preserves failed-result retake behavior and resets the runner", async () => {
    const user = userEvent.setup();
    vi.mocked(startQuizAttempt).mockResolvedValue({
      ok: true,
      attemptId: "attempt-2",
      questions: [attemptQuestions[0]],
      resumed: false,
      responses: {},
      reveals: [],
    });
    vi.mocked(finalizeQuizAttempt).mockResolvedValue({
      ok: true,
      score: 50,
      passed: false,
      earnedPoints: 0,
      totalPoints: 1,
      attemptId: "attempt-2",
      review: null,
    });
    renderRunner();
    await user.click(screen.getByRole("button", { name: "Start quiz" }));
    await user.click(await screen.findByLabelText("Lead with the offer"));
    await user.click(screen.getByRole("button", { name: "Check answer" }));
    await user.click(await screen.findByRole("button", { name: "Finish" }));

    expect(await screen.findByRole("heading", { name: "Keep going" })).toBeVisible();
    expect(screen.getByRole("img", { name: "Andrea" })).toHaveAttribute(
      "src",
      "/brand/mascot/face-worried.png",
    );
    await user.click(screen.getByRole("button", { name: "Retake quiz" }));
    expect(screen.getByRole("heading", { name: "Ready for the checkpoint?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Start quiz" }));
    expect(await screen.findByText("Attempt 3 of 3")).toBeVisible();
  });

  it("keeps the attempts-exhausted result state", async () => {
    const user = userEvent.setup();
    vi.mocked(startQuizAttempt).mockResolvedValue({
      ok: true,
      attemptId: "attempt-final",
      questions: [attemptQuestions[0]],
      resumed: false,
      responses: {},
      reveals: [],
    });
    vi.mocked(finalizeQuizAttempt).mockResolvedValue({
      ok: true,
      score: 0,
      passed: false,
      earnedPoints: 0,
      totalPoints: 1,
      attemptId: "attempt-final",
      review: null,
    });
    renderRunner({ attemptsUsed: 2, attemptsLeft: 1 });
    await user.click(screen.getByRole("button", { name: "Start quiz" }));
    await user.click(await screen.findByLabelText("Lead with the offer"));
    await user.click(screen.getByRole("button", { name: "Check answer" }));
    await user.click(await screen.findByRole("button", { name: "Finish" }));
    expect(await screen.findByRole("heading", { name: "Attempts complete" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Retake quiz" })).toBeNull();
    expect(screen.getByText(/no more attempts are available/i)).toBeVisible();
  });

  it("renders only numbered correct-response explanations in final review", async () => {
    const user = userEvent.setup();
    vi.mocked(startQuizAttempt).mockResolvedValue({
      ok: true,
      attemptId: "attempt-review",
      questions: [attemptQuestions[0]],
      resumed: false,
      responses: {},
      reveals: [],
    });
    vi.mocked(finalizeQuizAttempt).mockResolvedValue({
      ...finalPass,
      attemptId: "attempt-review",
      review: [
        { questionId: "single", questionNumber: 1, explanation: "First useful explanation." },
        { questionId: "multi", questionNumber: 3, explanation: "Third useful explanation." },
      ],
    });
    renderRunner();
    await start(user);
    await user.click(screen.getByLabelText("Ask one clear question"));
    await user.click(screen.getByRole("button", { name: "Check answer" }));
    await user.click(await screen.findByRole("button", { name: "Finish" }));

    expect(await screen.findByRole("heading", { name: "Correct-response review" })).toBeVisible();
    expect(screen.getByText("Question 1 explanation")).toBeVisible();
    expect(screen.getByText("Question 3 explanation")).toBeVisible();
    expect(screen.getAllByText("First useful explanation.")).toHaveLength(1);
    expect(screen.getAllByText("Third useful explanation.")).toHaveLength(1);
    expect(screen.queryByText("Correct answer")).not.toBeInTheDocument();
    expect(screen.queryByText("Ask one clear question", { selector: "p" })).not.toBeInTheDocument();
  });

  it("renders a legacy summary without a fabricated point breakdown", async () => {
    const user = userEvent.setup();
    vi.mocked(startQuizAttempt).mockResolvedValue({
      ok: true,
      attemptId: "attempt-legacy",
      questions: [attemptQuestions[0]],
      resumed: false,
      responses: {},
      reveals: [],
    });
    vi.mocked(finalizeQuizAttempt).mockResolvedValue({
      ok: true,
      score: 50,
      passed: false,
      earnedPoints: null,
      totalPoints: null,
      attemptId: "attempt-legacy",
      review: null,
    });
    renderRunner();
    await start(user);
    await user.click(screen.getByLabelText("Lead with the offer"));
    await user.click(screen.getByRole("button", { name: "Check answer" }));
    await user.click(await screen.findByRole("button", { name: "Finish" }));

    expect(await screen.findByText("50% score")).toBeVisible();
    expect(screen.queryByText(/points$/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Correct-response review" })).not.toBeInTheDocument();
  });

  it("keeps the cooldown result state", async () => {
    const user = userEvent.setup();
    vi.mocked(startQuizAttempt).mockResolvedValue({
      ok: true,
      attemptId: "attempt-cooldown",
      questions: [attemptQuestions[0]],
      resumed: false,
      responses: {},
      reveals: [],
    });
    vi.mocked(finalizeQuizAttempt).mockResolvedValue({
      ok: true,
      score: 0,
      passed: false,
      earnedPoints: 0,
      totalPoints: 1,
      attemptId: "attempt-cooldown",
      review: null,
    });
    renderRunner({ retakeCooldownHours: 24 });
    await start(user);
    await user.click(screen.getByLabelText("Lead with the offer"));
    await user.click(screen.getByRole("button", { name: "Check answer" }));
    await user.click(await screen.findByRole("button", { name: "Finish" }));
    expect(await screen.findByText(/return when the retake cooldown ends/i)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Retake quiz" })).toBeNull();
  });

  it("shows the start error and restores the start control", async () => {
    const user = userEvent.setup();
    const { toast } = await import("sonner");
    vi.mocked(startQuizAttempt).mockResolvedValue({
      ok: false,
      error: "This quiz does not have any questions yet.",
    });
    renderRunner();
    await user.click(screen.getByRole("button", { name: "Start quiz" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      "This quiz does not have any questions yet.",
    ));
    expect(screen.getByRole("button", { name: "Start quiz" })).toBeEnabled();
  });

  it("recovers when the start request rejects", async () => {
    const user = userEvent.setup();
    const { toast } = await import("sonner");
    vi.mocked(startQuizAttempt).mockRejectedValueOnce(new Error("transport lost"));
    renderRunner();
    await user.click(screen.getByRole("button", { name: "Start quiz" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      "Could not start the quiz. Try again.",
    ));
    expect(screen.getByRole("button", { name: "Start quiz" })).toBeEnabled();
  });
});
