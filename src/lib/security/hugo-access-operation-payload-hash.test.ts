import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/20260728113000_hugo_access_operation_payload_hash.sql"),
  "utf8",
);
const provisionerMigration = readFileSync(
  resolve("supabase/migrations/20260728091000_hugo_access_provisioner.sql"),
  "utf8",
);

describe("Hugo operation payload-hash binding", () => {
  it("adds a non-null, format-checked hash and binds it before email redaction", () => {
    expect(migration).toContain(
      "add column if not exists request_hash text",
    );
    expect(migration).toContain(
      "hugo_access_operations_request_hash_format_check",
    );
    expect(migration).toContain(
      "alter column request_hash set not null",
    );
    expect(migration).toContain(
      "create trigger hugo_access_operations_bind_request_hash",
    );
    expect(provisionerMigration).toContain(
      "create trigger hugo_access_operations_redact_email",
    );
    expect("hugo_access_operations_bind_request_hash".localeCompare(
      "hugo_access_operations_redact_email",
    )).toBeLessThan(0);
    expect(migration).toContain("extensions.digest");
    expect(migration).toContain("email_fingerprint");
  });

  it("preserves the frozen RPCs while adding exact replay and conflict gates", () => {
    expect(migration).toContain("hugo_apply_access_unhashed");
    expect(migration).toContain("hugo_prepare_pristine_delete_unhashed");
    expect(migration).toContain("hugo_delete_identity_unhashed");
    expect(migration).toContain(
      "from public, anon, authenticated, service_role;",
    );
    expect(migration).not.toContain(
      "grant execute on function public.hugo_apply_access_unhashed",
    );
    expect(migration).toContain("v_existing_hash is distinct from v_hash");
    expect(migration).toContain("'operation_id_reused'");
    expect(migration).toContain(
      "Operation id was already used for a different request.",
    );
    expect(migration).toContain("return v_existing_receipt;");
    expect(migration).toContain("return public.hugo_apply_access_unhashed(");
    expect(migration).toContain(
      "return public.hugo_prepare_pristine_delete_unhashed(",
    );
    expect(migration).toContain(
      "return public.hugo_delete_identity_unhashed(",
    );
  });

  it("canonicalizes the request without retaining raw email or secret config", () => {
    expect(migration).toContain("fn_hugo_canonical_apply_config");
    expect(migration).toContain("public.fn_hugo_sanitize_json");
    expect(migration).toContain("public.fn_hugo_email_fingerprint(v_email)");
    expect(migration).toContain("'app_user_id', p_app_user_id");
    expect(migration).toContain(
      "'config', public.fn_hugo_canonical_apply_config(coalesce(p_config, '{}'::jsonb))",
    );
    expect(migration).toContain(
      "before insert on public.hugo_access_operations",
    );
    expect(migration).not.toContain("new.request_hash := p_email");
  });

  it("rewrites every legacy implicit journal insert before enforcing NOT NULL", () => {
    expect(migration).toContain(
      "insert into public.hugo_access_operations(operation_id, operation, email, input, receipt) values (",
    );
    expect(migration).toContain(
      "Hugo apply RPC still contains an implicit operation journal insert",
    );
    expect(migration).toContain(
      "The successful branch mutates v_config for revoke operations.",
    );
    expect(migration).toContain(
      "Hugo prepare RPC still contains an implicit operation journal insert",
    );
    expect(migration).toContain(
      "Hugo delete RPC still contains an implicit operation journal insert",
    );
  });
});
