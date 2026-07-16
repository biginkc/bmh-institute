"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";

type LessonType = "content" | "quiz" | "assignment";
type EditorTab = LessonType | "details";

const TABS: Array<{ id: EditorTab; label: string }> = [
  { id: "content", label: "Content blocks" },
  { id: "quiz", label: "Quiz" },
  { id: "assignment", label: "Assignment" },
  { id: "details", label: "Details" },
];

export function LessonEditorTabs({
  lessonType,
  editor,
  details,
}: {
  lessonType: LessonType;
  editor: ReactNode;
  details: ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<EditorTab>(lessonType);
  const availableTabs: EditorTab[] = [lessonType, "details"];

  function selectTab(tab: EditorTab) {
    setActiveTab(tab);
    requestAnimationFrame(() => {
      document.getElementById(`lesson-tab-${tab}`)?.focus();
    });
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const currentIndex = availableTabs.indexOf(activeTab);
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % availableTabs.length;
    if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + availableTabs.length) % availableTabs.length;
    }
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = availableTabs.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    selectTab(availableTabs[nextIndex]);
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Lesson editor"
        className="mb-5 flex gap-1 overflow-x-auto border-b border-[var(--border-hairline)]"
      >
        {TABS.map((tab) => {
          const available = tab.id === lessonType || tab.id === "details";
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              id={`lesson-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={available ? `lesson-panel-${tab.id}` : undefined}
              tabIndex={active ? 0 : -1}
              disabled={!available}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={available ? onTabKeyDown : undefined}
              className={`shrink-0 border-0 bg-transparent px-4 py-3 font-[family-name:var(--font-body)] text-sm font-extrabold transition-colors ${
                active
                  ? "text-[var(--blue-600)] shadow-[inset_0_-3px_0_var(--action)]"
                  : available
                    ? "cursor-pointer text-[var(--ink-600)] hover:text-[var(--action)]"
                    : "cursor-not-allowed text-[var(--ink-300)]"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        id={`lesson-panel-${lessonType}`}
        role="tabpanel"
        aria-labelledby={`lesson-tab-${lessonType}`}
        hidden={activeTab !== lessonType}
      >
        {editor}
      </div>
      <div
        id="lesson-panel-details"
        role="tabpanel"
        aria-labelledby="lesson-tab-details"
        hidden={activeTab !== "details"}
      >
        {details}
      </div>
    </div>
  );
}
