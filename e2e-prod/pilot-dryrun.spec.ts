import { test } from "@playwright/test";

test.describe("manual production pilot dry run", () => {
  test.skip(
    true,
    "Manual Chrome gate: use real Hugo-authenticated admin and learner sessions to verify learner monitoring, access correction, CSV export, learner denial, and cleanup. Password-seeded production identities are forbidden.",
  );

  test("requires pre-provisioned Hugo identities and operator supervision", async () => {
    // This destructive production rehearsal cannot safely synthesize multiple
    // identities after the Hugo-only cutover, so it remains an explicit gate.
  });
});
