# Phase 2: Content Safety and Rate Limiting - Context

**Gathered:** 2026-05-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Close the two content-safety and rate-limiting gaps surfaced by `.planning/codebase/CONCERNS.md`:
HARDEN-05 (sanitize admin-authored HTML in text blocks and certificate templates via `sanitize-html` on write,
plus a `sandbox` attribute on the embed-block iframe) and HARDEN-06 (server-side rate limiting on
forgot-password and set-password keyed by IP and email). No new user-facing features. Every change ships
with TDD coverage, with the up-front test inventory reviewed by Jarrad before any tests or code are written.

</domain>

<decisions>
## Implementation Decisions

### HARDEN-05 sanitization policy
- **D-A1:** Two separate `sanitize-html` allow-lists.
  - Text blocks (high-traffic admin authoring, lives inside a Tailwind `prose` wrapper): strict prose only — `p, br, strong, em, u, ul, ol, li, h2, h3, h4, blockquote, a, code, pre`. `<a>` is restricted to `href` only; schemes limited to `http`, `https`, `mailto`; renderer keeps applying `rel="noopener noreferrer"` for external links. No `style`, no `class`, no `img`.
  - Certificate templates (rare authoring, the existing 005 seed depends on inline `style`): prose tags above plus `div, span, img`, with a CSS-property allowlist on `style` (`font-size, color, margin, margin-top, padding, text-align, font-family, font-weight`). `<img>` is allowed but `src` is restricted to `https` schemes only.
- **D-A2:** Sanitize on write, not on render. Admin server actions for text-block save and certificate-template save run the input through `sanitize-html` before insert/update. Renderer keeps its existing `dangerouslySetInnerHTML` and trusts the stored content. A backfill migration (next free slot is `011_*`) runs the same sanitizer over every existing `content_blocks.content.html` and `certificate_templates.body_html` row, in-place. Future sanitizer-rule tightening is handled by another targeted backfill, not by re-sanitizing on every render.
- **D-A3 [informational]:** `renderCertificateHtml` in `src/lib/certificates/render.ts` keeps its merge-field escaping. Sanitization runs against the pre-merge `body_html` template; merge values are still HTML-escaped at render time. Belt-and-suspenders here is essentially free because the two layers protect different surfaces (template vs values).

### HARDEN-05 embed-block iframe
- **D-B1:** `EmbedBlock` in `src/components/content-blocks.tsx` (lines 98–104, with the renderer body around lines 388–401) gains `sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"`. This is the CONCERNS.md-recommended set — permits Loom / Notion / Google Docs and other legitimate scripted embeds while blocking top-level navigation and (by default) popups.
- **D-B2:** The video-block iframe (YouTube / Vimeo / Loom inside `VideoBlock`, lines 388–401) is **not** sandboxed in this phase. HARDEN-05 names embed-block iframes specifically; the video iframe's `src` is rewritten by `toEmbedSrc()` against a fixed origin allowlist (`youtube-nocookie.com`, `player.vimeo.com`, `loom.com/embed`) so admin input cannot reach an arbitrary host. Backlog a video-sandbox audit if a future threat-model review calls for it.
- **D-B3:** No host allowlist on `iframe_src`. Server-side validation rejects anything that does not begin with `https://` (and trims whitespace). Block-editor copy in `blocks-editor.tsx` labels the embed `iframe_src` field as admin-trusted so authors understand the boundary. The sandbox attribute plus admin-only authoring is the defense; a host allowlist would force a code change every time the team adopts a new embed source.

### HARDEN-06 rate-limit storage
- **D-C1:** Counters live in a new Supabase Postgres table `auth_rate_limits` keyed by `(key_type, key_value, window_start)` with a `count` column and an `expires_at` column for TTL. `key_type` is an enum of `ip` or `email`. The migration creates the table, the index `(key_type, key_value, expires_at)`, and a periodic prune (server-action call after every check OR a scheduled cleanup; planner picks). Durable, multi-region consistent, no new vendor, no extra env vars.
- **D-C2:** Access pattern is Claude's discretion — either a `SECURITY DEFINER` function `fn_check_and_consume_rate_limit(key_type, key_value, threshold, window_seconds)` called via `supabase.rpc()` (atomic, encapsulated, easy to test against the live DB) or a service-role client doing UPSERT + read. Planner chooses based on the test-inventory shape; either way the action surface returns `{allowed: boolean, retry_after_seconds: number}`.

### HARDEN-06 thresholds and breach response
- **D-D1:** Two independent gates per request. Per-IP: 5 requests / 15 min. Per-email: 3 requests / 60 min. Both must pass. The IP key is the first entry of `x-forwarded-for` (Vercel-set), falling back to `x-real-ip`; planner handles the parsing. The email key is the lowercased-trimmed submitted email.
- **D-D2:** Breach response is hybrid:
  - **forgot-password breach:** return the existing success shape `{ok: true}` without calling `supabase.auth.resetPasswordForEmail`. Preserves the enumeration-resistance posture documented in the existing in-code comment and HARDEN-06 acceptance.
  - **set-password breach:** return `{ok: false, error: "Too many attempts. Try again in N minutes."}` where `N` is computed from `retry_after_seconds`. The user is already authenticated through the recovery session so enumeration is not a risk — clear UX wins.
- **D-D3 [informational]:** Both rate-limit gates fire **before** any Supabase auth call. A counter increment happens inside the gate; if the gate denies, no Supabase call runs, which preserves Supabase's own (project-level, non-configurable) rate limit budget for legitimate traffic.

### Plan granularity
- **D-E1 [informational]:** Phase 2 ships as **three** parallel plans, file-disjoint so they run in waves per the milestone-init "coarse granularity, parallel execution, YOLO" decision (carried from Phase 1, D-11):
  - `02-1 sanitize-html-policy` — install `sanitize-html`, define the two allow-lists in `src/lib/sanitize/`, wire into the text-block + certificate-template admin actions, ship the backfill migration. TDD inventory covers `<script>`-strip on save, link-scheme rejection, certificate `style` allow-list, backfill idempotency.
  - `02-2 embed-iframe-sandbox` — set `sandbox` on `EmbedBlock`, enforce `https://` on `iframe_src` in the embed admin action, add the admin-trusted label in the block editor. TDD inventory covers sandbox attribute presence, scheme rejection, save-then-render on a known embed (Loom).
  - `02-3 password-reset-rate-limit` — migration for `auth_rate_limits` (table + index + RPC if chosen), helper in `src/lib/rate-limit/`, integration into `forgot-password/actions.ts` and `auth/set-password/actions.ts`. TDD inventory covers per-IP threshold, per-email threshold, silent forgot-password breach, explicit set-password breach, gate-fires-before-Supabase-call, IP extraction from `x-forwarded-for`.

### Claude's Discretion
- Exact `sanitize-html` config object structure (per-tag attribute lists, scheme filters, `transformTags` for `<a>` rel) — planner chooses, anchored to D-A1.
- Whether the rate-limit access pattern is RPC or service-role UPSERT (per D-C2). Either is acceptable as long as the gate is atomic and the test suite proves "second submission within threshold is rejected."
- Cleanup strategy for `auth_rate_limits` — periodic prune via a small RPC called opportunistically, or a scheduled `pg_cron`-style approach. Planner picks based on Supabase project capabilities.
- Exact wording of the set-password breach error and the "N minutes" formatting.
- Migration filename numbering. Next free slot is `011_*` (current head is `010_prevent_last_owner_deletion.sql`); planner allocates per plan.

</decisions>

<specifics>
## Specific Ideas

- `sanitize-html` is locked by REQUIREMENTS.md as the sanitizer library. No alternate (DOMPurify, isomorphic-dompurify) — keeps the dependency surface predictable and matches the requirement wording.
- The text-block admin save lives in `src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.ts` — that's the natural sanitization point. The blocks-editor client form posts to that action.
- Certificate-template save lives in the certificate-template admin surface (per migration `001_initial_schema.sql:45` table + `003_rls_policies.sql:64-65` admin-only policy). Planner traces the actual action file.
- The backfill migration must be idempotent — running it twice should not re-corrupt sanitized content. Test inventory covers this.
- The 005 seed templates use inline `style` heavily (`text-align`, `padding`, `font-size`, `color`, `font-family`, `margin`, `margin-top`). The certificate allow-list (D-A1) must accept all of those CSS properties or the seed templates fail re-sanitization in the backfill.
- Existing forgot-password code at `src/app/(auth)/forgot-password/actions.ts` already has the comment "Intentionally treat user not found the same as success to avoid exposing which emails have accounts." D-D2 (silent breach) extends that posture rather than contradicting it.
- HARDEN-06's "test asserts the second submission within the threshold is rejected" is satisfied with a unit + integration combination — unit covers the gate logic against a fake counter; integration covers the live DB roundtrip.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project rules
- `AGENTS.md` — TDD with up-front test inventory, writing style, stack constraints, Hobby-plan limits
- `.planning/PROJECT.md` — locked decisions (TDD inventory mandatory, YOLO + coarse granularity, voice work belongs in Sandra Practice)
- `.planning/REQUIREMENTS.md` — HARDEN-05 and HARDEN-06 acceptance criteria. HARDEN-05 names `sanitize-html` and "on write" explicitly; HARDEN-06 names "per IP plus per-email window" explicitly.

### Codebase diagnosis (the reason this phase exists)
- `.planning/codebase/CONCERNS.md` §"Embed block has no URL allowlist or sandbox attribute" (lines 36–40), §"`dangerouslySetInnerHTML` for admin-authored `body_html` in certificate templates" (lines 42–46), §"`dangerouslySetInnerHTML` for admin-authored text blocks" (lines 48–52), §"No rate limiting on password reset and forgot-password actions" (lines 54–57). Read each before planning the matching plan.
- `.planning/codebase/ARCHITECTURE.md` — server-action layering, three Supabase clients
- `.planning/codebase/CONVENTIONS.md` — server-action discriminated-union return shape, naming patterns, comment style
- `.planning/codebase/TESTING.md` — Vitest unit/integration split, RTL surface, Playwright write-path expectations

### Schema and policy surface to mutate (HARDEN-05)
- `supabase/migrations/001_initial_schema.sql:45` — `certificate_templates` table with `body_html` column
- `supabase/migrations/003_rls_policies.sql:64-65` — `certificate_templates_admin_all` policy (admin-only writes; unchanged by this phase)
- `supabase/migrations/005_seed_dev.sql:11-39` — default course / program certificate templates that exercise the inline-style allow-list
- New backfill migration (next free slot `011_*`) — runs sanitizer in-place over `content_blocks.content` and `certificate_templates.body_html`

### Schema and policy surface to mutate (HARDEN-06)
- New migration creating `public.auth_rate_limits` (table + index, optional `SECURITY DEFINER` RPC) — admin-and-service-role access; learner sessions never read or write this table

### Code surfaces touched per HARDEN
- HARDEN-05 sanitization:
  - `src/components/content-blocks.tsx` (line 121 `TextBlock` — renderer untouched), (lines 98–104 + 388–401 `EmbedBlock`)
  - `src/lib/certificates/render.ts` — merge-field escaping unchanged
  - `src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.ts` — text-block save sanitization point
  - Certificate-template admin save action — sanitization point (planner locates the file)
  - New `src/lib/sanitize/text-block.ts` and `src/lib/sanitize/certificate.ts` exporting the two allow-lists and the sanitize functions
- HARDEN-05 iframe sandbox:
  - `src/components/content-blocks.tsx:98-104` (props), `lines 388-401` (rendered iframe) — add `sandbox` attribute
  - `src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.ts` — embed save validates `iframe_src` starts with `https://`
  - `src/app/(dashboard)/admin/lessons/[lessonId]/edit/blocks-editor.tsx:825-859` — admin-trusted label
- HARDEN-06 rate limit:
  - New migration (next free slot `011_*` or `012_*` depending on plan order) — `auth_rate_limits` table, index, optional RPC
  - New `src/lib/rate-limit/` module — `checkAndConsume(keyType, keyValue, threshold, windowSeconds)` helper, IP extractor from `headers()`
  - `src/app/(auth)/forgot-password/actions.ts` — gate before `supabase.auth.resetPasswordForEmail`, silent-success breach response
  - `src/app/auth/set-password/actions.ts` — gate before `supabase.auth.updateUser`, explicit error breach response

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Server-action discriminated union `{ ok: true } | { ok: false; error: string }` — used by `sendPasswordReset` and `setPassword` today; preserved
- `createClient()` (SSR) and `createAdminClient()` (service-role) from `src/lib/supabase/` — service-role available if rate-limit access pattern goes UPSERT-direct rather than RPC
- `escapeHtml` in `src/lib/certificates/render.ts` — merge-field escaping unchanged
- Existing `prose` Tailwind classes on `TextBlock` (line 121–127) — design contract that justifies the strict text-block allow-list
- Existing `?error=invite_failed` / `?error=invite_expired` query-string pattern from Phase 1 — set-password breach UX may reuse a similar query-string flag if redirect-based; otherwise the discriminated-union path is the form-action contract

### Established Patterns
- Admin mutations always go through a server action that calls `requireAdmin()` first (CONVENTIONS.md). Sanitization runs after `requireAdmin()` and before the DB write.
- Migrations append numerically (`NNN_name.sql`); RLS is grouped in `003_rls_policies.sql`-style files; new tables go in their own migration. Phase 2 ships up to two new migrations: backfill (HARDEN-05 plan 1) and `auth_rate_limits` table (HARDEN-06 plan 3).
- Test-first TDD with inventory review (AGENTS.md). The failing tests land in their own commit before the implementation commit, per Phase 1 precedent.
- Plans share zero source files where possible. The three Phase 2 plans are file-disjoint: Plan 1 (sanitization) and Plan 2 (sandbox) only overlap in `content-blocks.tsx` and `blocks-editor.tsx` if Plan 1 elects to touch the renderer (it does not — sanitize on write only). Confirmed disjoint.

### Integration Points
- `src/app/(dashboard)/admin/lessons/[lessonId]/edit/blocks-editor.tsx:39` — block-type registry includes `embed`; the embed editor surface is where the admin-trusted label lives
- `src/lib/supabase/middleware.ts:35` — public-routes whitelist already includes `/forgot-password`; rate-limit gate runs inside the action, not in middleware
- Vercel Hobby request headers — `x-forwarded-for`, `x-real-ip`, `x-vercel-forwarded-for` (Vercel-specific) all available in Next.js `headers()`. Planner picks the canonical extraction order.
- Phase 01.1 RTL + e2e harness — sanitization renderer behavior can be exercised via RTL; rate-limit timing requires Vitest unit + a small integration test against the prod-readonly Supabase project

</code_context>

<deferred>
## Deferred Ideas

- Sandboxing the video-block iframe (YouTube / Vimeo / Loom). Not in HARDEN-05's scope; backlog as a future audit item if a threat-model review calls for it.
- Host allowlist on embed `iframe_src`. Considered and explicitly rejected (D-B3) in favour of sandbox + scheme check + admin-trusted label. Re-open only if the team starts seeing accidental embeds of sensitive surfaces.
- Re-sanitize HTML on render. Considered and explicitly rejected (D-A2) in favour of write-time + backfill. Re-open if sanitizer-rule changes start happening frequently enough that read-time re-sanitization beats running another backfill.
- Upstash Redis for rate-limit counters. Considered and rejected (D-C1) for this phase given the small-team profile. Re-open only if password-reset volume grows past the point where Postgres-roundtrip cost is meaningful.
- A self-service "request a new invite" flow on `/login` — already deferred from Phase 1 (its CONTEXT.md). Still deferred.
- Generalised application-wide rate limiting (e.g., on every auth-adjacent server action). HARDEN-06 scopes to forgot-password and set-password explicitly. Generalising is its own phase.

</deferred>

---

*Phase: 02-content-safety-and-rate-limiting*
*Context gathered: 2026-05-01*
