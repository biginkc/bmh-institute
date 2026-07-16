"use client";

import { useRouter } from "next/navigation";
import type { AriaAttributes, CSSProperties } from "react";

import {
  ChapterItem,
  type ChapterItemProps,
} from "@/components/bmh-ds/chapter-item";
import type { LessonChapter } from "./lesson-navigation";

export function LessonChapters({
  chapters,
  completedCount,
}: {
  chapters: LessonChapter[];
  completedCount: number;
}) {
  const router = useRouter();

  return (
    <aside
      aria-label="Course chapters"
      className="sticky top-24 overflow-hidden rounded-[var(--bmh-radius-lg)] border border-[var(--border-card)] bg-[var(--surface-card)] p-3 shadow-[var(--bmh-shadow-sm)]"
    >
      <div className="flex items-center justify-between gap-4 px-2 pb-3 pt-1">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-[var(--ink-900)]">
          Chapters
        </h2>
        <span className="shrink-0 font-[family-name:var(--font-body)] text-xs font-extrabold tabular-nums text-[var(--text-muted)]">
          {completedCount} / {chapters.length} done
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        {chapters.map((chapter) => {
          const available =
            chapter.available ?? chapter.status !== "locked";
          const itemProps: ChapterItemProps &
            AriaAttributes & {
              disabled?: boolean;
              style?: CSSProperties;
            } = {
            index: chapter.index,
            title: chapter.title,
            meta: chapter.meta,
            status: chapter.status ?? "todo",
            active: chapter.active ?? false,
            onClick: available
              ? () => router.push(`/lessons/${chapter.id}`)
              : undefined,
            disabled: !available,
            "aria-disabled": !available || undefined,
            "aria-current": chapter.active ? "step" : undefined,
            style: available
              ? undefined
              : { cursor: "not-allowed", opacity: 0.6 },
          };

          return <ChapterItem key={chapter.id} {...itemProps} />;
        })}
      </div>
    </aside>
  );
}
