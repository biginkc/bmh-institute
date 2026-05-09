import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type IdRow = { id: string };

const PROD_PROJECT_REF = "dhvfsyteqsxagokoerrx";
const DEFAULT_PREFIX = "PRD-READY-";

const args = new Set(process.argv.slice(2));
const execute = args.has("--execute");
const prefix = readArgValue("--prefix") ?? DEFAULT_PREFIX;

const supabaseUrl =
  process.env.PROD_SUPABASE_URL ??
  process.env.TEST_SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole =
  process.env.PROD_SUPABASE_SERVICE_ROLE_KEY ??
  process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRole) {
  throw new Error(
    "Set PROD_SUPABASE_URL and PROD_SUPABASE_SERVICE_ROLE_KEY before running cleanup.",
  );
}

if (!supabaseUrl.includes(PROD_PROJECT_REF)) {
  throw new Error(
    `Refusing cleanup against unexpected Supabase project. Expected ${PROD_PROJECT_REF}.`,
  );
}

const admin = createClient(supabaseUrl, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const plan = await buildCleanupPlan(admin);

  if (execute) {
    await executeCleanup(admin, plan);
  }

  const remaining = execute ? await buildCleanupPlan(admin) : plan;

  console.log(
    JSON.stringify(
      {
        mode: execute ? "execute" : "dry-run",
        prefix,
        deleted: execute ? summarize(plan) : undefined,
        remaining: summarize(remaining),
        details: execute ? undefined : plan,
      },
      null,
      2,
    ),
  );
}

type CleanupPlan = Awaited<ReturnType<typeof buildCleanupPlan>>;

async function buildCleanupPlan(client: SupabaseClient) {
  const [
    programs,
    courses,
    roleGroups,
    assignments,
    quizzes,
    answerOptions,
    authUsers,
    storageObjects,
  ] = await Promise.all([
    selectIds(client, "programs", "title"),
    selectIds(client, "courses", "title"),
    selectIds(client, "role_groups", "name"),
    selectIds(client, "assignments", "title"),
    selectIds(client, "quizzes", "title"),
    selectIds(client, "answer_options", "option_text"),
    listPrefixedAuthUsers(client),
    listReadinessStorageObjects(client),
  ]);

  return {
    programs,
    courses,
    roleGroups,
    assignments,
    quizzes,
    answerOptions,
    authUsers,
    storageObjects,
  };
}

async function executeCleanup(client: SupabaseClient, plan: CleanupPlan) {
  if (plan.storageObjects.length > 0) {
    await throwOnStorageError(
      client.storage.from("submissions").remove(plan.storageObjects),
    );
  }

  await deleteIds(client, "programs", plan.programs);
  await deleteIds(client, "courses", plan.courses);
  await deleteIds(client, "assignments", plan.assignments);
  await deleteIds(client, "quizzes", plan.quizzes);
  await deleteIds(client, "answer_options", plan.answerOptions);
  await deleteIds(client, "role_groups", plan.roleGroups);

  for (const user of plan.authUsers) {
    const { error } = await client.auth.admin.deleteUser(user.id);
    if (error) throw error;
  }
}

async function selectIds(
  client: SupabaseClient,
  table: string,
  column: string,
): Promise<string[]> {
  const { data, error } = await client
    .from(table)
    .select("id")
    .ilike(column, `${prefix}%`);
  if (error) throw error;
  return ((data ?? []) as IdRow[]).map((row) => row.id);
}

async function deleteIds(
  client: SupabaseClient,
  table: string,
  ids: string[],
) {
  if (ids.length === 0) return;
  const { error } = await client.from(table).delete().in("id", ids);
  if (error) throw error;
}

async function listPrefixedAuthUsers(client: SupabaseClient) {
  const users: { id: string; email: string }[] = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw error;

    users.push(
      ...data.users
        .filter((user) => user.email?.startsWith(prefix.toLowerCase()))
        .map((user) => ({ id: user.id, email: user.email ?? "" })),
    );

    if (data.users.length < 1000) break;
  }
  return users;
}

async function listReadinessStorageObjects(
  client: SupabaseClient,
): Promise<string[]> {
  const matches: string[] = [];
  await walkStoragePrefix(client, "", matches);
  return matches;
}

async function walkStoragePrefix(
  client: SupabaseClient,
  prefixPath: string,
  matches: string[],
) {
  const { data, error } = await client.storage
    .from("submissions")
    .list(prefixPath, { limit: 1000 });
  if (error) throw error;

  for (const item of data ?? []) {
    const objectPath = prefixPath ? `${prefixPath}/${item.name}` : item.name;
    if (
      objectPath.endsWith("production-readiness-upload.txt") ||
      objectPath.endsWith("blocked-cross-prefix.txt")
    ) {
      matches.push(objectPath);
    }

    if (!item.id) {
      await walkStoragePrefix(client, objectPath, matches);
    }
  }
}

async function throwOnStorageError<T>(
  promise: Promise<{ data: T; error: Error | null }>,
) {
  const { error } = await promise;
  if (error) throw error;
}

function summarize(plan: CleanupPlan) {
  return {
    programs: plan.programs.length,
    courses: plan.courses.length,
    roleGroups: plan.roleGroups.length,
    assignments: plan.assignments.length,
    quizzes: plan.quizzes.length,
    answerOptions: plan.answerOptions.length,
    authUsers: plan.authUsers.length,
    storageObjects: plan.storageObjects.length,
  };
}

function readArgValue(name: string): string | undefined {
  const rawArgs = process.argv.slice(2);
  const index = rawArgs.indexOf(name);
  if (index === -1) return undefined;
  return rawArgs[index + 1];
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
