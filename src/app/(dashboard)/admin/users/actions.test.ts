import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  listUsers: vi.fn(),
  createUser: vi.fn(),
  profileMaybeSingle: vi.fn(),
  profileInsert: vi.fn(),
  groupsDeleteEq: vi.fn(),
  groupsInsert: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/guard", () => ({
  requireAdmin: mocks.requireAdmin,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    auth: {
      admin: {
        listUsers: mocks.listUsers,
        createUser: mocks.createUser,
      },
    },
    from: (table: string) => {
      if (table === "profiles") {
        return {
          update: () => ({
            eq: () => ({
              select: () => ({ maybeSingle: mocks.profileMaybeSingle }),
            }),
          }),
          insert: mocks.profileInsert,
        };
      }
      if (table === "user_role_groups") {
        return {
          delete: () => ({ eq: mocks.groupsDeleteEq }),
          insert: mocks.groupsInsert,
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { inviteUser } from "./actions";

function accessForm(email = "Person@Example.com") {
  const form = new FormData();
  form.set("email", email);
  form.set("system_role", "admin");
  form.append("role_group_ids", "group-1");
  return form;
}

describe("Grant Institute access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ id: "owner-1", email: "owner@example.com" });
    mocks.listUsers.mockResolvedValue({ data: { users: [] }, error: null });
    mocks.createUser.mockResolvedValue({
      data: {
        user: {
          id: "new-user",
          email: "person@example.com",
          user_metadata: {},
        },
      },
      error: null,
    });
    mocks.profileMaybeSingle.mockResolvedValue({
      data: { id: "new-user" },
      error: null,
    });
    mocks.profileInsert.mockResolvedValue({ error: null });
    mocks.groupsDeleteEq.mockResolvedValue({ error: null });
    mocks.groupsInsert.mockResolvedValue({ error: null });
  });

  it("creates a confirmed passwordless user and assigns its access", async () => {
    await expect(inviteUser(null, accessForm())).resolves.toEqual({
      ok: true,
      email: "person@example.com",
      created: true,
    });

    expect(mocks.createUser).toHaveBeenCalledWith({
      email: "person@example.com",
      email_confirm: true,
      app_metadata: { system_role: "admin" },
      user_metadata: { provisioned_by: "institute_admin" },
    });
    expect(mocks.groupsInsert).toHaveBeenCalledWith([
      { user_id: "new-user", role_group_id: "group-1" },
    ]);
  });

  it("preserves an exact-email existing user instead of replacing it", async () => {
    mocks.listUsers.mockResolvedValue({
      data: {
        users: [
          {
            id: "canonical-user",
            email: "PERSON@example.com",
            user_metadata: { full_name: "Canonical Person" },
          },
        ],
      },
      error: null,
    });
    mocks.profileMaybeSingle.mockResolvedValue({
      data: { id: "canonical-user" },
      error: null,
    });

    await expect(inviteUser(null, accessForm())).resolves.toEqual({
      ok: true,
      email: "person@example.com",
      created: false,
    });

    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.groupsInsert).toHaveBeenCalledWith([
      { user_id: "canonical-user", role_group_id: "group-1" },
    ]);
  });
});
