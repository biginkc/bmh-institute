-- Forward-only authored content boundary. Existing rows are not repaired here;
-- the renderer treats legacy invalid values as inert and these NOT VALID checks
-- protect all newly written rows without making this migration a data repair.

create or replace function public.bmh_authored_content_is_safe(p_block_type text, p_content jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  v_url text;
  v_source text;
  v_card jsonb;
begin
  if p_content is null or jsonb_typeof(p_content) <> 'object' then return false; end if;
  if octet_length(p_content::text) > 102400 then return false; end if;

  for v_url in select value from jsonb_each_text(p_content)
    where key in ('signed_url', 'poster_signed_url', 'caption_signed_url', 'transcript_signed_url')
  loop return false; end loop;

  for v_url in select value from jsonb_each_text(p_content)
    where key in ('file_path', 'poster_path', 'caption_path', 'transcript_path')
  loop
    if v_url ~* '^https?://' or v_url like '/%' or v_url ~ '(^|/)\.\.?(/|$)' then return false; end if;
  end loop;

  if p_block_type = 'external_link' and p_content ? 'url' and
     (p_content->>'url' !~ '^https://[^/@?#]+([/?#]|$)') then return false; end if;
  if p_block_type = 'audio' and coalesce(p_content->>'url', '') <> '' and
     (p_content->>'url' !~ '^https://[^/@?#]+([/?#]|$)') then return false; end if;
  if p_block_type = 'embed' and coalesce(p_content->>'iframe_src', '') <> '' and
     (p_content->>'iframe_src' !~ '^https://(www\.)?(loom\.com|youtube\.com|youtube-nocookie\.com|youtu\.be|vimeo\.com)([/#?]|$)' and
      p_content->>'iframe_src' !~ '^https://player\.vimeo\.com([/#?]|$)' and
      p_content->>'iframe_src' !~ '^https://fast\.wistia\.net([/#?]|$)') then return false; end if;
  if p_block_type = 'role_play' and coalesce(p_content->>'iframe_src', '') <> '' and
     p_content->>'iframe_src' !~ '^https://[^/@?#]+([/?#]|$)' then return false; end if;

  if p_block_type = 'video' and coalesce(p_content->>'url', '') <> '' then
    v_url := p_content->>'url';
    v_source := p_content->>'source';
    if v_source = 'youtube' and v_url !~ '^https://(www\.)?(youtube\.com|youtu\.be)([/#?]|$)' then return false; end if;
    if v_source = 'vimeo' and v_url !~ '^https://(www\.)?vimeo\.com([/#?]|$)' then return false; end if;
    if v_source = 'loom' and v_url !~ '^https://(www\.)?loom\.com([/#?]|$)' then return false; end if;
    if v_source not in ('youtube', 'vimeo', 'loom') and v_url !~ '^https://[^/@?#]+([/?#]|$)' then return false; end if;
  end if;

  if p_block_type = 'flashcard' then
    if jsonb_typeof(p_content->'cards') <> 'array' or jsonb_array_length(p_content->'cards') < 1 or jsonb_array_length(p_content->'cards') > 100 then return false; end if;
    for v_card in select value from jsonb_array_elements(p_content->'cards') loop
      if jsonb_typeof(v_card) <> 'object' or coalesce(length(v_card->>'front'), 0) = 0 or coalesce(length(v_card->>'back'), 0) = 0 or length(v_card->>'front') > 2000 or length(v_card->>'back') > 2000 then return false; end if;
    end loop;
  end if;
  return true;
end;
$$;

alter table public.content_blocks
  add constraint content_blocks_authored_content_security_check
  check (public.bmh_authored_content_is_safe(block_type, content)) not valid;

create or replace function public.bmh_validate_authored_content_trigger()
returns trigger
language plpgsql
as $$
begin
  if not public.bmh_authored_content_is_safe(new.block_type, new.content) then
    raise exception 'content_blocks authored content failed security validation';
  end if;
  return new;
end;
$$;

drop trigger if exists content_blocks_validate_authored_content on public.content_blocks;
create trigger content_blocks_validate_authored_content
before insert or update of block_type, content on public.content_blocks
for each row execute function public.bmh_validate_authored_content_trigger();
