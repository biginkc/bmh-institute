# Lesson load remediation plan

Status: proposed for Claude adversarial approval

Goal ID: `bmhi-lesson-load-performance`

Baseline: `origin/main` at `1eb980a53d12865741e9490051552e283c86439f`

Production route sampled: `/lessons/90ceaa26-0992-5991-a1c6-07070e3f7200`

## Goal

Reduce authenticated learner lesson response time without weakening access control, quiz answer isolation, progress correctness, guide withholding, reviewer boundaries, or signed media authorization.

## Evidence and diagnosis

Three clean Chrome DevTools reloads of the exact authenticated production route measured document TTFB of 4,258 ms, 3,637 ms, and 3,955 ms. Median TTFB was 3,955 ms. The HTML body completed 4 to 10 ms after TTFB and first paint followed 49 to 102 ms later. App assets completed in 60 to 114 ms when browser cache was bypassed.

Vercel evidence for the exact route showed hot Node invocations in `iad1`, p95 and maximum duration of 4,591 ms, maximum CPU of 865 ms, and maximum TTFB of 4,578 ms. Cold starts were 0.49 percent of lesson route invocations over 24 hours. The delay is downstream waiting rather than browser rendering, static assets, Vercel memory pressure, a cold-start pattern, or a Vercel to Supabase region mismatch.

Fresh authenticated database measurements showed:

| Operation | Authenticated execution | Diagnostic execution without repeated row authorization |
| --- | ---: | ---: |
| Full course, modules, 44 lessons, and 111 blocks | 3,010.16 ms | 4.30 ms |
| Course lesson states | 754.66 ms | 24.11 ms |

The dominant query performs 84,812 shared-buffer hits despite the course containing only 1 course, 6 modules, 44 lessons, and 111 content blocks. Core relationship indexes exist and the dominant statements show zero disk reads. Repeated row-level access evaluation and over-fetching are the proven hot path.

A fresh authenticated split query measured 105.45 ms for a block-free outline and 138.98 ms for the current lesson's six blocks. The combined 244.43 ms is 92 percent lower than the full tree query before changing authorization functions.

Secondary amplification comes from duplicate authentication/profile calls, the 500-title search fetch in every dashboard render, signing media for non-selected lesson parts, and automatic RSC prefetches for private no-store destinations. These are real load multipliers but do not cause the initial four-second document wait by themselves.

## Scope

Included:

- The learner lesson page and its server-side data projection.
- Request-scoped authenticated identity reuse.
- Current-part media signing and role-play token creation.
- Lesson search loading behavior.
- Private route prefetch behavior.
- A new narrowly scoped learner lesson RPC and set-based lesson-state calculation if required by the staged performance gate.
- Stage-level timing telemetry.
- Unit, migration, integration, browser, and production performance verification.

Excluded:

- Quiz presentation or scoring redesign.
- Course authoring changes.
- Global RLS relaxation.
- Edge runtime migration, Vercel memory increases, or speculative indexes.
- Caching learner progress, quiz attempts, signed URLs, role-play tokens, reviewer-only content, or authentication results across requests.

## Security invariants

1. The server derives the actor from `auth.uid()`. No caller-supplied user ID may choose another learner's state.
2. Course and lesson membership are validated before any learner data is returned.
3. Unanswered quiz answer keys are never selected into or returned by the lesson page payload.
4. Reviewer and import-review boundaries remain fail closed for every returned entity. Authorizing a course or lesson does not imply that every nested lesson, block, quiz reference, or assignment reference inside that boundary is released to the same actor.
5. Guide assets remain unsigned and absent from learner-visible output until their existing completion gate passes.
6. Video completion continues to require the current media asset version.
7. Role-play tokens remain scoped to the authenticated actor, selected lesson, and selected role-play block.
8. Unassigned and suspended users retain their current denial behavior.
9. Static catalog caching must exclude unpublished or reviewer-only structures unless the cache key and invalidation model preserve the same access boundary.

## Execution plan

### Step 1: add measurement boundaries

Add structured Vercel spans and a `Server-Timing` response strategy for these stages:

- middleware authentication
- dashboard identity/profile
- lesson identity and membership lookup
- lightweight outline
- lesson states
- current block progress
- assignment status when relevant
- selected-part media signing
- role-play token creation when relevant
- server render total

No identifiers, emails, tokens, signed URLs, quiz contents, or other private values may be emitted into logs or headers.

### Step 2: replace the generic full-tree lesson loader

Create a lesson-specific projection instead of calling the generic course-page loader from the lesson route.

The projection must:

- Fetch lightweight module and lesson metadata for navigation and pairing.
- Fetch full `content_blocks` only for the requested content lesson.
- Fetch `user_block_progress` only for those current lesson block IDs.
- Fetch assignment status only when the current lesson or its navigation state requires it.
- Omit `user_course_resume` because the lesson page does not consume it.
- Preserve lesson ordering, pairing, prerequisites, completion state, next-lesson behavior, quiz routing, and reviewer visibility.

Keep the existing generic loader for course and dashboard routes until their behavior is independently migrated and tested.

### Step 3: prepare only the selected part

Build and select lesson parts from authorized raw block metadata first. Then sign media and mint role-play tokens only for `selected.blocks`.

Expected behavior:

- Video part A signs only its own media paths.
- Video part B signs only its own media paths.
- Quiz signs no lesson media.
- A locked guide signs nothing.
- An unlocked guide signs only its own guide asset.
- A video view does not mint role-play tokens for hidden role-play blocks.

### Step 4: remove request duplication and background amplification

- Introduce request-scoped memoization for verified `getUser()` and profile loading. Middleware and database authorization remain in place.
- Replace the eager 500-title layout query with an authenticated, RLS-scoped, debounced search returning at most eight matches after the user types.
- Add `prefetch={false}` to private navigation and lesson-part links that currently cause speculative authenticated renders. Optional intent prefetch may be added on deliberate hover or focus only after measurement.
- Preserve native document navigation on the completed quiz terminal paths where stale RSC state was previously proven unsafe.

### Step 5: collapse remaining database authorization work

Run the TEST benchmark after steps 1 through 4. If lesson-state or access work prevents the budgets below from passing, add a migration named for the next available migration number with a narrowly scoped function such as:

```sql
public.fn_learner_lesson_page_v1(
  p_course_id uuid,
  p_lesson_id uuid
) returns jsonb
```

The function contract must:

- Use `security definer` only with a fixed safe `search_path` and explicit execute grants.
- Derive the actor only from `auth.uid()` and reject a null actor.
- Validate course access and current lesson membership once before reading learner state.
- Return lightweight course navigation, set-based lesson state, current lesson detail, current block progress, and only the current assignment's latest status when applicable.
- Never query or return answer correctness, scoring keys, or unrevealed quiz explanations.
- Apply import release and quarantine filtering set-wise to every returned entity row, including navigation lessons, current lesson blocks, quiz references, and assignment references. The result must be semantically equivalent to applying `fn_actor_may_access_catalog_entity_v1` to each returned entity even though the implementation must avoid the current per-row traversal cost. A course or current lesson boundary check alone is insufficient.
- Avoid calling the 20-branch catalog traversal once per returned row.
- Enforce bounded cardinality and deterministic ordering.

Rewrite lesson state set-wise inside the same migration or a separately reviewable migration. Join completions, prerequisites, attempts, current block progress, and assignment state in bulk after authorizing the actor and course once. Do not relax existing table RLS policies for general queries.

Regenerate checked-in Supabase types after the RPC contract is final.

### Step 6: cache only stable catalog structure

After security tests pass, cache the published lightweight course structure beneath the private page layer. Key it by course and published content version. Invalidate it from authoring mutations that change programs, courses, modules, lessons, pairing, prerequisites, publication state, or block structure.

Cache verification must prove that publish, unpublish, and structure mutations invalidate the prior version. A cache warmed by one persona must never cross a learner/reviewer access boundary. Unpublished and quarantined entities must remain absent from learner cache payloads before and after an invalidation event.

Do not cache across requests:

- actor or profile state
- access decisions that vary by actor
- progress or completion state
- quiz attempts or feedback
- signed URLs
- role-play tokens
- assignment submissions
- unpublished or quarantined reviewer content

## Test plan

### Unit and static tests

- The lesson route does not call the generic full-tree loader.
- Only current lesson block IDs are requested from `content_blocks` and `user_block_progress`.
- Assignment history and course resume are absent from ordinary lesson requests.
- Hidden lesson parts are not signed and do not receive role-play tokens.
- Request-scoped identity is reused without replacing verified authentication.
- Private links do not prefetch before deliberate interaction.
- Search requests begin only after typing and return a bounded result set.
- Migration tests prove safe search path, actor derivation, grants, cardinality, and no answer-key selection.
- Migration tests prove per-entity import release and quarantine filtering for every returned entity type.
- Timing tests prove `Server-Timing` and structured logs contain no user identifiers, emails, tokens, signed URLs, quiz contents, or other private values.

### TEST integration

Use a production-shaped course with 6 modules, 44 lessons, and 111 blocks. Verify owner, admin, learner, reviewer, unassigned, and suspended personas. Include one accessible course containing a partially released import with both released and unreleased lessons, blocks, quiz references, and assignment references.

Prove:

- Course and lesson access parity with the baseline.
- Reviewer/import quarantine parity.
- The mixed-release fixture returns released rows to learners, withholds every unreleased nested row, and returns only the reviewer-authorized quarantined rows to the correct granted reviewer.
- Prerequisite, completion, next-lesson, composite quiz, standalone quiz, assignment, and resume navigation parity.
- Guide withholding and stale video asset-version behavior.
- Role-play token actor and block scope.
- First-answer locking, refresh resume, and completed quiz terminal behavior remain intact.
- An unanswered quiz network response contains no answer key. The existing user waiver may satisfy only a Chrome screenshot requirement. It does not waive server review or automated answer-isolation tests.
- Publishing, unpublishing, pairing, prerequisite, ordering, and block-structure mutations invalidate the prior cached structure.
- A cache warmed by a learner is never served to a reviewer and a cache warmed by a reviewer is never served to a learner.
- Unpublished and quarantined entities remain absent from learner cache payloads before and after invalidation.

### Performance verification

Record every sample's document TTFB, first contentful paint, Vercel duration, cold/hot state, stage timings, database execution, RSC request count, and Institute-origin transferred bytes.

Run:

- 10 direct cold or prewarmed TEST loads.
- 20 direct warm TEST loads.
- 20 direct warm production Chrome loads after normal Git-connected deployment.
- A production mobile-size Chrome pass with the same authenticated learner path.

Acceptance budgets:

- Warm production median document TTFB below 1,500 ms.
- Warm production p95 document TTFB below 2,500 ms.
- At least 50 percent reduction from the 3,955 ms production median baseline.
- Current lesson catalog and learner-state database work below 500 ms combined at p95 in the measured TEST fixture.
- No private destination RSC prefetch before deliberate navigation.
- No increase in errors, authorization denials for valid personas, or access granted to invalid personas.

If any budget fails, use the recorded stage timing to revise the responsible phase. Do not hide a failed server budget behind optimistic loading UI.

## Rollout and rollback

1. Implement with TDD in an isolated worktree and commit each coherent phase.
2. Apply any new migration to the TEST Supabase project only first.
3. Run unit, integration, build, seeded browser, and manual Chrome verification against TEST.
4. Run `custom-manual-code-review` with independent application, database/security, and test/performance lanes.
5. Send the reviewed exact head to Claude through this convergence loop.
6. Only after all gates pass, use the repository's normal PR and Git-connected Vercel deployment path.
7. Record the pre-merge main SHA, migration version, deployment ID, and database function definitions as rollback points.
8. If production authorization behavior or error rate regresses, revert the application commit first. If the application depends on the new RPC, deploy the compatibility rollback before removing or replacing the function. Do not destructively roll back learner data.

## Acceptance gates

- [ ] Claude returns `DONE` with high confidence for this plan after independently challenging the evidence, security boundaries, sequence, tests, budgets, and rollback.
- [ ] The plan maps each measured bottleneck to a specific change and verification method.
- [ ] The plan preserves all listed security and learner-state invariants.
- [ ] TEST proves all listed personas and lesson types with a production-shaped fixture.
- [ ] Manual code review is clean on the exact implementation head.
- [ ] Unit, integration, typecheck, build, and seeded browser suites pass on the exact implementation head.
- [ ] Production Chrome meets the timing budgets and shows no console, network, access, or quiz-key regression.
- [ ] The evidence ledger records baseline, TEST migration, exact head, checks, Claude verdict, deployment, production measurements, and rollback points.

Plan approval does not itself authorize implementation, migration application, PR creation, merge, deployment, or production changes. Those actions begin only under a later explicit execution request and the repository's quality gates.
