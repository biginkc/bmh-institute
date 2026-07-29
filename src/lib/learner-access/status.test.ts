import { describe, expect, it } from "vitest";

import { shapeLearnerAccessRows } from "./status";

describe("shapeLearnerAccessRows", () => {
  it("marks active learners with role groups as ready", () => {
    const rows = shapeLearnerAccessRows({
      profiles: [
        profile({
          id: "user-1",
          email: "ready@example.com",
          full_name: "Ready Learner",
        }),
      ],
      userRoleGroupsByUserId: { "user-1": ["group-1"] },
    });

    expect(rows).toEqual([
      expect.objectContaining({
        id: "user-1",
        email: "ready@example.com",
        name: "Ready Learner",
        statusKey: "ready",
        statusLabel: "Ready",
        accessLabel: "Role group assigned",
        roleGroupIds: ["group-1"],
      }),
    ]);
  });

  it("marks active learners with no role group as missing access", () => {
    const rows = shapeLearnerAccessRows({
      profiles: [
        profile({
          id: "user-2",
          email: "missing@example.com",
          full_name: "Missing Access",
        }),
      ],
      userRoleGroupsByUserId: {},
    });

    expect(rows[0]).toEqual(
      expect.objectContaining({
        statusKey: "missing_access",
        statusLabel: "Needs access",
        accessLabel: "No role group assigned",
        roleGroupIds: [],
      }),
    );
  });

  it("marks suspended learners separately", () => {
    const rows = shapeLearnerAccessRows({
      profiles: [
        profile({
          id: "user-3",
          status: "suspended",
          email: "suspended@example.com",
        }),
      ],
      userRoleGroupsByUserId: { "user-3": ["group-1"] },
    });

    expect(rows[0]).toEqual(
      expect.objectContaining({
        statusKey: "suspended",
        statusLabel: "Suspended",
      }),
    );
  });

  it("does not mark an invited profile as ready even when it has a role group", () => {
    const rows = shapeLearnerAccessRows({
      profiles: [
        profile({
          id: "user-4",
          status: "invited",
          email: "invited@example.com",
        }),
      ],
      userRoleGroupsByUserId: { "user-4": ["group-1"] },
    });

    expect(rows[0]).toEqual(
      expect.objectContaining({
        statusKey: "inactive",
        statusLabel: "Not active",
        accessLabel: "Role group assigned",
      }),
    );
  });
});

function profile(overrides: Partial<ProfileInput> = {}): ProfileInput {
  return {
    id: "user-1",
    email: "learner@example.com",
    full_name: "Learner",
    system_role: "learner",
    status: "active",
    created_at: "2026-05-01T12:00:00.000Z",
    ...overrides,
  };
}

type ProfileInput = {
  id: string;
  email: string;
  full_name: string | null;
  system_role: "owner" | "admin" | "learner";
  status: "active" | "invited" | "suspended";
  created_at: string;
};
