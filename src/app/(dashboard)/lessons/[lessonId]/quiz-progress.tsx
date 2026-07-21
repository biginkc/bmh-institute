import { ProgressBar } from "@/components/bmh-ds/progress-bar";

export function QuizProgress({ index, total }: { index: number; total: number }) {
  return (
    <div className="space-y-2">
      <p
        aria-live="polite"
        className="font-[family-name:var(--font-body)] text-sm font-extrabold text-[var(--text-muted)]"
      >
        Question {index + 1} of {total}
      </p>
      <ProgressBar
        aria-label="Quiz progress"
        value={index + 1}
        max={total}
        tone="blue"
      />
    </div>
  );
}
