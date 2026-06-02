"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { sanitizeNextUrl } from "./sanitize-next";

export type LoginResult =
  | { ok: true }
  | { ok: false; error: string };

export async function signIn(
  _prevState: LoginResult | null,
  formData: FormData,
): Promise<LoginResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = sanitizeNextUrl(String(formData.get("next") ?? ""));

  if (!email || !password) {
    return { ok: false, error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const userId = data.user?.id;
  if (userId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("status")
      .eq("id", userId)
      .maybeSingle();

    if (profile?.status === "suspended") {
      await supabase.auth.signOut();
      return {
        ok: false,
        error: "Your account has been suspended. Contact your administrator.",
      };
    }
  }

  redirect(next);
}
