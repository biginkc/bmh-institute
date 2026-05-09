import { describe, expect, it } from "vitest";

import { shapePilotCohortRows } from "./status";

const NOW = new Date("2026-05-09T12:00:00.000Z");

describe("shapePilotCohortRows", () => {
  it("marks active learners with role groups as ready", () => {
    const rows = shapePilotCohortRows({
      now: NOW,
      profiles: [
        profile({
          id: "user-1",
          email: "ready@example.com",
          full_name: "Ready Learner",
        }),
      ],
      invites: [],
      userRoleGroupsByUserId: { "user-1": ["group-1"] },
    });

    expect(rows).toEqual([
      expect.objectContaining({
        kind: "profile",
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
    const rows = shapePilotCohortRows({
      now: NOW,
      profiles: [
        profile({
          id: "user-2",
          email: "missing@example.com",
          full_name: "Missing Access",
        }),
      ],
      invites: [],
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
    const rows = shapePilotCohortRows({
      now: NOW,
      profiles: [
        profile({
          id: "user-3",
          status: "suspended",
          email: "suspended@example.com",
        }),
      ],
      invites: [],
      userRoleGroupsByUserId: { "user-3": ["group-1"] },
    });

    expect(rows[0]).toEqual(
      expect.objectContaining({
        statusKey: "suspended",
        statusLabel: "Suspended",
      }),
    );
  });

  it("marks future pending invites as pending invite", () => {
    const rows = shapePilotCohortRows({
      now: NOW,
      profiles: [],
      invites: [
        invite({
          id: "invite-1",
          email: "pending@example.com",
          expires_at: "2026-05-10T12:00:00.000Z",
          role_group_ids: ["group-1"],
        }),
      ],
      userRoleGroupsByUserId: {},
    });

    expect(rows[0]).toEqual(
      expect.objectContaining({
        kind: "invite",
        id: "invite-1",
        statusKey: "pending_invite",
        statusLabel: "Pending invite",
        accessLabel: "Role group assigned",
      }),
    );
  });

  it("marks past pending invites as expired", () => {
    const rows = shapePilotCohortRows({
      now: NOW,
      profiles: [],
      invites: [
        invite({
          id: "invite-2",
          email: "expired@example.com",
          expires_at: "2026-05-08T12:00:00.000Z",
        }),
      ],
      userRoleGroupsByUserId: {},
    });

    expect(rows[0]).toEqual(
      expect.objectContaining({
        statusKey: "expired_invite",
        statusLabel: "Expired",
      }),
    );
  });

  it("excludes accepted invites from pending setup rows", () => {
    const rows = shapePilotCohortRows({
      now: NOW,
      profiles: [],
      invites: [
        invite({
          id: "invite-3",
          accepted_at: "2026-05-09T11:00:00.000Z",
        }),
      ],
      userRoleGroupsByUserId: {},
    });

    expect(rows).toEqual([]);
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

function invite(overrides: Partial<InviteInput> = {}): InviteInput {
  return {
    id: "invite-1",
    email: "invite@example.com",
    system_role: "learner",
    role_group_ids: [],
    created_at: "2026-05-01T12:00:00.000Z",
    accepted_at: null,
    expires_at: "2026-05-20T12:00:00.000Z",
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

type InviteInput = {
  id: string;
  email: string;
  system_role: "owner" | "admin" | "learner";
  role_group_ids: string[] | null;
  created_at: string;
  accepted_at: string | null;
  expires_at: string;
};
