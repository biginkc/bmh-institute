import { randomBytes, randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

const url = process.env.TEST_SUPABASE_URL;
const anonKey = process.env.TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const envPresent = Boolean(url && anonKey && serviceKey);

const admin = envPresent
  ? createClient(url!, serviceKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

type CatalogFixture = {
  importId: string;
  roleGroupId: string;
  programId: string;
  courseId: string;
  programCourseId: string;
  programAccessId: string;
};

function ownedPayload(fixture?: CatalogFixture) {
  return {
    answer_options: [],
    questions: [],
    content_blocks: [],
    lessons: [],
    assignments: [],
    quizzes: [],
    modules: [],
    program_access: fixture ? [fixture.programAccessId] : [],
    program_courses: fixture ? [fixture.programCourseId] : [],
    courses: fixture ? [fixture.courseId] : [],
    programs: fixture ? [fixture.programId] : [],
    role_groups: fixture ? [fixture.roleGroupId] : [],
  };
}

async function createCatalogFixture(): Promise<CatalogFixture> {
  if (!admin) throw new Error("Test-project service client is unavailable.");
  const suffix = randomBytes(8).toString("hex");
  const fixture = {
    importId: `rollback-integration-${suffix}`,
    roleGroupId: randomUUID(),
    programId: randomUUID(),
    courseId: randomUUID(),
    programCourseId: randomUUID(),
    programAccessId: randomUUID(),
  };
  try {
    const { error: roleError } = await admin.from("role_groups").insert({
      id: fixture.roleGroupId,
      name: `Rollback QA ${suffix}`,
    });
    if (roleError) throw roleError;
    const { error: programError } = await admin.from("programs").insert({
      id: fixture.programId,
      title: `Rollback program ${suffix}`,
    });
    if (programError) throw programError;
    const { error: courseError } = await admin.from("courses").insert({
      id: fixture.courseId,
      title: `Rollback course ${suffix}`,
    });
    if (courseError) throw courseError;
    const { error: linksError } = await admin.from("program_courses").insert({
      id: fixture.programCourseId,
      program_id: fixture.programId,
      course_id: fixture.courseId,
    });
    if (linksError) throw linksError;
    const { error: accessError } = await admin.from("program_access").insert({
      id: fixture.programAccessId,
      program_id: fixture.programId,
      role_group_id: fixture.roleGroupId,
    });
    if (accessError) throw accessError;
    return fixture;
  } catch (error) {
    await removeFixture(fixture);
    throw error;
  }
}

async function removeFixture(fixture: CatalogFixture) {
  if (!admin) return;
  await admin.from("programs").delete().eq("id", fixture.programId);
  await admin.from("courses").delete().eq("id", fixture.courseId);
  await admin.from("role_groups").delete().eq("id", fixture.roleGroupId);
}

async function expectCatalogPresent(fixture: CatalogFixture) {
  if (!admin) throw new Error("Test-project service client is unavailable.");
  for (const [table, id] of [
    ["role_groups", fixture.roleGroupId],
    ["programs", fixture.programId],
    ["courses", fixture.courseId],
    ["program_courses", fixture.programCourseId],
    ["program_access", fixture.programAccessId],
  ] as const) {
    const { count, error } = await admin
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("id", id);
    if (error) throw error;
    expect(count, `${table}.${id} should survive the rejected transaction`).toBe(1);
  }
}

describe.skipIf(!envPresent)("atomic course import rollback on a test project", () => {
  it("rolls back a complete synthetic catalog in one confirmed call", async () => {
    if (!admin) throw new Error("Test-project service client is unavailable.");
    const fixture = await createCatalogFixture();
    try {
      const { data, error } = await admin.rpc("fn_rollback_course_import", {
        p_import_id: fixture.importId,
        p_owned: ownedPayload(fixture),
      });
      expect(error).toBeNull();
      expect(data).toEqual({
        status: "rolled_back",
        import_id: fixture.importId,
        owned_id_count: 5,
      });

      const { count, error: countError } = await admin
        .from("programs")
        .select("id", { count: "exact", head: true })
        .eq("id", fixture.programId);
      if (countError) throw countError;
      expect(count).toBe(0);
    } finally {
      await removeFixture(fixture);
    }
  });

  it("blocks an external dependent without partially deleting owned rows", async () => {
    if (!admin) throw new Error("Test-project service client is unavailable.");
    const fixture = await createCatalogFixture();
    const courseAccessId = randomUUID();
    try {
      const { error: accessError } = await admin.from("course_access").insert({
        id: courseAccessId,
        course_id: fixture.courseId,
        role_group_id: fixture.roleGroupId,
      });
      if (accessError) throw accessError;

      const { error } = await admin.rpc("fn_rollback_course_import", {
        p_import_id: fixture.importId,
        p_owned: ownedPayload(fixture),
      });
      expect(error?.message).toMatch(/external course_access references/i);
      await expectCatalogPresent(fixture);
    } finally {
      await admin.from("course_access").delete().eq("id", courseAccessId);
      await removeFixture(fixture);
    }
  });

  it("denies execute to anonymous and authenticated clients", async () => {
    if (!admin || !url || !anonKey) throw new Error("Test-project clients are unavailable.");
    const anonymous = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const deniedAnon = await anonymous.rpc("fn_rollback_course_import", {
      p_import_id: "rollback-privilege-test",
      p_owned: ownedPayload(),
    });
    expect(deniedAnon.error).not.toBeNull();

    const email = `rollback-auth-${randomBytes(8).toString("hex")}@bmh.invalid`;
    const password = `${randomBytes(16).toString("base64url")}!Aa1`;
    let userId: string | null = null;
    try {
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (created.error || !created.data.user) {
        throw created.error ?? new Error("Could not create privilege-test user.");
      }
      userId = created.data.user.id;
      const authenticated = createClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const signedIn = await authenticated.auth.signInWithPassword({ email, password });
      if (signedIn.error) throw signedIn.error;
      const deniedAuthenticated = await authenticated.rpc("fn_rollback_course_import", {
        p_import_id: "rollback-privilege-test",
        p_owned: ownedPayload(),
      });
      expect(deniedAuthenticated.error).not.toBeNull();
    } finally {
      if (userId) await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    }
  });
});
