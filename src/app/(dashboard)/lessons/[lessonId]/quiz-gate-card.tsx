import Link from "next/link";

import { Badge } from "@/components/bmh-ds/badge";
import { Card } from "@/components/bmh-ds/card";
import { Coach } from "@/components/bmh-ds/coach";

export function QuizGateCard({
  state,
  bestScore,
  attemptsUsed,
  maxAttempts,
  nextAvailableAt,
  backHref,
}: {
  state: "passed" | "max_reached" | "cooldown";
  bestScore: number | null;
  attemptsUsed: number;
  maxAttempts: number | null;
  nextAvailableAt: string | null;
  backHref: string;
}) {
  const passed = state === "passed";
  const noAttempts = state === "max_reached";
  const when = nextAvailableAt ? new Date(nextAvailableAt) : null;
  const title = passed
    ? "Passed"
    : noAttempts
      ? "No attempts left"
      : "Retake cooldown in effect";
  const message = passed
    ? `You already passed this quiz with a score of ${bestScore ?? 0}%. You don't need to retake it.`
    : noAttempts
      ? `You've used all ${maxAttempts ?? attemptsUsed} attempts. Ask an admin to reset them if this blocks your progress.`
      : `Your next attempt opens ${when ? when.toLocaleString() : "soon"}. Use the time to review the lesson.`;

  return (
    <Card outline padding="lg">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-extrabold text-[var(--ink-900)]">
          {title}
        </h2>
        <Badge tone={passed ? "green" : noAttempts ? "red" : "yellow"}>
          Best score: {bestScore ?? 0}%
        </Badge>
      </div>

      <Coach
        emotion={passed ? "laugh" : "worried"}
        tone={passed ? "yellow" : "white"}
        size="sm"
        message={message}
      />

      {!passed ? (
        <p className="mt-5 font-[family-name:var(--font-body)] text-sm font-bold text-[var(--text-muted)]">
          Attempts used: {attemptsUsed}
          {maxAttempts !== null ? ` / ${maxAttempts}` : ""}. Best score so far: {bestScore ?? 0}%.
        </p>
      ) : null}

      {passed ? (
        <div className="mt-6">
          <Link
            href={backHref}
            prefetch={false}
            className="inline-flex items-center justify-center rounded-[var(--bmh-radius-md)] border-[2.5px] border-[var(--ink-900)] bg-[var(--paper)] px-5 py-3 font-[family-name:var(--font-body)] text-sm font-extrabold text-[var(--ink-900)] transition-colors hover:bg-[var(--ink-050)]"
          >
            Back to course
          </Link>
        </div>
      ) : null}
    </Card>
  );
}
