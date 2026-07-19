type ExecuteGrant = {
  grantee: string;
  grantable: boolean;
};

type ControllerFunctionContract = {
  definition_sha256: string;
  owner_exact: boolean;
  security_definer: boolean;
  search_path: string[];
  language: string;
  volatility: string;
  strict: boolean;
  execute_acl: ExecuteGrant[];
  safe: boolean;
};

type TableGrant = ExecuteGrant & { privilege: string };

type ControllerTableContract = {
  owner_exact: boolean;
  acl: TableGrant[];
  safe: boolean;
};

type ControllerRoleContract = {
  role: string;
  superuser: boolean;
  inherit: boolean;
  create_role: boolean;
  create_db: boolean;
  login: boolean;
  replication: boolean;
  connection_limit: number;
  bypass_rls: boolean;
  valid_until: null;
  safe: boolean;
};

type ControllerRoleMembership = {
  member: string;
  role: string;
  admin_option: boolean;
  inherit_option?: boolean;
  set_option?: boolean;
};

type ControllerEffectivePrivilegeContract = {
  role: string;
  controller_wrapper_execute: boolean;
  transport_probe_execute: boolean;
  private_helper_execute: boolean;
  controller_keys_access: boolean;
  execution_receipts_access: boolean;
  expected_contracts_access: boolean;
  safe: boolean;
};

const ownerOnly: ExecuteGrant[] = [{ grantee: "owner", grantable: false }];
const ownerAndService: ExecuteGrant[] = [
  { grantee: "owner", grantable: false },
  { grantee: "service_role", grantable: false },
];

export const REVIEWED_CONTROLLER_FUNCTION_CONTRACTS: Record<
  | "assert_retained"
  | "canonical_evidence"
  | "canonical_jsonb"
  | "controller_attester"
  | "controller_evidence"
  | "controller_wrapper"
  | "legacy_attester"
  | "moved_destructive"
  | "transport_probe",
  ControllerFunctionContract
> = {
  assert_retained: {
    definition_sha256:
      "1766ff88e3dfaf4b37f3629406c6be1bbed32274e0937e1a4ab7257d715aa612",
    owner_exact: true,
    security_definer: true,
    search_path: ["search_path=pg_catalog"],
    language: "plpgsql",
    volatility: "volatile",
    strict: false,
    execute_acl: ownerOnly,
    safe: true,
  },
  canonical_evidence: {
    definition_sha256:
      "79a0862a703d7d0698a6b179157bf4fef0fda58e52471e6efd77f66605eeceab",
    owner_exact: true,
    security_definer: false,
    search_path: ["search_path=pg_catalog"],
    language: "plpgsql",
    volatility: "stable",
    strict: true,
    execute_acl: ownerOnly,
    safe: true,
  },
  canonical_jsonb: {
    definition_sha256:
      "6db0a612dc15cb21e0fd39317d87e4e103d0953f2ab5e8d759da39431fa5ad8d",
    owner_exact: true,
    security_definer: false,
    search_path: ["search_path=pg_catalog"],
    language: "plpgsql",
    volatility: "stable",
    strict: true,
    execute_acl: ownerOnly,
    safe: true,
  },
  controller_attester: {
    definition_sha256:
      "fed40391a8ac6902110fcd62c36c8c14615ce9a437390316f05a591759a8fe74",
    owner_exact: true,
    security_definer: true,
    search_path: ["search_path=pg_catalog"],
    language: "plpgsql",
    volatility: "stable",
    strict: false,
    execute_acl: ownerOnly,
    safe: true,
  },
  controller_evidence: {
    definition_sha256:
      "9631a9eb83cb21f3c84faddc02c5cd08a33db51be410228590e02df99b4c6380",
    owner_exact: true,
    security_definer: true,
    search_path: ["search_path=pg_catalog"],
    language: "plpgsql",
    volatility: "volatile",
    strict: false,
    execute_acl: ownerOnly,
    safe: true,
  },
  controller_wrapper: {
    definition_sha256:
      "f5574da2efc5aaaa9c9e063d380aed273a7e14be0d6de78ad46bffd178a5d141",
    owner_exact: true,
    security_definer: true,
    search_path: ["search_path=pg_catalog"],
    language: "plpgsql",
    volatility: "volatile",
    strict: false,
    execute_acl: ownerAndService,
    safe: true,
  },
  legacy_attester: {
    definition_sha256:
      "e63f6f40802a11ddf0b855dd61b6a8844ab5259942f777c037d099bd7ef8f93e",
    owner_exact: true,
    security_definer: true,
    search_path: ["search_path=pg_catalog"],
    language: "plpgsql",
    volatility: "stable",
    strict: false,
    execute_acl: ownerOnly,
    safe: true,
  },
  moved_destructive: {
    definition_sha256:
      "0a4ff6b98a86427016faee21d6b8a821944015b944317e9942bda11dd23de05e",
    owner_exact: true,
    security_definer: true,
    search_path: ["search_path=pg_catalog"],
    language: "plpgsql",
    volatility: "volatile",
    strict: false,
    execute_acl: ownerOnly,
    safe: true,
  },
  transport_probe: {
    definition_sha256:
      "6a286ad85ab3b904675a0c1a86306bf3c389a30323d09c4f48dca06ef926181b",
    owner_exact: true,
    security_definer: true,
    search_path: ["search_path=pg_catalog"],
    language: "plpgsql",
    volatility: "stable",
    strict: false,
    execute_acl: ownerAndService,
    safe: true,
  },
};

const ownerTableAclPostgres15And16: TableGrant[] = [
  { grantee: "owner", privilege: "DELETE", grantable: false },
  { grantee: "owner", privilege: "INSERT", grantable: false },
  { grantee: "owner", privilege: "REFERENCES", grantable: false },
  { grantee: "owner", privilege: "SELECT", grantable: false },
  { grantee: "owner", privilege: "TRIGGER", grantable: false },
  { grantee: "owner", privilege: "TRUNCATE", grantable: false },
  { grantee: "owner", privilege: "UPDATE", grantable: false },
];

const ownerTableAclPostgres17: TableGrant[] = [
  ...ownerTableAclPostgres15And16.slice(0, 2),
  { grantee: "owner", privilege: "MAINTAIN", grantable: false },
  ...ownerTableAclPostgres15And16.slice(2),
];

function tableContracts(
  acl: TableGrant[],
): Record<
  "controller_keys" | "execution_receipts" | "expected_function_contracts",
  ControllerTableContract
> {
  return {
    controller_keys: { owner_exact: true, acl, safe: true },
    execution_receipts: { owner_exact: true, acl, safe: true },
    expected_function_contracts: { owner_exact: true, acl, safe: true },
  };
}

export const REVIEWED_CONTROLLER_TABLE_CONTRACTS_BY_POSTGRES_MAJOR = {
  15: tableContracts(ownerTableAclPostgres15And16),
  16: tableContracts(ownerTableAclPostgres15And16),
  17: tableContracts(ownerTableAclPostgres17),
} as const;

export const REVIEWED_CONTROLLER_ROLE_CONTRACTS: ControllerRoleContract[] = [
  {
    role: "anon",
    superuser: false,
    inherit: true,
    create_role: false,
    create_db: false,
    login: false,
    replication: false,
    connection_limit: -1,
    bypass_rls: false,
    valid_until: null,
    safe: true,
  },
  {
    role: "authenticated",
    superuser: false,
    inherit: true,
    create_role: false,
    create_db: false,
    login: false,
    replication: false,
    connection_limit: -1,
    bypass_rls: false,
    valid_until: null,
    safe: true,
  },
  {
    role: "authenticator",
    superuser: false,
    inherit: false,
    create_role: false,
    create_db: false,
    login: true,
    replication: false,
    connection_limit: -1,
    bypass_rls: false,
    valid_until: null,
    safe: true,
  },
  {
    role: "service_role",
    superuser: false,
    inherit: true,
    create_role: false,
    create_db: false,
    login: false,
    replication: false,
    connection_limit: -1,
    bypass_rls: true,
    valid_until: null,
    safe: true,
  },
];

export const REVIEWED_SUPABASE_ROLE_INHERIT_SOURCE = {
  repository: "supabase/postgres",
  revision: "ad8973723a73c53371389026d7f76a01e470c06c",
  migration:
    "migrations/db/migrations/20230529180330_alter_api_roles_for_inherit.sql",
  inherited_roles: ["anon", "authenticated", "service_role"],
  noninherited_roles: ["authenticator"],
} as const;

// This is the final topology after Supabase's full role-migration history. The
// initial supabase_admin -> authenticator membership is later revoked.
const roleMembershipsPostgres16And17: ControllerRoleMembership[] = [
  {
    member: "authenticator",
    role: "anon",
    admin_option: false,
    inherit_option: false,
    set_option: true,
  },
  {
    member: "authenticator",
    role: "authenticated",
    admin_option: false,
    inherit_option: false,
    set_option: true,
  },
  {
    member: "authenticator",
    role: "service_role",
    admin_option: false,
    inherit_option: false,
    set_option: true,
  },
  {
    member: "postgres",
    role: "anon",
    admin_option: true,
    inherit_option: true,
    set_option: true,
  },
  {
    member: "postgres",
    role: "authenticated",
    admin_option: true,
    inherit_option: true,
    set_option: true,
  },
  {
    member: "postgres",
    role: "authenticator",
    admin_option: true,
    inherit_option: true,
    set_option: true,
  },
  {
    member: "postgres",
    role: "service_role",
    admin_option: true,
    inherit_option: true,
    set_option: true,
  },
  {
    member: "supabase_storage_admin",
    role: "authenticator",
    admin_option: false,
    inherit_option: true,
    set_option: true,
  },
];

const roleMembershipsPostgres15: ControllerRoleMembership[] = [
  { member: "authenticator", role: "anon", admin_option: false },
  { member: "authenticator", role: "authenticated", admin_option: false },
  { member: "authenticator", role: "service_role", admin_option: false },
  { member: "postgres", role: "anon", admin_option: false },
  { member: "postgres", role: "authenticated", admin_option: false },
  { member: "postgres", role: "service_role", admin_option: false },
  {
    member: "supabase_storage_admin",
    role: "authenticator",
    admin_option: false,
  },
];

export const REVIEWED_CONTROLLER_ROLE_MEMBERSHIPS_BY_POSTGRES_MAJOR = {
  15: roleMembershipsPostgres15,
  16: roleMembershipsPostgres16And17,
  17: roleMembershipsPostgres16And17,
} as const;

export const REVIEWED_CONTROLLER_ROLE_MEMBERSHIPS =
  REVIEWED_CONTROLLER_ROLE_MEMBERSHIPS_BY_POSTGRES_MAJOR[17];

export const REVIEWED_CONTROLLER_EFFECTIVE_PRIVILEGES: ControllerEffectivePrivilegeContract[] =
  [
    effectivePrivileges("anon", false),
    effectivePrivileges("authenticated", false),
    effectivePrivileges("authenticator", false),
    effectivePrivileges("service_role", true),
  ];

function effectivePrivileges(
  role: string,
  serviceRole: boolean,
): ControllerEffectivePrivilegeContract {
  return {
    role,
    controller_wrapper_execute: serviceRole,
    transport_probe_execute: serviceRole,
    private_helper_execute: false,
    controller_keys_access: false,
    execution_receipts_access: false,
    expected_contracts_access: false,
    safe: true,
  };
}

// PostgreSQL 15 and 16 have seven owner-default table privileges. PostgreSQL
// 17 adds MAINTAIN. Callers must select the exact shape for the server that
// produced the probe; accepting their union would hide missing or extra grants.
export function reviewedControllerTableContracts(
  postgresMajor: unknown,
): Record<
  "controller_keys" | "execution_receipts" | "expected_function_contracts",
  ControllerTableContract
> | null {
  if (postgresMajor === 15 || postgresMajor === 16 || postgresMajor === 17) {
    return REVIEWED_CONTROLLER_TABLE_CONTRACTS_BY_POSTGRES_MAJOR[postgresMajor];
  }
  return null;
}

// Retained for import compatibility with tests and callers that explicitly
// model the reviewed PostgreSQL 17 contract. Production major is not assumed.
export const REVIEWED_CONTROLLER_TABLE_CONTRACTS =
  REVIEWED_CONTROLLER_TABLE_CONTRACTS_BY_POSTGRES_MAJOR[17];

const REVIEWED_LEGACY_DEFINITION_SHA256 =
  "0a4ff6b98a86427016faee21d6b8a821944015b944317e9942bda11dd23de05e";

export function assertFixtureCleanupTransportContract(
  probe: Record<string, unknown> | null,
): void {
  const expectedTables = reviewedControllerTableContracts(
    probe?.postgres_major,
  );
  const expectedMemberships =
    probe?.postgres_major === 15 ||
    probe?.postgres_major === 16 ||
    probe?.postgres_major === 17
      ? REVIEWED_CONTROLLER_ROLE_MEMBERSHIPS_BY_POSTGRES_MAJOR[
          probe.postgres_major
        ]
      : null;
  if (
    probe?.role !== "service_role" ||
    expectedTables === null ||
    expectedMemberships === null ||
    probe.old_public_rpc !== false ||
    probe.ungated_service_execute !== false ||
    probe.key_select !== false ||
    probe.legacy_contract_safe !== true ||
    probe.legacy_definition_sha256 !== REVIEWED_LEGACY_DEFINITION_SHA256 ||
    probe.controller_contract_safe !== true ||
    !sameJson(
      probe.controller_contracts,
      REVIEWED_CONTROLLER_FUNCTION_CONTRACTS,
    ) ||
    !sameJson(probe.controller_table_contracts, expectedTables) ||
    !sameJson(
      probe.controller_role_contracts,
      REVIEWED_CONTROLLER_ROLE_CONTRACTS,
    ) ||
    !sameJson(probe.controller_role_memberships, expectedMemberships) ||
    !sameJson(
      probe.controller_effective_privileges,
      REVIEWED_CONTROLLER_EFFECTIVE_PRIVILEGES,
    )
  ) {
    throw new Error(
      "Fixture cleanup transport probe returned an unsafe contract.",
    );
  }
}

function sameJson(left: unknown, right: unknown): boolean {
  return (
    JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right))
  );
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}
