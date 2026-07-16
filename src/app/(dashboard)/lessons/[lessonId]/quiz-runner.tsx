"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/bmh-ds/badge";
import { Button } from "@/components/bmh-ds/button";
import { Card } from "@/components/bmh-ds/card";
import { Coach } from "@/components/bmh-ds/coach";

import { submitQuizAttempt, type QuizSubmitResult } from "./quiz-actions";

export type QuizQuestion = {
  id: string;
  question_text: string;
  question_type: "true_false" | "single_choice" | "multi_select";
  options: { id: string; option_text: string }[];
};

const linkButtonClass =
  "inline-flex items-center justify-center rounded-[var(--bmh-radius-md)] border-[2.5px] border-[var(--ink-900)] bg-[var(--paper)] px-5 py-3 font-[family-name:var(--font-body)] text-sm font-extrabold text-[var(--ink-900)] transition-colors hover:bg-[var(--ink-050)]";

export function QuizRunner({
  quizId,
  lessonId,
  passingScore,
  questions,
  backHref,
  attemptsUsed,
  attemptsLeft,
}: {
  quizId: string;
  lessonId: string;
  passingScore: number;
  questions: QuizQuestion[];
  backHref: string;
  attemptsUsed: number;
  attemptsLeft: number | null;
}) {
  const [responses, setResponses] = useState<Record<string, string[]>>({});
  const [result, setResult] = useState<QuizSubmitResult | null>(null);
  const [pending, startTransition] = useTransition();

  if (questions.length === 0) {
    return (
      <Card outline padding="lg">
        <div className="mb-5">
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-extrabold text-[var(--ink-900)]">
            No questions yet
          </h2>
        </div>
        <Coach
          emotion="curious"
          tone="tint"
          size="sm"
          message="This quiz doesn't have any questions yet. An admin needs to add some."
        />
      </Card>
    );
  }

  if (result && result.ok) {
    return (
      <QuizResultCard
        result={result}
        passingScore={passingScore}
        backHref={backHref}
        onRetake={() => {
          setResult(null);
          setResponses({});
        }}
      />
    );
  }

  function onToggle(question: QuizQuestion, optionId: string) {
    setResponses((prev) => {
      const current = prev[question.id] ?? [];
      if (question.question_type === "multi_select") {
        return {
          ...prev,
          [question.id]: current.includes(optionId)
            ? current.filter((id) => id !== optionId)
            : [...current, optionId],
        };
      }
      return { ...prev, [question.id]: [optionId] };
    });
  }

  function onSubmit() {
    const answered = questions.every(
      (question) => (responses[question.id] ?? []).length > 0,
    );
    if (!answered) {
      toast.error("Answer every question before submitting.");
      return;
    }
    startTransition(async () => {
      const response = await submitQuizAttempt({ quizId, lessonId, responses });
      setResult(response);
      if (!response.ok) {
        toast.error(response.error);
      }
    });
  }

  const attemptLabel =
    attemptsLeft !== null
      ? `Attempt ${attemptsUsed + 1} of ${attemptsUsed + attemptsLeft}`
      : attemptsUsed > 0
        ? `Attempt ${attemptsUsed + 1}`
        : "Retakes available";

  return (
    <div className="flex flex-col gap-5">
      <Card outline padding="md" tint>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-3xl font-extrabold text-[var(--ink-900)]">
              Quiz
            </h2>
            <p className="mt-1 font-[family-name:var(--font-body)] text-sm font-semibold text-[var(--text-muted)]">
              Answer every question. You need {passingScore}% to pass.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral">{attemptLabel}</Badge>
            <Badge tone="yellow">Pass mark: {passingScore}%</Badge>
          </div>
        </div>
      </Card>

      {questions.map((question, index) => (
        <Card key={question.id} padding="md">
          <div className="mb-4 flex items-start gap-3">
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--ink-900)] font-[family-name:var(--font-body)] text-sm font-extrabold text-[var(--paper)]"
            >
              {index + 1}
            </span>
            <div className="min-w-0">
              <h3 className="font-[family-name:var(--font-display)] text-lg font-bold leading-snug text-[var(--ink-900)]">
                {question.question_text}
              </h3>
              {question.question_type === "multi_select" ? (
                <p className="mt-1 font-[family-name:var(--font-body)] text-xs font-bold text-[var(--text-muted)]">
                  Select all that apply
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            {question.options.map((option) => {
              const selected = (responses[question.id] ?? []).includes(option.id);
              const inputId = `${question.id}-${option.id}`;
              return (
                <label
                  key={option.id}
                  htmlFor={inputId}
                  className="flex cursor-pointer items-center gap-3 rounded-[var(--bmh-radius-md)] border-2 px-4 py-3 font-[family-name:var(--font-body)] text-sm font-bold text-[var(--ink-900)] transition-colors"
                  style={{
                    borderColor: selected ? "var(--action)" : "var(--ink-200)",
                    background: selected ? "var(--action-soft)" : "var(--paper)",
                  }}
                >
                  <input
                    id={inputId}
                    type={
                      question.question_type === "multi_select" ? "checkbox" : "radio"
                    }
                    name={question.id}
                    checked={selected}
                    onChange={() => onToggle(question, option.id)}
                    className="size-4 accent-[var(--action)]"
                  />
                  <span>{option.option_text}</span>
                </label>
              );
            })}
          </div>
        </Card>
      ))}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link href={backHref} className={linkButtonClass}>
          Cancel
        </Link>
        <Button
          size="lg"
          onClick={onSubmit}
          disabled={pending}
          iconLeft={<Send aria-hidden="true" className="size-4" />}
        >
          {pending ? "Scoring..." : "Submit quiz"}
        </Button>
      </div>
    </div>
  );
}

function QuizResultCard({
  result,
  passingScore,
  backHref,
  onRetake,
}: {
  result: Extract<QuizSubmitResult, { ok: true }>;
  passingScore: number;
  backHref: string;
  onRetake: () => void;
}) {
  return (
    <Card outline padding="lg">
      <div className="mb-6 text-center">
        <Badge tone={result.passed ? "green" : "red"}>
          {result.score}% score
        </Badge>
        <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-extrabold text-[var(--ink-900)]">
          {result.passed ? "Passed" : "Keep going"}
        </h2>
        <p className="mt-1 font-[family-name:var(--font-body)] text-sm font-semibold text-[var(--text-muted)]">
          {result.earnedPoints} of {result.totalPoints} points
        </p>
      </div>

      <div className="mx-auto mb-7 max-w-xl">
        <Coach
          emotion={result.passed ? "laugh" : "worried"}
          tone={result.passed ? "yellow" : "white"}
          size="sm"
          message={
            result.passed
              ? `You scored ${result.score}% and passed. On to the next lesson.`
              : `You scored ${result.score}%. You need ${passingScore}%. Review the lesson and try again.`
          }
        />
      </div>

      <div className="flex flex-col-reverse justify-center gap-3 sm:flex-row">
        <Link href={backHref} className={linkButtonClass}>
          Back to course
        </Link>
        {!result.passed ? (
          <Button
            onClick={onRetake}
            iconLeft={<RotateCcw aria-hidden="true" className="size-4" />}
          >
            Retake quiz
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
