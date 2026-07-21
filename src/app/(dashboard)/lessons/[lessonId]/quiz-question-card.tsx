"use client";

import { useEffect, useRef } from "react";

import { Button } from "@/components/bmh-ds/button";
import { Card } from "@/components/bmh-ds/card";

import { QuizFeedback } from "./quiz-feedback";
import type { QuizQuestion } from "./quiz-runner";

type Recovery = {
  kind: "retry" | "reload";
  message: string;
} | null;

export type QuizQuestionPhase =
  | "answering"
  | "checking"
  | "revealed"
  | "check_error"
  | "finalizing"
  | "finalize_error";

type Feedback = {
  correct: boolean;
  correctOptionIds: string[];
  explanation: string | null;
} | null;

export function QuizQuestionCard({
  question,
  index,
  total,
  selected,
  phase,
  feedback,
  recovery = null,
  onToggle,
  onCheck,
  onRetryCheck,
  onReload = onRetryCheck,
}: {
  question: QuizQuestion;
  index: number;
  total: number;
  selected: string[];
  phase: QuizQuestionPhase;
  feedback: Feedback;
  recovery?: Recovery;
  onToggle: (optionId: string) => void;
  onCheck: () => void;
  onRetryCheck: () => void;
  onReload?: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [index]);

  const locked = phase !== "answering";
  const headingId = `quiz-question-${question.id}`;
  return (
    <Card padding="md">
      <div className="mb-4 flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--ink-900)] font-[family-name:var(--font-body)] text-sm font-extrabold text-[var(--paper)]"
        >
          {index + 1}
        </span>
        <div className="min-w-0">
          <h3
            id={headingId}
            ref={headingRef}
            tabIndex={-1}
            className="font-[family-name:var(--font-display)] text-lg font-bold leading-snug text-[var(--ink-900)] outline-none"
          >
            {question.question_text}
          </h3>
          {question.question_type === "multi_select" ? (
            <p className="mt-1 font-[family-name:var(--font-body)] text-xs font-bold text-[var(--text-muted)]">
              Select all that apply
            </p>
          ) : null}
          <span className="sr-only">Question {index + 1} of {total}</span>
        </div>
      </div>

      <div
        role="group"
        aria-labelledby={headingId}
        className="flex flex-col gap-2.5"
      >
        {question.options.map((option) => {
          const isSelected = selected.includes(option.id);
          const isCorrect = feedback?.correctOptionIds.includes(option.id) ?? false;
          const inputId = `${question.id}-${option.id}`;
          let borderColor = isSelected ? "var(--action)" : "var(--ink-200)";
          let background = isSelected ? "var(--action-soft)" : "var(--paper)";
          if (feedback) {
            if (isCorrect && isSelected) {
              borderColor = "var(--success)";
              background = "var(--success-soft)";
            } else if (isCorrect) {
              borderColor = "var(--success)";
              background = "var(--paper)";
            } else if (isSelected) {
              borderColor = "var(--danger)";
              background = "var(--danger-soft)";
            } else {
              borderColor = "var(--ink-200)";
              background = "var(--paper)";
            }
          }
          return (
            <label
              key={option.id}
              htmlFor={inputId}
              className="flex items-center gap-3 rounded-[var(--bmh-radius-md)] border-2 px-4 py-3 font-[family-name:var(--font-body)] text-sm font-bold text-[var(--ink-900)] transition-colors"
              style={{ borderColor, background, cursor: locked ? "default" : "pointer" }}
            >
              <input
                id={inputId}
                type={question.question_type === "multi_select" ? "checkbox" : "radio"}
                name={question.id}
                checked={isSelected}
                disabled={locked}
                aria-disabled={locked ? "true" : "false"}
                onChange={() => onToggle(option.id)}
                className="size-4 accent-[var(--action)]"
              />
              <span>{option.option_text}</span>
            </label>
          );
        })}
      </div>

      {phase === "check_error" ? (
        <div role="alert" className="mt-5 rounded-[var(--bmh-radius-md)] border-2 border-[var(--danger)] bg-[var(--danger-soft)] p-4">
          <p className="text-sm font-extrabold text-[var(--ink-900)]">
            Couldn&apos;t check that answer
          </p>
          <p className="mt-1 text-sm font-semibold text-[var(--text-muted)]">
            {recovery?.message ?? "Your selection is locked here. Try the same answer again."}
          </p>
          {recovery?.kind === "reload" ? (
            <Button className="mt-3" onClick={onReload}>Reload saved progress</Button>
          ) : (
            <Button className="mt-3" onClick={onRetryCheck}>Try again</Button>
          )}
        </div>
      ) : feedback ? (
        <QuizFeedback
          correct={feedback.correct}
          correctOptions={question.options
            .filter((option) => feedback.correctOptionIds.includes(option.id))
            .map((option) => option.option_text)}
          explanation={feedback.explanation}
        />
      ) : (
        <div className="mt-5 flex justify-end">
          <Button
            onClick={onCheck}
            disabled={phase !== "answering" || selected.length < 1}
          >
            {phase === "checking" ? "Checking..." : "Check answer"}
          </Button>
        </div>
      )}
    </Card>
  );
}
