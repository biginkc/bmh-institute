import { execFileSync, spawn } from "node:child_process";

const userId = "00000000-0000-4000-8000-000000000420";
const prepareOperationId = "00000000-0000-4000-8000-000000000421";
const deleteOperationId = "00000000-0000-4000-8000-000000000422";
const email = "concurrent-auth-insert@example.invalid";

export async function verifyAuthInsertLifecycleSerialization({
  psqlPath,
  env,
}) {
  const insert = runPsqlAsync(
    psqlPath,
    env,
    `
      begin;
      insert into auth.users (
        id,
        email,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
      ) values (
        '${userId}',
        '${email}',
        '{}'::jsonb,
        '{}'::jsonb,
        now(),
        now()
      );
      select pg_sleep(2);
      commit;
    `,
  );

  await waitForAdvisoryLock(psqlPath, env, insert);

  let lifecycleSettled = false;
  const lifecycle = runPsqlAsync(
    psqlPath,
    env,
    `
      begin;
      set local request.jwt.claim.role = 'service_role';
      select public.hugo_prepare_pristine_delete(
        '${prepareOperationId}',
        '${email}'
      );
      commit;
      begin;
      set local request.jwt.claim.role = 'service_role';
      select public.hugo_delete_identity(
        '${deleteOperationId}',
        '${email}'
      );
      commit;
    `,
  ).finally(() => {
    lifecycleSettled = true;
  });

  await delay(250);
  if (lifecycleSettled) {
    await Promise.allSettled([insert, lifecycle]);
    throw new Error(
      "Lifecycle prepare/delete did not wait for the in-flight Auth insert.",
    );
  }

  await insert;
  await lifecycle;

  const observed = psqlScalar(
    psqlPath,
    env,
    `
      select string_agg(
        concat_ws(
          ':',
          operation,
          receipt #>> '{observed,status}',
          receipt ->> 'ok',
          coalesce(receipt ->> 'error_code', 'none')
        ),
        '|'
        order by operation_id
      )
      from public.hugo_access_operations
      where operation_id in (
        '${prepareOperationId}',
        '${deleteOperationId}'
      );
    `,
  );
  if (
    observed !==
      "preparePristineDelete:revoked:true:none|deleteIdentity:missing:true:none"
  ) {
    throw new Error(
      `Lifecycle calls did not observe and delete the serialized Auth insert: ${observed}`,
    );
  }

  const identityCount = psqlScalar(
    psqlPath,
    env,
    `
      select (
        (select count(*) from auth.users where id = '${userId}') +
        (select count(*) from public.profiles where id = '${userId}')
      )::text;
    `,
  );
  if (identityCount !== "0") {
    throw new Error(
      `Serialized lifecycle left an Auth/profile identity behind: ${identityCount}`,
    );
  }

  return "auth_insert_locked_before_row_then_lifecycle_deleted";
}

async function waitForAdvisoryLock(psqlPath, env, insert) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const lockPresent = psqlScalar(
      psqlPath,
      env,
      `
        select exists (
          select 1
          from pg_catalog.pg_locks held_lock
          where held_lock.locktype = 'advisory'
            and held_lock.granted
            and held_lock.pid <> pg_backend_pid()
        )::text;
      `,
    );
    if (lockPresent === "true" || lockPresent === "t") return;

    const completed = await Promise.race([
      insert.then(() => true),
      delay(25).then(() => false),
    ]);
    if (completed) {
      throw new Error(
        "Auth insert completed before its advisory lock was observed.",
      );
    }
  }
  throw new Error("Timed out waiting for the Auth insert advisory lock.");
}

function runPsqlAsync(psqlPath, env, sql) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      psqlPath,
      ["-X", "-v", "ON_ERROR_STOP=1", "-c", sql],
      { env, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(
        new Error(
          `psql concurrency session failed (${code}): ${stdout}${stderr}`,
        ),
      );
    });
  });
}

function psqlScalar(psqlPath, env, sql) {
  return execFileSync(
    psqlPath,
    ["-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql],
    { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}

function delay(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
