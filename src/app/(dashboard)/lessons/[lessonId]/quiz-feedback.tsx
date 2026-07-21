import { Badge } from "@/components/bmh-ds/badge";
import { Coach } from "@/components/bmh-ds/coach";

export function QuizFeedback({
  correct,
  correctOptions,
  explanation,
}: {
  correct: boolean;
  correctOptions: string[];
  explanation: string | null;
}) {
  return (
    <div aria-live="polite" className="mt-5 space-y-3">
      <Badge tone={correct ? "green" : "red"}>
        {correct ? "Correct" : "Incorrect"}
      </Badge>
      <Coach
        emotion={correct ? "smile" : "worried"}
        tone={correct ? "tint" : "white"}
        size="sm"
        message={correct ? "Nice work — that answer is right." : "Not quite. Use the answer below to lock in the lesson."}
      />
      <div className="rounded-[var(--bmh-radius-md)] border-2 border-[var(--success)] bg-[var(--success-soft)] p-4">
        <p className="text-xs font-extrabold uppercase tracking-wide text-[var(--text-muted)]">
          Correct answer
        </p>
        <p className="mt-1 text-sm font-bold text-[var(--ink-900)]">
          {correctOptions.join(", ")}
        </p>
      </div>
      {explanation ? (
        <p className="text-sm font-semibold leading-relaxed text-[var(--ink-900)]">
          {explanation}
        </p>
      ) : null}
    </div>
  );
}
