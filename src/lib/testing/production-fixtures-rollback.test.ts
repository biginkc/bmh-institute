import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  cleanupProductionPilotDryRunFixture,
  cleanupProductionRecoveryFixture,
  createProductionInviteFixture,
  createProductionPilotDryRunFixture,
  createProductionReadinessFixture,
  createProductionRecoveryFixture,
} from "../../../e2e-prod/production-fixtures";

class FakeProductionAdmin {
  readonly users = new Set<string>();
  readonly rows = new Map<string, Set<string>>();
  readonly objects = new Map<string, Set<string>>();
  readonly insertFailures = new Map<string, number>();
  readonly deleteFailures = new Set<string>();
  readonly injectedError = new Error("injected fixture construction failure");
  failProfileUpdate = false;
  failUserDeletion = false;
  failUserCreationAt: number | null = null;
  private nextId = 0;
  private readonly insertCounts = new Map<string, number>();
  private userCreationCount = 0;

  readonly auth = {
    admin: {
      createUser: async () => {
        this.userCreationCount += 1;
        if (this.failUserCreationAt === this.userCreationCount) {
          return { data: { user: null }, error: this.injectedError };
        }
        const id = this.id("user");
        this.users.add(id);
        return { data: { user: { id } }, error: null };
      },
      deleteUser: async (id: string) => {
        if (this.failUserDeletion) {
          return {
            data: null,
            error: new Error("injected user cleanup failure"),
          };
        }
        this.users.delete(id);
        return { data: null, error: null };
      },
    },
  };

  readonly storage = {
    from: (bucket: string) => ({
      upload: async (path: string) => {
        this.bucket(bucket).add(path);
        return { data: { path }, error: null };
      },
      remove: async (paths: string[]) => {
        for (const path of paths) this.bucket(bucket).delete(path);
        return { data: paths, error: null };
      },
    }),
  };

  from(table: string) {
    return new FakeQuery(this, table);
  }

  addRows(table: string, values: unknown): string {
    const records = Array.isArray(values) ? values : [values];
    let lastId = "";
    for (const record of records) {
      const candidate = record as { id?: unknown };
      lastId = typeof candidate.id === "string" ? candidate.id : this.id(table);
      this.table(table).add(lastId);
    }
    return lastId;
  }

  shouldFailInsert(table: string): boolean {
    const count = (this.insertCounts.get(table) ?? 0) + 1;
    this.insertCounts.set(table, count);
    return this.insertFailures.get(table) === count;
  }

  deleteRow(table: string, id: string): void {
    this.table(table).delete(id);

    // The production schema cascades these owned rows. Model those cascades so
    // the regression checks the same cleanup boundary as production.
    if (table === "courses") {
      for (const child of ["modules", "lessons", "content_blocks", "course_access", "program_courses"]) {
        this.table(child).clear();
      }
    }
    if (table === "programs") {
      for (const child of ["program_access", "program_courses"]) this.table(child).clear();
    }
    if (table === "role_groups") {
      for (const child of ["user_role_groups", "program_access", "course_access"]) this.table(child).clear();
    }
    if (table === "quizzes") {
      for (const child of ["questions", "answer_options"]) this.table(child).clear();
    }
  }

  resourceCount(): number {
    const rowCount = [...this.rows.values()].reduce((sum, rows) => sum + rows.size, 0);
    const objectCount = [...this.objects.values()].reduce((sum, objects) => sum + objects.size, 0);
    return this.users.size + rowCount + objectCount;
  }

  private id(prefix: string): string {
    this.nextId += 1;
    return `${prefix}-${this.nextId}`;
  }

  private table(name: string): Set<string> {
    const rows = this.rows.get(name) ?? new Set<string>();
    this.rows.set(name, rows);
    return rows;
  }

  private bucket(name: string): Set<string> {
    const objects = this.objects.get(name) ?? new Set<string>();
    this.objects.set(name, objects);
    return objects;
  }
}

class FakeQuery implements PromiseLike<{ data: null; error: null }> {
  private insertedId: string | null = null;
  private deleting = false;
  private insertError: Error | null = null;
  private updating = false;
  private equality: { column: string; value: unknown } | null = null;

  constructor(
    private readonly admin: FakeProductionAdmin,
    private readonly table: string,
  ) {}

  insert(values: unknown): this {
    if (this.admin.shouldFailInsert(this.table)) {
      this.insertError = this.admin.injectedError;
    } else {
      this.insertedId = this.admin.addRows(this.table, values);
    }
    return this;
  }

  update(): this {
    this.updating = true;
    return this;
  }

  delete(): this {
    this.deleting = true;
    return this;
  }

  select(): this {
    return this;
  }

  eq(column: string, value: unknown): this {
    this.equality = { column, value };
    return this;
  }

  async single(): Promise<{ data: { id: string } | null; error: Error | null }> {
    return {
      data: this.insertedId ? { id: this.insertedId } : null,
      error: this.insertError,
    };
  }

  async throwOnError(): Promise<{ data: null; error: null }> {
    if (this.insertError) throw this.insertError;
    if (this.updating && this.table === "profiles" && this.admin.failProfileUpdate) {
      throw this.admin.injectedError;
    }
    if (this.deleting && this.admin.deleteFailures.has(this.table)) {
      throw this.admin.injectedError;
    }
    this.executeDelete();
    return { data: null, error: null };
  }

  then<TResult1 = { data: null; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: null; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    this.executeDelete();
    return Promise.resolve({ data: null, error: null }).then(onfulfilled, onrejected);
  }

  private executeDelete(): void {
    if (this.deleting && this.equality?.column === "id" && typeof this.equality.value === "string") {
      this.admin.deleteRow(this.table, this.equality.value);
      this.deleting = false;
    }
  }
}

function adminClient(fake: FakeProductionAdmin): SupabaseClient {
  return fake as unknown as SupabaseClient;
}

async function expectRollbackAfter(
  stage: string,
  configure: (fake: FakeProductionAdmin) => void,
): Promise<void> {
  const fake = new FakeProductionAdmin();
  configure(fake);

  await expect(
    createProductionReadinessFixture(adminClient(fake)),
  ).rejects.toBe(fake.injectedError);
  expect(fake.resourceCount(), `resources leaked after ${stage}`).toBe(0);
}

describe("production fixture construction rollback", () => {
  it("removes a user when construction fails after user creation", async () => {
    await expectRollbackAfter("user creation", (fake) => {
      fake.failProfileUpdate = true;
    });
  });

  it("removes users and catalog rows when construction fails after catalog creation", async () => {
    await expectRollbackAfter("catalog creation", (fake) => {
      fake.insertFailures.set("modules", 1);
    });
  });

  it("removes users, catalog rows, and storage when construction fails after upload", async () => {
    await expectRollbackAfter("storage upload", (fake) => {
      fake.insertFailures.set("content_blocks", 3);
    });
  });

  it("preserves the construction error when rollback also fails", async () => {
    const fake = new FakeProductionAdmin();
    fake.failProfileUpdate = true;
    fake.failUserDeletion = true;

    let failure: unknown;
    try {
      await createProductionReadinessFixture(adminClient(fake));
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(AggregateError);
    const aggregate = failure as AggregateError;
    expect(aggregate.cause).toBe(fake.injectedError);
    expect(aggregate.errors[0]).toBe(fake.injectedError);
    expect(aggregate.message).toMatch(/rollback was incomplete/i);
  });

  it("rolls back an invite fixture when catalog creation fails", async () => {
    const fake = new FakeProductionAdmin();
    fake.insertFailures.set("programs", 1);

    await expect(
      createProductionInviteFixture(adminClient(fake), "invitee@bmh-institute.test"),
    ).rejects.toBe(fake.injectedError);
    expect(fake.resourceCount()).toBe(0);
  });

  it("rolls back a recovery user when profile setup fails", async () => {
    const fake = new FakeProductionAdmin();
    fake.failProfileUpdate = true;

    await expect(
      createProductionRecoveryFixture(adminClient(fake), "recovery@bmh-institute.test"),
    ).rejects.toBe(fake.injectedError);
    expect(fake.resourceCount()).toBe(0);
  });

  it("waits for each pilot user and rolls back before the next one after a failure", async () => {
    const fake = new FakeProductionAdmin();
    fake.failUserCreationAt = 2;

    await expect(
      createProductionPilotDryRunFixture(adminClient(fake)),
    ).rejects.toBe(fake.injectedError);
    expect(fake.resourceCount()).toBe(0);
  });

  it("reports a failed normal auth teardown instead of claiming cleanup", async () => {
    const fake = new FakeProductionAdmin();
    const fixture = await createProductionRecoveryFixture(
      adminClient(fake),
      "recovery@bmh-institute.test",
    );
    fake.failUserDeletion = true;

    await expect(cleanupProductionRecoveryFixture(adminClient(fake), fixture))
      .rejects.toThrow(/cleanup was incomplete/i);
    expect(fake.users).toContain(fixture.userId);
  });

  it("continues normal teardown after a database delete fails", async () => {
    const fake = new FakeProductionAdmin();
    const fixture = await createProductionPilotDryRunFixture(adminClient(fake));
    fake.deleteFailures.add("courses");

    await expect(cleanupProductionPilotDryRunFixture(adminClient(fake), fixture))
      .rejects.toThrow(/cleanup was incomplete/i);
    expect(fake.users.size).toBe(0);
    expect(fake.rows.get("courses")?.has(fixture.courseId)).toBe(true);
    expect(fake.rows.get("programs")?.has(fixture.programId)).toBe(false);
    expect(fake.rows.get("role_groups")?.has(fixture.roleGroupId)).toBe(false);
  });
});
