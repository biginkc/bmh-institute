import { randomBytes } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

const url = process.env.TEST_SUPABASE_URL;
const anonKey = process.env.TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const envPresent = Boolean(url && anonKey && serviceKey);

const admin = envPresent
  ? createClient(url!, serviceKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

async function withLearner(
  // The integration client intentionally has no generated schema type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: (learner: SupabaseClient<any, any, any>) => Promise<void>,
) {
  if (!admin || !url || !anonKey) throw new Error("Storage integration environment is missing.");
  const email = `storage-auth-${randomBytes(8).toString("hex")}@bmh.invalid`;
  const password = `${randomBytes(16).toString("base64url")}!Aa1`;
  let userId: string | null = null;
  try {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) throw error ?? new Error("Learner creation failed.");
    userId = data.user.id;
    const learner = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInError } = await learner.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
    await fn(learner);
  } finally {
    if (userId) await admin.auth.admin.deleteUser(userId).catch(() => undefined);
  }
}

describe.skipIf(!envPresent)("private course content storage", () => {
  it("prevents an authenticated learner from listing, downloading, or signing a predictable path", async () => {
    if (!admin) return;
    const folder = `courses/storage-auth-integration/v1/${randomBytes(6).toString("hex")}`;
    const path = `${folder}/cross-course.txt`;
    const { error: uploadError } = await admin.storage
      .from("content")
      .upload(path, new TextEncoder().encode("private course content"), {
        contentType: "text/plain",
      });
    expect(uploadError).toBeNull();

    try {
      await withLearner(async (learner) => {
        const listed = await learner.storage.from("content").list(folder);
        expect(listed.data ?? []).toEqual([]);

        const downloaded = await learner.storage.from("content").download(path);
        expect(downloaded.data).toBeNull();
        expect(downloaded.error).not.toBeNull();

        const signed = await learner.storage.from("content").createSignedUrl(path, 60);
        expect(signed.data).toBeNull();
        expect(signed.error).not.toBeNull();
      });
    } finally {
      await admin.storage.from("content").remove([path]);
    }
  });
});
