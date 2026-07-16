import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  createQuestion,
  deleteAnswerOption,
  deleteQuestion,
  moveQuestion,
  updateAnswerOption,
  updateQuizSettings,
} from "./quiz-actions";
import { QuizEditor } from "./quiz-editor";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("./quiz-actions", () => ({
  createAnswerOption: vi.fn(async () => ({ ok: true })),
  createQuestion: vi.fn(async () => ({ ok: true })),
  deleteAnswerOption: vi.fn(async () => ({ ok: true })),
  deleteQuestion: vi.fn(async () => ({ ok: true })),
  moveQuestion: vi.fn(async () => ({ ok: true })),
  updateAnswerOption: vi.fn(async () => ({ ok: true })),
  updateQuestion: vi.fn(async () => ({ ok: true })),
  updateQuizSettings: vi.fn(async () => ({ ok: true })),
}));

describe("<QuizEditor />", () => {
  it("keeps quiz settings and question options editable", async () => {
    const user = userEvent.setup();
    render(
      <QuizEditor
        lessonId="lesson-1"
        quiz={{
          id: "quiz-1",
          title: "Opening quiz",
          description: "Check understanding",
          passing_score: 80,
          randomize_questions: true,
          randomize_answers: true,
          questions_per_attempt: null,
          max_attempts: 3,
          retake_cooldown_hours: 1,
          show_correct_answers_after: "after_pass",
        }}
        questions={[
          {
            id: "question-1",
            question_text: "What comes first?",
            question_type: "single_choice",
            explanation: null,
            points: 1,
            sort_order: 0,
            answer_options: [
              {
                id: "option-1",
                option_text: "Build rapport",
                is_correct: true,
                sort_order: 0,
              },
              {
                id: "option-2",
                option_text: "Ask for the price",
                is_correct: false,
                sort_order: 1,
              },
            ],
          },
          {
            id: "question-2",
            question_text: "Is tone important?",
            question_type: "true_false",
            explanation: null,
            points: 1,
            sort_order: 1,
            answer_options: [
              {
                id: "option-3",
                option_text: "True",
                is_correct: true,
                sort_order: 0,
              },
              {
                id: "option-4",
                option_text: "False",
                is_correct: false,
                sort_order: 1,
              },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByDisplayValue("What comes first?")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Build rapport")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Passing score (%)"));
    await user.type(screen.getByLabelText("Passing score (%)"), "85");
    await user.click(screen.getByRole("button", { name: "Save settings" }));

    expect(updateQuizSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        quizId: "quiz-1",
        lessonId: "lesson-1",
        passing_score: 85,
      }),
    );

    await user.click(screen.getAllByLabelText("Mark correct")[1]);
    await waitFor(() =>
      expect(updateAnswerOption).toHaveBeenCalledWith({
        optionId: "option-2",
        lessonId: "lesson-1",
        text: "Ask for the price",
        is_correct: true,
        exclusivePeerOptionIds: ["option-1"],
      }),
    );

    const secondOption = screen.getByDisplayValue("Ask for the price");
    await user.clear(secondOption);
    await user.type(secondOption, "Ask a qualifying question");
    await user.tab();
    await waitFor(() =>
      expect(updateAnswerOption).toHaveBeenCalledWith({
        optionId: "option-2",
        lessonId: "lesson-1",
        text: "Ask a qualifying question",
        is_correct: true,
        exclusivePeerOptionIds: ["option-1"],
      }),
    );

    await user.click(screen.getAllByRole("button", { name: "Move question down" })[0]);
    await waitFor(() =>
      expect(moveQuestion).toHaveBeenCalledWith({
        questionId: "question-1",
        quizId: "quiz-1",
        lessonId: "lesson-1",
        direction: "down",
      }),
    );

    await user.selectOptions(screen.getByLabelText("New question type"), "multi_select");
    await user.click(screen.getByRole("button", { name: "Add question" }));
    await waitFor(() =>
      expect(createQuestion).toHaveBeenCalledWith({
        quizId: "quiz-1",
        lessonId: "lesson-1",
        type: "multi_select",
      }),
    );

    const confirm = vi.spyOn(globalThis, "confirm").mockReturnValue(true);
    await user.click(screen.getAllByRole("button", { name: "Delete option" })[1]);
    await waitFor(() =>
      expect(deleteAnswerOption).toHaveBeenCalledWith({
        optionId: "option-2",
        lessonId: "lesson-1",
      }),
    );
    await user.click(screen.getAllByRole("button", { name: "Delete question" })[0]);
    await waitFor(() =>
      expect(deleteQuestion).toHaveBeenCalledWith({
        questionId: "question-1",
        lessonId: "lesson-1",
      }),
    );
    confirm.mockRestore();
  });
});
