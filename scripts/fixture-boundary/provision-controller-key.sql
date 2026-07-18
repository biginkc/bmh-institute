\set ON_ERROR_STOP on
\getenv cleanup_project_ref FIXTURE_CLEANUP_PROJECT_REF
\getenv cleanup_key_id FIXTURE_CLEANUP_CONTROLLER_KEY_ID
\getenv cleanup_hmac_secret FIXTURE_CLEANUP_CONTROLLER_HMAC_SECRET

select :'cleanup_project_ref' = 'dhvfsyteqsxagokoerrx' as project_ref_ok \gset
\if :project_ref_ok
\else
  do $$ begin
    raise exception 'Refusing controller key provisioning for a non-production project ref.'
      using errcode = '42501';
  end $$;
\endif

-- Validate all secret-bearing values before an INSERT can produce PostgreSQL's
-- constraint DETAIL (which includes the complete rejected row).
select :'cleanup_key_id' ~ '^[a-z0-9][a-z0-9._-]{0,63}$' as key_id_ok \gset
\if :key_id_ok
\else
  \unset cleanup_hmac_secret
  do $$ begin
    raise exception 'Controller key provisioning received invalid key material.'
      using errcode = '22023';
  end $$;
\endif

select length(:'cleanup_hmac_secret') between 32 and 512 as hmac_secret_ok \gset
\if :hmac_secret_ok
\else
  \unset cleanup_hmac_secret
  do $$ begin
    raise exception 'Controller key provisioning received invalid key material.'
      using errcode = '22023';
  end $$;
\endif

select pg_get_userbyid(class.relowner) = current_user as owner_ok
from pg_class class
where class.oid = 'private.fixture_cleanup_controller_keys_v1'::regclass
\gset
\if :owner_ok
\else
  do $$ begin
    raise exception 'Controller key provisioning requires the database owner.'
      using errcode = '42501';
  end $$;
\endif

begin;
select pg_advisory_xact_lock(
  hashtextextended('bmh-institute-fixture-cleanup-controller-key-v1', 0)
);
select not exists (
  select 1
  from private.fixture_cleanup_controller_keys_v1
  where is_active and retired_at is null
) as no_active_key \gset
\if :no_active_key
\else
  rollback;
  \unset cleanup_hmac_secret
  do $$ begin
    raise exception 'Controller key provisioning refused because an active key already exists.'
      using errcode = '55000';
  end $$;
\endif
insert into private.fixture_cleanup_controller_keys_v1 (
  key_id,
  hmac_secret,
  activated_at,
  is_active
) values (
  :'cleanup_key_id',
  :'cleanup_hmac_secret',
  clock_timestamp(),
  true
);
commit;
\unset cleanup_hmac_secret
\echo 'Provisioned one active fixture cleanup controller key.'
