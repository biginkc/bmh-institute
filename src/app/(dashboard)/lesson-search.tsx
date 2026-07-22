"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { SearchBar } from "@/components/bmh-ds/search-bar";

import {
  CLOSE_LESSON_SEARCH_EVENT,
  COMPLETED_QUIZ_HARD_NAVIGATION_ATTRIBUTE,
} from "./dashboard-events";

type LessonSearchItem = {
  id: string;
  title: string;
  href: string;
};

const MAX_RESULTS = 8;
const SEARCH_DEBOUNCE_MS = 250;

export function LessonSearch({
  instanceId,
  compact = false,
}: {
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
  const [searchResult, setSearchResult] = useState<{
    query: string;
    items: LessonSearchItem[];
    status: "idle" | "loading" | "success" | "error";
  }>({ query: "", items: [], status: "idle" });
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const results =
    searchResult.query === normalizedQuery ? searchResult.items : [];
  const searchStatus = normalizedQuery.length < 2
    ? "idle"
    : searchResult.query === normalizedQuery
      ? searchResult.status
      : "loading";
  const expanded = open && normalizedQuery.length >= 2;

  useEffect(() => {
    if (normalizedQuery.length < 2) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/lesson-search?q=${encodeURIComponent(normalizedQuery)}`,
          { signal: controller.signal, cache: "no-store" },
        );
        if (!response.ok) {
          setSearchResult({ query: normalizedQuery, items: [], status: "error" });
          return;
        }
        const payload = (await response.json()) as { results?: LessonSearchItem[] };
        setSearchResult({
          query: normalizedQuery,
          items: Array.isArray(payload.results)
            ? payload.results.slice(0, MAX_RESULTS)
            : [],
          status: "success",
        });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setSearchResult({ query: normalizedQuery, items: [], status: "error" });
        }
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [normalizedQuery]);

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
    if (
      document.documentElement.hasAttribute(
        COMPLETED_QUIZ_HARD_NAVIGATION_ATTRIBUTE,
      )
    ) {
      window.location.assign(lesson.href);
      return;
    }
    router.push(lesson.href);
  }

  const searchSurface = (
    <div className="relative">
      <SearchBar
        placeholder="Search lessons"
        value={query}
        onChange={(event) => {
          const nextQuery = event.target.value;
          const nextNormalizedQuery = nextQuery.trim().toLocaleLowerCase();
          setQuery(nextQuery);
          setSearchResult({
            query: nextNormalizedQuery,
            items: [],
            status: nextNormalizedQuery.length >= 2 ? "loading" : "idle",
          });
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
          {searchStatus === "loading" ? (
            <p className="px-3 py-2 text-sm font-semibold text-[var(--text-muted)]" role="status">
              Searching…
            </p>
          ) : searchStatus === "error" ? (
            <p className="px-3 py-2 text-sm font-semibold text-[var(--danger)]" role="status">
              Search unavailable. Try again.
            </p>
          ) : results.length > 0 ? (
            results.map((lesson, index) => (
              <Link
                key={lesson.id}
                id={`${idPrefix}-option-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                href={lesson.href}
                prefetch={false}
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
