---
phase: 02-content-safety-and-rate-limiting
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - package-lock.json
  - src/lib/sanitize/text-block.ts
  - src/lib/sanitize/text-block.test.ts
  - src/lib/sanitize/certificate.ts
  - src/lib/sanitize/certificate.test.ts
  - src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.ts
  - src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.test.ts
  - scripts/backfill-sanitize-html.ts
autonomous: true
requirements:
  - HARDEN-05
must_haves:
  truths:
    - sanitizeTextBlockHtml strips script tags entirely on save (D-A1, D-A2)
    - sanitizeTextBlockHtml rejects javascript and data hrefs and forces rel noopener noreferrer on anchors (D-A1)
    - sanitizeTextBlockHtml strips inline style attributes; text blocks live in Tailwind prose (D-A1)
    - sanitizeCertificateBodyHtml preserves the inline style properties used by the 005 seed templates including font-size, color, margin, margin-top, padding, text-align, font-family, font-weight, plus any others the seed actually exercises (D-A1)
    - sanitizeCertificateBodyHtml restricts img src to https only (D-A1)
    - Both sanitizers are idempotent so the backfill script is safe to re-run (RESEARCH Pitfall 3)
    - updateBlock reads block_type from the existing row and sanitizes content.html when block_type is text before the Supabase update (D-A2; RESEARCH Pattern 1; PATTERNS analog assignment)
    - The backfill script reads every text content block and every certificate template, sanitizes in place, skips no-op rows, and exits non-zero on error (RESEARCH Pattern 2)
    - Failing tests land in their own commit before the implementation commit (AGENTS.md)
  artifacts:
    - path: src/lib/sanitize/text-block.ts
      provides: STRICT_OPTIONS plus sanitizeTextBlockHtml export
      contains: sanitizeTextBlockHtml
    - path: src/lib/sanitize/certificate.ts
      provides: CERTIFICATE_OPTIONS plus sanitizeCertificateBodyHtml export
      contains: sanitizeCertificateBodyHtml
    - path: src/lib/sanitize/text-block.test.ts
      provides: Vitest unit suite covering script strip, javascript scheme rejection, rel injection, idempotency, style strip
    - path: src/lib/sanitize/certificate.test.ts
      provides: Vitest unit suite covering 005 seed round-trip, style allow-list, https-only img scheme, idempotency
    - path: src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.ts
      provides: updateBlock dispatches by existing block_type and routes text content through sanitizeTextBlockHtml before write
      contains: sanitizeTextBlockHtml
    - path: src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.test.ts
      provides: Vitest unit asserting updateBlock with block_type text sanitizes content.html before update
    - path: scripts/backfill-sanitize-html.ts
      provides: One-shot Node script that sanitizes content_blocks.content.html and certificate_templates.body_html in place; idempotent (skips when output equals input)
      contains: sanitizeTextBlockHtml
  key_links:
    - from: src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.ts
      to: src/lib/sanitize/text-block.ts
      via: import sanitizeTextBlockHtml from @/lib/sanitize/text-block
      pattern: sanitizeTextBlockHtml
    - from: scripts/backfill-sanitize-html.ts
      to: src/lib/sanitize/text-block.ts and src/lib/sanitize/certificate.ts
      via: imported by the backfill script and applied to each row's html or body_html column
      pattern: sanitize(TextBlockHtml|CertificateBodyHtml)
    - from: scripts/backfill-sanitize-html.ts
      to: src/lib/supabase/admin.ts
      via: createAdminClient() service-role bypass for batch update
      pattern: createAdminClient
---

<objective>
Close the HARDEN-05 sanitization half. Install sanitize-html v2.17, define the two locked allow-lists from CONTEXT.md D-A1 in `src/lib/sanitize/`, wire `sanitizeTextBlockHtml` into the existing `updateBlock` server action so admin-authored text blocks are cleaned on save (D-A2), and ship a one-shot Node backfill script that walks every `content_blocks.content.html` and `certificate_templates.body_html` row and re-sanitizes in place. Render path stays untouched (D-A2). Test inventory is enumerated up front and fails first per AGENTS.md.

Purpose: Today `src/components/content-blocks.tsx` lines 121-128 render admin-authored HTML through `dangerouslySetInnerHTML`, and the certificate template path in `src/lib/certificates/render.ts` does the same with the seed templates from `005_seed_dev.sql:11-39`. Per CONCERNS.md a malicious or careless admin can land a script tag and learners execute it. CONTEXT.md D-A2 locks the fix at the write boundary plus a one-shot backfill so the renderer keeps its existing shape.

Output:
- New `src/lib/sanitize/text-block.ts` and `src/lib/sanitize/certificate.ts` plus their `.test.ts` siblings.
- `updateBlock` (the only existing text-block write path) sanitizes when the existing block_type is `text`, per RESEARCH Open Question 1 option (b) — read block_type from the row before sanitizing.
- New `scripts/backfill-sanitize-html.ts` and matching `npm run backfill:sanitize-html` script entry. Documented as a manual post-deploy step.
- Two commits: failing tests, then implementation. The package install rides on the failing-test commit because the imports must resolve at typecheck time.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/STATE.md
@.planning/phases/02-content-safety-and-rate-limiting/02-CONTEXT.md
@.planning/phases/02-content-safety-and-rate-limiting/02-RESEARCH.md
@.planning/phases/02-content-safety-and-rate-limiting/02-PATTERNS.md
@.planning/codebase/CONVENTIONS.md
@.planning/codebase/TESTING.md
@AGENTS.md
@src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.ts
@src/lib/certificates/render.ts
@src/lib/quizzes/score.test.ts
@src/lib/supabase/admin.ts
@supabase/migrations/005_seed_dev.sql

<interfaces>
Existing `updateBlock` signature (src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.ts:99-120). The plan extends this body, NOT the signature:
```
export async function updateBlock(input: {
  blockId: string;
  lessonId: string;
  content: Record<string, unknown>;
  is_required_for_completion?: boolean;
}): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const patch: Record<string, unknown> = { content: input.content };
  if (typeof input.is_required_for_completion === "boolean") {
    patch.is_required_for_completion = input.is_required_for_completion;
  }
  const { error } = await supabase
    .from("content_blocks")
    .update(patch)
    .eq("id", input.blockId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/lessons/${input.lessonId}/edit`);
  revalidatePath(`/lessons/${input.lessonId}`);
  return { ok: true };
}
```

Service-role admin client (src/lib/supabase/admin.ts:12-23):
```
export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Admin Supabase client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

Locked allow-list shapes from RESEARCH §Code Examples §1 and §2 (these are the source of truth — copy verbatim during implementation):

text-block STRICT_OPTIONS:
```
const STRICT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "strong", "em", "u",
    "ul", "ol", "li",
    "h2", "h3", "h4",
    "blockquote", "code", "pre",
    "a",
  ],
  allowedAttributes: { a: ["href", "rel", "target"] },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { a: ["http", "https", "mailto"] },
  allowProtocolRelative: false,
  transformTags: {
    a: (_tag, attribs) => ({
      tagName: "a",
      attribs: {
        href: attribs.href ?? "",
        rel: "noopener noreferrer",
        target: attribs.target === "_blank" ? "_blank" : "_self",
      },
    }),
  },
  disallowedTagsMode: "discard",
};
```

certificate CERTIFICATE_OPTIONS:
```
const CERTIFICATE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "strong", "em", "u",
    "ul", "ol", "li",
    "h1", "h2", "h3", "h4",
    "blockquote", "code", "pre",
    "a",
    "div", "span", "img",
  ],
  allowedAttributes: {
    a: ["href", "rel", "target"],
    img: ["src", "alt", "width", "height"],
    div: ["style"],
    span: ["style"],
    p: ["style"],
    h1: ["style"],
    h2: ["style"],
    h3: ["style"],
    h4: ["style"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { a: ["http", "https", "mailto"], img: ["https"] },
  allowProtocolRelative: false,
  allowedStyles: {
    "*": {
      "font-size": [/^[\d.]+(px|em|rem|%|pt)$/],
      "color": [/^#[0-9a-f]{3,8}$/i, /^rgb\((\s*\d+\s*,){2}\s*\d+\s*\)$/, /^[a-z]+$/i],
      "margin": [/^([\d.]+(px|em|rem|%)?(\s+|$)){1,4}$/],
      "margin-top": [/^[\d.]+(px|em|rem|%)?$/],
      "margin-bottom": [/^[\d.]+(px|em|rem|%)?$/],
      "padding": [/^([\d.]+(px|em|rem|%)?(\s+|$)){1,4}$/],
      "text-align": [/^(left|right|center|justify)$/],
      "font-family": [/^[\w\s,'"-]+$/],
      "font-weight": [/^(\d{3}|normal|bold|bolder|lighter)$/],
    },
  },
  transformTags: {
    a: (_tag, attribs) => ({
      tagName: "a",
      attribs: {
        href: attribs.href ?? "",
        rel: "noopener noreferrer",
        target: attribs.target === "_blank" ? "_blank" : "_self",
      },
    }),
  },
  disallowedTagsMode: "discard",
};
```

Note on `margin-bottom`: the 005 seed uses `margin-bottom:8px` on the `<h1>`. RESEARCH §Code Examples §2 omitted that key; the version above adds it. The Test Inventory pins the round-trip on the seed bodies, so any property the seed exercises must appear in `allowedStyles`. Add more (e.g., `margin-left`, `margin-right`) only if a fixture surfaces a need.

005 seed body that MUST round-trip unchanged (supabase/migrations/005_seed_dev.sql:11-25, course template, joined into a single string):
```
<div style="text-align:center;padding:48px;font-family:Georgia,serif"><h1 style="font-size:36px;margin-bottom:8px">Certificate of Completion</h1><p style="font-size:18px">This certifies that</p><h2 style="font-size:28px;margin:16px 0">{{full_name}}</h2><p style="font-size:18px">has completed the course</p><h3 style="font-size:22px;margin:16px 0">{{title}}</h3><p style="font-size:16px">on {{completion_date}}</p><p style="font-size:14px;margin-top:32px;color:#666">Certificate number: {{certificate_number}}</p><p style="font-size:14px;color:#666">Issued by BMH Group</p></div>
```

Backfill script shape (RESEARCH Pattern 2; PATTERNS scripts/backfill-sanitize-html.ts assignment):
```
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeTextBlockHtml } from "@/lib/sanitize/text-block";
import { sanitizeCertificateBodyHtml } from "@/lib/sanitize/certificate";

async function backfillContentBlocks() {
  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("content_blocks")
    .select("id, content")
    .eq("block_type", "text");
  if (error) throw error;
  let touched = 0;
  for (const row of rows ?? []) {
    const html = (row.content as { html?: string } | null)?.html;
    if (typeof html !== "string") continue;
    const safe = sanitizeTextBlockHtml(html);
    if (safe === html) continue;
    const { error: updErr } = await admin
      .from("content_blocks")
      .update({ content: { ...(row.content as object), html: safe } })
      .eq("id", row.id);
    if (updErr) throw updErr;
    touched += 1;
  }
  console.log(`content_blocks: ${touched} rows sanitized`);
}
```
</interfaces>
</context>

<test_inventory>
Per AGENTS.md the test inventory is enumerated and reviewable BEFORE any tests or code are written. Files, scope, and assertions:

File A: `src/lib/sanitize/text-block.test.ts` (Vitest unit, runs in `npm run test`)

`describe("sanitizeTextBlockHtml (HARDEN-05)")`:
1. `it("strips <script> tags entirely")` — input `<p>hi<script>alert(1)</script></p>` returns `<p>hi</p>`.
2. `it("rejects javascript: hrefs while preserving the <a> element")` — input with javascript scheme href returns an anchor whose href is missing or empty AND `rel="noopener noreferrer"` is present.
3. `it("rejects data: hrefs")` — input with data URI href returns an anchor without a data href.
4. `it("forces rel noopener noreferrer on anchors with target _blank")` — input with target _blank returns output containing both `rel="noopener noreferrer"` and `target="_blank"`.
5. `it("forces target _self on anchors that did not request _blank")` — input without target attr returns output containing `target="_self"`.
6. `it("strips inline style attributes from text blocks")` — input `<p style="color:red">x</p>` returns `<p>x</p>`.
7. `it("strips disallowed tags entirely (img, div, span)")` — input with `<div>`, `<span>`, `<img>` returns text content only.
8. `it("rejects protocol-relative URLs starting with //")` — input `<a href="//example.com">x</a>` returns an anchor without that href.
9. `it("is idempotent — sanitize(sanitize(x)) === sanitize(x) for representative inputs")` — inputs include plain prose, an external https anchor, a script-bearing string, and `<svg><script>alert(1)</script></svg>` (Assumption A4).
10. `it("preserves allowed tags and their text content unchanged")` — input `<p>hi <strong>there</strong></p><ul><li>a</li></ul>` round-trips unchanged.

Ten `it` cases. No external I/O.

File B: `src/lib/sanitize/certificate.test.ts` (Vitest unit, runs in `npm run test`)

`describe("sanitizeCertificateBodyHtml (HARDEN-05)")`:
1. `it("preserves the 005 default course certificate body unchanged")` — fixture is the exact `body_html` string concatenated from migration 005 lines 11-25. Asserts `sanitize === input`. Pivot test that pins Pitfall 8.
2. `it("preserves the 005 default program certificate body unchanged")` — same shape against the program template (lines 26-38).
3. `it("strips <script> tags entirely")` — input `<div>hi<script>alert(1)</script></div>` returns `<div>hi</div>`.
4. `it("strips img elements with non-https src")` — input with `http://` img returns output without that img.
5. `it("preserves img elements with https src")` — input with https img with alt and width returns the img intact.
6. `it("rejects style declarations whose property is not in the allow-list")` — input `<div style="position:absolute;top:0">x</div>` returns the div with no style.
7. `it("rejects style declarations whose value does not match the regex")` — input with `color:javascript:alert(1)` returns the div with no style.
8. `it("forces rel noopener noreferrer on every anchor")` — same shape as text-block test 4.
9. `it("is idempotent against the 005 seed and against script-bearing inputs")` — same shape as text-block test 9.

Nine `it` cases. The fixtures for tests 1 and 2 are inlined string literals matching the seed bodies verbatim.

File C: `src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.test.ts` (Vitest unit, runs in `npm run test`)

`describe("updateBlock sanitization (HARDEN-05)")`:
1. `it("sanitizes content.html before writing when the stored block_type is text")` — Mock `requireAdmin` and `createClient` so the lookup returns `{ block_type: "text" }` and the update captures the patch. Call with `content: { html: "<p>hi<script>x</script></p>" }`. Assert the captured `patch.content.html` equals `<p>hi</p>` and the action returns `{ ok: true }`.
2. `it("does NOT sanitize content.html when the stored block_type is callout")` — Lookup returns `{ block_type: "callout" }`. Call with `content: { html: "<script>x</script>", markdown: "a" }`. Assert the captured patch's content matches the input verbatim — sanitization is skipped.
3. `it("returns ok false with a not-found message when the block_type lookup returns null")` — Lookup returns `null`. Assert `{ ok: false, error: "Block not found." }` and the update was NOT called.

Three `it` cases focused on the new sanitization branch. The existing revalidatePath behavior is implicitly preserved (mocked away).

Embed-branch tests (block_type embed, https-only) belong to Plan 02-2 — disjoint by design.

No new test for the backfill script. Idempotency is proven via the unit tests' "is idempotent" cases.

Total Plan 02-1 inventory: 22 unit `it` cases across 3 test files. Failing tests land in commit 1; implementation in commit 2.
</test_inventory>

<tasks>

<task type="auto">
  <name>Task 1: Install sanitize-html, write all failing tests, single commit</name>
  <files>
    - package.json
    - package-lock.json
    - src/lib/sanitize/text-block.test.ts
    - src/lib/sanitize/certificate.test.ts
    - src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.test.ts
  </files>
  <read_first>
    - .planning/phases/02-content-safety-and-rate-limiting/02-CONTEXT.md (D-A1, D-A2, D-A3)
    - .planning/phases/02-content-safety-and-rate-limiting/02-RESEARCH.md (Code Examples 1-3, Common Pitfalls 1-3 and 8)
    - .planning/phases/02-content-safety-and-rate-limiting/02-PATTERNS.md (sections for src/lib/sanitize/text-block.ts, src/lib/sanitize/certificate.ts, the matching .test.ts files, and the updateBlock MODIFY block)
    - supabase/migrations/005_seed_dev.sql lines 11-39 (fixture source — inline the exact string in File B tests 1 and 2)
    - src/lib/quizzes/score.test.ts (style reference: imports, describe shape, it naming)
    - src/app/(dashboard)/admin/users/[userId]/edit/actions.test.ts (mock pattern reference for File C)
    - src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.ts (the function under test in File C)
    - .planning/codebase/CONVENTIONS.md (server-action discriminated union; named export only)
    - AGENTS.md (TDD with up-front inventory; failing tests in their own commit)
  </read_first>
  <action>
1. Install dependencies. Test files import sanitize-html so the install MUST land in this commit alongside the failing tests. From the repo root:

```
npm install sanitize-html@^2.17.3
npm install --save-dev @types/sanitize-html@^2.16.1
```

Verify the lockfile updated by checking package.json for both entries.

2. Create `src/lib/sanitize/text-block.test.ts` per the test inventory. Header:
```
// HARDEN-05: text-block sanitizer regression. Strict prose-only allow-list
// per CONTEXT.md D-A1; sanitize-on-write per D-A2.
import { describe, expect, it } from "vitest";

import { sanitizeTextBlockHtml } from "./text-block";
```

The `sanitizeTextBlockHtml` export does not exist yet — that is expected and the typecheck will fail until Task 2 lands.

Per-case bodies follow `src/lib/quizzes/score.test.ts` shape: one `describe`, one `it` per assertion, no nested describes, no mocks. Use the exact inputs and expected outputs called out in the test inventory above.

3. Create `src/lib/sanitize/certificate.test.ts` per the inventory. Header:
```
// HARDEN-05: certificate-template sanitizer regression. Looser allow-list
// (div / span / img + style) per CONTEXT.md D-A1. The 005 seed templates
// are pinned as round-trip fixtures so the backfill cannot silently break
// them (Pitfall 8 in 02-RESEARCH.md).
import { describe, expect, it } from "vitest";

import { sanitizeCertificateBodyHtml } from "./certificate";
```

For tests 1 and 2 (the 005 seed fixtures) inline the exact string. The seed migration concatenates literal SQL strings; in TypeScript join them with no separator. Course template fixture:

```
const COURSE_SEED_BODY =
  '<div style="text-align:center;padding:48px;font-family:Georgia,serif">' +
  '<h1 style="font-size:36px;margin-bottom:8px">Certificate of Completion</h1>' +
  '<p style="font-size:18px">This certifies that</p>' +
  '<h2 style="font-size:28px;margin:16px 0">{{full_name}}</h2>' +
  '<p style="font-size:18px">has completed the course</p>' +
  '<h3 style="font-size:22px;margin:16px 0">{{title}}</h3>' +
  '<p style="font-size:16px">on {{completion_date}}</p>' +
  '<p style="font-size:14px;margin-top:32px;color:#666">Certificate number: {{certificate_number}}</p>' +
  '<p style="font-size:14px;color:#666">Issued by BMH Group</p>' +
  '</div>';

it("preserves the 005 default course certificate body unchanged", () => {
  expect(sanitizeCertificateBodyHtml(COURSE_SEED_BODY)).toBe(COURSE_SEED_BODY);
});
```

Mirror for the program template (migration 005 lines 26-38).

4. Create `src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.test.ts`. The codebase has no existing test file for this `actions.ts`; this is the first.

Use the mock pattern from `src/app/(dashboard)/admin/users/[userId]/edit/actions.test.ts`. `updateBlock` will need TWO calls to `from("content_blocks")` (a `.select(...).eq(...).maybeSingle()` for block_type, and a `.update(...).eq(...)` for the patch). Mock skeleton:

```
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let blockTypeRow: { block_type: string } | null = null;
let updatePatch: Record<string, unknown> | null = null;
let updateError: { message: string } | null = null;

vi.mock("@/lib/auth/guard", () => ({
  requireAdmin: vi.fn(async () => ({
    id: "admin-1",
    email: "a@b.com",
    system_role: "admin",
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      if (table !== "content_blocks") {
        throw new Error(`Unexpected table ${table}`);
      }
      return {
        select: (_cols: string) => ({
          eq: () => ({
            maybeSingle: async () => ({ data: blockTypeRow, error: null }),
          }),
        }),
        update: (patch: Record<string, unknown>) => {
          updatePatch = patch;
          return { eq: async () => ({ error: updateError }) };
        },
      };
    },
  })),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { updateBlock } from "./actions";

describe("updateBlock sanitization (HARDEN-05)", () => {
  beforeEach(() => {
    blockTypeRow = null;
    updatePatch = null;
    updateError = null;
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("sanitizes content.html before writing when the stored block_type is text", async () => {
    blockTypeRow = { block_type: "text" };
    const result = await updateBlock({
      blockId: "b1",
      lessonId: "l1",
      content: { html: '<p>hi<script>alert(1)</script></p>' },
    });
    expect(result).toEqual({ ok: true });
    const patched = updatePatch?.content as { html?: string } | undefined;
    expect(patched?.html).toBe('<p>hi</p>');
  });

  it("does NOT sanitize content.html when the stored block_type is callout", async () => {
    blockTypeRow = { block_type: "callout" };
    const result = await updateBlock({
      blockId: "b1",
      lessonId: "l1",
      content: { html: '<script>x</script>', markdown: "a" },
    });
    expect(result).toEqual({ ok: true });
    const patched = updatePatch?.content as Record<string, unknown> | undefined;
    expect(patched?.html).toBe('<script>x</script>');
    expect(patched?.markdown).toBe("a");
  });

  it("returns ok false when the block_type lookup returns null", async () => {
    blockTypeRow = null;
    const result = await updateBlock({
      blockId: "missing",
      lessonId: "l1",
      content: { html: "<p>x</p>" },
    });
    expect(result).toEqual({ ok: false, error: "Block not found." });
    expect(updatePatch).toBeNull();
  });
});
```

5. Verify the red state. The TypeScript compile must fail (the imports in Files A and B point at modules that do not exist yet) AND the unit suite must report failures:
```
npm run typecheck
```

If the husky pre-commit hook gates on the failing typecheck, commit with `HUSKY=0` for THIS commit only — Phase 01.1 set the precedent (STATE.md "Failing-tests commit lands with HUSKY=0 because the harness has not been installed yet"). The implementation commit (Task 2) runs the hook end-to-end.

6. Stage and commit. Files: `package.json`, `package-lock.json`, three `.test.ts` files. Commit message:
```
test(02-1): HARDEN-05 failing inventory for sanitize-html on write

Twenty-two unit cases across text-block sanitizer, certificate sanitizer
(including 005 seed round-trip fixtures), and the updateBlock action
dispatch. Installs sanitize-html and @types/sanitize-html so the imports
resolve. Implementation lands in the next commit.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```
  </action>
  <verify>
    <automated>npm run typecheck 2>&1 | tail -25; ls src/lib/sanitize/text-block.test.ts src/lib/sanitize/certificate.test.ts; grep -c sanitize-html package.json</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "sanitize-html" package.json` returns at least 1 (production dep)
    - `grep -c "@types/sanitize-html" package.json` returns at least 1 (devDep)
    - All three new `.test.ts` files exist at the paths in the `<files>` block
    - `grep -c "alert(1)" src/lib/sanitize/text-block.test.ts` returns at least 1
    - `grep -c "Certificate of Completion" src/lib/sanitize/certificate.test.ts` returns at least 1 (seed fixture inlined verbatim)
    - `grep -c "is idempotent" src/lib/sanitize/text-block.test.ts` returns at least 1
    - `grep -c "Block not found" src/app/\(dashboard\)/admin/lessons/\[lessonId\]/edit/actions.test.ts` returns at least 1
    - `git log -1 --name-only` lists exactly: `package.json`, `package-lock.json`, the three new `.test.ts` files (no production code)
    - The commit message starts with `test(02-1):`
  </acceptance_criteria>
  <done>Failing-tests commit landed with sanitize-html installed; the imports compile, the assertions fail.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement sanitizers, wire updateBlock, ship backfill script, single commit</name>
  <files>
    - src/lib/sanitize/text-block.ts
    - src/lib/sanitize/certificate.ts
    - src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.ts
    - scripts/backfill-sanitize-html.ts
    - package.json
  </files>
  <read_first>
    - src/lib/sanitize/text-block.test.ts (the contract being implemented against)
    - src/lib/sanitize/certificate.test.ts (the contract being implemented against)
    - src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.test.ts (the contract for the action change)
    - .planning/phases/02-content-safety-and-rate-limiting/02-RESEARCH.md (Code Examples 1 and 2, Pattern 1, Pattern 2, Common Pitfalls 1, 2, 3, 8)
    - .planning/phases/02-content-safety-and-rate-limiting/02-PATTERNS.md (sections for src/lib/sanitize/text-block.ts, src/lib/sanitize/certificate.ts, the updateBlock MODIFY block, and scripts/backfill-sanitize-html.ts)
    - .planning/phases/02-content-safety-and-rate-limiting/02-CONTEXT.md (D-A1, D-A2)
    - src/lib/certificates/render.ts (analog: pure-function lib helper, named export, JSDoc rule documentation)
    - src/lib/supabase/admin.ts (createAdminClient signature for the backfill script)
    - src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.ts (the existing updateBlock body — REPLACE only lines 99-120; leave every other function alone)
    - supabase/migrations/005_seed_dev.sql lines 11-39 (the round-trip fixture — your CERTIFICATE_OPTIONS allow-list must accept every property used)
    - .planning/codebase/CONVENTIONS.md ("Module Design" — named exports only, no default)
  </read_first>
  <behavior>
    - All 22 failing tests from Task 1 pass
    - `npm run verify` (typecheck + unit + RTL) passes
    - The husky pre-commit hook runs end-to-end (no HUSKY=0)
  </behavior>
  <action>
1. Create `src/lib/sanitize/text-block.ts`. Use the `STRICT_OPTIONS` object from the `<interfaces>` block of this plan verbatim. JSDoc must call out (a) sanitize-on-write per CONTEXT.md D-A2, (b) renderer keeps `dangerouslySetInnerHTML` unchanged, (c) `disallowedTagsMode: "discard"` is what makes the function idempotent (RESEARCH Pitfall 3).

```
/**
 * Strict prose-only sanitizer for admin-authored text-block HTML.
 *
 * Wired into the admin save action only. The lesson renderer continues
 * to use dangerouslySetInnerHTML and trusts the stored content per
 * CONTEXT.md D-A2. Backfill script in scripts/backfill-sanitize-html.ts
 * runs the same function over existing rows.
 *
 * disallowedTagsMode is set to "discard" so script tags are stripped
 * (not escaped). That is what makes sanitize(sanitize(x)) === sanitize(x)
 * (RESEARCH Pitfall 3).
 */
import sanitizeHtml from "sanitize-html";

const STRICT_OPTIONS: sanitizeHtml.IOptions = {
  // exact body from the <interfaces> section
};

export function sanitizeTextBlockHtml(input: string): string {
  return sanitizeHtml(input, STRICT_OPTIONS);
}
```

Run `npm run test src/lib/sanitize/text-block.test.ts` and confirm all 10 cases pass before moving on. If any fail, adjust the `STRICT_OPTIONS` regex or transformTags shape against the failing assertion (do not change the test).

2. Create `src/lib/sanitize/certificate.ts`. Start from the `CERTIFICATE_OPTIONS` in the `<interfaces>` block (the version that already includes `margin-bottom`). Run the test suite and inspect any FAILING 005 seed round-trip cases — Pitfall 8 says the allow-list must adapt until both fixtures round-trip green:

```
npm run test src/lib/sanitize/certificate.test.ts
```

DO NOT modify the seed fixture in the test. The seed is the source of truth; the allow-list adapts to it.

JSDoc on `sanitizeCertificateBodyHtml` must call out: "Allow-list MUST accept every CSS property used by the migration 005 seed templates. Round-trip test in certificate.test.ts pins this contract."

3. Modify `src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.ts`. Add an import (group with the other `@/lib/*` imports per CONVENTIONS.md):
```
import { sanitizeTextBlockHtml } from "@/lib/sanitize/text-block";
```

Replace the existing `updateBlock` body (lines 99-120) verbatim with:
```
export async function updateBlock(input: {
  blockId: string;
  lessonId: string;
  content: Record<string, unknown>;
  is_required_for_completion?: boolean;
}): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  // HARDEN-05 / D-A2: dispatch by the stored block_type. Text content goes
  // through sanitize-html on write so the renderer can keep using
  // dangerouslySetInnerHTML without per-request CPU cost.
  const { data: existing } = await supabase
    .from("content_blocks")
    .select("block_type")
    .eq("id", input.blockId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Block not found." };

  let safeContent = input.content;
  if (existing.block_type === "text" && typeof input.content.html === "string") {
    safeContent = {
      ...input.content,
      html: sanitizeTextBlockHtml(input.content.html),
    };
  }

  const patch: Record<string, unknown> = { content: safeContent };
  if (typeof input.is_required_for_completion === "boolean") {
    patch.is_required_for_completion = input.is_required_for_completion;
  }
  const { error } = await supabase
    .from("content_blocks")
    .update(patch)
    .eq("id", input.blockId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/lessons/${input.lessonId}/edit`);
  revalidatePath(`/lessons/${input.lessonId}`);
  return { ok: true };
}
```

Do NOT modify the embed branch — Plan 02-2 owns `iframe_src` https-validation and will extend this same dispatch in its own commit. Do NOT touch any other function in this file.

Run `npm run test src/app/\(dashboard\)/admin/lessons/\[lessonId\]/edit/actions.test.ts` and confirm all 3 cases pass.

4. Create `scripts/backfill-sanitize-html.ts`. Use the `backfillContentBlocks` body from the `<interfaces>` block. Add `backfillCertificateTemplates` mirroring the shape against `body_html`:

```
async function backfillCertificateTemplates() {
  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("certificate_templates")
    .select("id, body_html");
  if (error) throw error;
  let touched = 0;
  for (const row of rows ?? []) {
    const html = (row as { body_html?: string }).body_html;
    if (typeof html !== "string") continue;
    const safe = sanitizeCertificateBodyHtml(html);
    if (safe === html) continue;
    const { error: updErr } = await admin
      .from("certificate_templates")
      .update({ body_html: safe })
      .eq("id", row.id);
    if (updErr) throw updErr;
    touched += 1;
  }
  console.log(`certificate_templates: ${touched} rows sanitized`);
}

async function main() {
  await backfillContentBlocks();
  await backfillCertificateTemplates();
}

main().catch((e) => { console.error(e); process.exit(1); });
```

Header comment:
```
// One-shot backfill for HARDEN-05. Re-sanitizes every text content block
// and every certificate template in place using the same sanitizers wired
// into the admin save path. Idempotent: rows where sanitize(input) === input
// are skipped.
//
// Run manually after deploying the sanitizer change:
//   npx tsx scripts/backfill-sanitize-html.ts
//
// Requires SUPABASE_SERVICE_ROLE_KEY in the runtime env (createAdminClient
// throws otherwise). The script bypasses RLS by design — admin-only by
// virtue of the service role.
```

5. Add the npm script to `package.json` under `"scripts"`:
```
"backfill:sanitize-html": "tsx scripts/backfill-sanitize-html.ts"
```

If `tsx` is not yet a devDependency, install it: `npm install --save-dev tsx`. Per RESEARCH Open Question 2 the alternative is `node --experimental-strip-types` on Node 22+; `tsx` wins on discoverability and is the recommendation.

6. Run the full local gate:
```
npm run verify
```

`npm run verify` is `tsc --noEmit && vitest run && vitest run --config vitest.rtl.config.ts`. All three sub-commands must exit 0. The husky pre-commit hook MUST run end-to-end this commit (no HUSKY=0).

7. Do NOT execute the backfill script in this commit. The script is shipped but not executed; running it is a manual post-deploy step documented in the SUMMARY.

8. Commit. Files: the four new or modified production files plus `package.json` (and `package-lock.json` if `tsx` was added). Message:
```
feat(02-1): HARDEN-05 sanitize text blocks and certificate templates on write

Adds sanitize-html allow-lists for text blocks (strict prose only) and
certificate templates (looser, accepts the inline style properties used
by the 005 seed). updateBlock dispatches by stored block_type and routes
text content through the sanitizer before the Supabase write. Renderer
keeps dangerouslySetInnerHTML per CONTEXT.md D-A2.

Ships scripts/backfill-sanitize-html.ts plus npm run backfill:sanitize-html
for the one-shot post-deploy backfill. Idempotent: rows where the
sanitizer output equals the input are skipped.

Closes the sanitization half of HARDEN-05. Embed sandbox lands in 02-2.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```
  </action>
  <verify>
    <automated>npm run verify 2>&1 | tail -40; grep -c sanitizeTextBlockHtml src/app/\(dashboard\)/admin/lessons/\[lessonId\]/edit/actions.ts; grep -c "Block not found" src/app/\(dashboard\)/admin/lessons/\[lessonId\]/edit/actions.ts; grep -c backfill:sanitize-html package.json; grep -c createAdminClient scripts/backfill-sanitize-html.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c sanitizeTextBlockHtml src/lib/sanitize/text-block.ts` returns at least 1 (the export)
    - `grep -c sanitizeCertificateBodyHtml src/lib/sanitize/certificate.ts` returns at least 1 (the export)
    - `grep -c sanitizeTextBlockHtml src/app/\(dashboard\)/admin/lessons/\[lessonId\]/edit/actions.ts` returns at least 1 (the wire-in)
    - `grep -c "Block not found" src/app/\(dashboard\)/admin/lessons/\[lessonId\]/edit/actions.ts` returns at least 1
    - `grep -c "backfill:sanitize-html" package.json` returns at least 1
    - `grep -c createAdminClient scripts/backfill-sanitize-html.ts` returns at least 1
    - `grep -c sanitizeCertificateBodyHtml scripts/backfill-sanitize-html.ts` returns at least 1
    - `npm run verify` exits 0
    - `npm run test src/lib/sanitize/` reports 19 passed (10 text-block + 9 certificate), 0 failed
    - `npm run test src/app/\(dashboard\)/admin/lessons/\[lessonId\]/edit/actions.test.ts` reports 3 passed, 0 failed
    - `git log -1 --name-only` lists the four production files plus package.json and (if added) package-lock.json — and nothing else
  </acceptance_criteria>
  <done>HARDEN-05 sanitization half closed: write-path sanitizers live, updateBlock dispatches by block_type, backfill script is shipped (manual run post-deploy), all 22 unit cases green under `npm run verify`.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Admin form -> server action | Admin-authored HTML enters the system at the text-block save path; sanitization runs after `requireAdmin()` and before the Supabase write |
| Stored data -> renderer | `content_blocks.content.html` is rendered via `dangerouslySetInnerHTML` (untouched by this plan); the on-write contract is what protects the learner browser |
| Service-role script -> Postgres | The backfill script runs with `SUPABASE_SERVICE_ROLE_KEY` and bypasses RLS by design; admin-only because the secret is admin-only |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation |
|-----------|----------|-----------|-------------|------------|
| T-02-1-01 | Tampering / Information Disclosure | Stored XSS via admin-authored `<script>` in a text block (CONCERNS.md lines 48-52) | mitigate | `sanitizeTextBlockHtml` strips `<script>` (test 1); `disallowedTagsMode: "discard"` is idempotent (test 9); backfill script applies the rule to existing rows |
| T-02-1-02 | Tampering / Information Disclosure | Stored XSS via admin-authored `<script>` or `javascript:` href in a certificate template (CONCERNS.md lines 42-46) | mitigate | `sanitizeCertificateBodyHtml` allow-list rejects `<script>` and `javascript:` schemes; 005 seed round-trip pins the contract; backfill applies on deploy |
| T-02-1-03 | Tampering | `<a href="javascript:...">` reaches the renderer | mitigate | `allowedSchemes: ["http", "https", "mailto"]` plus per-tag override; tests 2 and 3 |
| T-02-1-04 | Information Disclosure | Cross-origin tracking via `<img src="http://attacker.com/...">` in certificate templates | mitigate | `allowedSchemesByTag.img: ["https"]` strips http and data URIs; test 4 |
| T-02-1-05 | Tampering | Backfill silently strips legitimate inline styles from the 005 seed templates and breaks the rendered certificate (Pitfall 8) | mitigate | The 005 seed round-trip tests fail until the allow-list accepts every property the seed uses (including `margin-bottom`); implementation iterates against the failing fixture |
| T-02-1-06 | Tampering | Re-running the backfill produces different output (non-idempotent) | mitigate | `disallowedTagsMode: "discard"` plus the "is idempotent" test cases (text-block 9, certificate 9); the backfill script also no-ops when `sanitize(input) === input` |
| T-02-1-07 | Elevation of Privilege | Backfill script run by a non-admin via leaked service-role key | accept | Out of scope; the service role is already required by `createAdminClient` and is documented as admin-only in `src/lib/supabase/admin.ts`. Same posture as the existing admin-client surface |
| T-02-1-08 | Tampering | Future admin write path (e.g., a certificate-template editor) bypasses the sanitizer | accept | RESEARCH Open Question 5 — no CI grep sentinel; relies on code review and the test inventory rule that any new HTML write action ships its own sanitization unit test. Documented for Phase 4 follow-up |

Residual risk after mitigation: low. Threats 01-06 are actively closed by tests; 07 inherits the service-role posture already in place; 08 is a known follow-up tracked in CONVENTIONS.
</threat_model>

<verification>
- `npm run verify` exits 0 (typecheck + Vitest unit + Vitest RTL)
- `npm run test src/lib/sanitize/` reports 19 passed
- `npm run test src/app/\(dashboard\)/admin/lessons/\[lessonId\]/edit/actions.test.ts` reports 3 passed
- Two distinct commits in `git log`: a `test(02-1):` commit then a `feat(02-1):` commit
- Sanitization wired into `updateBlock`, NOT into the renderer (per CONTEXT.md D-A2)
- Backfill script ships but is not executed in this plan; manual post-deploy run documented in SUMMARY

Out of scope for this plan (handed off):
- Embed `iframe_src` https-only validation and sandbox attribute — Plan 02-2
- Rate limiting on auth paths — Plan 02-3
- Re-sanitize on render (rejected per D-A2)
- Self-service certificate-template editor (no admin UI surface exists today; RESEARCH §1 §2)
</verification>

<success_criteria>
- HARDEN-05 sanitization criterion met: saving a text block containing a `<script>` strips the script before the row is written, AND every existing row in `content_blocks` (text type) and `certificate_templates` is protected by the manual backfill run post-deploy
- Two sanitizers exist as named exports under `src/lib/sanitize/`, each with unit coverage including idempotency
- `updateBlock` reads block_type from the existing row and dispatches to the text sanitizer when applicable
- The 005 seed certificate templates round-trip through `sanitizeCertificateBodyHtml` unchanged (regression-pinned)
- Failing-tests commit precedes implementation commit (TDD per AGENTS.md)
- No em dashes; no bold or Roman numeral headers; "BMH Group" wording preserved
</success_criteria>

<output>
After completion, create `.planning/phases/02-content-safety-and-rate-limiting/02-1-SUMMARY.md` summarising:
- HARDEN-05 sanitization half closed
- Commit shas for the test and impl commits
- Confirmation that `npm run verify` is green
- Note that the backfill script ships unrun and the manual command is `npx tsx scripts/backfill-sanitize-html.ts` against the live project with `SUPABASE_SERVICE_ROLE_KEY` set
- Handoff to Plan 02-2 (embed iframe sandbox + iframe_src https validation extends the same `updateBlock` dispatch)
</output>
</content>
</invoke>