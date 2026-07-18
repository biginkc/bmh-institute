import { assertCanonicalSupabaseProjectUrl } from "../../src/lib/supabase/canonical-project-url";
import {
  createFixtureCleanupSupabaseClient,
  isOpaqueSupabaseSecret,
} from "../../src/lib/fixture-cleanup/supabase-client";
import { assertFixtureCleanupTransportContract } from "../../src/lib/fixture-cleanup/controller-contract";

const TEST_PROJECT_REF = "jvaabkchkihkjllehmft";

async function main() {
  const url = requiredEnv("TEST_SUPABASE_URL");
  const key = requiredEnv("TEST_SUPABASE_SERVICE_ROLE_KEY");
  if (!isOpaqueSupabaseSecret(key)) {
    throw new Error(
      "TEST_SUPABASE_SERVICE_ROLE_KEY must be a modern opaque sb_secret_ key.",
    );
  }
  assertCanonicalSupabaseProjectUrl(url, [TEST_PROJECT_REF]);
  const client = createFixtureCleanupSupabaseClient(url, key);
  const rpc = client as unknown as {
    rpc(name: string): PromiseLike<{
      data: Record<string, unknown> | null;
      error: { message: string } | null;
    }>;
  };

  const { data, error } = await rpc.rpc("fixture_cleanup_transport_probe_v1");
  if (error) throw new Error(`Fixture cleanup transport probe failed: ${error.message}`);
  assertFixtureCleanupTransportContract(data);

  const profileProbe = await client
    .from("profiles")
    .select("id", { head: true, count: "exact" })
    .limit(1);
  if (profileProbe.error) {
    throw new Error(`Read-only table probe failed: ${profileProbe.error.message}`);
  }
  const authProbe = await client.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (authProbe.error) {
    throw new Error(`Read-only Auth probe failed: ${authProbe.error.message}`);
  }
  const storageProbe = await client.storage.from("content").list("", { limit: 1 });
  if (storageProbe.error) {
    throw new Error(`Read-only Storage probe failed: ${storageProbe.error.message}`);
  }

  console.log(
    JSON.stringify({
      status: "passed",
      project_ref: TEST_PROJECT_REF,
      credential_kind: "opaque",
      probes: ["postgrest-rpc", "postgrest-table", "auth-admin", "storage-list"],
    }),
  );
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Set ${name}.`);
  return value;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
