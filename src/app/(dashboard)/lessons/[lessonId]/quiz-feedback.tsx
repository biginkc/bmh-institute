import { Badge } from "@/components/bmh-ds/badge";
import { Coach } from "@/components/bmh-ds/coach";

export function QuizFeedback({
  correct,
  selectedAnswers,
  explanation,
  announce,
}: {
  correct: boolean;
  selectedAnswers: string[];
  explanation: string | null;
  announce: boolean;
}) {
  const coachMessage = correct
    ? "Nice work — that answer is right."
    : "Not quite. That answer is locked — keep going.";
  const usefulExplanation = correct && !duplicatesSelection(explanation, selectedAnswers)
    ? explanation?.trim() || null
    : null;

  return (
    <div className="mt-5 space-y-3">
      {announce ? (
        <p
          data-quiz-feedback-announcement
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {correct ? "Correct" : "Incorrect"}. {coachMessage}
        </p>
      ) : null}
      <Badge tone={correct ? "green" : "red"}>
        {correct ? "Correct" : "Incorrect"}
      </Badge>
      <Coach
        emotion={correct ? "smile" : "worried"}
        tone={correct ? "tint" : "white"}
        size="sm"
        message={coachMessage}
      />
      {usefulExplanation ? (
        <p className="text-sm font-semibold leading-relaxed text-[var(--ink-900)]">
          {usefulExplanation}
        </p>
      ) : null}
    </div>
  );
}

function duplicatesSelection(
  explanation: string | null,
  selectedAnswers: string[],
): boolean {
  if (!explanation) return false;
  const normalizedExplanation = normalizeFeedbackText(explanation);
  if (!normalizedExplanation) return false;
  const normalizedSelections = selectedAnswers.map(normalizeFeedbackText);
  return normalizedSelections.includes(normalizedExplanation) ||
    normalizeFeedbackText(selectedAnswers.join(" ")) === normalizedExplanation;
}

function normalizeFeedbackText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, " ")
    .trim();
}
