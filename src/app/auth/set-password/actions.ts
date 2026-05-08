"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { checkAndConsume } from "@/lib/rate-limit/check";
import { extractClientIp } from "@/lib/rate-limit/ip";
import { createClient } from "@/lib/supabase/server";

export type SetPasswordState =
  | { ok: true }
  | { ok: false; error: string }
  | null;

export async function setPassword(
  _prev: SetPasswordState,
  formData: FormData,
): Promise<SetPasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }
  if (password !== confirm) {
    return { ok: false, error: "Passwords don't match." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Your session expired. Open the invite link again." };
  }

  const headersList = await headers();
  const ip = extractClientIp(headersList);
  const ipGate = await checkAndConsume({
    keyType: "ip",
    keyValue: ip,
    threshold: 5,
    windowSeconds: 15 * 60,
  });
  if (!ipGate.allowed) {
    return { ok: false, error: retryMessage(ipGate.retryAfterSeconds) };
  }

  const emailKey = (user.email ?? "").trim().toLowerCase();
  if (emailKey) {
    const emailGate = await checkAndConsume({
      keyType: "email",
      keyValue: emailKey,
      threshold: 3,
      windowSeconds: 60 * 60,
    });
    if (!emailGate.allowed) {
      return { ok: false, error: retryMessage(emailGate.retryAfterSeconds) };
    }
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: error.message };

  redirect("/dashboard");
}

function retryMessage(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `Too many attempts. Try again in ${minutes} minutes.`;
}
