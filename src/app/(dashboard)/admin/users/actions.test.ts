import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  listUsers: vi.fn(),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  rpc: vi.fn(),
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
        deleteUser: mocks.deleteUser,
      },
    },
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ rpc: mocks.rpc })),
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
    mocks.requireAdmin.mockResolvedValue({
      id: "owner-1",
      email: "owner@example.com",
    });
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
    mocks.deleteUser.mockResolvedValue({ data: null, error: null });
    mocks.rpc.mockResolvedValue({ data: null, error: null });
  });

  it("creates a confirmed passwordless user and assigns access atomically", async () => {
    await expect(inviteUser(null, accessForm())).resolves.toEqual({
      ok: true,
      email: "person@example.com",
      created: true,
    });

    expect(mocks.createUser).toHaveBeenCalledWith({
      email: "person@example.com",
      email_confirm: true,
      app_metadata: {
        system_role: "admin",
        provisioning_origin: "institute_admin",
      },
      user_metadata: { provisioned_by: "institute_admin" },
    });
    expect(mocks.rpc).toHaveBeenCalledWith("fn_save_user_settings", {
      p_user_id: "new-user",
      p_system_role: "admin",
      p_status: "active",
      p_role_group_ids: ["group-1"],
    });
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

    await expect(inviteUser(null, accessForm())).resolves.toEqual({
      ok: true,
      email: "person@example.com",
      created: false,
    });

    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "fn_save_user_settings",
      expect.objectContaining({ p_user_id: "canonical-user" }),
    );
  });

  it("continues exact-email lookup beyond the first 1,000 users", async () => {
    mocks.listUsers
      .mockResolvedValueOnce({
        data: {
          users: Array.from({ length: 1000 }, (_, index) => ({
            id: `other-${index}`,
            email: `other-${index}@example.com`,
          })),
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          users: [{ id: "page-two-user", email: "person@example.com" }],
        },
        error: null,
      });

    await expect(inviteUser(null, accessForm())).resolves.toMatchObject({
      ok: true,
      created: false,
    });

    expect(mocks.listUsers).toHaveBeenNthCalledWith(2, {
      page: 2,
      perPage: 1000,
    });
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("deletes only a newly created user when transactional access fails", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "role group assignment failed" },
    });

    await expect(inviteUser(null, accessForm())).resolves.toEqual({
      ok: false,
      error: "role group assignment failed",
    });

    expect(mocks.deleteUser).toHaveBeenCalledWith("new-user");
  });

  it("never deletes a canonical existing user when assignment fails", async () => {
    mocks.listUsers.mockResolvedValue({
      data: {
        users: [{ id: "canonical-user", email: "person@example.com" }],
      },
      error: null,
    });
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "role group assignment failed" },
    });

    await expect(inviteUser(null, accessForm())).resolves.toEqual({
      ok: false,
      error: "role group assignment failed",
    });

    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });
});
