-- The canonicalizer parses timestamps. PostgreSQL classifies that conversion
-- as STABLE because session settings can affect timestamp parsing. Migration
-- 021 declared it IMMUTABLE, which made the linked database lint fail.
alter function private.fixture_cleanup_canonical_jsonb_v1(jsonb) stable;
