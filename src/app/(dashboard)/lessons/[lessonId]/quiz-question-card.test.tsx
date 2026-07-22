import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { QuizQuestionCard } from "./quiz-question-card";
import type { QuizQuestion } from "./quiz-runner";

const single: QuizQuestion = {
  id: "single",
  question_text: "Choose one",
  question_type: "single_choice",
  options: [
    { id: "a", option_text: "Alpha" },
    { id: "b", option_text: "Beta" },
  ],
};
const multi: QuizQuestion = {
  ...single,
  id: "multi",
  question_text: "Choose many",
  question_type: "multi_select",
};
const truth: QuizQuestion = {
  ...single,
  id: "truth",
  question_text: "Choose true or false",
  question_type: "true_false",
};

function renderCard(overrides: Partial<React.ComponentProps<typeof QuizQuestionCard>> = {}) {
  const props: React.ComponentProps<typeof QuizQuestionCard> = {
    question: single,
    index: 0,
    total: 2,
    selected: [],
    phase: "answering",
    feedback: null,
    onToggle: vi.fn(),
    onCheck: vi.fn(),
    onRetryCheck: vi.fn(),
    ...overrides,
  };
  return { ...render(<QuizQuestionCard {...props} />), props };
}

describe("<QuizQuestionCard />", () => {
  it("keeps Check answer disabled until one selection exists for every type", () => {
    const { rerender, props } = renderCard();
    expect(screen.getByRole("button", { name: "Check answer" })).toBeDisabled();
    rerender(<QuizQuestionCard {...props} selected={["a"]} />);
    expect(screen.getByRole("button", { name: "Check answer" })).toBeEnabled();
    rerender(<QuizQuestionCard {...props} question={truth} selected={[]} />);
    expect(screen.getByRole("button", { name: "Check answer" })).toBeDisabled();
    rerender(<QuizQuestionCard {...props} question={truth} selected={["a"]} />);
    expect(screen.getByRole("button", { name: "Check answer" })).toBeEnabled();
    rerender(<QuizQuestionCard {...props} question={multi} selected={["a"]} />);
    expect(screen.getByRole("button", { name: "Check answer" })).toBeEnabled();
  });

  it("uses native radios for single choice and checkboxes for multi-select", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const { rerender, props } = renderCard({ onToggle });
    expect(screen.getByLabelText("Alpha")).toHaveAttribute("type", "radio");
    await user.click(screen.getByLabelText("Beta"));
    expect(onToggle).toHaveBeenCalledWith("b");
    rerender(<QuizQuestionCard {...props} question={multi} onToggle={onToggle} />);
    expect(screen.getByLabelText("Alpha")).toHaveAttribute("type", "checkbox");
    rerender(<QuizQuestionCard {...props} question={truth} onToggle={onToggle} />);
    expect(screen.getByLabelText("Alpha")).toHaveAttribute("type", "radio");
  });

  for (const phase of [
    "checking",
    "revealed",
    "check_error",
    "finalizing",
    "finalize_error",
  ] as const) {
    it(`locks every input during ${phase}`, () => {
      renderCard({
        phase,
        selected: ["a"],
        feedback: phase === "revealed" ? {
          correct: true,
          explanation: "Alpha is right.",
        } : null,
      });
      for (const input of screen.getAllByRole("radio")) {
        expect(input).toBeDisabled();
        expect(input).toHaveAttribute("aria-disabled", "true");
      }
    });
  }

  it("associates the option group with the focused question prompt", () => {
    renderCard();
    expect(screen.getByRole("group", { name: "Choose one" })).toBeVisible();
  });

  it("renders correct and incorrect feedback with the required badge tone", () => {
    const { rerender, props } = renderCard({
      phase: "revealed",
      selected: ["a"],
      feedback: { correct: true, explanation: "Right." },
    });
    expect(screen.getByText("Correct")).toHaveStyle({
      background: "var(--success-soft)",
    });
    const correctOption = screen.getByLabelText("Alpha").closest("label") as HTMLElement;
    expect(correctOption.style.borderColor).toBe("var(--success)");
    expect(correctOption.style.background).toBe("var(--success-soft)");
    rerender(<QuizQuestionCard
      {...props}
      phase="revealed"
      selected={["b"]}
      feedback={{ correct: false }}
    />);
    expect(screen.getByText("Incorrect")).toHaveStyle({
      background: "var(--danger-soft)",
    });
    const wrongOption = screen.getByLabelText("Beta").closest("label") as HTMLElement;
    expect(wrongOption.style.borderColor).toBe("var(--danger)");
    expect(wrongOption.style.background).toBe("var(--danger-soft)");
    const neutralOption = screen.getByLabelText("Alpha").closest("label") as HTMLElement;
    expect(neutralOption.style.borderColor).toBe("var(--ink-200)");
    expect(neutralOption.style.background).toBe("var(--paper)");
  });
});
