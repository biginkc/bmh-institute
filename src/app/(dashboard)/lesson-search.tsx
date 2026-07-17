"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { SearchBar } from "@/components/bmh-ds/search-bar";

export type LessonSearchItem = {
  id: string;
  title: string;
};

const MAX_RESULTS = 8;

export function LessonSearch({ lessons }: { lessons: LessonSearchItem[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const results = useMemo(
    () =>
      normalizedQuery
        ? lessons
            .filter((lesson) =>
              lesson.title.toLocaleLowerCase().includes(normalizedQuery),
            )
            .slice(0, MAX_RESULTS)
        : [],
    [lessons, normalizedQuery],
  );
  const expanded = open && normalizedQuery.length > 0;

  function navigateTo(index: number) {
    const lesson = results[index];
    if (!lesson) return;
    setOpen(false);
    router.push(lessonHref(lesson.id));
  }

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <SearchBar
        placeholder="Search lessons"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        inputProps={{
          role: "combobox",
          "aria-autocomplete": "list",
          "aria-controls": "lesson-search-results",
          "aria-expanded": expanded,
          "aria-activedescendant":
            expanded && activeIndex >= 0
              ? `lesson-search-option-${activeIndex}`
              : undefined,
          autoComplete: "off",
          onFocus: () => setOpen(true),
          onKeyDown: (event) => {
            if (event.key === "Escape") {
              setOpen(false);
              setActiveIndex(-1);
              return;
            }
            if (!expanded || results.length === 0) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((current) =>
                current >= results.length - 1 ? 0 : current + 1,
              );
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((current) =>
                current <= 0 ? results.length - 1 : current - 1,
              );
            } else if (event.key === "Enter") {
              event.preventDefault();
              navigateTo(activeIndex >= 0 ? activeIndex : 0);
            }
          },
        }}
      />
      {expanded ? (
        <div
          id="lesson-search-results"
          role="listbox"
          aria-label="Lesson search results"
          className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 max-h-80 overflow-y-auto rounded-[var(--bmh-radius-md)] border border-[var(--border-card)] bg-[var(--paper)] p-1 shadow-[var(--bmh-shadow-md)]"
        >
          {results.length > 0 ? (
            results.map((lesson, index) => (
              <Link
                key={lesson.id}
                id={`lesson-search-option-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                href={lessonHref(lesson.id)}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => setOpen(false)}
                className="block rounded-[var(--bmh-radius-sm)] px-3 py-2 text-sm font-extrabold text-[var(--ink-900)] no-underline hover:bg-[var(--action-soft)] focus-visible:bg-[var(--action-soft)] focus-visible:outline-2 focus-visible:outline-[var(--action)] aria-selected:bg-[var(--action-soft)]"
              >
                {lesson.title}
              </Link>
            ))
          ) : (
            <p className="px-3 py-2 text-sm font-semibold text-[var(--text-muted)]">
              No lessons found.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function lessonHref(id: string): string {
  return `/lessons/${encodeURIComponent(id)}`;
}
