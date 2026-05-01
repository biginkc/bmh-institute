# Phase 2 Discussion Log

**Date:** 2026-05-01
**Phase:** 02-content-safety-and-rate-limiting
**Mode:** discuss (default)

This file is the human-readable audit trail of the decision flow. Downstream agents (researcher, planner, executor) read CONTEXT.md, not this file.

## Areas selected for discussion

User selected all four areas: HTML sanitizer policy, iframe sandbox + URL policy, rate-limit storage backend, rate-limit policy + breach response.

## Decision A.1 — Allow-list scope

**Question:** Should text blocks and certificate templates share one sanitize-html allow-list, or use two?

**Options presented:**
- Two separate allow-lists (Recommended) — text strict, certificates looser with safe `style` properties
- One unified allow-list (looser)
- One unified allow-list (strict) + migrate certificate templates off inline `style`

**Selected:** Two separate allow-lists.

**Rationale captured:** Text blocks live inside a `prose` Tailwind wrapper and don't need authoring power for `style`/`class`/`img`. Certificate templates already rely on inline `style` (font-size, padding, color, font-family) and would break under a strict rule. Two lists keeps the high-traffic surface tight while preserving the rare-touched surface functional. Migrating the certificate seed off inline `style` was rejected as out of scope for this phase.

## Decision A.2 — Defense in depth on read

**Question:** Sanitize HTML only on write, or also on every render as a defense-in-depth layer?

**Options presented:**
- Write only + backfill migration (Recommended)
- Write + render (defense in depth, ~1ms per render)
- Render only (rejected by requirement)

**Selected:** Write only + backfill migration.

**Rationale captured:** Requirement locks "sanitize on write." All admin authoring is funneled through server actions we control. A backfill migration cleans existing rows. Future sanitizer-rule tightening is handled by another targeted backfill rather than re-sanitizing on every render. Cleaner, faster, and the rule surface stays single-sourced.

## Decision B.1 — Embed block sandbox flag set

**Question:** Which sandbox flag set should the embed block use?

**Options presented:**
- `allow-scripts allow-same-origin allow-forms allow-presentation` (Recommended — CONCERNS.md)
- Above + `allow-popups allow-popups-to-escape-sandbox`
- Strict `sandbox=""` (no flags)

**Selected:** CONCERNS.md baseline (`allow-scripts allow-same-origin allow-forms allow-presentation`).

**Rationale captured:** Permits Loom / Notion / Google Docs / dashboard embeds while blocking top-level navigation and popups by default. Strict sandbox breaks every modern embed. Adding popup escape weakens the boundary; if a future embed needs more, escalate as its own plan.

## Decision B.2 — Sandbox the video block iframe?

**Question:** Apply the sandbox attribute to the video block iframe (YouTube/Vimeo/Loom) too, or only to the embed block?

**Options presented:**
- Embed block only (Recommended)
- Both iframes

**Selected:** Embed block only.

**Rationale captured:** HARDEN-05 names embed-block iframes specifically. Video iframe `src` is rewritten by `toEmbedSrc()` against a fixed origin allowlist (youtube-nocookie / player.vimeo / loom). Smaller attack surface; admin input cannot reach an arbitrary host. Backlog the video-sandbox audit if a future threat-model review calls for it.

## Decision B.3 — URL allowlist on embed

**Question:** Should the embed block enforce a URL allowlist on top of the sandbox?

**Options presented:**
- No allowlist, scheme check only (Recommended) — reject anything that isn't `https://`
- Strict host allowlist (loom.com, notion.so, etc.)
- No restriction at all (rejected — minimum should be `https://`)

**Selected:** Scheme check only (`https://`-or-reject).

**Rationale captured:** Sandbox + admin-only authoring is the defense. A host allowlist forces a code change every time the team adopts a new embed source (Loom share-domain variants, new tools). Block-editor UI labels the field as "admin-trusted." Re-open only if the threat model changes.

## Decision C.1 — Rate-limit storage backend

**Question:** Where should server-side rate-limit counters live?

**Options presented:**
- New Postgres table on Supabase (Recommended)
- In-memory module Map (rejected — not durable, won't satisfy HARDEN-06's contract)
- Upstash Redis via Vercel Marketplace

**Selected:** New Postgres table on Supabase.

**Rationale captured:** Durable, multi-region consistent, no new vendor, no extra env vars. Matches existing data model. One short SQL roundtrip per attempt is negligible at BMH's scale (small internal team, password-reset volume in the tens per day). Upstash overkill at this scale; in-memory unreliable on Fluid Compute.

## Decision D.1 — Thresholds and windows

**Question:** What thresholds and windows should the password-reset paths enforce?

**Options presented:**
- Per-IP 5/15min + Per-email 3/60min (Recommended — fits internal tool profile)
- Stricter (Per-IP 3/15min + Per-email 2/60min)
- Looser (Per-IP 10/15min + Per-email 5/60min)

**Selected:** Per-IP 5/15min + Per-email 3/60min.

**Rationale captured:** Conservative for an internal tool. Per-IP catches automated probing across the surface; per-email caps how many resets one address can trigger per hour, which doubles as anti-harassment. A real user almost never trips this. Stricter would frustrate legitimate retry; looser sacrifices protection for shared-IP environments BMH doesn't have.

## Decision D.2 — Breach response

**Question:** How should each path respond when a rate-limit threshold is crossed?

**Options presented:**
- Hybrid: silent forgot-password, explicit set-password (Recommended)
- Always explicit (return throttle error on both)
- Always silent (no error surfaced anywhere)

**Selected:** Hybrid.

**Rationale captured:** forgot-password preserves the existing enumeration-resistance posture (matches in-code comment); breach returns `{ok: true}` without calling Supabase. set-password is post-recovery-session — the user is authenticated, no enumeration risk, so an explicit "Try again in N minutes" wins on UX.

## Deferred ideas

- Sandboxing the video-block iframe (YouTube / Vimeo / Loom) — backlog future audit
- Host allowlist on embed `iframe_src` — explicitly rejected (D-B3); re-open only if threat model changes
- Re-sanitize HTML on render — explicitly rejected (D-A2); re-open if sanitizer-rule changes get frequent
- Upstash Redis for rate-limit counters — explicitly rejected (D-C1); re-open at higher volume
- Generalised application-wide rate limiting beyond the two password-reset paths — own phase
- Self-service "request a new invite" flow on `/login` — still deferred from Phase 1

## Claude's discretion items

- Exact `sanitize-html` config object structure (per-tag attribute lists, scheme filters, `transformTags` for `<a>` rel)
- Rate-limit access pattern (RPC vs service-role UPSERT)
- Cleanup strategy for `auth_rate_limits` (opportunistic prune vs scheduled)
- Exact wording of the set-password breach error and the "N minutes" formatting
- Migration filename numbering (next free slot is `011_*`)

---

*Discussion log written: 2026-05-01*
