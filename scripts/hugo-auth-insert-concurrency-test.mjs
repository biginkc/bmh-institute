import { execFileSync, spawn } from "node:child_process";

const userId = "00000000-0000-4000-8000-000000000420";
const prepareOperationId = "00000000-0000-4000-8000-000000000421";
const deleteOperationId = "00000000-0000-4000-8000-000000000422";
const email = "concurrent-auth-insert@example.invalid";
const updateUserId = "00000000-0000-4000-8000-000000000430";
const updatePrepareOperationId = "00000000-0000-4000-8000-000000000431";
const updateDeleteOperationId = "00000000-0000-4000-8000-000000000432";
const originalEmail = "before-concurrent-email-update@example.invalid";
const updatedEmail = "after-concurrent-email-update@example.invalid";
const roleGroupId = "00000000-0000-4000-8000-000000000440";
const roleGroupUserId = "00000000-0000-4000-8000-000000000441";
const roleGroupGrantOperationId =
  "00000000-0000-4000-8000-000000000442";
const roleGroupSuspendOperationId =
  "00000000-0000-4000-8000-000000000443";
const roleGroupEmail = "concurrent-role-group-delete@example.invalid";
const truncateRoleGroupId = "00000000-0000-4000-8000-000000000450";
const truncateUserId = "00000000-0000-4000-8000-000000000451";
const truncateGrantOperationId =
  "00000000-0000-4000-8000-000000000452";
const truncateSuspendOperationId =
  "00000000-0000-4000-8000-000000000453";
const truncateEmail = "concurrent-role-group-truncate@example.invalid";
const roleLifecycleAdminId = "00000000-0000-4000-8000-000000000470";
const roleLifecycleUserId = "00000000-0000-4000-8000-000000000471";
const roleLifecycleGroupA = "00000000-0000-4000-8000-000000000472";
const roleLifecycleGroupB = "00000000-0000-4000-8000-000000000473";
const roleLifecycleEmail = "concurrent-role-lifecycle@example.invalid";
const roleLifecycleGrantOperationId =
  "00000000-0000-4000-8000-000000000474";
const roleLifecycleSuspendOperationId =
  "00000000-0000-4000-8000-000000000475";

export async function verifyAuthInsertLifecycleSerialization({
  psqlPath,
  env,
}) {
  await verifyInsertSerialization(psqlPath, env);
  await verifyEmailUpdateSerialization(psqlPath, env);
  return "auth_insert_and_email_update_serialized_before_lifecycle_proof";
}

export async function verifyRoleGroupDeleteLifecycleSerialization({
  psqlPath,
  env,
}) {
  psqlExec(
    psqlPath,
    env,
    `
      set request.jwt.claim.role = 'service_role';
      insert into public.role_groups (id, name)
      values ('${roleGroupId}', 'Concurrent Hugo deletion regression');
      insert into auth.users (
        id,
        email,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
      ) values (
        '${roleGroupUserId}',
        '${roleGroupEmail}',
        now(),
        '{}'::jsonb,
        '{}'::jsonb,
        now(),
        now()
      );
      select public.hugo_apply_access(
        '${roleGroupGrantOperationId}',
        '${roleGroupEmail}',
        'learner',
        '{"role_group_ids":["${roleGroupId}"]}'::jsonb,
        'active',
        null,
        '${roleGroupUserId}'
      );
    `,
  );

  const deletion = runPsqlAsync(
    psqlPath,
    env,
    `
      begin;
      delete from public.role_groups
      where id = '${roleGroupId}';
      select pg_sleep(2);
      commit;
    `,
  );
  await waitForAdvisoryLock(
    psqlPath,
    env,
    deletion,
    "role-group deletion",
  );

  let lifecycleSettled = false;
  const lifecycle = runPsqlAsync(
    psqlPath,
    env,
    `
      begin;
      set local request.jwt.claim.role = 'service_role';
      select public.hugo_preflight_access_operation(
        '${roleGroupSuspendOperationId}',
        '${roleGroupEmail}',
        'learner',
        '{"role_group_ids":["${roleGroupId}"]}'::jsonb,
        'suspended',
        null
      );
      select public.hugo_apply_access(
        '${roleGroupSuspendOperationId}',
        '${roleGroupEmail}',
        'learner',
        '{"role_group_ids":["${roleGroupId}"]}'::jsonb,
        'suspended',
        null,
        '${roleGroupUserId}'
      );
      commit;
    `,
  ).finally(() => {
    lifecycleSettled = true;
  });

  await delay(250);
  if (lifecycleSettled) {
    await Promise.allSettled([deletion, lifecycle]);
    throw new Error(
      "Lifecycle suspension did not wait for the in-flight role-group deletion.",
    );
  }

  await deletion;
  await lifecycle;

  const observed = psqlScalar(
    psqlPath,
    env,
    `
      select concat_ws(
        ':',
        receipt ->> 'ok',
        receipt #>> '{observed,status}',
        jsonb_array_length(
          receipt #> '{observed,config,role_group_ids}'
        ),
        (
          select profile.status
          from public.profiles profile
          where profile.id = '${roleGroupUserId}'
        ),
        (
          select count(*)
          from public.user_role_groups membership
          where membership.user_id = '${roleGroupUserId}'
        )
      )
      from public.hugo_access_operations
      where operation_id = '${roleGroupSuspendOperationId}';
    `,
  );
  if (observed !== "true:suspended:0:suspended:0") {
    throw new Error(
      `Serialized role-group deletion left unsafe lifecycle state: ${observed}`,
    );
  }

  return "role_group_delete_committed_before_suspension_filter";
}

export async function verifyRoleGroupTruncateLifecycleSerialization({
  psqlPath,
  env,
}) {
  psqlExec(
    psqlPath,
    env,
    `
      set request.jwt.claim.role = 'service_role';
      insert into public.role_groups (id, name)
      values ('${truncateRoleGroupId}', 'Concurrent Hugo truncate regression');
      insert into auth.users (
        id,
        email,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
      ) values (
        '${truncateUserId}',
        '${truncateEmail}',
        now(),
        '{}'::jsonb,
        '{}'::jsonb,
        now(),
        now()
      );
      select public.hugo_apply_access(
        '${truncateGrantOperationId}',
        '${truncateEmail}',
        'learner',
        '{"role_group_ids":["${truncateRoleGroupId}"]}'::jsonb,
        'active',
        null,
        '${truncateUserId}'
      );
    `,
  );

  const lifecycle = runPsqlAsync(
    psqlPath,
    env,
    `
      begin;
      set local request.jwt.claim.role = 'service_role';
      select pg_advisory_xact_lock(
        hashtextextended('hugo-institute-privileged-lifecycle-v1', 0)
      );
      select pg_advisory_xact_lock(
        hashtextextended('hugo-institute-grant-mutation-rpc-v1', 0)
      );
      select pg_sleep(2);
      select public.hugo_preflight_access_operation(
        '${truncateSuspendOperationId}',
        '${truncateEmail}',
        'learner',
        '{"role_group_ids":["${truncateRoleGroupId}"]}'::jsonb,
        'suspended',
        null
      );
      select public.hugo_apply_access(
        '${truncateSuspendOperationId}',
        '${truncateEmail}',
        'learner',
        '{"role_group_ids":["${truncateRoleGroupId}"]}'::jsonb,
        'suspended',
        null,
        '${truncateUserId}'
      );
      commit;
    `,
  );
  await waitForAdvisoryLock(
    psqlPath,
    env,
    lifecycle,
    "truncate-race lifecycle",
  );

  const truncation = runPsqlAsync(
    psqlPath,
    env,
    `
      begin;
      truncate table public.role_groups cascade;
      select pg_sleep(1);
      commit;
    `,
  );
  await waitForTableLock(
    psqlPath,
    env,
    truncation,
    "public.role_groups",
    "AccessExclusiveLock",
  );

  await Promise.all([lifecycle, truncation]);

  const observed = psqlScalar(
    psqlPath,
    env,
    `
      select concat_ws(
        ':',
        receipt ->> 'ok',
        receipt #>> '{observed,status}',
        jsonb_array_length(
          receipt #> '{observed,config,role_group_ids}'
        ),
        (
          select profile.status
          from public.profiles profile
          where profile.id = '${truncateUserId}'
        ),
        (
          select count(*)
          from public.role_groups
        ),
        (
          select count(*)
          from public.user_role_groups membership
          where membership.user_id = '${truncateUserId}'
        )
      )
      from public.hugo_access_operations
      where operation_id = '${truncateSuspendOperationId}';
    `,
  );
  if (observed !== "true:suspended:0:suspended:0:0") {
    throw new Error(
      `Owner-level role-group truncate did not converge safely: ${observed}`,
    );
  }

  return "owner_truncate_and_suspension_converged_without_deadlock";
}

export async function verifyRoleAndLifecycleTwoSessionSerialization(
  psqlPath,
  env,
) {
  psqlExec(
    psqlPath,
    env,
    `
      set request.jwt.claim.role = 'service_role';
      insert into public.role_groups (id, name)
      values
        ('${roleLifecycleGroupA}', 'Two-session role lifecycle A'),
        ('${roleLifecycleGroupB}', 'Two-session role lifecycle B');
      insert into auth.users (
        id, email, email_confirmed_at, raw_app_meta_data,
        raw_user_meta_data, created_at, updated_at
      ) values
        ('${roleLifecycleAdminId}', 'two-session-admin@example.invalid', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
        ('${roleLifecycleUserId}', '${roleLifecycleEmail}', now(), '{}'::jsonb, '{}'::jsonb, now(), now());
      update public.profiles
      set system_role = case
        when id = '${roleLifecycleAdminId}' then 'owner'
        else 'learner'
      end,
      status = 'active'
      where id in ('${roleLifecycleAdminId}', '${roleLifecycleUserId}');
      insert into public.user_role_groups (user_id, role_group_id)
      values ('${roleLifecycleUserId}', '${roleLifecycleGroupA}');
      select public.hugo_apply_access(
        '${roleLifecycleGrantOperationId}',
        '${roleLifecycleEmail}',
        'learner',
        '{"role_group_ids":["${roleLifecycleGroupA}"]}'::jsonb,
        'active', null, '${roleLifecycleUserId}'
      );
    `,
  );

  // Session A is a real Institute role/group RPC. Holding its transaction
  // after the write proves the lifecycle session must wait on the same lock.
  const roleEdit = runPsqlAsync(
    psqlPath,
    env,
    `
      begin;
      set local request.jwt.claim.role = 'authenticated';
      set local request.jwt.claim.sub = '${roleLifecycleAdminId}';
      select public.fn_set_user_role_and_groups(
        '${roleLifecycleUserId}',
        'admin',
        array['${roleLifecycleGroupB}']::uuid[]
      );
      select pg_sleep(2);
      commit;
    `,
  );
  await waitForAdvisoryLock(psqlPath, env, roleEdit, "Institute role edit");

  let lifecycleSettled = false;
  const lifecycle = runPsqlAsync(
    psqlPath,
    env,
    `
      begin;
      set local request.jwt.claim.role = 'service_role';
      select public.hugo_apply_access(
        '${roleLifecycleSuspendOperationId}',
        '${roleLifecycleEmail}',
        'learner',
        '{"role_group_ids":["${roleLifecycleGroupA}"]}'::jsonb,
        'suspended', null, '${roleLifecycleUserId}'
      );
      commit;
    `,
  ).finally(() => {
    lifecycleSettled = true;
  });

  await delay(250);
  if (lifecycleSettled) {
    await Promise.allSettled([roleEdit, lifecycle]);
    throw new Error(
      "Hugo lifecycle crossed an in-flight Institute role/group edit.",
    );
  }

  await roleEdit;
  await lifecycle;

  const observed = psqlScalar(
    psqlPath,
    env,
    `
      select concat_ws(
        ':',
        profile.system_role,
        profile.status,
        grant_row.desired_status,
        grant_row.role,
        (select count(*) from public.user_role_groups membership
         where membership.user_id = profile.id
           and membership.role_group_id = '${roleLifecycleGroupB}'),
        (grant_row.config->'role_group_ids')::text
      )
      from public.profiles profile
      join public.hugo_access_grants grant_row on grant_row.user_id = profile.id
      where profile.id = '${roleLifecycleUserId}';
    `,
  );
  if (observed !== `admin:suspended:suspended:admin:1:["${roleLifecycleGroupB}"]`) {
    throw new Error(
      `Two-session role/lifecycle serialization lost Institute state: ${observed}`,
    );
  }

  return "institute_role_edit_committed_before_hugo_suspension_snapshot";
}

async function verifyInsertSerialization(psqlPath, env) {
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

}

async function verifyEmailUpdateSerialization(psqlPath, env) {
  psqlExec(
    psqlPath,
    env,
    `
      insert into auth.users (
        id,
        email,
        last_sign_in_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
      ) values (
        '${updateUserId}',
        '${originalEmail}',
        now(),
        '{}'::jsonb,
        '{}'::jsonb,
        now(),
        now()
      );
    `,
  );

  const update = runPsqlAsync(
    psqlPath,
    env,
    `
      begin;
      update auth.users
      set email = '${updatedEmail}',
          updated_at = now()
      where id = '${updateUserId}';
      select pg_sleep(2);
      commit;
    `,
  );

  await waitForAdvisoryLock(psqlPath, env, update, "Auth email update");

  let lifecycleSettled = false;
  const lifecycle = runPsqlAsync(
    psqlPath,
    env,
    `
      begin;
      set local request.jwt.claim.role = 'service_role';
      select public.hugo_prepare_pristine_delete(
        '${updatePrepareOperationId}',
        '${updatedEmail}'
      );
      commit;
      begin;
      set local request.jwt.claim.role = 'service_role';
      select public.hugo_delete_identity(
        '${updateDeleteOperationId}',
        '${updatedEmail}'
      );
      commit;
    `,
  ).finally(() => {
    lifecycleSettled = true;
  });

  await delay(250);
  if (lifecycleSettled) {
    await Promise.allSettled([update, lifecycle]);
    throw new Error(
      "Lifecycle prepare/delete did not wait for the in-flight Auth email update.",
    );
  }

  await update;
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
        '${updatePrepareOperationId}',
        '${updateDeleteOperationId}'
      );
    `,
  );
  if (
    observed !==
      "preparePristineDelete:missing:false:identity_not_pristine|deleteIdentity:missing:false:identity_not_pristine"
  ) {
    throw new Error(
      `Lifecycle calls did not observe durable evidence at the updated Auth email: ${observed}`,
    );
  }

  const retainedIdentity = psqlScalar(
    psqlPath,
    env,
    `
      select auth_user.email || '|' || profile.email
      from auth.users auth_user
      join public.profiles profile on profile.id = auth_user.id
      where auth_user.id = '${updateUserId}';
    `,
  );
  if (retainedIdentity !== `${updatedEmail}|${originalEmail}`) {
    throw new Error(
      `Durable email-update fixture did not remain fail-closed: ${retainedIdentity}`,
    );
  }

  psqlExec(
    psqlPath,
    env,
    `
      delete from auth.users
      where id = '${updateUserId}';
    `,
  );

  const cleanupCount = psqlScalar(
    psqlPath,
    env,
    `
      select (
        (select count(*) from auth.users where id = '${updateUserId}') +
        (select count(*) from public.profiles where id = '${updateUserId}')
      )::text;
    `,
  );
  if (cleanupCount !== "0") {
    throw new Error(
      `Email-update concurrency fixture cleanup left identity rows behind: ${cleanupCount}`,
    );
  }
}

async function waitForAdvisoryLock(
  psqlPath,
  env,
  concurrentSession,
  label = "Auth insert",
) {
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
      concurrentSession.then(() => true),
      delay(25).then(() => false),
    ]);
    if (completed) {
      throw new Error(
        `${label} completed before its advisory lock was observed.`,
      );
    }
  }
  throw new Error(`Timed out waiting for the ${label} advisory lock.`);
}

async function waitForTableLock(
  psqlPath,
  env,
  concurrentSession,
  relation,
  mode,
) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const lockPresent = psqlScalar(
      psqlPath,
      env,
      `
        select exists (
          select 1
          from pg_catalog.pg_locks held_lock
          where held_lock.locktype = 'relation'
            and held_lock.relation = '${relation}'::regclass
            and held_lock.mode = '${mode}'
            and held_lock.granted
            and held_lock.pid <> pg_backend_pid()
        )::text;
      `,
    );
    if (lockPresent === "true" || lockPresent === "t") return;

    const completed = await Promise.race([
      concurrentSession.then(() => true),
      delay(25).then(() => false),
    ]);
    if (completed) {
      throw new Error(
        `${relation} concurrency session completed before ${mode} was observed.`,
      );
    }
  }
  throw new Error(
    `Timed out waiting for ${mode} on ${relation}.`,
  );
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

function psqlExec(psqlPath, env, sql) {
  execFileSync(
    psqlPath,
    ["-X", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { env, stdio: ["ignore", "ignore", "pipe"] },
  );
}

function delay(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
