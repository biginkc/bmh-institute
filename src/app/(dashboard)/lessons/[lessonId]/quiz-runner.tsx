"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Play, RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/bmh-ds/badge";
import { Button } from "@/components/bmh-ds/button";
import { Card } from "@/components/bmh-ds/card";
import { Coach } from "@/components/bmh-ds/coach";

import {
  startQuizAttempt,
  submitQuizAttempt,
  type QuizSubmitResult,
} from "./quiz-actions";

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
  backHref,
  attemptsUsed,
  attemptsLeft,
  retakeCooldownHours,
}: {
  quizId: string;
  lessonId: string;
  passingScore: number;
  backHref: string;
  attemptsUsed: number;
  attemptsLeft: number | null;
  retakeCooldownHours: number;
}) {
  const [responses, setResponses] = useState<Record<string, string[]>>({});
  const [result, setResult] = useState<QuizSubmitResult | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [completedAttempts, setCompletedAttempts] = useState(attemptsUsed);
  const [pending, startTransition] = useTransition();

  function beginAttempt() {
    startTransition(async () => {
      const response = await startQuizAttempt({ quizId, lessonId });
      if (!response.ok) {
        toast.error(response.error);
        return;
      }
      setAttemptId(response.attemptId);
      setQuestions(response.questions);
      setResponses({});
      setResult(null);
    });
  }

  if (!attemptId) {
    return (
      <Card outline padding="lg">
        <div className="mb-5 text-center">
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-extrabold text-[var(--ink-900)]">
            Ready for the checkpoint?
          </h2>
          <p className="mt-2 font-[family-name:var(--font-body)] text-sm font-semibold text-[var(--text-muted)]">
            Your question and answer order is saved when the attempt starts.
          </p>
        </div>
        <div className="flex justify-center">
          <Button
            onClick={beginAttempt}
            disabled={pending}
            iconLeft={<Play aria-hidden="true" className="size-4" />}
          >
            {pending ? "Starting..." : "Start quiz"}
          </Button>
        </div>
      </Card>
    );
  }

  if (result && result.ok) {
    const totalAttempts =
      attemptsLeft === null ? null : attemptsUsed + attemptsLeft;
    const canRetake =
      !result.passed &&
      retakeCooldownHours <= 0 &&
      (totalAttempts === null || completedAttempts + 1 < totalAttempts);
    const attemptsExhausted =
      totalAttempts !== null && completedAttempts + 1 >= totalAttempts;
    return (
      <QuizResultCard
        result={result}
        passingScore={passingScore}
        backHref={backHref}
        canRetake={canRetake}
        cooldownRequired={
          !result.passed && retakeCooldownHours > 0 && !attemptsExhausted
        }
        attemptsExhausted={!result.passed && attemptsExhausted}
        onRetake={() => {
          setCompletedAttempts((count) => count + 1);
          setAttemptId(null);
          setQuestions([]);
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
      if (!attemptId) return;
      const response = await submitQuizAttempt({ attemptId, responses });
      setResult(response);
      if (!response.ok) {
        toast.error(response.error);
      }
    });
  }

  const attemptLabel =
    attemptsLeft !== null
      ? `Attempt ${completedAttempts + 1} of ${attemptsUsed + attemptsLeft}`
      : `Attempt ${completedAttempts + 1}`;

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
  canRetake,
  cooldownRequired,
  attemptsExhausted,
  onRetake,
}: {
  result: Extract<QuizSubmitResult, { ok: true }>;
  passingScore: number;
  backHref: string;
  canRetake: boolean;
  cooldownRequired: boolean;
  attemptsExhausted: boolean;
  onRetake: () => void;
}) {
  return (
    <Card outline padding="lg">
      <div className="mb-6 text-center">
        <Badge tone={result.passed ? "green" : "red"}>
          {result.score}% score
        </Badge>
        <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-extrabold text-[var(--ink-900)]">
          {result.passed
            ? "Passed"
            : attemptsExhausted
              ? "Attempts complete"
              : "Keep going"}
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
              : attemptsExhausted
                ? `You scored ${result.score}%. You need ${passingScore}%. Review the lesson; no more attempts are available.`
                : cooldownRequired
                  ? `You scored ${result.score}%. You need ${passingScore}%. Review the lesson and return when the retake cooldown ends.`
                  : `You scored ${result.score}%. You need ${passingScore}%. Review the lesson and try again.`
          }
        />
      </div>

      {result.review?.length ? (
        <div className="mx-auto mb-7 max-w-xl space-y-3">
          <h3 className="font-[family-name:var(--font-display)] text-xl font-bold text-[var(--ink-900)]">
            Answer review
          </h3>
          {result.review.map((item, index) => (
            <div
              key={item.questionId}
              className="rounded-[var(--bmh-radius-md)] border-2 border-[var(--ink-200)] bg-[var(--ink-050)] p-4 text-left"
            >
              <p className="text-sm font-extrabold text-[var(--ink-900)]">
                Question {index + 1}: {item.correctOptions.join(", ")}
              </p>
              {item.explanation ? (
                <p className="mt-1 text-sm font-semibold text-[var(--text-muted)]">
                  {item.explanation}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col-reverse justify-center gap-3 sm:flex-row">
        <Link href={backHref} className={linkButtonClass}>
          Back to course
        </Link>
        {canRetake ? (
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
