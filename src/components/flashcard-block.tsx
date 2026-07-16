"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";

import { Button } from "@/components/bmh-ds";

export type Flashcard = { front: string; back: string };

export function FlashcardBlock({ cards }: { cards: Flashcard[] }) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const card = cards[index];

  function goTo(nextIndex: number) {
    setIndex(Math.max(0, Math.min(cards.length - 1, nextIndex)));
    setRevealed(false);
  }

  if (!card) {
    return (
      <div className="rounded-[var(--bmh-radius-md)] border border-dashed border-[var(--ink-300)] bg-[var(--ink-050)] p-6 text-center text-sm font-semibold text-[var(--text-muted)]">
        No flashcards have been added yet.
      </div>
    );
  }

  return (
    <section
      aria-label="Lesson flashcards"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "ArrowLeft") goTo(index - 1);
        if (event.key === "ArrowRight") goTo(index + 1);
      }}
      className="rounded-[var(--bmh-radius-lg)] border border-[var(--border-card)] bg-[var(--surface-card)] p-5 shadow-[var(--bmh-shadow-sm)]"
    >
      <div className="mb-3 flex items-center justify-between gap-3 text-xs font-extrabold text-[var(--text-muted)]">
        <span aria-live="polite">Card {index + 1} of {cards.length}</span>
        <span>{Math.round(((index + 1) / cards.length) * 100)}%</span>
      </div>
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-[var(--ink-100)]" aria-hidden="true">
        <div
          className="h-full rounded-full bg-[var(--action)] transition-[width]"
          style={{ width: `${((index + 1) / cards.length) * 100}%` }}
        />
      </div>
      <button
        type="button"
        onClick={() => setRevealed((value) => !value)}
        aria-label={revealed ? "Show question" : "Reveal answer"}
        className="flex min-h-52 w-full flex-col items-center justify-center rounded-[var(--bmh-radius-md)] border-2 border-[var(--ink-900)] bg-[var(--paper)] p-8 text-center outline-none transition hover:border-[var(--action)] focus-visible:ring-4 focus-visible:ring-[var(--focus-ring)]"
      >
        <span className="mb-3 text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--action)]">
          {revealed ? "Answer" : "Prompt"}
        </span>
        <span className="font-[family-name:var(--font-display)] text-xl font-bold text-[var(--ink-900)]">
          {revealed ? card.back : card.front}
        </span>
        <span className="mt-5 flex items-center gap-2 text-xs font-bold text-[var(--text-muted)]">
          <RotateCcw aria-hidden="true" className="size-4" />
          {revealed ? "Show prompt" : "Reveal answer"}
        </span>
      </button>
      <div className="mt-4 flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={index === 0}
          onClick={() => goTo(index - 1)}
          iconLeft={<ArrowLeft className="size-4" />}
        >
          Previous
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={index === cards.length - 1}
          onClick={() => goTo(index + 1)}
          iconRight={<ArrowRight className="size-4" />}
        >
          Next
        </Button>
      </div>
    </section>
  );
}
