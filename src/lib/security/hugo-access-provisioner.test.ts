import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/20260728091000_hugo_access_provisioner.sql"),
  "utf8",
);

describe("Hugo Institute access provisioner contract", () => {
  it("exposes the frozen RPC names and normalized receipt fields", () => {
    expect(migration).toMatch(
      /create or replace function public\.hugo_apply_access\([\s\S]*?p_operation_id uuid,[\s\S]*?p_email text,[\s\S]*?p_role text,[\s\S]*?p_config jsonb,[\s\S]*?p_status text,[\s\S]*?p_access_expires_at timestamptz,[\s\S]*?p_app_user_id text default null/,
    );
    expect(migration).toContain("public.hugo_inspect_access(p_email text)");
    expect(migration).toContain(
      "public.hugo_prepare_pristine_delete(\n  p_operation_id uuid,\n  p_email text",
    );
    expect(migration).toContain(
      "public.hugo_delete_identity(\n  p_operation_id uuid,\n  p_email text",
    );
    for (const field of [
      "operation_id",
      "app_id",
      "app_user_id",
      "requested",
      "observed",
      "has_durable_activity",
      "error_code",
      "error_message",
    ]) {
      expect(migration).toContain(`'${field}'`);
    }
  });

  it("fails closed at the service-role boundary and makes retries idempotent", () => {
    expect(migration).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(migration).toContain(
      "v_existing := public.fn_hugo_operation_receipt(p_operation_id)",
    );
    expect(migration).toMatch(
      /revoke all on function public\.hugo_apply_access[\s\S]*grant execute on function public\.hugo_apply_access[\s\S]*to service_role;/,
    );
    expect(migration).toMatch(
      /revoke all on function public\.hugo_inspect_access[\s\S]*grant execute on function public\.hugo_inspect_access[\s\S]*to service_role;/,
    );
  });

  it("validates Institute roles and role groups without logging secrets", () => {
    expect(migration).toContain("('owner', 'admin', 'learner')");
    expect(migration).toContain("role_group_ids must be an array.");
    expect(migration).toContain("One or more role groups do not exist.");
    expect(migration).toMatch(
      /v_key ~\* '\(secret\|token\|password\|private\.\?key\|cookie\|action\.\?link\|access\.\?key\)'/,
    );
  });

  it("enforces expiry/suspension at the content authorization helpers", () => {
    expect(migration).toContain("g.desired_status = 'active'");
    expect(migration).toContain(
      "g.access_expires_at is null or g.access_expires_at > now()",
    );
    expect(migration).toContain("public.fn_hugo_access_is_active(p_user_id)");
    expect(migration).toContain("when v_grant.access_expires_at is not null");
  });

  it("guards the final owner and requires pristine deletion preparation", () => {
    expect(migration).toContain("final active Institute owner cannot");
    expect(migration).toContain("identity_not_pristine");
    expect(migration).toContain("delete from auth.users where id = v_profile.id");
    expect(migration).toContain("prepared_for_delete");
    expect(migration).toContain("fn_hugo_has_durable_activity");
  });
});
