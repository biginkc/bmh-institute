"use server";

import { headers } from "next/headers";

import { checkAndConsume } from "@/lib/rate-limit/check";
import { extractClientIp } from "@/lib/rate-limit/ip";
import { createClient } from "@/lib/supabase/server";

export type ForgotPasswordState =
  | { ok: true }
  | { ok: false; error: string }
  | null;

export async function sendPasswordReset(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { ok: false, error: "Email is required." };

  const headersList = await headers();
  const ip = extractClientIp(headersList);
  const ipGate = await checkAndConsume({
    keyType: "ip",
    keyValue: ip,
    threshold: 5,
    windowSeconds: 15 * 60,
  });
  if (!ipGate.allowed) return { ok: true };

  const emailKey = email.toLowerCase();
  const emailGate = await checkAndConsume({
    keyType: "email",
    keyValue: emailKey,
    threshold: 3,
    windowSeconds: 60 * 60,
  });
  if (!emailGate.allowed) return { ok: true };

  const supabase = await createClient();
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://bmh-institute.vercel.app";

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/auth/callback`,
  });

  // Intentionally treat "user not found" the same as success to avoid
  // exposing which emails have accounts. Supabase already no-ops silently
  // for unknown emails, so we just trust its response here.
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
