"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";

import { SearchBar } from "@/components/bmh-ds/search-bar";

import { CLOSE_LESSON_SEARCH_EVENT } from "./dashboard-events";

export type LessonSearchItem = {
  id: string;
  title: string;
  href: string;
};

const MAX_RESULTS = 8;

export function LessonSearch({
  lessons,
  instanceId,
  compact = false,
}: {
  lessons: LessonSearchItem[];
  instanceId?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const generatedId = useId().replaceAll(":", "");
  const idPrefix = instanceId ?? `lesson-search-${generatedId}`;
  const resultsId = `${idPrefix}-results`;
  const panelId = `${idPrefix}-panel`;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [compactOpen, setCompactOpen] = useState(false);
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

  function closeSearch() {
    setOpen(false);
    setCompactOpen(false);
    setActiveIndex(-1);
  }

  useEffect(() => {
    const closeForModalNavigation = () => {
      setOpen(false);
      setCompactOpen(false);
      setActiveIndex(-1);
    };
    window.addEventListener(CLOSE_LESSON_SEARCH_EVENT, closeForModalNavigation);
    return () => window.removeEventListener(CLOSE_LESSON_SEARCH_EVENT, closeForModalNavigation);
  }, []);

  function navigateTo(index: number) {
    const lesson = results[index];
    if (!lesson) return;
    closeSearch();
    router.push(lesson.href);
  }

  const searchSurface = (
    <div className="relative">
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
          "aria-controls": resultsId,
          "aria-expanded": expanded,
          "aria-activedescendant":
            expanded && activeIndex >= 0
              ? `${idPrefix}-option-${activeIndex}`
              : undefined,
          autoComplete: "off",
          autoFocus: compact,
          onFocus: () => setOpen(true),
          onKeyDown: (event) => {
            if (event.key === "Escape") {
              closeSearch();
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
          id={resultsId}
          role="listbox"
          aria-label="Lesson search results"
          className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 max-h-80 overflow-y-auto rounded-[var(--bmh-radius-md)] border border-[var(--border-card)] bg-[var(--paper)] p-1 shadow-[var(--bmh-shadow-md)]"
        >
          {results.length > 0 ? (
            results.map((lesson, index) => (
              <Link
                key={lesson.id}
                id={`${idPrefix}-option-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                href={lesson.href}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={closeSearch}
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

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) closeSearch();
      }}
    >
      {compact ? (
        <>
          <button
            type="button"
            aria-label="Search lessons"
            aria-expanded={compactOpen}
            aria-controls={panelId}
            onClick={() => setCompactOpen((current) => !current)}
            className="flex size-10 items-center justify-center rounded-full border-2 border-[var(--ink-200)] bg-[var(--paper)] text-[var(--ink-700)] shadow-[var(--bmh-shadow-xs)] hover:border-[var(--action)] hover:text-[var(--action)] focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            <Search aria-hidden="true" className="size-5" />
          </button>
          {compactOpen ? (
            <div
              id={panelId}
              className="fixed left-4 right-4 top-[84px] z-50 rounded-[var(--bmh-radius-lg)] border border-[var(--border-card)] bg-[var(--paper)] p-2 shadow-[var(--bmh-shadow-md)]"
            >
              {searchSurface}
            </div>
          ) : null}
        </>
      ) : (
        searchSurface
      )}
    </div>
  );
}
