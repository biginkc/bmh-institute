import { describe, expect, it } from "vitest";

import {
  formatLearnerDate,
  formatLearnerDateTime,
  formatLearnerLongDate,
} from "./format-learner-date";

describe("learner date formatting", () => {
  it("uses a fixed locale and UTC date for server/browser parity", () => {
    expect(formatLearnerDate("2026-07-16T23:30:00.000Z")).toBe("7/16/2026");
    expect(formatLearnerDateTime("2026-07-16T12:00:00.000Z")).toBe("7/16/2026, 12:00 PM");
    expect(formatLearnerLongDate("2026-07-16T23:30:00.000Z")).toBe("July 16, 2026");
  });
});
