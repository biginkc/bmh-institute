import { afterEach, describe, expect, it } from "vitest";

import { isQaFixtureUser, routeQaNotification } from "./qa-routing";

const originalIds = process.env.INSTITUTE_QA_NOTIFICATION_USER_IDS;
const originalRecipient = process.env.INSTITUTE_QA_NOTIFICATION_RECIPIENT;

afterEach(() => {
  if (originalIds === undefined) delete process.env.INSTITUTE_QA_NOTIFICATION_USER_IDS;
  else process.env.INSTITUTE_QA_NOTIFICATION_USER_IDS = originalIds;
  if (originalRecipient === undefined) delete process.env.INSTITUTE_QA_NOTIFICATION_RECIPIENT;
  else process.env.INSTITUTE_QA_NOTIFICATION_RECIPIENT = originalRecipient;
});

describe("production QA notification routing", () => {
  it("routes only exact configured user IDs", () => {
    process.env.INSTITUTE_QA_NOTIFICATION_USER_IDS = "user-qa, user-other";
    process.env.INSTITUTE_QA_NOTIFICATION_RECIPIENT = "qa@example.test";

    expect(isQaFixtureUser("user-qa")).toBe(true);
    expect(routeQaNotification("user-qa", "admin@example.test")).toBe("qa@example.test");
    expect(routeQaNotification("user-qa-similar", "admin@example.test")).toBe("admin@example.test");
  });

  it("preserves ordinary mail and falls back safely without a recipient", () => {
    process.env.INSTITUTE_QA_NOTIFICATION_USER_IDS = "user-qa";
    delete process.env.INSTITUTE_QA_NOTIFICATION_RECIPIENT;

    expect(routeQaNotification("ordinary-user", "admin@example.test")).toBe("admin@example.test");
    expect(routeQaNotification("user-qa", "admin@example.test")).toBeNull();
  });
});
