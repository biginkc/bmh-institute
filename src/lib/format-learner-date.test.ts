import { describe, expect, it } from "vitest";

import {
  formatLearnerDate,
  formatLearnerDateTime,
  formatLearnerLongDate,
} from "./format-learner-date";

describe("learner date formatting", () => {
  it("uses a fixed locale and America/Chicago date for server/browser parity", () => {
    expect(formatLearnerDate("2026-07-16T23:30:00.000Z")).toBe("7/16/2026");
    expect(formatLearnerDateTime("2026-07-16T12:00:00.000Z")).toBe("7/16/2026, 7:00 AM");
    expect(formatLearnerLongDate("2026-07-16T23:30:00.000Z")).toBe("July 16, 2026");
  });

  it("keeps a Central-time evening completion on the correct calendar day (not tomorrow's UTC date)", () => {
    // Every learner is US-Central. 2026-07-16T21:30:00-05:00 (9:30 PM CDT,
    // still July 16 locally) is 2026-07-17T02:30:00.000Z in UTC -- if the
    // formatter were pinned to UTC instead of America/Chicago, a learner
    // finishing a course that evening would see the certificate dated
    // July 17, a day that hasn't happened for them yet.
    expect(formatLearnerDate("2026-07-17T02:30:00.000Z")).toBe("7/16/2026");
    expect(formatLearnerLongDate("2026-07-17T02:30:00.000Z")).toBe("July 16, 2026");
  });
});
