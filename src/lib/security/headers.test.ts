import { describe, expect, it } from "vitest";

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

  it("still denies the features we intend to deny", async () => {
    const values = await permissionsPolicyValues();
    for (const feature of ["camera", "geolocation", "payment", "usb"]) {
      expect(values.some((value) => new RegExp(`${feature}=\\(\\)`).test(value))).toBe(
        true,
      );
    }
  });
});
