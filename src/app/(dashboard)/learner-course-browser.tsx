import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, Lock, Play } from "lucide-react";

import { Badge } from "@/components/bmh-ds/badge";
import { ProgressBar } from "@/components/bmh-ds/progress-bar";
import {
  ProgressRail,
  type ProgressRailEntry,
} from "@/components/bmh-ds/progress-rail";
import type {
  LearnerCourseOutline,
  LearnerCourseTile,
} from "@/lib/courses/learner-outline";

const MODULES_PER_PAGE = 2;

export function LearnerCourseBrowser({
  outline,
  page,
  pageHref,
  showResume = true,
}: {
  outline: LearnerCourseOutline;
  page: number;
  pageHref: string;
  showResume?: boolean;
}) {
  const pageCount = Math.max(1, Math.ceil(outline.modules.length / MODULES_PER_PAGE));
  const currentPage = Math.min(Math.max(1, page), pageCount);
  const modules = outline.modules.slice(
    (currentPage - 1) * MODULES_PER_PAGE,
    currentPage * MODULES_PER_PAGE,
  );
  const railEntries: ProgressRailEntry[] = outline.tiles.map((tile, index) => ({
    id: tile.id,
    label: tile.title,
    eyebrow:
      index === 0 || outline.tiles[index - 1]?.moduleId !== tile.moduleId
        ? tile.moduleTitle
        : undefined,
    href: tile.unlocked ? tile.href : null,
    state: railState(tile),
  }));

  return (
    <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_330px]">
      <div className="min-w-0">
        {showResume && outline.resume ? (
          <section className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-[var(--bmh-radius-lg)] border border-[var(--border-card)] bg-[var(--surface-tint)] px-5 py-4">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                {outline.resume.label}
              </p>
              <p className="mt-1 font-[family-name:var(--font-display)] text-lg font-extrabold text-[var(--ink-900)]">
                Lesson {outline.tiles.find((tile) => tile.id === outline.resume?.tileId)?.lessonNumber} · {outline.tiles.find((tile) => tile.id === outline.resume?.tileId)?.title}
              </p>
            </div>
            <Link
              href={outline.resume.href}
              className="inline-flex min-h-10 items-center justify-center rounded-[var(--bmh-radius-md)] bg-[var(--action)] px-5 text-sm font-extrabold text-white no-underline hover:bg-[var(--action-hover)] focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            >
              Resume
            </Link>
          </section>
        ) : null}

        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-extrabold text-[var(--ink-900)]">
              Course lessons
            </h2>
            <p className="mt-1 text-sm font-bold text-[var(--text-muted)]">
              {outline.totalCount} lessons · {outline.completedCount} complete
            </p>
          </div>
          <div className="w-32">
            <ProgressBar value={outline.completionPercent} size="sm" />
          </div>
        </div>

        <div className="space-y-8" data-learner-tile-grid>
          {modules.map((module) => (
            <section key={module.id}>
              <div className="mb-3 flex items-center gap-3">
                <h3 className="shrink-0 font-[family-name:var(--font-display)] text-base font-extrabold text-[var(--ink-900)]">
                  {module.title}
                </h3>
                <span className="h-px flex-1 bg-[var(--border-hairline)]" />
                <span className="shrink-0 text-xs font-extrabold text-[var(--text-muted)]">
                  {module.tiles.filter((tile) => tile.complete).length}/{module.tiles.length}
                </span>
              </div>
              <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {module.tiles.map((tile) => (
                  <LearnerTile key={tile.id} tile={tile} />
                ))}
              </ol>
            </section>
          ))}
        </div>

        {pageCount > 1 ? (
          <nav aria-label="Lesson grid pages" className="mt-8 flex items-center justify-between gap-4 border-t border-[var(--border-hairline)] pt-5">
            {currentPage > 1 ? (
              <PageLink href={pageUrl(pageHref, currentPage - 1)} direction="previous" />
            ) : <span />}
            <span className="text-sm font-extrabold text-[var(--text-muted)]">
              Page {currentPage} of {pageCount}
            </span>
            {currentPage < pageCount ? (
              <PageLink href={pageUrl(pageHref, currentPage + 1)} direction="next" />
            ) : <span />}
          </nav>
        ) : null}
      </div>

      <div className="lg:sticky lg:top-[96px]">
        <ProgressRail
          title="Course progress"
          countLabel={`${outline.completedCount} of ${outline.totalCount}`}
          entries={railEntries}
          ariaLabel="All course lessons"
        />
      </div>
    </div>
  );
}

function LearnerTile({ tile }: { tile: LearnerCourseTile }) {
  const content = (
    <div className="relative flex min-h-28 flex-col overflow-hidden rounded-[var(--bmh-radius-lg)] border border-[var(--border-card)] bg-[var(--paper)] p-4 shadow-[var(--bmh-shadow-xs)]">
      {tile.thumbnailUrl ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-1.5 bg-cover bg-center"
          style={{ backgroundImage: `url(${tile.thumbnailUrl})` }}
        />
      ) : (
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5 bg-[var(--action-soft)]" />
      )}
      <div className="flex items-start justify-between gap-3 pl-1">
        <span className="text-xs font-extrabold text-[var(--text-muted)]">
          Lesson {tile.lessonNumber}
        </span>
        <TileMark tile={tile} />
      </div>
      <h4 className="mt-3 pl-1 font-[family-name:var(--font-display)] text-base font-extrabold leading-snug text-[var(--ink-900)]">
        {tile.title}
      </h4>
      <div className="mt-auto flex flex-wrap gap-2 pl-1 pt-3">
        {tile.kind === "assignment" ? <Badge tone="orange" size="sm">Assignment</Badge> : null}
        {tile.state === "awaiting_review" ? <Badge tone="blue" size="sm">Awaiting review</Badge> : null}
        {tile.state === "needs_revision" ? <Badge tone="yellow" size="sm">Needs revision</Badge> : null}
      </div>
    </div>
  );
  return (
    <li>
      {tile.unlocked ? (
        <Link
          href={tile.href}
          aria-current={tile.state === "current" ? "step" : undefined}
          className="block rounded-[var(--bmh-radius-lg)] no-underline transition hover:-translate-y-0.5 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          {content}
        </Link>
      ) : (
        <div aria-disabled="true" className="cursor-not-allowed opacity-55">{content}</div>
      )}
    </li>
  );
}

function TileMark({ tile }: { tile: LearnerCourseTile }) {
  const className = "flex size-7 items-center justify-center rounded-full border-2";
  if (tile.complete) return <span aria-label="Complete" className={`${className} border-[var(--success)] bg-[var(--success)] text-white`}><Check className="size-4" /></span>;
  if (!tile.unlocked) return <span aria-label="Locked" className={`${className} border-[var(--ink-300)] text-[var(--ink-500)]`}><Lock className="size-3.5" /></span>;
  return <span aria-label="Current" className={`${className} border-[var(--action)] bg-[var(--action)] text-white`}><Play className="size-3.5 fill-current" /></span>;
}

function PageLink({ href, direction }: { href: string; direction: "previous" | "next" }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-sm font-extrabold text-[var(--action)] no-underline hover:underline">
      {direction === "previous" ? <ChevronLeft className="size-4" /> : null}
      {direction === "previous" ? "Previous" : "Next"}
      {direction === "next" ? <ChevronRight className="size-4" /> : null}
    </Link>
  );
}

function pageUrl(base: string, page: number): string {
  return `${base}${base.includes("?") ? "&" : "?"}page=${page}`;
}

function railState(tile: LearnerCourseTile): ProgressRailEntry["state"] {
  if (tile.complete) return "done";
  if (tile.state === "needs_revision") return "revision";
  if (tile.state === "awaiting_review") return "waiting";
  if (tile.state === "current") return "current";
  return tile.unlocked ? "open" : "locked";
}
