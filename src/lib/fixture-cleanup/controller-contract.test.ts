import { describe, expect, it } from "vitest";

import {
  assertFixtureCleanupTransportContract,
  REVIEWED_CONTROLLER_EFFECTIVE_PRIVILEGES,
  REVIEWED_CONTROLLER_FUNCTION_CONTRACTS,
  REVIEWED_CONTROLLER_ROLE_CONTRACTS,
  REVIEWED_CONTROLLER_ROLE_MEMBERSHIPS,
  REVIEWED_CONTROLLER_ROLE_MEMBERSHIPS_BY_POSTGRES_MAJOR,
  REVIEWED_CONTROLLER_TABLE_CONTRACTS_BY_POSTGRES_MAJOR,
  REVIEWED_SUPABASE_ROLE_INHERIT_SOURCE,
} from "./controller-contract";

function reviewedProbe(postgresMajor: 15 | 16 | 17 = 17) {
  return {
    role: "service_role",
    postgres_major: postgresMajor,
    old_public_rpc: false,
    ungated_service_execute: false,
    key_select: false,
    legacy_contract_safe: true,
    legacy_definition_sha256:
      "0a4ff6b98a86427016faee21d6b8a821944015b944317e9942bda11dd23de05e",
    controller_contract_safe: true,
    controller_contracts: structuredClone(
      REVIEWED_CONTROLLER_FUNCTION_CONTRACTS,
    ),
    controller_table_contracts: structuredClone(
      REVIEWED_CONTROLLER_TABLE_CONTRACTS_BY_POSTGRES_MAJOR[postgresMajor],
    ),
    controller_role_contracts: structuredClone(
      REVIEWED_CONTROLLER_ROLE_CONTRACTS,
    ),
    controller_role_memberships: structuredClone(
      REVIEWED_CONTROLLER_ROLE_MEMBERSHIPS_BY_POSTGRES_MAJOR[postgresMajor],
    ),
    controller_effective_privileges: structuredClone(
      REVIEWED_CONTROLLER_EFFECTIVE_PRIVILEGES,
    ),
  };
}

describe("fixture cleanup controller function contracts", () => {
  it("pins the exact transitive function and table contracts", () => {
    expect(Object.keys(REVIEWED_CONTROLLER_FUNCTION_CONTRACTS).sort()).toEqual([
      "assert_retained",
      "canonical_evidence",
      "canonical_jsonb",
      "controller_attester",
      "controller_evidence",
      "controller_wrapper",
      "legacy_attester",
      "moved_destructive",
      "transport_probe",
    ]);
    for (const contract of Object.values(
      REVIEWED_CONTROLLER_FUNCTION_CONTRACTS,
    )) {
      expect(contract.definition_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(contract.owner_exact).toBe(true);
      expect(contract.search_path).toEqual(["search_path=pg_catalog"]);
      expect(contract.language).toBe("plpgsql");
      expect(contract.safe).toBe(true);
    }
    expect(
      REVIEWED_CONTROLLER_FUNCTION_CONTRACTS.canonical_evidence,
    ).toMatchObject({
      security_definer: false,
      strict: true,
    });
    expect(
      REVIEWED_CONTROLLER_FUNCTION_CONTRACTS.canonical_jsonb,
    ).toMatchObject({
      security_definer: false,
      strict: true,
    });
    for (const postgresMajor of [15, 16, 17] as const) {
      expect(
        Object.keys(
          REVIEWED_CONTROLLER_TABLE_CONTRACTS_BY_POSTGRES_MAJOR[postgresMajor],
        ).sort(),
      ).toEqual([
        "controller_keys",
        "execution_receipts",
        "expected_function_contracts",
      ]);
      expect(() =>
        assertFixtureCleanupTransportContract(reviewedProbe(postgresMajor)),
      ).not.toThrow();
    }
    expect(
      REVIEWED_CONTROLLER_TABLE_CONTRACTS_BY_POSTGRES_MAJOR[15].controller_keys
        .acl,
    ).toEqual(
      REVIEWED_CONTROLLER_TABLE_CONTRACTS_BY_POSTGRES_MAJOR[16].controller_keys
        .acl,
    );
    expect(
      REVIEWED_CONTROLLER_TABLE_CONTRACTS_BY_POSTGRES_MAJOR[16].controller_keys
        .acl,
    ).not.toContainEqual(expect.objectContaining({ privilege: "MAINTAIN" }));
    expect(
      REVIEWED_CONTROLLER_TABLE_CONTRACTS_BY_POSTGRES_MAJOR[17].controller_keys
        .acl,
    ).toContainEqual(expect.objectContaining({ privilege: "MAINTAIN" }));
    expect(REVIEWED_CONTROLLER_ROLE_CONTRACTS.map(({ role }) => role)).toEqual([
      "anon",
      "authenticated",
      "authenticator",
      "service_role",
    ]);
    expect(
      REVIEWED_CONTROLLER_ROLE_CONTRACTS.map(({ role, inherit }) => ({
        role,
        inherit,
      })),
    ).toEqual([
      { role: "anon", inherit: true },
      { role: "authenticated", inherit: true },
      { role: "authenticator", inherit: false },
      { role: "service_role", inherit: true },
    ]);
    expect(REVIEWED_SUPABASE_ROLE_INHERIT_SOURCE).toEqual({
      repository: "supabase/postgres",
      revision: "ad8973723a73c53371389026d7f76a01e470c06c",
      migration:
        "migrations/db/migrations/20230529180330_alter_api_roles_for_inherit.sql",
      inherited_roles: ["anon", "authenticated", "service_role"],
      noninherited_roles: ["authenticator"],
    });
    expect(REVIEWED_CONTROLLER_ROLE_MEMBERSHIPS).toHaveLength(8);
    expect(REVIEWED_CONTROLLER_ROLE_MEMBERSHIPS).not.toContainEqual(
      expect.objectContaining({ member: "supabase_admin" }),
    );
    expect(
      REVIEWED_CONTROLLER_ROLE_MEMBERSHIPS_BY_POSTGRES_MAJOR[15],
    ).toHaveLength(7);
    expect(REVIEWED_CONTROLLER_ROLE_MEMBERSHIPS[0]).toMatchObject({
      member: "authenticator",
      inherit_option: false,
      set_option: true,
    });
    expect(REVIEWED_CONTROLLER_EFFECTIVE_PRIVILEGES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "service_role",
          controller_wrapper_execute: true,
          transport_probe_execute: true,
          private_helper_execute: false,
        }),
        expect.objectContaining({
          role: "authenticator",
          controller_wrapper_execute: false,
          transport_probe_execute: false,
          private_helper_execute: false,
        }),
      ]),
    );
  });

  it("fails closed for every top-level and nested function-contract drift", () => {
    for (const mutate of [
      (probe: ReturnType<typeof reviewedProbe>) => {
        probe.controller_contract_safe = false;
      },
      (probe: ReturnType<typeof reviewedProbe>) => {
        probe.controller_contracts.controller_wrapper.definition_sha256 =
          "0".repeat(64);
      },
      (probe: ReturnType<typeof reviewedProbe>) => {
        probe.controller_contracts.controller_evidence.owner_exact = false;
      },
      (probe: ReturnType<typeof reviewedProbe>) => {
        probe.controller_contracts.transport_probe.security_definer = false;
      },
      (probe: ReturnType<typeof reviewedProbe>) => {
        probe.controller_contracts.controller_wrapper.search_path = [
          "search_path=public",
        ];
      },
      (probe: ReturnType<typeof reviewedProbe>) => {
        probe.controller_contracts.controller_evidence.execute_acl = [
          { grantee: "owner", grantable: true },
          { grantee: "service_role", grantable: false },
        ];
      },
      (probe: ReturnType<typeof reviewedProbe>) => {
        probe.controller_contracts.transport_probe.volatility = "volatile";
      },
      (probe: ReturnType<typeof reviewedProbe>) => {
        probe.controller_contracts.controller_attester.language = "sql";
      },
      (probe: ReturnType<typeof reviewedProbe>) => {
        probe.controller_contracts.canonical_jsonb.strict = false;
      },
      (probe: ReturnType<typeof reviewedProbe>) => {
        probe.controller_table_contracts.controller_keys.acl.push({
          grantee: "authenticated",
          privilege: "SELECT",
          grantable: false,
        });
      },
      (probe: ReturnType<typeof reviewedProbe>) => {
        probe.controller_table_contracts.execution_receipts.owner_exact = false;
      },
      (probe: ReturnType<typeof reviewedProbe>) => {
        probe.postgres_major = 14 as 15;
      },
      (probe: ReturnType<typeof reviewedProbe>) => {
        probe.controller_table_contracts.controller_keys.acl.push({
          grantee: "owner",
          privilege: "MAINTAIN",
          grantable: false,
        });
      },
      (probe: ReturnType<typeof reviewedProbe>) => {
        probe.controller_role_contracts[0].bypass_rls = true;
      },
      (probe: ReturnType<typeof reviewedProbe>) => {
        probe.controller_role_contracts[2].inherit = true;
      },
      (probe: ReturnType<typeof reviewedProbe>) => {
        probe.controller_role_memberships.push({
          member: "anon",
          role: "service_role",
          admin_option: false,
          inherit_option: true,
          set_option: true,
        });
      },
      (probe: ReturnType<typeof reviewedProbe>) => {
        probe.controller_role_memberships[0].inherit_option = true;
      },
      (probe: ReturnType<typeof reviewedProbe>) => {
        probe.controller_role_memberships[2].set_option = false;
      },
      (probe: ReturnType<typeof reviewedProbe>) => {
        probe.controller_effective_privileges[0].controller_keys_access = true;
      },
      (probe: ReturnType<typeof reviewedProbe>) => {
        probe.controller_effective_privileges[3].private_helper_execute = true;
      },
    ]) {
      const probe = reviewedProbe();
      mutate(probe);
      expect(() => assertFixtureCleanupTransportContract(probe)).toThrow(
        /unsafe contract/i,
      );
    }
  });
});
