import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const usersAction = readFileSync(
  resolve("src/app/(dashboard)/admin/users/actions.ts"),
  "utf8",
);
const editAction = readFileSync(
  resolve("src/app/(dashboard)/admin/users/[userId]/edit/actions.ts"),
  "utf8",
);
const editForm = readFileSync(
  resolve("src/app/(dashboard)/admin/users/[userId]/edit/user-edit-form.tsx"),
  "utf8",
);
const runtimeSource = collectRuntimeSource(resolve("src"));

describe("Hugo-only provisioning boundary", () => {
  it("has no runtime path that creates or deletes an authentication identity", () => {
    expect(runtimeSource).not.toMatch(/auth\.admin\.(?:createUser|deleteUser)/);
  });

  it("keeps legacy invites and account lifecycle changes outside Institute", () => {
    expect(usersAction).not.toContain('from("invites").delete()');
    expect(usersAction).not.toContain("inviteUser");
    expect(usersAction).not.toContain("revokeInvite");
    expect(editAction).not.toContain("deleteUser");
    expect(editForm).not.toContain("onSuspendToggle");
    expect(editForm).not.toContain("onDelete");
  });

  it("never writes login status while saving Institute settings", () => {
    expect(editAction).not.toContain("status: \"active\" | \"invited\" | \"suspended\"");
    expect(editAction).not.toContain("p_status");
    expect(editAction).not.toContain("fn_save_user_settings");
    expect(editAction).not.toContain("createAdminClient");
    expect(editAction).toContain('update({ system_role: input.system_role })');
    expect(editAction).toContain('rpc("fn_set_user_role_groups"');
  });
});

function collectRuntimeSource(directory: string): string {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return collectRuntimeSource(path);
      if (!/\.(?:ts|tsx)$/.test(entry.name)) return [];
      if (/\.(?:integration\.)?test\.(?:ts|tsx)$/.test(entry.name)) return [];
      return readFileSync(path, "utf8");
    })
    .join("\n");
}
