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
describe("Permissions-Policy", () => {
  it("does not deny the microphone, so the role-play iframe can use it", async () => {
    const headerGroups = await nextConfig.headers!();
    const permissionsPolicy = headerGroups
      .flatMap((group) => group.headers)
      .find((header) => header.key === "Permissions-Policy");

    expect(permissionsPolicy).toBeDefined();
    expect(permissionsPolicy!.value).not.toMatch(/(^|[;,\s])microphone\s*=/);
  });

  it("still denies the features we intend to deny", async () => {
    const headerGroups = await nextConfig.headers!();
    const value = headerGroups
      .flatMap((group) => group.headers)
      .find((header) => header.key === "Permissions-Policy")!.value;

    for (const feature of ["camera", "geolocation", "payment", "usb"]) {
      expect(value).toMatch(new RegExp(`${feature}=\\(\\)`));
    }
  });
});
