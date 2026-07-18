import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type FetchLike = typeof fetch;

export function isOpaqueSupabaseSecret(key: string) {
  return /^sb_secret_[A-Za-z0-9_-]{20,}$/.test(key);
}

export function createOpaqueKeySafeFetch(
  key: string,
  baseFetch: FetchLike = fetch,
): FetchLike {
  if (!isOpaqueSupabaseSecret(key)) return baseFetch;
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    if (headers.get("authorization") === `Bearer ${key}`) {
      headers.delete("authorization");
    }
    return baseFetch(input, { ...init, headers });
  };
}

export function createFixtureCleanupSupabaseClient(
  url: string,
  key: string,
  baseFetch: FetchLike = fetch,
): SupabaseClient {
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { fetch: createOpaqueKeySafeFetch(key, baseFetch) },
  });
}
