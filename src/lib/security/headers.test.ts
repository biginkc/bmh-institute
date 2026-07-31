import { afterEach, describe, expect, it, vi } from "vitest";

import nextConfig from "../../../next.config";

/**
 * Regression guard for the Closer Lab role-play iframe microphone.
 *
 * `microphone` is deliberately ABSENT from our Permissions-Policy. Per the
 * permissions-policy spec, a feature missing from the declared policy resolves
 * to Enabled, which is what lets the iframe's `allow="microphone"` delegate the
 * mic to the cross-origin Closer Lab child.
 *
 * Adding `microphone=()` — or even `microphone=(self)` — is the single most
 * natural-looking "harden the headers" edit here, and it would silently kill
 * voice practice in Chrome with no warning beyond a NotAllowedError at
 * getUserMedia time. The iframe `allow` attribute can only narrow this policy,
 * never widen it, so it cannot recover the mic.
 *
 * If an explicit directive is ever genuinely required, the only correct value
 * is: microphone=(self "https://<closer-lab-origin>")
 */
async function permissionsPolicyValues(): Promise<string[]> {
  const headerGroups = await nextConfig.headers!();
  // Match case-insensitively and collect EVERY entry, not just the first.
  // Next.js applies the last matching same-key header, so checking only
  // `.find()` would stay green while a later route-specific `microphone=()`
  // silently disabled voice practice.
  return headerGroups
    .flatMap((group) => group.headers)
    .filter((header) => /^permissions-policy$/i.test(header.key))
    .map((header) => String(header.value));
}

describe("Permissions-Policy", () => {
  it("does not deny the microphone in ANY policy entry", async () => {
    const values = await permissionsPolicyValues();
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      expect(value).not.toMatch(/(^|[;,\s])microphone\s*=/i);
    }
  });

  it("does not deny autoplay in ANY policy entry", async () => {
    // The role-play iframe must be able to play the persona's voice. Denying
    // autoplay here kills it exactly like denying microphone kills the mic,
    // and the iframe allow attribute cannot widen it back.
    const values = await permissionsPolicyValues();
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      expect(value).not.toMatch(/(^|[;,\s])autoplay\s*=/i);
    }
  });

  it("still denies the features we intend to deny outright", async () => {
    const values = await permissionsPolicyValues();
    for (const feature of ["geolocation", "payment", "usb"]) {
      // `.some()` alone would pass if ONE Permissions-Policy entry denies the
      // feature while another entry (e.g. a later, more specific route match)
      // widens it — Next.js applies every matching same-key header, not just
      // the first. Require every entry that mentions the feature to deny it
      // exactly, and require at least one entry to mention it at all.
      const matchingValues = values.filter((value) =>
        new RegExp(`(^|[;,\\s])${feature}\\s*=`, "i").test(value),
      );
      expect(matchingValues.length).toBeGreaterThan(0);
      for (const value of matchingValues) {
        expect(value).toMatch(new RegExp(`(^|[;,\\s])${feature}\\s*=\\s*\\(\\s*\\)`, "i"));
      }
    }
  });

  /**
   * Regression guard for the "Talk with Andrea" role-play iframe camera.
   *
   * `camera=()` is an empty allowlist. Per the permissions-policy spec, that
   * disables camera for the top-level document AND every nested iframe,
   * unconditionally overriding the iframe's own `allow="camera"` attribute —
   * exactly what silently forced learners into audio-only recordings while
   * a "baseline browser protections" commit looked correct on its face.
   *
   * The role-play runtime is served from a different origin (Closer Lab), so
   * `camera=(self)` alone is NOT sufficient — a cross-origin frame needs its
   * origin named explicitly: camera=(self "https://lab.bmhgroupkc.com").
   * This must never regress back to a blanket camera=() deny, and must never
   * widen to an open allowlist (`*`) that would hand camera to arbitrary
   * third-party embeds.
   */
  it("allows the camera for the Closer Lab role-play origin only", async () => {
    const values = await permissionsPolicyValues();

    // Every Permissions-Policy value must carry exactly one camera directive.
    for (const value of values) {
      const matches = value.match(/(^|[;,\s])camera\s*=/gi) ?? [];
      expect(matches.length).toBe(1);
    }

    const cameraDirectives = values
      .map((value) => value.match(/(^|[;,\s])camera\s*=\s*\(([^)]*)\)/i)?.[2])
      .filter((v): v is string => v !== undefined);
    expect(cameraDirectives.length).toBeGreaterThan(0);

    for (const directive of cameraDirectives) {
      // Tokenize on whitespace and assert EXACT membership, not substring
      // containment. `.toContain('"https://lab.bmhgroupkc.com"')` would also
      // pass for `camera=(self "https://lab.bmhgroupkc.com" "https://evil.
      // example")` — a widened allowlist that still contains the substring.
      const tokens = directive.trim().split(/\s+/).filter(Boolean);

      // Exactly `self` plus exactly one quoted origin. No wildcard, no `src`,
      // no malformed/unquoted token, and no additional origins.
      expect(tokens.length).toBe(2);
      expect(tokens[0]).toBe("self");
      expect(tokens[1]).toBe('"https://lab.bmhgroupkc.com"');

      for (const token of tokens) {
        expect(token).not.toBe("*");
        expect(token).not.toBe("src");
        expect(token).not.toMatch(/\*/);
      }
    }
  });
});

/**
 * Regression guard for the dev-only Closer Lab camera origins.
 *
 * next.config.ts additionally allows http://localhost:3200 and
 * http://127.0.0.1:3200 for camera, but ONLY when
 * `process.env.NODE_ENV === "development"` — so a learner never sees them,
 * since Next.js production builds run with NODE_ENV=production. That is a
 * runtime fact about how Next.js is built and started, not a property this
 * file can enforce by itself: a config that merely "happens" to read the
 * right env var today gives no guarantee against drift later (e.g. someone
 * loosening the check to `!== "production"`, which fails open instead of
 * closed).
 *
 * These tests pin the guarantee by forcing NODE_ENV explicitly and
 * re-importing next.config fresh for each value, so the assertion holds
 * regardless of whatever NODE_ENV happens to be ambient when the suite
 * runs, and regardless of build path.
 */
describe("Permissions-Policy camera dev-origin gate is NODE_ENV-provable", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function permissionsPolicyValuesForEnv(nodeEnv: string): Promise<string[]> {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", nodeEnv);
    const mod = await import("../../../next.config");
    const headerGroups = await mod.default.headers!();
    return headerGroups
      .flatMap((group) => group.headers)
      .filter((header) => /^permissions-policy$/i.test(header.key))
      .map((header) => String(header.value));
  }

  function cameraDirectivesOf(values: string[]): string[] {
    return values
      .map((value) => value.match(/(^|[;,\s])camera\s*=\s*\(([^)]*)\)/i)?.[2])
      .filter((v): v is string => v !== undefined);
  }

  it("grants camera to exactly the single Closer Lab origin under NODE_ENV=production", async () => {
    const values = await permissionsPolicyValuesForEnv("production");
    const cameraDirectives = cameraDirectivesOf(values);
    expect(cameraDirectives.length).toBeGreaterThan(0);
    for (const directive of cameraDirectives) {
      const tokens = directive.trim().split(/\s+/).filter(Boolean);
      expect(tokens).toEqual(["self", '"https://lab.bmhgroupkc.com"']);
    }
  });

  it("never leaks the localhost dev origins outside NODE_ENV=development", async () => {
    for (const nodeEnv of ["production", "test", "staging"]) {
      const values = await permissionsPolicyValuesForEnv(nodeEnv);
      for (const value of values) {
        expect(value).not.toMatch(/localhost:3200|127\.0\.0\.1:3200/);
      }
    }
  });

  it("adds the local Closer Lab dev origins only under NODE_ENV=development", async () => {
    const values = await permissionsPolicyValuesForEnv("development");
    const cameraDirectives = cameraDirectivesOf(values);
    expect(cameraDirectives.length).toBeGreaterThan(0);
    for (const directive of cameraDirectives) {
      // Exact token equality, not containment — `.toContain(...)` alone
      // would still pass if a future edit appended an arbitrary extra
      // development origin alongside the two intended ones. Pin the full
      // set: self, the production Closer Lab origin, and exactly the two
      // intended localhost origins, in the order next.config.ts builds them.
      const tokens = directive.trim().split(/\s+/).filter(Boolean);
      expect(tokens).toEqual([
        "self",
        '"https://lab.bmhgroupkc.com"',
        '"http://localhost:3200"',
        '"http://127.0.0.1:3200"',
      ]);
    }
  });
});
