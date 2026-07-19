import { describe, expect, it, vi } from "vitest";

import { createFixtureCleanupSupabaseClient } from "./supabase-client";

describe("fixture cleanup Supabase transport", () => {
  it("uses apikey only for opaque keys across REST, Auth, Storage and RPC", async () => {
    const seen: Array<{ path: string; apikey: string | null; authorization: string | null }> = [];
    const key = `sb_secret_${"S".repeat(32)}`;
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      const headers = new Headers(init?.headers);
      seen.push({
        path,
        apikey: headers.get("apikey"),
        authorization: headers.get("authorization"),
      });
      const body = path.includes("/auth/v1/admin/users")
        ? { users: [], aud: "", next_page: null, last_page: 0, total: 0 }
        : [];
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const client = createFixtureCleanupSupabaseClient(
      "https://example.supabase.co",
      key,
      fetch,
    );

    await client.from("profiles").select("id").limit(1);
    await client.rpc("fixture_cleanup_transport_probe_v1");
    await client.auth.admin.listUsers({ page: 1, perPage: 1 });
    await client.storage.from("content").list("", { limit: 1 });

    expect(seen.map((request) => request.path)).toEqual(
      expect.arrayContaining([
        "/rest/v1/profiles",
        "/rest/v1/rpc/fixture_cleanup_transport_probe_v1",
        "/auth/v1/admin/users",
        "/storage/v1/object/list/content",
      ]),
    );
    for (const request of seen) {
      expect(request.apikey).toBe(key);
      expect(request.authorization).toBeNull();
    }
  });

  it("keeps Bearer authorization for a legacy service-role JWT", async () => {
    const key = "header.payload.signature";
    let authorization: string | null = null;
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      authorization = new Headers(init?.headers).get("authorization");
      return new Response("[]", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const client = createFixtureCleanupSupabaseClient(
      "https://example.supabase.co",
      key,
      fetch,
    );

    await client.rpc("fixture_cleanup_transport_probe_v1");

    expect(authorization).toBe(`Bearer ${key}`);
  });
});
