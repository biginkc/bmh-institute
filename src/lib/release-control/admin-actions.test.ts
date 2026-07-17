import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  IMPORT_RELEASE_REQUIRED_ERROR,
  IMPORT_ROLLBACK_REQUIRED_ERROR,
} from "./admin-guards";

type CatalogRow = {
  thumbnail_path: string | null;
  content_import_id: string | null;
  thumbnail_asset_key: string | null;
  thumbnail_approved_path: string | null;
  thumbnail_approved_sha256: string | null;
  is_published: boolean;
};

const current: Record<"programs" | "courses", CatalogRow> = {
  programs: catalogRow(),
  courses: catalogRow(),
};
const updateCalls: Array<{ table: string; value: Record<string, unknown> }> = [];
const deleteCalls: string[] = [];

vi.mock("@/lib/auth/guard", () => ({
  requireAdmin: vi.fn(async () => ({ id: "admin-1" })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: "programs" | "courses") => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: current[table], error: null }),
        }),
      }),
      update: (value: Record<string, unknown>) => {
        updateCalls.push({ table, value });
        return { eq: async () => ({ error: null }) };
      },
      delete: () => ({
        eq: async () => {
          deleteCalls.push(table);
          return { error: null };
        },
      }),
    }),
  })),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { updateCourse } from "@/app/(dashboard)/admin/courses/actions";
import { updateProgram } from "@/app/(dashboard)/admin/programs/actions";
import { deleteCourse } from "@/app/(dashboard)/admin/courses/actions";
import { deleteProgram } from "@/app/(dashboard)/admin/programs/actions";

function catalogRow(): CatalogRow {
  return {
    thumbnail_path: null,
    content_import_id: "bmh-institute-v1",
    thumbnail_asset_key: null,
    thumbnail_approved_path: null,
    thumbnail_approved_sha256: null,
    is_published: false,
  };
}

function form(kind: "program" | "course", publish: boolean): FormData {
  const data = new FormData();
  data.set("title", `Release-controlled ${kind}`);
  if (kind === "program") data.set("course_order_mode", "sequential");
  if (publish) data.set("is_published", "on");
  return data;
}

describe("generic admin catalog actions", () => {
  beforeEach(() => {
    current.programs = catalogRow();
    current.courses = catalogRow();
    updateCalls.length = 0;
    deleteCalls.length = 0;
  });

  it("refuses to publish an imported program", async () => {
    const result = await updateProgram("program-1", null, form("program", true));
    expect(result).toEqual({
      ok: false,
      error: IMPORT_RELEASE_REQUIRED_ERROR,
      values: expect.objectContaining({ is_published: true }),
    });
    expect(updateCalls).toEqual([]);
  });

  it("refuses to publish an imported course", async () => {
    const result = await updateCourse("course-1", null, form("course", true));
    expect(result).toEqual({
      ok: false,
      error: IMPORT_RELEASE_REQUIRED_ERROR,
      values: expect.objectContaining({ is_published: true }),
    });
    expect(updateCalls).toEqual([]);
  });

  it("preserves generic publication for non-imported content", async () => {
    current.programs.content_import_id = null;
    current.courses.content_import_id = null;

    await expect(
      updateProgram("program-1", null, form("program", true)),
    ).resolves.toEqual({ ok: true });
    await expect(
      updateCourse("course-1", null, form("course", true)),
    ).resolves.toEqual({ ok: true });
    expect(updateCalls).toHaveLength(2);
  });

  it("refuses generic deletion of imported programs and courses", async () => {
    await expect(deleteProgram("program-1")).resolves.toEqual({
      ok: false,
      error: IMPORT_ROLLBACK_REQUIRED_ERROR,
    });
    await expect(deleteCourse("course-1")).resolves.toEqual({
      ok: false,
      error: IMPORT_ROLLBACK_REQUIRED_ERROR,
    });
    expect(deleteCalls).toEqual([]);
  });

  it("preserves generic deletion for reusable non-imported catalog rows", async () => {
    current.programs.content_import_id = null;
    current.courses.content_import_id = null;
    await deleteProgram("program-1");
    await deleteCourse("course-1");
    expect(deleteCalls).toEqual(["programs", "courses"]);
  });
});
