-- Imported catalog publication is a release operation, not a generic admin edit.
-- Keep the real course unpublished and QA-only until every recorded gate has
-- passed, then publish and attach the employee role group in one transaction.

create table public.content_import_release_records (
  import_id text primary key check (import_id ~ '^[a-z0-9][a-z0-9._-]{0,127}$'),
  program_id uuid not null unique,
  qa_role_group_id uuid not null,
  employee_role_group_id uuid not null,
  manifest_sha256 text not null check (manifest_sha256 ~ '^[a-f0-9]{64}$'),
  reconciliation_sha256 text not null check (reconciliation_sha256 ~ '^[a-f0-9]{64}$'),
  catalog_sha256 text not null check (catalog_sha256 ~ '^[a-f0-9]{64}$'),
  rollback_rehearsal_sha256 text not null check (rollback_rehearsal_sha256 ~ '^[a-f0-9]{64}$'),
  chrome_desktop_sha256 text not null check (chrome_desktop_sha256 ~ '^[a-f0-9]{64}$'),
  chrome_mobile_sha256 text not null check (chrome_mobile_sha256 ~ '^[a-f0-9]{64}$'),
  admin_happy_path_sha256 text not null check (admin_happy_path_sha256 ~ '^[a-f0-9]{64}$'),
  approval_sha256 text not null check (approval_sha256 ~ '^[a-f0-9]{64}$'),
  approved_by text not null check (approved_by = 'Jarrad Henry'),
  evidence jsonb not null,
  released_at timestamptz not null default now(),
  released_by uuid
);

comment on table public.content_import_release_records is
  'Immutable evidence and checksum record for the one atomic imported-catalog release.';

alter table public.content_import_release_records enable row level security;
revoke all on table public.content_import_release_records from public, anon, authenticated;

create or replace function public.fn_guard_content_import_release_record()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'Content import release records are immutable.' using errcode = '42501';
  end if;
  if coalesce(auth.role(), '') <> 'service_role'
     or coalesce(current_setting('bmh.release_import_id', true), '') <> new.import_id then
    raise exception 'Content import release records may only be created by the evidence-bound release operation.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.fn_guard_content_import_release_record() from public, anon, authenticated;

create trigger content_import_release_records_guard
before insert or update or delete on public.content_import_release_records
for each row execute function public.fn_guard_content_import_release_record();

create or replace function public.fn_guard_imported_catalog_publication()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_import_id text;
begin
  if tg_op = 'INSERT' then
    if new.content_import_id is not null and new.is_published then
      raise exception 'Imported catalog release requires the evidence-bound release operation.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  v_import_id := old.content_import_id;
  if v_import_id is not null and not old.is_published and new.is_published then
    if coalesce(auth.role(), '') <> 'service_role'
       or coalesce(current_setting('bmh.release_import_id', true), '') <> v_import_id
       or not exists (
         select 1
         from public.content_import_release_records release
         where release.import_id = v_import_id
       ) then
      raise exception 'Imported catalog release requires the evidence-bound release operation.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.fn_guard_imported_catalog_publication() from public, anon, authenticated;

create trigger programs_guard_imported_publication
before insert or update of is_published on public.programs
for each row execute function public.fn_guard_imported_catalog_publication();

create trigger courses_guard_imported_publication
before insert or update of is_published on public.courses
for each row execute function public.fn_guard_imported_catalog_publication();

create or replace function public.fn_guard_unreleased_import_access()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_program_id uuid := case when tg_op = 'DELETE' then old.program_id else new.program_id end;
  v_import_id text;
  v_published boolean;
begin
  select program.content_import_id, program.is_published
    into v_import_id, v_published
  from public.programs program
  where program.id = v_program_id;

  if v_import_id is null or v_published then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Unreleased imported catalog QA access may only be changed by the import service.'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE'
     and new.program_id is not distinct from old.program_id
     and new.role_group_id is not distinct from old.role_group_id then
    return new;
  end if;

  if coalesce(auth.role(), '') = 'service_role'
     and coalesce(current_setting('bmh.release_import_id', true), '') = v_import_id
     and exists (
       select 1
       from public.content_import_release_records release
       where release.import_id = v_import_id
         and release.employee_role_group_id = new.role_group_id
     ) then
    return new;
  end if;

  -- The atomic importer creates exactly one access row. That first row is the
  -- QA group; every additional role group remains denied until release.
  if tg_op = 'INSERT' and not exists (
    select 1
    from public.program_access access
    where access.program_id = v_program_id
  ) then
    return new;
  end if;

  raise exception 'Unreleased imported catalog access is limited to its QA role group.'
    using errcode = '42501';
end;
$$;

revoke all on function public.fn_guard_unreleased_import_access() from public, anon, authenticated;

create trigger program_access_guard_unreleased_import
before insert or update of program_id, role_group_id or delete on public.program_access
for each row execute function public.fn_guard_unreleased_import_access();

create or replace function public.fn_course_import_catalog_sha256(p_import_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with
    owned_programs as (
      select * from public.programs where content_import_id = p_import_id
    ),
    owned_courses as (
      select * from public.courses where content_import_id = p_import_id
    ),
    owned_modules as (
      select module.* from public.modules module
      where module.course_id in (select id from owned_courses)
    ),
    owned_lessons as (
      select * from public.lessons where content_import_id = p_import_id
    ),
    owned_quizzes as (
      select quiz.* from public.quizzes quiz
      where quiz.id in (select quiz_id from owned_lessons where quiz_id is not null)
    ),
    owned_assignments as (
      select assignment.* from public.assignments assignment
      where assignment.id in (select assignment_id from owned_lessons where assignment_id is not null)
    ),
    owned_questions as (
      select question.* from public.questions question
      where question.quiz_id in (select id from owned_quizzes)
    ),
    catalog as (
      select jsonb_build_object(
        'programs', coalesce((select jsonb_agg(to_jsonb(row) - 'created_at' - 'updated_at' order by row.id) from owned_programs row), '[]'::jsonb),
        'courses', coalesce((select jsonb_agg(to_jsonb(row) - 'created_at' - 'updated_at' order by row.id) from owned_courses row), '[]'::jsonb),
        'program_courses', coalesce((select jsonb_agg(to_jsonb(row) order by row.id) from public.program_courses row where row.program_id in (select id from owned_programs)), '[]'::jsonb),
        'program_access', coalesce((select jsonb_agg(to_jsonb(row) order by row.id) from public.program_access row where row.program_id in (select id from owned_programs)), '[]'::jsonb),
        'role_groups', coalesce((select jsonb_agg(to_jsonb(row) - 'created_at' - 'updated_at' order by row.id) from public.role_groups row where row.id in (select role_group_id from public.program_access where program_id in (select id from owned_programs))), '[]'::jsonb),
        'modules', coalesce((select jsonb_agg(to_jsonb(row) - 'created_at' - 'updated_at' order by row.id) from owned_modules row), '[]'::jsonb),
        'lessons', coalesce((select jsonb_agg(to_jsonb(row) - 'created_at' - 'updated_at' order by row.id) from owned_lessons row), '[]'::jsonb),
        'content_blocks', coalesce((select jsonb_agg(to_jsonb(row) - 'created_at' - 'updated_at' order by row.id) from public.content_blocks row where row.lesson_id in (select id from owned_lessons)), '[]'::jsonb),
        'quizzes', coalesce((select jsonb_agg(to_jsonb(row) - 'created_at' - 'updated_at' order by row.id) from owned_quizzes row), '[]'::jsonb),
        'questions', coalesce((select jsonb_agg(to_jsonb(row) - 'created_at' - 'updated_at' order by row.id) from owned_questions row), '[]'::jsonb),
        'answer_options', coalesce((select jsonb_agg(to_jsonb(row) - 'created_at' order by row.id) from public.answer_options row where row.question_id in (select id from owned_questions)), '[]'::jsonb),
        'assignments', coalesce((select jsonb_agg(to_jsonb(row) - 'created_at' - 'updated_at' order by row.id) from owned_assignments row), '[]'::jsonb)
      ) as value
    )
  select encode(sha256(convert_to(catalog.value::text, 'UTF8')), 'hex') from catalog;
$$;

revoke all on function public.fn_course_import_catalog_sha256(text) from public, anon, authenticated;
grant execute on function public.fn_course_import_catalog_sha256(text) to service_role;

create or replace function public.fn_release_course_import_v1(
  p_import_id text,
  p_program_id uuid,
  p_employee_role_group_id uuid,
  p_evidence jsonb,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_catalog_sha256 text;
  v_qa_role_group_id uuid;
  v_manifest_at timestamptz;
  v_reconciliation_at timestamptz;
  v_rollback_at timestamptz;
  v_desktop_at timestamptz;
  v_mobile_at timestamptz;
  v_admin_at timestamptz;
  v_approval_at timestamptz;
  v_existing public.content_import_release_records%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Course import release requires the service role.' using errcode = '42501';
  end if;
  if p_import_id is null or p_import_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$' then
    raise exception 'Course import release refused: invalid import_id.' using errcode = '22023';
  end if;
  if p_confirmation is distinct from 'RELEASE-BMH-INSTITUTE:' || p_import_id || ':' || coalesce(p_evidence -> 'manifest' ->> 'sha256', '') then
    raise exception 'Course import release refused: confirmation does not bind the import and manifest checksum.' using errcode = '22023';
  end if;

  if p_evidence is null or jsonb_typeof(p_evidence) <> 'object'
     or (select count(*) from jsonb_object_keys(p_evidence)) <> 7
     or not (p_evidence ?& array['manifest','reconciliation','rollback_rehearsal','chrome_desktop','chrome_mobile','admin_happy_path','jarrad_approval']) then
    raise exception 'Course import release refused: evidence must contain exactly the seven required gates.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from (values
      ('manifest', array['sha256','recorded_at','status']::text[]),
      ('reconciliation', array['sha256','catalog_sha256','recorded_at','status','exact']::text[]),
      ('rollback_rehearsal', array['sha256','recorded_at','status']::text[]),
      ('chrome_desktop', array['sha256','recorded_at','status']::text[]),
      ('chrome_mobile', array['sha256','recorded_at','status']::text[]),
      ('admin_happy_path', array['sha256','recorded_at','status']::text[]),
      ('jarrad_approval', array['sha256','approved_at','status','approved_by']::text[])
    ) required(name, keys)
    where jsonb_typeof(p_evidence -> required.name) <> 'object'
       or (select count(*) from jsonb_object_keys(p_evidence -> required.name)) <> cardinality(required.keys)
       or not ((p_evidence -> required.name) ?& required.keys)
  ) then
    raise exception 'Course import release refused: an evidence gate has an invalid shape.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from (values
      (p_evidence -> 'manifest' ->> 'sha256'),
      (p_evidence -> 'reconciliation' ->> 'sha256'),
      (p_evidence -> 'reconciliation' ->> 'catalog_sha256'),
      (p_evidence -> 'rollback_rehearsal' ->> 'sha256'),
      (p_evidence -> 'chrome_desktop' ->> 'sha256'),
      (p_evidence -> 'chrome_mobile' ->> 'sha256'),
      (p_evidence -> 'admin_happy_path' ->> 'sha256'),
      (p_evidence -> 'jarrad_approval' ->> 'sha256')
    ) digest(value)
    where digest.value is null or digest.value !~ '^[a-f0-9]{64}$'
  ) then
    raise exception 'Course import release refused: every evidence checksum must be lowercase SHA-256.' using errcode = '22023';
  end if;

  if p_evidence -> 'manifest' ->> 'status' <> 'finalized'
     or p_evidence -> 'reconciliation' ->> 'status' <> 'passed'
     or p_evidence -> 'reconciliation' -> 'exact' is distinct from 'true'::jsonb
     or p_evidence -> 'rollback_rehearsal' ->> 'status' <> 'passed'
     or p_evidence -> 'chrome_desktop' ->> 'status' <> 'passed'
     or p_evidence -> 'chrome_mobile' ->> 'status' <> 'passed'
     or p_evidence -> 'admin_happy_path' ->> 'status' <> 'passed'
     or p_evidence -> 'jarrad_approval' ->> 'status' <> 'approved'
     or p_evidence -> 'jarrad_approval' ->> 'approved_by' <> 'Jarrad Henry' then
    raise exception 'Course import release refused: every required gate must explicitly pass.' using errcode = '22023';
  end if;

  begin
    v_manifest_at := (p_evidence -> 'manifest' ->> 'recorded_at')::timestamptz;
    v_reconciliation_at := (p_evidence -> 'reconciliation' ->> 'recorded_at')::timestamptz;
    v_rollback_at := (p_evidence -> 'rollback_rehearsal' ->> 'recorded_at')::timestamptz;
    v_desktop_at := (p_evidence -> 'chrome_desktop' ->> 'recorded_at')::timestamptz;
    v_mobile_at := (p_evidence -> 'chrome_mobile' ->> 'recorded_at')::timestamptz;
    v_admin_at := (p_evidence -> 'admin_happy_path' ->> 'recorded_at')::timestamptz;
    v_approval_at := (p_evidence -> 'jarrad_approval' ->> 'approved_at')::timestamptz;
  exception when others then
    raise exception 'Course import release refused: evidence timestamps are invalid.' using errcode = '22023';
  end;

  if greatest(v_manifest_at, v_reconciliation_at, v_rollback_at, v_desktop_at, v_mobile_at, v_admin_at, v_approval_at) > now()
     or v_reconciliation_at < now() - interval '1 hour'
     or least(v_rollback_at, v_desktop_at, v_mobile_at, v_admin_at, v_approval_at) < now() - interval '24 hours'
     or v_approval_at < greatest(v_manifest_at, v_reconciliation_at, v_rollback_at, v_desktop_at, v_mobile_at, v_admin_at) then
    raise exception 'Course import release refused: acceptance evidence is stale, future-dated, or approved before its gates.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('course-import-release:' || p_import_id, 0));
  lock table public.programs, public.courses, public.program_courses, public.program_access,
    public.role_groups, public.content_import_release_records in share row exclusive mode;

  select * into v_existing
  from public.content_import_release_records release
  where release.import_id = p_import_id;
  if found then
    if v_existing.program_id = p_program_id
       and v_existing.employee_role_group_id = p_employee_role_group_id
       and v_existing.evidence = p_evidence
       and exists (select 1 from public.programs where id = p_program_id and is_published)
       and not exists (
         select 1 from public.program_courses pc join public.courses course on course.id = pc.course_id
         where pc.program_id = p_program_id and not course.is_published
       )
       and exists (
         select 1 from public.program_access
         where program_id = p_program_id and role_group_id = p_employee_role_group_id
       ) then
      return jsonb_build_object('status', 'already_released', 'import_id', p_import_id, 'program_id', p_program_id);
    end if;
    raise exception 'Course import release refused: an immutable release record already exists with different state.' using errcode = '22023';
  end if;

  if (select count(*) from public.programs where content_import_id = p_import_id) <> 1
     or not exists (
       select 1 from public.programs
       where id = p_program_id and content_import_id = p_import_id and not is_published and certificate_enabled
     ) then
    raise exception 'Course import release refused: expected one unpublished certificate-enabled imported program.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.role_groups where id = p_employee_role_group_id) then
    raise exception 'Course import release refused: employee role group does not exist.' using errcode = '22023';
  end if;
  if (select count(*) from public.program_access where program_id = p_program_id) <> 1 then
    raise exception 'Course import release refused: unreleased imported content must have exactly one QA access group.' using errcode = '22023';
  end if;
  select role_group_id into v_qa_role_group_id
  from public.program_access where program_id = p_program_id;
  if v_qa_role_group_id = p_employee_role_group_id then
    raise exception 'Course import release refused: employee and QA role groups must be distinct.' using errcode = '22023';
  end if;

  if not exists (select 1 from public.courses where content_import_id = p_import_id)
     or exists (
       select 1 from public.courses course
       where course.content_import_id = p_import_id
         and (course.is_published or course.certificate_enabled)
     )
     or exists (
       select 1 from public.courses course
       where course.content_import_id = p_import_id
         and (select count(*) from public.program_courses pc where pc.program_id = p_program_id and pc.course_id = course.id) <> 1
     )
     or exists (
       select 1 from public.program_courses pc join public.courses course on course.id = pc.course_id
       where pc.program_id = p_program_id and course.content_import_id is distinct from p_import_id
     ) then
    raise exception 'Course import release refused: imported courses must be unpublished, course certificates disabled, and attached only to the imported program.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.lessons where content_import_id = p_import_id)
     or exists (
       select 1 from public.lessons lesson join public.modules module on module.id = lesson.module_id
       join public.courses course on course.id = module.course_id
       where course.content_import_id = p_import_id and lesson.content_import_id is distinct from p_import_id
     )
     or exists (
       select 1 from public.lessons lesson join public.modules module on module.id = lesson.module_id
       join public.courses course on course.id = module.course_id
       where lesson.content_import_id = p_import_id and course.content_import_id is distinct from p_import_id
     ) then
    raise exception 'Course import release refused: lesson provenance does not exactly match the imported course graph.' using errcode = '22023';
  end if;

  v_catalog_sha256 := public.fn_course_import_catalog_sha256(p_import_id);
  if p_evidence -> 'reconciliation' ->> 'catalog_sha256' <> v_catalog_sha256 then
    raise exception 'Course import release refused: current database catalog no longer matches the reconciled checksum.' using errcode = '22023';
  end if;

  perform set_config('bmh.release_import_id', p_import_id, true);
  insert into public.content_import_release_records (
    import_id, program_id, qa_role_group_id, employee_role_group_id,
    manifest_sha256, reconciliation_sha256, catalog_sha256,
    rollback_rehearsal_sha256, chrome_desktop_sha256, chrome_mobile_sha256,
    admin_happy_path_sha256, approval_sha256, approved_by, evidence, released_by
  ) values (
    p_import_id, p_program_id, v_qa_role_group_id, p_employee_role_group_id,
    p_evidence -> 'manifest' ->> 'sha256', p_evidence -> 'reconciliation' ->> 'sha256',
    v_catalog_sha256, p_evidence -> 'rollback_rehearsal' ->> 'sha256',
    p_evidence -> 'chrome_desktop' ->> 'sha256', p_evidence -> 'chrome_mobile' ->> 'sha256',
    p_evidence -> 'admin_happy_path' ->> 'sha256', p_evidence -> 'jarrad_approval' ->> 'sha256',
    'Jarrad Henry', p_evidence, auth.uid()
  );

  update public.courses
  set is_published = true, certificate_enabled = false
  where content_import_id = p_import_id;
  update public.programs
  set is_published = true, certificate_enabled = true
  where id = p_program_id;
  insert into public.program_access (program_id, role_group_id)
  values (p_program_id, p_employee_role_group_id);

  return jsonb_build_object(
    'status', 'released',
    'import_id', p_import_id,
    'program_id', p_program_id,
    'catalog_sha256', v_catalog_sha256
  );
end;
$$;

revoke all on function public.fn_release_course_import_v1(text, uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.fn_release_course_import_v1(text, uuid, uuid, jsonb, text) to service_role;
