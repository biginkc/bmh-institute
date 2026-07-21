import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const action = readFileSync(
  resolve("src/app/(dashboard)/admin/users/actions.ts"),
  "utf8",
);
const migration = readFileSync(
  resolve("supabase/migrations/049_fail_closed_hugo_provisioning.sql"),
  "utf8",
);

describe("Hugo-only provisioning boundary", () => {
  it("marks admin-created users and gives their trigger profile a denied state", () => {
    expect(action).toContain('provisioning_origin: "institute_admin"');
    expect(migration).toContain(
      "new.raw_app_meta_data->>'provisioning_origin' = 'institute_admin'",
    );
    expect(migration).toMatch(/then 'invited'[\s\S]*else 'active'/);
  });

  it("promotes access only through the transactional settings RPC", () => {
    expect(action).toContain('supabase.rpc("fn_save_user_settings"');
    expect(action).toContain('p_status: "active"');
    expect(migration).not.toMatch(/then 'active'[\s\S]*else 'invited'/);
  });
});
