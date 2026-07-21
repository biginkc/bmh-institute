"use client";

import { useEffect, useReducer, useRef } from "react";
import Link from "next/link";
import { Play, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/bmh-ds/badge";
import { Button } from "@/components/bmh-ds/button";
import { Card } from "@/components/bmh-ds/card";
import { Coach } from "@/components/bmh-ds/coach";

import { COMPLETED_QUIZ_HARD_NAVIGATION_ATTRIBUTE } from "../../dashboard-events";

import {
  answerQuizQuestion,
  finalizeQuizAttempt,
  startQuizAttempt,
  type QuestionReveal,
  type QuizSubmitResult,
} from "./quiz-actions";
import { QuizProgress } from "./quiz-progress";
import {
  QuizQuestionCard,
  type QuizQuestionPhase,
} from "./quiz-question-card";

export type QuizQuestion = {
  id: string;
  question_text: string;
  question_type: "true_false" | "single_choice" | "multi_select";
  options: { id: string; option_text: string }[];
};

type Answer = {
  correct: boolean;
  correctOptionIds: string[];
  explanation: string | null;
};

type Recovery = {
  kind: "retry" | "reload";
  message: string;
};

type RunState = {
  status: "run";
  attemptId: string;
  questions: QuizQuestion[];
  viewIndex: number;
  maxReachedIndex: number;
  selected: Record<string, string[]>;
  answers: Record<string, Answer>;
  phase: QuizQuestionPhase;
  recovery: Recovery | null;
};

type RunnerState =
  | { status: "idle" }
  | { status: "starting" }
  | RunState
  | { status: "done"; result: Extract<QuizSubmitResult, { ok: true }> };

type RunnerAction =
  | { type: "start" }
  | {
      type: "started";
      attemptId: string;
      questions: QuizQuestion[];
      responses: Record<string, string[]>;
      reveals: QuestionReveal[];
    }
  | { type: "start_error" }
  | { type: "toggle"; question: QuizQuestion; optionId: string }
  | { type: "checking" }
  | { type: "check_success"; reveal: QuestionReveal }
  | { type: "check_error"; recovery: Recovery }
  | { type: "move"; index: number }
  | { type: "finalizing" }
  | { type: "finalize_error"; recovery: Recovery }
  | { type: "done"; result: Extract<QuizSubmitResult, { ok: true }> }
  | { type: "reset" };

const linkButtonClass =
  "inline-flex items-center justify-center rounded-[var(--bmh-radius-md)] border-[2.5px] border-[var(--ink-900)] bg-[var(--paper)] px-5 py-3 font-[family-name:var(--font-body)] text-sm font-extrabold text-[var(--ink-900)] transition-colors hover:bg-[var(--ink-050)]";

function runnerReducer(state: RunnerState, action: RunnerAction): RunnerState {
  if (action.type === "start") return { status: "starting" };
  if (action.type === "start_error") return { status: "idle" };
  if (action.type === "reset") return { status: "idle" };
  if (action.type === "started") {
    const answers = Object.fromEntries(
      action.reveals.map((reveal) => [reveal.questionId, revealToAnswer(reveal)]),
    );
    const firstUnanswered = action.questions.findIndex(
      (question) => !(action.responses[question.id]?.length),
    );
    const allAnswered = firstUnanswered === -1;
    const viewIndex = allAnswered
      ? Math.max(0, action.questions.length - 1)
      : firstUnanswered;
    return {
      status: "run",
      attemptId: action.attemptId,
      questions: action.questions,
      viewIndex,
      maxReachedIndex: allAnswered
        ? Math.max(0, action.questions.length - 1)
        : Math.max(0, viewIndex - 1),
      selected: action.responses,
      answers,
      phase: answers[action.questions[viewIndex]?.id] ? "revealed" : "answering",
      recovery: null,
    };
  }
  if (state.status !== "run") return state;

  switch (action.type) {
    case "toggle": {
      if (state.phase !== "answering") return state;
      const current = state.selected[action.question.id] ?? [];
      const next = action.question.question_type === "multi_select"
        ? current.includes(action.optionId)
          ? current.filter((id) => id !== action.optionId)
          : [...current, action.optionId]
        : [action.optionId];
      return {
        ...state,
        selected: { ...state.selected, [action.question.id]: next },
      };
    }
    case "checking":
      return { ...state, phase: "checking", recovery: null };
    case "check_success":
      return {
        ...state,
        phase: "revealed",
        recovery: null,
        maxReachedIndex: Math.max(state.maxReachedIndex, state.viewIndex),
        answers: {
          ...state.answers,
          [action.reveal.questionId]: revealToAnswer(action.reveal),
        },
      };
    case "check_error":
      return { ...state, phase: "check_error", recovery: action.recovery };
    case "move": {
      if (action.index < 0 || action.index >= state.questions.length) return state;
      if (action.index > state.viewIndex && state.phase !== "revealed") return state;
      if (action.index > state.maxReachedIndex + 1) return state;
      const questionId = state.questions[action.index].id;
      const targetWasAnswered = Boolean(state.answers[questionId]);
      return {
        ...state,
        viewIndex: action.index,
        maxReachedIndex: targetWasAnswered
          ? Math.max(state.maxReachedIndex, action.index)
          : state.maxReachedIndex,
        phase: targetWasAnswered ? "revealed" : "answering",
        recovery: null,
      };
    }
    case "finalizing":
      return { ...state, phase: "finalizing", recovery: null };
    case "finalize_error":
      return { ...state, phase: "finalize_error", recovery: action.recovery };
    case "done":
      return { status: "done", result: action.result };
    default:
      return state;
  }
}

function revealToAnswer(reveal: QuestionReveal): Answer {
  return {
    correct: reveal.isCorrect,
    correctOptionIds: reveal.correctOptionIds,
    explanation: reveal.explanation,
  };
}

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
  const [state, dispatch] = useReducer(runnerReducer, { status: "idle" });
  const [completedAttempts, updateCompletedAttempts] = useReducer(
    (count: number) => count + 1,
    attemptsUsed,
  );
  useEffect(() => {
    if (state.status !== "done") return;

    function hardNavigateFromCompletedResult(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (
        !anchor ||
        anchor.hasAttribute("download") ||
        (anchor.target && anchor.target !== "_self")
      ) {
        return;
      }
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      const current = new URL(window.location.href);
      if (
        destination.pathname === current.pathname &&
        destination.search === current.search &&
        destination.hash
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      window.location.assign(destination.href);
    }

    document.documentElement.setAttribute(
      COMPLETED_QUIZ_HARD_NAVIGATION_ATTRIBUTE,
      "true",
    );
    document.addEventListener("click", hardNavigateFromCompletedResult, true);
    return () => {
      document.documentElement.removeAttribute(
        COMPLETED_QUIZ_HARD_NAVIGATION_ATTRIBUTE,
      );
      document.removeEventListener("click", hardNavigateFromCompletedResult, true);
    };
  }, [state.status]);

  async function loadAttempt(showStartingState: boolean) {
    if (showStartingState) dispatch({ type: "start" });
    let response: Awaited<ReturnType<typeof startQuizAttempt>>;
    try {
      response = await startQuizAttempt({ quizId, lessonId });
    } catch {
      if (showStartingState) dispatch({ type: "start_error" });
      toast.error(
        showStartingState
          ? "Could not start the quiz. Try again."
          : "Could not reload your saved progress. Try again.",
      );
      return;
    }
    if (!response.ok) {
      if (showStartingState) dispatch({ type: "start_error" });
      toast.error(response.error);
      return;
    }
    dispatch({
      type: "started",
      attemptId: response.attemptId,
      questions: response.questions,
      responses: response.responses,
      reveals: response.reveals,
    });
  }

  async function beginAttempt() {
    await loadAttempt(true);
  }

  async function reloadSavedProgress() {
    await loadAttempt(false);
  }

  async function checkAnswer(run: RunState) {
    const question = run.questions[run.viewIndex];
    const selected = run.selected[question.id] ?? [];
    dispatch({ type: "checking" });
    let response: Awaited<ReturnType<typeof answerQuizQuestion>>;
    try {
      response = await answerQuizQuestion({
        attemptId: run.attemptId,
        questionId: question.id,
        selected,
      });
    } catch {
      dispatch({
        type: "check_error",
        recovery: {
          kind: "retry",
          message: "Your selection is locked here. Try the same answer again.",
        },
      });
      return;
    }
    dispatch(response.ok
      ? { type: "check_success", reveal: response.reveal }
      : {
          type: "check_error",
          recovery: { kind: "reload", message: response.error },
        });
  }

  async function finishAttempt(run: RunState) {
    dispatch({ type: "finalizing" });
    let response: Awaited<ReturnType<typeof finalizeQuizAttempt>>;
    try {
      response = await finalizeQuizAttempt({ attemptId: run.attemptId });
    } catch {
      dispatch({
        type: "finalize_error",
        recovery: {
          kind: "retry",
          message: "Your checked answers are still saved.",
        },
      });
      return;
    }
    if (!response.ok) {
      dispatch({
        type: "finalize_error",
        recovery: { kind: "reload", message: response.error },
      });
      return;
    }
    dispatch({ type: "done", result: response });
  }

  if (state.status === "idle" || state.status === "starting") {
    return (
      <Card outline padding="lg">
        <div className="mb-5 text-center">
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-extrabold text-[var(--ink-900)]">
            Ready for the checkpoint?
          </h2>
          <p className="mt-2 font-[family-name:var(--font-body)] text-sm font-semibold text-[var(--text-muted)]">
            Each answer locks when you check it. Your progress is saved.
          </p>
        </div>
        <div className="flex justify-center">
          <Button
            onClick={beginAttempt}
            disabled={state.status === "starting"}
            iconLeft={<Play aria-hidden="true" className="size-4" />}
          >
            {state.status === "starting" ? "Starting..." : "Start quiz"}
          </Button>
        </div>
      </Card>
    );
  }

  if (state.status === "done") {
    const totalAttempts =
      attemptsLeft === null ? null : attemptsUsed + attemptsLeft;
    const canRetake =
      !state.result.passed &&
      retakeCooldownHours <= 0 &&
      (totalAttempts === null || completedAttempts + 1 < totalAttempts);
    const attemptsExhausted =
      totalAttempts !== null && completedAttempts + 1 >= totalAttempts;
    return (
      <QuizResultCard
        result={state.result}
        passingScore={passingScore}
        backHref={backHref}
        canRetake={canRetake}
        cooldownRequired={
          !state.result.passed && retakeCooldownHours > 0 && !attemptsExhausted
        }
        attemptsExhausted={!state.result.passed && attemptsExhausted}
        onRetake={() => {
          updateCompletedAttempts();
          dispatch({ type: "reset" });
        }}
      />
    );
  }

  const question = state.questions[state.viewIndex];
  const feedback = state.answers[question.id] ?? null;
  const isLast = state.viewIndex === state.questions.length - 1;
  const attemptLabel = attemptsLeft !== null
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
              Check each answer before moving on. You need {passingScore}% to pass.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral">{attemptLabel}</Badge>
            <Badge tone="yellow">Pass mark: {passingScore}%</Badge>
          </div>
        </div>
      </Card>

      <QuizProgress index={state.viewIndex} total={state.questions.length} />
      <div
        key={question.id}
        style={{ transition: "opacity var(--dur-slow) var(--bmh-ease-out)" }}
      >
        <QuizQuestionCard
          question={question}
          index={state.viewIndex}
          total={state.questions.length}
          selected={state.selected[question.id] ?? []}
          phase={state.phase}
          feedback={feedback}
          recovery={state.phase === "check_error" ? state.recovery : null}
          onToggle={(optionId) =>
            dispatch({ type: "toggle", question, optionId })}
          onCheck={() => void checkAnswer(state)}
          onRetryCheck={() => void checkAnswer(state)}
          onReload={() => void reloadSavedProgress()}
        />
      </div>

      {state.phase === "finalize_error" ? (
        <div role="alert" className="rounded-[var(--bmh-radius-md)] border-2 border-[var(--danger)] bg-[var(--danger-soft)] p-4 text-sm font-bold text-[var(--ink-900)]">
          <p>Couldn&apos;t finish the quiz.</p>
          <p className="mt-1 font-semibold text-[var(--text-muted)]">
            {state.recovery?.message ?? "Your checked answers are still saved."}
          </p>
          {state.recovery?.kind === "reload" ? (
            <Button className="mt-3" onClick={() => void reloadSavedProgress()}>
              Reload saved progress
            </Button>
          ) : (
            <Button className="mt-3" onClick={() => void finishAttempt(state)}>
              Try finishing again
            </Button>
          )}
        </div>
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <div className="flex gap-3">
          <Link href={backHref} className={linkButtonClass}>Cancel</Link>
          {state.viewIndex > 0 ? (
            <Button
              variant="secondary"
              onClick={() => dispatch({ type: "move", index: state.viewIndex - 1 })}
              disabled={
                state.phase === "checking" ||
                state.phase === "check_error" ||
                state.phase === "finalizing"
              }
            >
              Back
            </Button>
          ) : null}
        </div>
        {state.phase === "revealed" ? (
          isLast ? (
            <Button size="lg" onClick={() => void finishAttempt(state)}>
              Finish
            </Button>
          ) : (
            <Button
              size="lg"
              onClick={() => dispatch({ type: "move", index: state.viewIndex + 1 })}
            >
              Next
            </Button>
          )
        ) : state.phase === "finalizing" ? (
          <Button size="lg" disabled>Finishing...</Button>
        ) : null}
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
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <Card outline padding="lg">
      <div className="mb-6 text-center">
        <Badge tone={result.passed ? "green" : "red"}>
          {result.score}% score
        </Badge>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="mt-3 scroll-mt-24 font-[family-name:var(--font-display)] text-3xl font-extrabold text-[var(--ink-900)] outline-none"
        >
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
        <a href={backHref} className={linkButtonClass}>Back to course</a>
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
