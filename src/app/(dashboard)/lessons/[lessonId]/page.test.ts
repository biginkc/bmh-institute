import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ContentBlock } from "@/components/content-blocks";

/**
 * `page.tsx` composes several `async function` server components
 * (`ContentCompositeLesson`, `PartBody`, ...) that `renderToStaticMarkup`
 * cannot render directly (React's synchronous string renderer errors with
 * "A component suspended while responding to synchronous input" the moment
 * it meets an unresolved async component). This walks the real element tree
 * returned by the real page and awaits exactly those async components in
 * place, leaving every ordinary (possibly hook-using) component untouched
 * for React to render normally. `AsyncFunction` detection is done via the
 * function's own constructor, never by invoking it speculatively — a
 * hook-using sync component is never called outside of React's render pass.
 */
function isAsyncFunctionComponent(
  type: unknown,
): type is (props: unknown) => Promise<ReactNode> {
  return (
    typeof type === "function" &&
    (type as { constructor?: { name?: string } }).constructor?.name ===
      "AsyncFunction"
  );
}

async function resolveServerTree(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) {
    return Promise.all(node.map(resolveServerTree));
  }
  if (!isValidElement(node)) return node;
  const { type, props } = node as ReactElement<Record<string, unknown>>;
  if (isAsyncFunctionComponent(type)) {
    const resolved = await type(props);
    return resolveServerTree(resolved);
  }
  if (props && typeof props === "object" && "children" in props) {
    const children = await resolveServerTree(
      (props as { children?: ReactNode }).children,
    );
    // Spread an array back out to positional arguments so React's original
    // "sibling JSX children" (which never needed keys) doesn't get
    // reinterpreted as a keyed list purely because of how this resolves them.
    return Array.isArray(children)
      ? cloneElement(node, undefined, ...children)
      : cloneElement(node, undefined, children);
  }
  return node;
}

// This is the actual request path a browser hits: `LessonPage` (the route's
// default export) -> `renderLessonPage` -> `ContentCompositeLesson` ->
// `resolveAndPrepareLearnerPart`. `prepare-learner-part.test.ts` and
// `performance-contract.test.ts` exercise the decision helper and the source
// text in isolation, but the prior defect for this exact PR was a
// route-ordering bug that lived *before* the helper was ever called
// (`page.tsx` used to canonicalize an unknown `?part=` value via
// `redirect()` ahead of the guard). Only rendering the real default export
// with a `?part=` search param proves an unknown or locked id actually
// reaches the rejection logic instead of being redirected first.
const { loadLearnerLessonOutline } = vi.hoisted(() => ({
  loadLearnerLessonOutline: vi.fn(),
}));
vi.mock("../../load-learner-lesson-outline", () => ({
  loadLearnerLessonOutline,
}));

const { getRequestAuthContext } = vi.hoisted(() => ({
  getRequestAuthContext: vi.fn(),
}));
vi.mock("@/lib/auth/request-context", () => ({ getRequestAuthContext }));

vi.mock("@/lib/content-blocks/sign-urls", () => ({
  enrichBlocksWithSignedUrls: vi.fn(async (blocks: ContentBlock[]) => blocks),
}));

const { notFoundMock, redirectMock } = vi.hoisted(() => ({
  notFoundMock: vi.fn(() => {
    throw new Error("notFound() called");
  }),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`redirect(${url}) called`);
  }),
}));
vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
}));

import LessonPage from "./page";

function fakeSupabase(lessonRow: unknown) {
  return {
    from(table: string) {
      if (table !== "lessons") {
        throw new Error(`unexpected supabase table query in this test: ${table}`);
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: lessonRow, error: null }),
          }),
        }),
      };
    },
  };
}

const lessonRow = {
  id: "lesson-1",
  lesson_type: "content",
  prerequisite_lesson_id: null,
  quiz_id: null,
  module_id: "module-1",
  modules: { course_id: "course-1" },
};

// A required video followed by a locked "Talk with Andrea" oral-check
// role-play — the exact shape of the production repro (Lesson 3,
// `?part=not-a-real-part` and `?part=guide` while locked both rendered the
// role-play surface instead of an explicit denial).
const videoBlock: ContentBlock = {
  id: "block-video-1",
  block_type: "video",
  content: { source: "upload" },
  sort_order: 1,
  is_required_for_completion: true,
};
const rolePlayBlock: ContentBlock = {
  id: "block-role-play-1",
  block_type: "role_play",
  content: { mode: "oral_check" },
  sort_order: 2,
  is_required_for_completion: true,
};

function contentTile() {
  return {
    id: "lesson-1",
    title: "Lesson 1",
    description: null,
    moduleId: "module-1",
    moduleTitle: "Module 1",
    lessonNumber: 1,
    complete: false,
    unlocked: true,
    state: "current" as const,
    href: "/lessons/lesson-1",
    blocks: [videoBlock, rolePlayBlock],
    thumbnailPath: null,
    contentImportId: null,
    thumbnailAssetKey: null,
    thumbnailApprovedPath: null,
    thumbnailApprovedSha256: null,
    kind: "content" as const,
    pairedQuizLessonId: null,
    quizId: null,
    contentComplete: false,
    quizComplete: false,
    quizUnlocked: false,
    completedBlockIds: new Set<string>(),
  };
}

async function renderLesson(part: string | undefined) {
  const element = await LessonPage({
    params: Promise.resolve({ lessonId: "lesson-1" }),
    searchParams: Promise.resolve({ part }),
  });
  return renderToStaticMarkup(await resolveServerTree(element));
}

describe("LessonPage real request path (?part= routing)", () => {
  beforeEach(() => {
    loadLearnerLessonOutline.mockReset();
    getRequestAuthContext.mockReset();
    notFoundMock.mockClear();
    redirectMock.mockClear();
    getRequestAuthContext.mockResolvedValue({
      supabase: fakeSupabase(lessonRow),
      user: { id: "user-1" },
      profile: { system_role: "learner", full_name: "Learner One", status: "active" },
    });
    loadLearnerLessonOutline.mockResolvedValue({
      ok: true,
      outline: { tiles: [contentTile()], totalCount: 1 },
    });
  });

  it("rejects an unknown ?part= id at the real page route, never rendering the role-play surface", async () => {
    const html = await renderLesson("not-a-real-part");
    expect(html).toContain(
      "That lesson part is unavailable. Choose an available part or finish the earlier lesson first.",
    );
    expect(html).not.toContain("Talk with Andrea");
    expect(html).not.toContain('data-content-block="role_play"');
    expect(redirectMock).not.toHaveBeenCalled();
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it("rejects a real but still-locked ?part= id at the real page route (gated by an earlier required, incomplete part)", async () => {
    const html = await renderLesson("role-play-1");
    expect(html).toContain(
      "That lesson part is unavailable. Choose an available part or finish the earlier lesson first.",
    );
    expect(html).not.toContain("Talk with Andrea");
    expect(html).not.toContain('data-content-block="role_play"');
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("positive control: a valid, available ?part= id renders its content through the same real route", async () => {
    const html = await renderLesson("video-1");
    expect(html).toContain('data-content-block="video"');
    expect(html).not.toContain("unavailable");
  });

  it("positive control: the no-query default still selects the first available part", async () => {
    const html = await renderLesson(undefined);
    expect(html).toContain('data-content-block="video"');
  });
});
