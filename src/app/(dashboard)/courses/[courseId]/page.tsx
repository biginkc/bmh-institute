import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Badge } from "@/components/bmh-ds/badge";
import { CourseCoverArtwork } from "@/components/course-cover-artwork";
import { artworkRequestKey } from "@/lib/artwork/paths";
import { signAuthorizedArtworkPaths } from "@/lib/content-blocks/sign-urls";
import { createClient } from "@/lib/supabase/server";

import { LearnerCourseBrowser } from "../../learner-course-browser";
import { loadLearnerCourseOutline } from "../../load-learner-outline";

export default async function CoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams?: Promise<{ page?: string | string[] }>;
}) {
  const [{ courseId }, query]: [
    { courseId: string },
    { page?: string | string[] },
  ] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({}),
  ]);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const result = await loadLearnerCourseOutline({
    supabase,
    courseId,
    userId: user.id,
  });
  if (!result.ok && "notFound" in result) notFound();
  if (!result.ok) {
    return <OutlineError title="Course unavailable" error={result.error} />;
  }
  const { outline } = result;
  const signed = await signAuthorizedArtworkPaths([
    {
      entityType: "course",
      entityId: outline.course.id,
      contentImportId: outline.course.contentImportId,
      thumbnailAssetKey: outline.course.thumbnailAssetKey,
      thumbnailApprovedPath: outline.course.thumbnailApprovedPath,
      thumbnailApprovedSha256: outline.course.thumbnailApprovedSha256,
      path: outline.course.thumbnailPath,
    },
    ...outline.tiles.map((tile) => ({
      entityType: "lesson" as const,
      entityId: tile.id,
      contentImportId: tile.contentImportId,
      thumbnailAssetKey: tile.thumbnailAssetKey,
      thumbnailApprovedPath: tile.thumbnailApprovedPath,
      thumbnailApprovedSha256: tile.thumbnailApprovedSha256,
      path: tile.thumbnailPath,
    })),
  ]);
  for (const tile of outline.tiles) {
    tile.thumbnailUrl = signed.get(artworkRequestKey("lesson", tile.id));
  }
  const coverUrl = signed.get(artworkRequestKey("course", outline.course.id));
  const page = parsePage(query.page);

  return (
    <main className="w-full flex-1 p-5 font-[family-name:var(--font-body)] md:p-8 lg:p-10" data-bmh-course-page>
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-extrabold text-[var(--action)] underline-offset-4 hover:underline">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to dashboard
      </Link>
      <header className="mt-5 grid items-center gap-6 border-b border-[var(--border-hairline)] pb-7 md:grid-cols-[minmax(0,1fr)_240px]">
        <div>
          <div className="flex flex-wrap gap-2">
            {!outline.course.isPublished ? <Badge tone="yellow" size="sm">Private review</Badge> : null}
            <Badge tone={outline.completedCount === outline.totalCount ? "green" : "solid"} size="sm">
              {outline.completedCount === outline.totalCount ? "Course complete" : "In progress"}
            </Badge>
          </div>
          <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-extrabold tracking-[-0.025em] text-[var(--ink-900)]">
            {outline.course.title}
          </h1>
          {outline.course.description ? <p className="mt-2 max-w-3xl text-base font-semibold leading-relaxed text-[var(--text-muted)]">{outline.course.description}</p> : null}
        </div>
        <CourseCoverArtwork imageUrl={coverUrl} alt={`${outline.course.title} course cover`} size="course" />
      </header>
      <div className="mt-7">
        <LearnerCourseBrowser outline={outline} page={page} pageHref={`/courses/${courseId}`} />
      </div>
    </main>
  );
}

function OutlineError({ title, error }: { title: string; error: string }) {
  return (
    <main className="w-full flex-1 p-5 md:p-8 lg:p-10">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-extrabold text-[var(--ink-900)]">{title}</h1>
      <div className="mt-5 max-w-3xl rounded-[var(--bmh-radius-md)] border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm font-semibold text-[var(--danger)]">
        {error} Refresh the page or contact an administrator.
      </div>
    </main>
  );
}

function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const page = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}
