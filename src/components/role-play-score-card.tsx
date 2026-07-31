"use client";

import { CheckCircle2, ExternalLink } from "lucide-react";

import { Badge } from "@/components/bmh-ds/badge";
import { Coach } from "@/components/bmh-ds/coach";
import type { RolePlayLatestResult } from "@/lib/content-security/validate";

/**
 * Default view for a learner returning to a role play / oral check they've
 * already completed. Shows the most recent attempt's score instead of
 * re-mounting the Closer Lab iframe, per the "show score by default, try
 * again by choice" decision — see role-play-block.tsx for the mode switch.
 */
export function RolePlayScoreCard({
  title,
  result,
  onTryAgain,
}: {
  title: string;
  result: RolePlayLatestResult;
  onTryAgain: () => void;
}) {
  const hasScore = result.score !== null;
  const tone = !hasScore
    ? "neutral"
    : result.score! >= 80
      ? "green"
      : result.score! >= 50
        ? "yellow"
        : "red";

  return (
    <section className="overflow-hidden rounded-[var(--bmh-radius-lg)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--bmh-shadow-sm)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-hairline)] bg-[var(--surface-tint)] px-5 py-4 font-[family-name:var(--font-body)]">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-[var(--ink-900)]">
            {title}
          </h2>
          <p className="mt-0.5 text-xs font-bold text-[var(--text-muted)]">
            Completed
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-[var(--success-soft)] px-2.5 py-1 text-xs font-extrabold text-[var(--success)]">
          <CheckCircle2 className="size-4" />
          Complete
        </div>
      </div>

      <div className="p-5 font-[family-name:var(--font-body)]">
        {hasScore ? (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <Badge tone={tone}>Score: {result.score}%</Badge>
              {result.goalsTotalCount ? (
                <span className="text-xs font-bold text-[var(--text-muted)]">
                  {result.goalsMetCount ?? 0} of {result.goalsTotalCount} objectives met
                </span>
              ) : null}
            </div>
            <Coach
              emotion={tone === "green" ? "laugh" : tone === "red" ? "worried" : "content"}
              tone="white"
              size="sm"
              message={
                tone === "green"
                  ? "Strong run. You can try again any time to push the score higher."
                  : "Here's how your last attempt scored. Try again whenever you're ready."
              }
            />
          </>
        ) : (
          <p
            role="status"
            className="mb-4 font-[family-name:var(--font-body)] text-sm font-bold text-[var(--text-muted)]"
          >
            We couldn&apos;t load a score for your last attempt. Your completion is
            saved — try again to get a fresh score.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onTryAgain}
            className="inline-flex min-h-11 items-center justify-center rounded-[var(--bmh-radius-md)] bg-[var(--action)] px-5 py-3 text-sm font-extrabold text-white transition-colors hover:bg-[var(--action-hover)]"
          >
            Try again
          </button>
          {result.summaryUrl ? (
            <a
              href={result.summaryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--bmh-radius-md)] border-[2.5px] border-[var(--ink-900)] bg-[var(--paper)] px-5 py-3 text-sm font-extrabold text-[var(--ink-900)] transition-colors hover:bg-[var(--ink-050)]"
            >
              View full review
              <ExternalLink className="size-4" />
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}
