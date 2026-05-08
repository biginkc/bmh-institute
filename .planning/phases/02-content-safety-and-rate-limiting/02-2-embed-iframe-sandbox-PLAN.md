---
phase: 02-content-safety-and-rate-limiting
plan: 2
type: execute
wave: 2
depends_on:
  - 02-1
files_modified:
  - src/components/content-blocks.tsx
  - src/components/content-blocks.test.tsx
  - src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.ts
  - src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.test.ts
  - src/app/(dashboard)/admin/lessons/[lessonId]/edit/blocks-editor.tsx
autonomous: true
requirements:
  - HARDEN-05
must_haves:
  truths:
    - The embed-block iframe renders with sandbox set to the locked CONTEXT.md D-B1 string and no other value
    - The video-block iframe is NOT modified (D-B2 explicit non-goal)
    - updateBlock rejects an embed save when iframe_src does not start with https after trimming whitespace (D-B3)
    - updateBlock trims whitespace from iframe_src on a valid https save (D-B3)
    - updateBlock dispatch order is preserved from Plan 02-1 — text branch unchanged, embed branch added below it
    - blocks-editor displays an admin-trusted helper note under the iframe src input (D-B3)
    - The Plan 02-1 sanitization branch in updateBlock continues to work (text sanitizer test passes)
    - Failing tests land in their own commit before the implementation commit (AGENTS.md)
  artifacts:
    - path: src/components/content-blocks.tsx
      provides: EmbedBlock iframe with sandbox attribute set to allow-scripts allow-same-origin allow-forms allow-presentation
      contains: sandbox
    - path: src/components/content-blocks.test.tsx
      provides: RTL suite asserting the sandbox attribute value and the empty-src no-render branch
    - path: src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.ts
      provides: updateBlock embed branch validating iframe_src https scheme and trimming whitespace
      contains: https://
    - path: src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.test.ts
      provides: Vitest unit cases for the embed branch (https accepted, http rejected, javascript scheme rejected, whitespace trimmed)
    - path: src/app/(dashboard)/admin/lessons/[lessonId]/edit/blocks-editor.tsx
      provides: Admin-trusted helper note rendered below the iframe src input
      contains: admin-trusted
  key_links:
    - from: src/components/content-blocks.tsx
      to: rendered DOM iframe
      via: sandbox prop on the iframe JSX element inside EmbedBlock
      pattern: sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
    - from: src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.ts
      to: src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.test.ts
      via: updateBlock dispatch is now: text -> sanitize, embed -> https check + trim
      pattern: iframe_src
    - from: src/app/(dashboard)/admin/lessons/[lessonId]/edit/blocks-editor.tsx
      to: rendered helper text
      via: muted-foreground p tag below the Iframe src Input
      pattern: admin-trusted
---

<objective>
Close the HARDEN-05 iframe half. Set the locked sandbox attribute on the EmbedBlock iframe (D-B1), enforce https scheme on iframe_src in the updateBlock embed branch (D-B3), and add a short admin-trusted helper note below the iframe src input in blocks-editor (D-B3). Plan 02-1 already extended updateBlock to dispatch by stored block_type for the text branch; this plan adds the embed branch directly underneath it without touching the text branch.

Purpose: Today src/components/content-blocks.tsx lines 445-465 renders embed iframes with no sandbox attribute, so an admin who pastes a hostile or compromised iframe_src can trigger top-level navigation, popups, or unscoped script execution in the learner's browser (CONCERNS.md lines 36-40). HARDEN-05 names the embed-block iframe explicitly. The fix is two parts: a static sandbox attribute on the rendered iframe (defense in depth) and an https-only scheme check at the admin save boundary (defense in depth at write time).

Output:
- src/components/content-blocks.tsx EmbedBlock body gains sandbox="allow-scripts allow-same-origin allow-forms allow-presentation" with an inline comment documenting Pitfall 4 (cross-origin requirement)
- src/components/content-blocks.test.tsx is a NEW RTL test file asserting the attribute is set on the rendered iframe
- src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.ts updateBlock dispatch grows an embed branch below the existing text branch
- src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.test.ts gains four embed-branch cases alongside the three text cases from Plan 02-1
- src/app/(dashboard)/admin/lessons/[lessonId]/edit/blocks-editor.tsx gets a single muted-foreground p tag below the Iframe src input
- Two commits: failing tests, then implementation
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
@.planning/phases/02-content-safety-and-rate-limiting/02-1-sanitize-html-policy-PLAN.md
@.planning/codebase/CONVENTIONS.md
@.planning/codebase/TESTING.md
@AGENTS.md
@src/components/content-blocks.tsx
@src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.ts
@src/app/(dashboard)/admin/lessons/[lessonId]/edit/blocks-editor.tsx
@src/app/(dashboard)/certificates/print-button.test.tsx

<interfaces>
Existing EmbedBlock body that this plan modifies (src/components/content-blocks.tsx:445-465):
```
function EmbedBlock({ src, aspect }: { src: string; aspect: string }) {
  if (!src || src === "https://") {
    return (
      <div className="border-border bg-muted/40 text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm">
        Embed URL not set.
      </div>
    );
  }
  const aspectClass = EMBED_ASPECT_CLASS[aspect] ?? "aspect-video";
  return (
    <div className={cn(aspectClass, "overflow-hidden rounded-md border")}>
      <iframe
        src={src}
        title="Embedded content"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="h-full w-full"
      />
    </div>
  );
}
```

Locked sandbox attribute value (CONTEXT.md D-B1, copy verbatim — do NOT vary the order or whitespace):
```
allow-scripts allow-same-origin allow-forms allow-presentation
```

Existing iframe src input in blocks-editor.tsx around line 833 that this plan extends:
```
<div className="flex flex-col gap-1.5">
  <Label htmlFor={`src-${block.id}`}>Iframe src</Label>
  <Input
    id={`src-${block.id}`}
    value={src}
    onChange={(e) => setSrc(e.target.value)}
    placeholder="https://www.loom.com/embed/..."
  />
</div>
```

The shape of updateBlock AFTER Plan 02-1 lands (text branch). This plan adds the embed branch below the text branch:
```
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
```

The embed branch this plan adds (per CONTEXT.md D-B3 and PATTERNS analog):
```
} else if (existing.block_type === "embed" && typeof input.content.iframe_src === "string") {
  const src = input.content.iframe_src.trim();
  if (!src.startsWith("https://")) {
    return { ok: false, error: "Embed URL must start with https://" };
  }
  safeContent = { ...input.content, iframe_src: src };
}
```

Pitfall 4 inline comment text (RESEARCH §Common Pitfalls §4) to attach above the sandbox attribute:
```
{/* HARDEN-05 / D-B1: sandbox is effective because all supported embed
    sources (Loom, Notion, Google Docs) are cross-origin from
    university.bmhgroup.com. Same-origin frames could call
    frameElement.removeAttribute("sandbox"); BMH does not host any
    iframable surfaces under its own origin. See 02-RESEARCH.md
    Common Pitfall 4. */}
```

Admin-trusted helper text (CONTEXT.md D-B3) to render below the input:
```
<p className="text-muted-foreground text-xs">
  Admin-trusted: must start with https. The iframe is rendered with a
  sandbox attribute that blocks top-level navigation.
</p>
```

RTL test fixture shape (analog: src/app/(dashboard)/certificates/print-button.test.tsx):
```
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ContentBlockRenderer } from "./content-blocks";

describe("EmbedBlock sandbox attribute (HARDEN-05)", () => {
  it("renders the iframe with the locked sandbox flag set", () => {
    const { container } = render(
      <ContentBlockRenderer
        block={{
          id: "x",
          block_type: "embed",
          content: { iframe_src: "https://www.loom.com/embed/abc", aspect_ratio: "16:9" },
          sort_order: 0,
          is_required_for_completion: false,
        }}
      />,
    );
    const iframe = container.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe!.getAttribute("sandbox")).toBe(
      "allow-scripts allow-same-origin allow-forms allow-presentation",
    );
  });
});
```
</interfaces>
</context>

<test_inventory>
Per AGENTS.md the test inventory is enumerated and reviewable BEFORE any tests or code are written. Files, scope, and assertions:

File A: `src/components/content-blocks.test.tsx` (NEW; Vitest RTL, runs in `npm run test:rtl`)

`describe("EmbedBlock sandbox attribute (HARDEN-05)")`:
1. `it("renders the iframe with the locked sandbox flag set when iframe_src is a valid https URL")` — renders ContentBlockRenderer with block_type embed and iframe_src https://www.loom.com/embed/abc, asserts `iframe.getAttribute("sandbox")` equals exactly `allow-scripts allow-same-origin allow-forms allow-presentation`. Pivot test against accidental drift in the attribute value.
2. `it("renders the placeholder when iframe_src is empty")` — iframe_src is the empty string; the EmbedBlock early-returns the placeholder, so `container.querySelector("iframe")` is null.
3. `it("renders the placeholder when iframe_src is the default sentinel https://")` — default content from DEFAULT_CONTENT in actions.ts is `https://`; EmbedBlock treats this as unset; assert no iframe rendered.
4. `it("preserves the existing allow attribute alongside sandbox")` — assert `iframe.getAttribute("allow")` still includes accelerometer, autoplay, clipboard-write so the new attribute does not displace the existing one.

Four `it` cases. No mocks needed; EmbedBlock is a leaf component.

File B: `src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.test.ts` (MODIFY — extend the existing file from Plan 02-1; do NOT replace the text-branch describe block)

Add a new `describe("updateBlock embed branch (HARDEN-05)")` alongside the Plan 02-1 `describe("updateBlock sanitization (HARDEN-05)")`:
1. `it("accepts a valid https iframe_src and writes the trimmed value")` — blockTypeRow is `{ block_type: "embed" }`. Call with `content: { iframe_src: "  https://www.loom.com/embed/abc  ", aspect_ratio: "16:9" }`. Expect `{ ok: true }`. Assert the captured patch.content.iframe_src equals `https://www.loom.com/embed/abc` (trimmed) AND aspect_ratio is preserved.
2. `it("rejects an http:// iframe_src with a clear error and does NOT call update")` — content `{ iframe_src: "http://example.com" }`. Expect `{ ok: false, error: "Embed URL must start with https://" }`. Assert `updatePatch` is null.
3. `it("rejects a javascript: iframe_src")` — content `{ iframe_src: "javascript:alert(1)" }`. Expect the same error. Assert `updatePatch` is null.
4. `it("rejects a protocol-relative //example.com iframe_src")` — content `{ iframe_src: "//example.com/foo" }`. Expect the same error.
5. `it("does not run the embed branch when block_type is text — text sanitizer still wins")` — Regression for plan-disjointness. blockTypeRow `{ block_type: "text" }`. Call with `content: { html: "<p>hi</p>", iframe_src: "http://danger" }` (improbable but proves the dispatch). Expect `{ ok: true }` and the captured patch.content.html sanitized to `<p>hi</p>`, AND patch.content.iframe_src remains `http://danger` (text branch does not touch iframe_src).

Five new `it` cases inside the existing actions.test.ts. The Plan 02-1 three text-branch cases are preserved verbatim. Total cases in this file after the plan: 8.

Total Plan 02-2 inventory: 9 new test cases (4 RTL + 5 unit). Failing tests land in commit 1; implementation in commit 2.
</test_inventory>

<tasks>

<task type="auto">
  <name>Task 1: Write failing RTL and unit cases for sandbox + embed-branch dispatch, single commit</name>
  <files>
    - src/components/content-blocks.test.tsx
    - src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.test.ts
  </files>
  <read_first>
    - .planning/phases/02-content-safety-and-rate-limiting/02-CONTEXT.md (D-B1, D-B2, D-B3)
    - .planning/phases/02-content-safety-and-rate-limiting/02-RESEARCH.md (Code Examples 4, Common Pitfall 4, Pattern 3)
    - .planning/phases/02-content-safety-and-rate-limiting/02-PATTERNS.md (sections for content-blocks.tsx EmbedBlock MODIFY, content-blocks.test.tsx NEW, the updateBlock MODIFY analog, and blocks-editor.tsx MODIFY)
    - .planning/phases/02-content-safety-and-rate-limiting/02-1-sanitize-html-policy-PLAN.md (the text-branch dispatch shape this plan extends; the existing actions.test.ts file from Plan 02-1)
    - src/components/content-blocks.tsx (EmbedBlock body at lines 445-465 and the dispatch at lines 98-104)
    - src/app/(dashboard)/certificates/print-button.test.tsx (RTL exemplar for harness shape)
    - src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.ts (the updateBlock function being extended)
    - .planning/codebase/CONVENTIONS.md (server-action discriminated union; named export only)
    - AGENTS.md (TDD with up-front inventory; failing tests in their own commit; no em dashes)
  </read_first>
  <action>
1. Verify Plan 02-1 has merged before starting. Run:
```
git log --oneline -5
ls src/lib/sanitize/text-block.ts src/lib/sanitize/certificate.ts src/app/\(dashboard\)/admin/lessons/\[lessonId\]/edit/actions.test.ts
```
The three files must exist. If any is missing, stop and surface to the operator — Plan 02-2 depends on Plan 02-1 (`depends_on: [02-1]`).

2. Create `src/components/content-blocks.test.tsx`. Use the harness from src/app/(dashboard)/certificates/print-button.test.tsx as the import + describe shape. Header:
```
// HARDEN-05: EmbedBlock sandbox regression (CONTEXT.md D-B1).
// Locks the exact sandbox attribute value so a future refactor cannot
// silently weaken it. Pitfall 4 (cross-origin requirement) is documented
// inline in the EmbedBlock source.
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ContentBlockRenderer } from "./content-blocks";
```

Per-case bodies use `container.querySelector("iframe")` and `getAttribute` rather than role queries so the assertion is unambiguous about attribute identity.

For test 1 use the verbatim sandbox string from CONTEXT.md D-B1: `allow-scripts allow-same-origin allow-forms allow-presentation`. Do NOT vary the order, do NOT use array compare, do NOT split on whitespace — the assertion is `toBe()` against the literal.

For test 4 (allow attribute preservation) the existing string in EmbedBlock is `accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture`. Use `toContain("accelerometer")` to keep the test resilient to future appends to the allow list while still proving non-displacement.

3. Modify `src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.test.ts` to ADD a new `describe("updateBlock embed branch (HARDEN-05)")` block alongside the existing `describe("updateBlock sanitization (HARDEN-05)")` block from Plan 02-1. Do NOT touch the existing describe block, the existing mocks, the existing beforeEach/afterEach, or the existing imports.

The existing mock skeleton from Plan 02-1 already exposes `blockTypeRow`, `updatePatch`, and `updateError` module-scoped vars and the `from("content_blocks")` mock supports both the select-then-maybeSingle path and the update-then-eq path. Reuse it verbatim.

Add the new describe block at the bottom of the file:
```
describe("updateBlock embed branch (HARDEN-05)", () => {
  beforeEach(() => {
    blockTypeRow = null;
    updatePatch = null;
    updateError = null;
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("accepts a valid https iframe_src and writes the trimmed value", async () => {
    blockTypeRow = { block_type: "embed" };
    const result = await updateBlock({
      blockId: "b1",
      lessonId: "l1",
      content: { iframe_src: "  https://www.loom.com/embed/abc  ", aspect_ratio: "16:9" },
    });
    expect(result).toEqual({ ok: true });
    const patched = updatePatch?.content as { iframe_src?: string; aspect_ratio?: string } | undefined;
    expect(patched?.iframe_src).toBe("https://www.loom.com/embed/abc");
    expect(patched?.aspect_ratio).toBe("16:9");
  });

  it("rejects an http:// iframe_src with a clear error and does NOT call update", async () => {
    blockTypeRow = { block_type: "embed" };
    const result = await updateBlock({
      blockId: "b1",
      lessonId: "l1",
      content: { iframe_src: "http://example.com" },
    });
    expect(result).toEqual({ ok: false, error: "Embed URL must start with https://" });
    expect(updatePatch).toBeNull();
  });

  it("rejects a javascript: iframe_src", async () => {
    blockTypeRow = { block_type: "embed" };
    const result = await updateBlock({
      blockId: "b1",
      lessonId: "l1",
      content: { iframe_src: "javascript:alert(1)" },
    });
    expect(result).toEqual({ ok: false, error: "Embed URL must start with https://" });
    expect(updatePatch).toBeNull();
  });

  it("rejects a protocol-relative iframe_src starting with //", async () => {
    blockTypeRow = { block_type: "embed" };
    const result = await updateBlock({
      blockId: "b1",
      lessonId: "l1",
      content: { iframe_src: "//example.com/foo" },
    });
    expect(result).toEqual({ ok: false, error: "Embed URL must start with https://" });
    expect(updatePatch).toBeNull();
  });

  it("does not run the embed branch when block_type is text — text sanitizer still wins", async () => {
    blockTypeRow = { block_type: "text" };
    const result = await updateBlock({
      blockId: "b1",
      lessonId: "l1",
      content: { html: "<p>hi</p>", iframe_src: "http://danger" },
    });
    expect(result).toEqual({ ok: true });
    const patched = updatePatch?.content as { html?: string; iframe_src?: string } | undefined;
    expect(patched?.html).toBe("<p>hi</p>");
    expect(patched?.iframe_src).toBe("http://danger");
  });
});
```

4. Verify the red state. Two runners gate this commit:
```
npm run test:rtl 2>&1 | tail -25
npm run test src/app/\(dashboard\)/admin/lessons/\[lessonId\]/edit/actions.test.ts 2>&1 | tail -25
```
The four new RTL cases MUST fail (the EmbedBlock has no sandbox attribute yet). The five new unit cases MUST fail (updateBlock has no embed branch yet).

5. The existing Plan 02-1 commit pattern landed the failing-tests commit with HUSKY=0 only because the harness was not installed. Plan 02-1 has now installed sanitize-html and shipped the sanitizers, so `npm run verify` passes for the text-branch tests. The failing RTL + embed-branch unit tests in this commit will fail under the husky pre-commit hook. Land this commit with `HUSKY=0` per AGENTS.md TDD precedent — failing tests in their own commit before implementation. The implementation commit (Task 2) runs the hook end-to-end.

6. Stage and commit. Files: `src/components/content-blocks.test.tsx`, `src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.test.ts`. No production code changes. Commit message:
```
test(02-2): HARDEN-05 failing inventory for embed iframe sandbox

Four RTL cases pinning the sandbox attribute value on EmbedBlock plus
five unit cases for the updateBlock embed branch (https accepted with
trim, http rejected, javascript scheme rejected, protocol-relative
rejected, text branch unaffected). Implementation lands in the next
commit.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```
  </action>
  <verify>
    <automated>npm run test:rtl 2>&1 | tail -20; npm run test src/app/\(dashboard\)/admin/lessons/\[lessonId\]/edit/actions.test.ts 2>&1 | tail -20; ls src/components/content-blocks.test.tsx; grep -v '^//' src/components/content-blocks.test.tsx | grep -c 'allow-scripts allow-same-origin allow-forms allow-presentation'</automated>
  </verify>
  <acceptance_criteria>
    - File `src/components/content-blocks.test.tsx` exists
    - `grep -v '^//' src/components/content-blocks.test.tsx | grep -c 'allow-scripts allow-same-origin allow-forms allow-presentation'` returns at least 1
    - `grep -c 'updateBlock embed branch' src/app/\(dashboard\)/admin/lessons/\[lessonId\]/edit/actions.test.ts` returns at least 1
    - `grep -c 'Embed URL must start with https://' src/app/\(dashboard\)/admin/lessons/\[lessonId\]/edit/actions.test.ts` returns at least 1
    - `grep -c 'iframe_src' src/app/\(dashboard\)/admin/lessons/\[lessonId\]/edit/actions.test.ts` returns at least 4
    - `git log -1 --name-only` lists exactly: `src/components/content-blocks.test.tsx`, `src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.test.ts`. No production code.
    - Commit message starts with `test(02-2):`
    - The new RTL cases fail when run (sandbox attribute not yet set)
    - The new unit cases fail when run (embed branch not yet implemented)
  </acceptance_criteria>
  <done>Failing-tests commit landed; nine new cases red against unmodified production code.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement sandbox attribute, embed-branch dispatch, and admin-trusted helper note</name>
  <files>
    - src/components/content-blocks.tsx
    - src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.ts
    - src/app/(dashboard)/admin/lessons/[lessonId]/edit/blocks-editor.tsx
  </files>
  <read_first>
    - src/components/content-blocks.test.tsx (the contract being implemented against)
    - src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.test.ts (the contract for the embed branch and the regression for the text branch)
    - .planning/phases/02-content-safety-and-rate-limiting/02-RESEARCH.md (Pattern 3 for the iframe sandbox prop, Pattern 1 for the dispatch shape, Common Pitfall 4 for the inline comment)
    - .planning/phases/02-content-safety-and-rate-limiting/02-PATTERNS.md (sections: content-blocks.tsx MODIFY, the updateBlock MODIFY analog, blocks-editor.tsx MODIFY)
    - .planning/phases/02-content-safety-and-rate-limiting/02-CONTEXT.md (D-B1, D-B2, D-B3)
    - src/components/content-blocks.tsx (only EmbedBlock at lines 445-465 is modified; VideoBlock at lines 388-401 is NOT modified per D-B2)
    - src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.ts (the updateBlock body that Plan 02-1 left with a text branch; this plan adds the embed branch directly below it)
    - src/app/(dashboard)/admin/lessons/[lessonId]/edit/blocks-editor.tsx lines 820-866 (the embed editor section that grows the helper note)
    - .planning/codebase/CONVENTIONS.md ("Module Design": named exports only; helper-text style is inline `<p className="text-muted-foreground text-xs">`)
    - AGENTS.md (writing style: no em dashes; "BMH Group" not "BMH Group KC"; minimal commas)
  </read_first>
  <behavior>
    - All 9 new failing tests from Task 1 pass
    - The 3 text-branch tests from Plan 02-1 STILL pass (no regression)
    - `npm run verify` exits 0 (typecheck + Vitest unit + Vitest RTL)
    - The husky pre-commit hook runs end-to-end (no HUSKY=0)
    - VideoBlock at lines 388-401 is unchanged (D-B2)
  </behavior>
  <action>
1. Modify `src/components/content-blocks.tsx`. Locate the EmbedBlock function at lines 445-465. Add ONE attribute to the iframe JSX, with the inline comment from the `<interfaces>` block immediately above it. The exact change to lines 456-462:

Before:
```
<iframe
  src={src}
  title="Embedded content"
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
  allowFullScreen
  className="h-full w-full"
/>
```

After:
```
{/* HARDEN-05 / D-B1: sandbox is effective because all supported embed
    sources (Loom, Notion, Google Docs) are cross-origin from
    university.bmhgroup.com. Same-origin frames could call
    frameElement.removeAttribute("sandbox"); BMH does not host any
    iframable surfaces under its own origin. See 02-RESEARCH.md
    Common Pitfall 4. */}
<iframe
  src={src}
  title="Embedded content"
  sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
  allowFullScreen
  className="h-full w-full"
/>
```

The sandbox value MUST be the literal string above. Do NOT compute it, do NOT join an array, do NOT alphabetize the tokens. The RTL test asserts `toBe()` against the exact string.

Do NOT modify VideoBlock at lines 388-401 (D-B2 explicit non-goal). Do NOT modify any other block type.

2. Run the RTL suite to confirm green:
```
npm run test:rtl src/components/content-blocks.test.tsx 2>&1 | tail -20
```
All 4 cases must pass. If a case fails, the most likely cause is an attribute drift in the literal string — fix the source, never the test.

3. Modify `src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.ts`. Locate the updateBlock body that Plan 02-1 left with a text branch only. Find the closing brace of the `if (existing.block_type === "text"...)` block. Add the embed branch immediately after it, BEFORE the `const patch` line. The full dispatch after this plan:

```
let safeContent = input.content;
if (existing.block_type === "text" && typeof input.content.html === "string") {
  safeContent = {
    ...input.content,
    html: sanitizeTextBlockHtml(input.content.html),
  };
} else if (existing.block_type === "embed" && typeof input.content.iframe_src === "string") {
  // HARDEN-05 / D-B3: scheme allow-list at the write boundary. The
  // sandbox attribute on the rendered iframe is the runtime defense;
  // this is the authoring-time defense.
  const src = input.content.iframe_src.trim();
  if (!src.startsWith("https://")) {
    return { ok: false, error: "Embed URL must start with https://" };
  }
  safeContent = { ...input.content, iframe_src: src };
}
```

Do NOT touch the text branch above. Do NOT touch the `const patch` line below or the rest of the function. Do NOT add any other branches (callout, video, image, etc) — they are out of scope for HARDEN-05.

4. Run the actions unit suite. Both the existing 3 text-branch cases and the new 5 embed-branch cases must pass:
```
npm run test src/app/\(dashboard\)/admin/lessons/\[lessonId\]/edit/actions.test.ts 2>&1 | tail -25
```
Expect 8 passed, 0 failed.

5. Modify `src/app/(dashboard)/admin/lessons/[lessonId]/edit/blocks-editor.tsx`. Locate the embed editor section around line 832. The existing div containing the Iframe src Label and Input ends at line 840. Add a new sibling p tag immediately after the closing `</div>` of the input wrapper, BEFORE the aspect-ratio div at line 841:

```
<p className="text-muted-foreground text-xs">
  Admin-trusted: must start with https. The iframe is rendered with a
  sandbox attribute that blocks top-level navigation.
</p>
```

The exact placement: between the closing `</div>` of the iframe-src wrapper (line 840) and the opening `<div className="flex flex-col gap-1.5">` of the aspect-ratio wrapper (line 841).

No new imports needed. The `<p>` tag uses Tailwind utilities already in use elsewhere in the file (`text-muted-foreground`, `text-xs`).

Per AGENTS.md writing style: no em dashes (use a colon as in the copy above), minimal commas, "BMH Group" not "BMH Group KC". The phrase "Admin-trusted" uses a hyphen (compound modifier) and is fine.

6. Run the full local gate:
```
npm run verify
```
`npm run verify` is `tsc --noEmit && vitest run && vitest run --config vitest.rtl.config.ts`. All three sub-commands must exit 0. The husky pre-commit hook MUST run end-to-end this commit (no HUSKY=0).

7. Commit. Files: the three production files. Message:
```
feat(02-2): HARDEN-05 sandbox embed iframes and validate iframe_src on save

EmbedBlock renders the iframe with sandbox="allow-scripts allow-same-origin
allow-forms allow-presentation" per CONTEXT.md D-B1. updateBlock dispatch
grows an embed branch alongside the text-block sanitizer from 02-1: the
embed branch trims iframe_src whitespace and rejects anything that does
not start with https. blocks-editor adds an admin-trusted helper note
under the input. VideoBlock is intentionally untouched (D-B2).

Closes the iframe half of HARDEN-05.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```
  </action>
  <verify>
    <automated>npm run verify 2>&1 | tail -40; grep -c 'allow-scripts allow-same-origin allow-forms allow-presentation' src/components/content-blocks.tsx; grep -c 'Embed URL must start with https://' src/app/\(dashboard\)/admin/lessons/\[lessonId\]/edit/actions.ts; grep -c 'admin-trusted' src/app/\(dashboard\)/admin/lessons/\[lessonId\]/edit/blocks-editor.tsx; grep -c 'iframe_src.trim' src/app/\(dashboard\)/admin/lessons/\[lessonId\]/edit/actions.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'allow-scripts allow-same-origin allow-forms allow-presentation' src/components/content-blocks.tsx` returns at least 1 (the rendered attribute)
    - `grep -c 'sandbox=' src/components/content-blocks.tsx` returns exactly 1 (NOT applied to VideoBlock — D-B2)
    - `grep -c 'Embed URL must start with https://' src/app/\(dashboard\)/admin/lessons/\[lessonId\]/edit/actions.ts` returns at least 1
    - `grep -c 'iframe_src.trim' src/app/\(dashboard\)/admin/lessons/\[lessonId\]/edit/actions.ts` returns at least 1
    - `grep -ci 'admin-trusted' src/app/\(dashboard\)/admin/lessons/\[lessonId\]/edit/blocks-editor.tsx` returns at least 1
    - `npm run verify` exits 0
    - `npm run test:rtl src/components/content-blocks.test.tsx` reports 4 passed, 0 failed
    - `npm run test src/app/\(dashboard\)/admin/lessons/\[lessonId\]/edit/actions.test.ts` reports 8 passed, 0 failed (3 text + 5 embed)
    - `git log -1 --name-only` lists exactly: `src/components/content-blocks.tsx`, `src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.ts`, `src/app/(dashboard)/admin/lessons/[lessonId]/edit/blocks-editor.tsx`. Nothing else.
    - VideoBlock body at lines 388-401 unchanged (no sandbox attribute on the YouTube/Vimeo iframe)
    - Commit message starts with `feat(02-2):`
  </acceptance_criteria>
  <done>HARDEN-05 iframe half closed: sandbox attribute on rendered iframe, https-scheme validation at the write boundary, admin-trusted helper note in the editor, and the Plan 02-1 text-branch sanitization still passes its regressions.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Admin form -> server action | Admin-authored iframe_src enters the system at the embed save path; the https scheme check runs after `requireAdmin()` and before the Supabase write |
| Stored iframe_src -> rendered iframe | content_blocks.content.iframe_src is rendered into the DOM by EmbedBlock; the sandbox attribute is the runtime defense |
| Iframed content -> learner browser | The third-party iframe content runs in the learner's browser; sandbox flags constrain what it can do |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation |
|-----------|----------|-----------|-------------|------------|
| T-02-2-01 | Tampering / Spoofing | Iframe-based clickjacking via embed (CONCERNS.md lines 36-40) | mitigate | sandbox attribute set to allow-scripts allow-same-origin allow-forms allow-presentation prevents top-level navigation and (by default) popups; RTL test 1 pins the attribute value verbatim |
| T-02-2-02 | Tampering | Top-level navigation hijack via window.top.location from inside the embed | mitigate | sandbox attribute does not include allow-top-navigation; the omission is what blocks the hijack |
| T-02-2-03 | Tampering | http:// or javascript: iframe_src reaches the renderer | mitigate | updateBlock embed branch rejects any scheme other than https on save; unit tests 2, 3, 4 cover http, javascript, protocol-relative |
| T-02-2-04 | Spoofing | Whitespace-padded iframe_src bypasses the scheme check | mitigate | iframe_src is trimmed before the startsWith check; unit test 1 asserts the trim |
| T-02-2-05 | Tampering | Same-origin embed (e.g., a self-hosted dashboard at university.bmhgroup.com/foo) escapes the sandbox via frameElement.removeAttribute (RESEARCH Pitfall 4) | accept | BMH does not host any iframable surfaces under its own origin (Assumption A2 in 02-RESEARCH.md). If a future plan adds one, the sandbox attribute alone is insufficient and a host allowlist must be added. Inline comment in EmbedBlock documents this constraint |
| T-02-2-06 | Information Disclosure | Cross-origin tracking via embed source loading third-party scripts | accept | Embed authoring is admin-only and the admin chooses the source; learners trust admins. Beyond Phase 2 scope |
| T-02-2-07 | Tampering | Plan 02-1's text-branch dispatch regresses when this plan extends updateBlock | mitigate | The embed branch is added with `else if` directly below the text branch; unit test 5 (text branch wins for block_type text) is the regression pin |
| T-02-2-08 | Tampering | Future write path for embed (e.g., a bulk import) bypasses the scheme check | accept | Same posture as T-02-1-08 in Plan 02-1; relies on code review and the test inventory rule that any new HTML write action ships its own scheme check |

Residual risk after mitigation: low. T-02-2-01..04 and T-02-2-07 are actively closed by tests; T-02-2-05, T-02-2-06, T-02-2-08 inherit explicit Phase 2 scope decisions and are documented in code or in Phase 2 references.
</threat_model>

<verification>
- `npm run verify` exits 0 (typecheck + Vitest unit + Vitest RTL)
- `npm run test:rtl src/components/content-blocks.test.tsx` reports 4 passed
- `npm run test src/app/\(dashboard\)/admin/lessons/\[lessonId\]/edit/actions.test.ts` reports 8 passed (3 text from Plan 02-1 + 5 embed from this plan)
- `grep -c 'sandbox=' src/components/content-blocks.tsx` returns exactly 1 (EmbedBlock only; VideoBlock unchanged per D-B2)
- Two distinct commits in `git log`: a `test(02-2):` commit then a `feat(02-2):` commit
- Plan 02-1 sanitization still works (no regression)

Out of scope for this plan (handed off):
- Sanitization of HTML content — Plan 02-1 already shipped
- Rate limiting on auth paths — Plan 02-3
- Sandboxing the video-block iframe (D-B2 explicit deferral)
- Host allowlist on iframe_src (D-B3 explicit deferral; Pitfall 4 documents the constraint)
</verification>

<success_criteria>
- HARDEN-05 iframe criterion met: an embed-block iframe renders with a sandbox attribute that prevents top-level navigation and unscoped script execution
- Saving an embed block with a non-https iframe_src is rejected before reaching Supabase
- Saving an embed block with a whitespace-padded https URL trims and persists the trimmed form
- The Plan 02-1 sanitization branch is preserved and continues to pass its three regression cases
- Failing-tests commit precedes implementation commit (TDD per AGENTS.md)
- VideoBlock untouched (D-B2)
- No em dashes; no bold or Roman numeral headers; "BMH Group" wording preserved
</success_criteria>

<output>
After completion, create `.planning/phases/02-content-safety-and-rate-limiting/02-2-SUMMARY.md` summarising:
- HARDEN-05 iframe half closed
- Commit shas for the test and impl commits
- Confirmation that `npm run verify` is green
- The exact sandbox attribute string set on EmbedBlock
- Confirmation that the Plan 02-1 text-branch sanitization regression cases still pass
- Handoff to Plan 02-3 (rate limiting) — file-disjoint from this plan; no shared imports
</output>
</content>
</invoke>