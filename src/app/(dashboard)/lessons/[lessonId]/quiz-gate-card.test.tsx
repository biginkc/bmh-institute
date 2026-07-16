import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { QuizGateCard } from "./quiz-gate-card";

describe("<QuizGateCard />", () => {
  it("celebrates a prior pass", () => {
    render(
      <QuizGateCard
        state="passed"
        bestScore={92}
        attemptsUsed={1}
        maxAttempts={3}
        nextAvailableAt={null}
        backHref="/courses/course-1"
      />,
    );

    expect(screen.getByRole("heading", { name: "Passed" })).toBeInTheDocument();
    expect(screen.getByText(/passed this quiz with a score of 92%/i)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Andrea" })).toHaveAttribute(
      "src",
      "/brand/mascot/face-laugh.png",
    );
    expect(screen.getByRole("link", { name: "Back to course" })).toHaveAttribute(
      "href",
      "/courses/course-1",
    );
  });

  it("shows the no-attempts state with the best score", () => {
    render(
      <QuizGateCard
        state="max_reached"
        bestScore={64}
        attemptsUsed={3}
        maxAttempts={3}
        nextAvailableAt={null}
        backHref="/courses/course-1"
      />,
    );

    expect(screen.getByRole("heading", { name: "No attempts left" })).toBeInTheDocument();
    expect(screen.getByText(/used all 3 attempts/i)).toBeInTheDocument();
    expect(screen.getByText(/best score so far: 64%/i)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Andrea" })).toHaveAttribute(
      "src",
      "/brand/mascot/face-worried.png",
    );
  });

  it("shows the worried cooldown state and attempt count", () => {
    render(
      <QuizGateCard
        state="cooldown"
        bestScore={70}
        attemptsUsed={2}
        maxAttempts={3}
        nextAvailableAt="2026-07-16T12:00:00.000Z"
        backHref="/courses/course-1"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Retake cooldown in effect" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/attempts used: 2 \/ 3/i)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Andrea" })).toHaveAttribute(
      "src",
      "/brand/mascot/face-worried.png",
    );
  });
});
