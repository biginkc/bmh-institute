import Link from "next/link";
import { Check, Lock, Play } from "lucide-react";

export type ProgressRailEntry = {
  id: string;
  label: string;
  eyebrow?: string;
  href: string | null;
  state: "done" | "current" | "open" | "locked" | "waiting" | "revision";
};

export function ProgressRail({
  title,
  countLabel,
  entries,
  ariaLabel,
  hardNavigation = false,
}: {
  title: string;
  countLabel: string;
  entries: ProgressRailEntry[];
  ariaLabel: string;
  hardNavigation?: boolean;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className="rounded-[var(--bmh-radius-xl)] border border-[var(--border-card)] bg-[var(--paper)] p-4 shadow-[var(--bmh-shadow-xs)]"
    >
      <div className="flex items-baseline justify-between gap-4 border-b border-[var(--border-hairline)] pb-3">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-extrabold text-[var(--ink-900)]">
          {title}
        </h2>
        <span className="text-xs font-extrabold text-[var(--text-muted)]">{countLabel}</span>
      </div>
      <ol className="mt-3 max-h-[calc(100vh-190px)] space-y-0.5 overflow-y-auto pr-1">
        {entries.map((entry, index) => {
          const row = (
            <span className="flex min-h-11 items-center gap-3 rounded-[var(--bmh-radius-md)] px-2 py-2">
              <RailMark state={entry.state} index={index + 1} />
              <span className="min-w-0 flex-1">
                {entry.eyebrow ? (
                  <span className="block text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                    {entry.eyebrow}
                  </span>
                ) : null}
                <span className="block text-xs font-extrabold leading-snug text-[var(--ink-800)]">
                  {entry.label}
                </span>
              </span>
            </span>
          );
          const linkClassName = `block rounded-[var(--bmh-radius-md)] no-underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--action)] ${
            entry.state === "current"
              ? "bg-[var(--action-soft)]"
              : "hover:bg-[var(--ink-050)]"
          }`;
          return (
            <li key={entry.id}>
              {entry.href ? (
                hardNavigation ? (
                  <a
                    href={entry.href}
                    aria-current={entry.state === "current" ? "step" : undefined}
                    className={linkClassName}
                  >
                    {row}
                  </a>
                ) : (
                  <Link
                    href={entry.href}
                    prefetch={false}
                    aria-current={entry.state === "current" ? "step" : undefined}
                    className={linkClassName}
                  >
                    {row}
                  </Link>
                )
              ) : (
                <span aria-disabled="true" className="block cursor-not-allowed opacity-55">
                  {row}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function RailMark({
  state,
  index,
}: {
  state: ProgressRailEntry["state"];
  index: number;
}) {
  const done = state === "done";
  const current = state === "current" || state === "revision";
  return (
    <span
      aria-hidden="true"
      className={`flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-extrabold ${
        done
          ? "border-[var(--success)] bg-[var(--success)] text-white"
          : current
            ? "border-[var(--action)] bg-[var(--action)] text-white"
            : "border-[var(--ink-300)] bg-[var(--paper)] text-[var(--ink-600)]"
      }`}
    >
      {done ? (
        <Check className="size-3.5" />
      ) : state === "locked" ? (
        <Lock className="size-3" />
      ) : current ? (
        <Play className="size-3 fill-current" />
      ) : (
        index
      )}
    </span>
  );
}
