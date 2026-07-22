import Link from "next/link";

import { Badge } from "@/components/bmh-ds/badge";
import { Card } from "@/components/bmh-ds/card";
import { Coach } from "@/components/bmh-ds/coach";
import { artworkRequestKey } from "@/lib/artwork/paths";
import { signAuthorizedArtworkPaths } from "@/lib/content-blocks/sign-urls";
import { shapeProgramsResponse } from "@/lib/programs/shape";
import { createClient } from "@/lib/supabase/server";

import { LearnerCourseBrowser } from "../learner-course-browser";
import { loadLearnerCourseOutline } from "../load-learner-outline";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string | string[] }>;
} = {}) {
  const query: { page?: string | string[] } = await (
    searchParams ?? Promise.resolve({})
  );
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("programs")
    .select(
      `
        id,
        title,
        description,
        thumbnail_path,
        content_import_id,
        thumbnail_asset_key,
        thumbnail_approved_path,
        thumbnail_approved_sha256,
        course_order_mode,
        is_published,
        sort_order,
        program_courses (
          sort_order,
          courses (
            id,
            title,
            description,
            thumbnail_path,
            content_import_id,
            thumbnail_asset_key,
            thumbnail_approved_path,
            thumbnail_approved_sha256,
            is_published
          )
        )
      `,
    )
    .order("sort_order");
  const courseIds = Array.from(
    new Set(
      shapeProgramsResponse(data).flatMap((entry) =>
        entry.courses.map((course) => course.id),
      ),
    ),
  );

  if (error) return <DashboardError message="We couldn't load your courses." />;
  if (!user || courseIds.length === 0) return <NoAssignments />;

  const outlines = await Promise.all(
    courseIds.map((courseId) =>
      loadLearnerCourseOutline({ supabase, courseId, userId: user.id }),
    ),
  );
  const valid = outlines.flatMap((result) => (result.ok ? [result.outline] : []));
  const failed = outlines.find((result) => !result.ok);
  if (valid.length === 0 && failed && !failed.ok) {
    return <DashboardError message={failed.error} />;
  }
  const outline =
    valid.find((candidate) => candidate.completedCount < candidate.totalCount) ?? valid[0];
  if (!outline) return <NoAssignments />;

  const signed = await signAuthorizedArtworkPaths(
    outline.tiles.map((tile) => ({
      entityType: "lesson" as const,
      entityId: tile.id,
      contentImportId: tile.contentImportId,
      thumbnailAssetKey: tile.thumbnailAssetKey,
      thumbnailApprovedPath: tile.thumbnailApprovedPath,
      thumbnailApprovedSha256: tile.thumbnailApprovedSha256,
      path: tile.thumbnailPath,
    })),
  );
  for (const tile of outline.tiles) {
    tile.thumbnailUrl = signed.get(artworkRequestKey("lesson", tile.id));
  }

  return (
    <main className="w-full flex-1 p-5 font-[family-name:var(--font-body)] md:p-8 lg:p-10">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-5 border-b border-[var(--border-hairline)] pb-6">
        <div>
          <div className="flex flex-wrap gap-2">
            {!outline.course.isPublished ? <Badge tone="yellow" size="sm">Private review</Badge> : null}
            <Badge tone={outline.completedCount === outline.totalCount ? "green" : "solid"} size="sm">
              {outline.completedCount === outline.totalCount ? "Course complete" : "In progress"}
            </Badge>
          </div>
          <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-[-0.02em] text-[var(--ink-900)] md:text-4xl">
            {outline.course.title}
          </h1>
          {outline.course.description ? <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-[var(--text-muted)]">{outline.course.description}</p> : null}
        </div>
        {valid.length > 1 ? (
          <Link href={`/courses/${outline.course.id}`} prefetch={false} className="text-sm font-extrabold text-[var(--action)] no-underline hover:underline">
            View course
          </Link>
        ) : null}
      </header>
      <LearnerCourseBrowser
        outline={outline}
        page={parsePage(query.page)}
        pageHref="/dashboard"
      />
      <nav aria-label="Account" className="mt-8 flex gap-4 border-t border-[var(--border-hairline)] pt-5 text-sm font-extrabold">
        <Link href="/profile" prefetch={false} className="text-[var(--action)] hover:underline">Profile</Link>
        <a href="https://hugo.bmhgroupkc.com" className="text-[var(--action)] hover:underline">Manage Hugo account</a>
      </nav>
    </main>
  );
}

function NoAssignments() {
  return (
    <main className="w-full flex-1 p-5 md:p-8 lg:p-10">
      <Card padding="lg" radius="2xl" tint>
        <div className="grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="max-w-2xl">
            <Badge tone="blue" size="sm">Getting started</Badge>
            <h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-extrabold text-[var(--ink-900)] md:text-4xl">No training assigned yet</h1>
            <p className="mt-3 text-base font-semibold leading-relaxed text-[var(--ink-700)]">
              Your account is active, but no courses are assigned yet. Ask your BMH Institute admin or manager to add you to the right role group.
            </p>
            <div className="mt-5 flex gap-4 text-sm font-extrabold">
              <Link href="/profile" prefetch={false} className="text-[var(--action)] hover:underline">Check your profile</Link>
              <a href="https://hugo.bmhgroupkc.com" className="text-[var(--action)] hover:underline">Manage Hugo account</a>
            </div>
          </div>
          <div className="hidden md:block">
            <Coach base="/brand/mascot" pose="wave" tone="white" side="right" height={190} message="Your next course will show up here as soon as it is assigned." />
          </div>
        </div>
      </Card>
    </main>
  );
}

function DashboardError({ message }: { message: string }) {
  return (
    <main className="w-full flex-1 p-5 md:p-8 lg:p-10">
      <div className="rounded-[var(--bmh-radius-md)] border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm font-semibold text-[var(--danger)]">
        {message} Refresh the page to try again.
      </div>
    </main>
  );
}

function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const page = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}
