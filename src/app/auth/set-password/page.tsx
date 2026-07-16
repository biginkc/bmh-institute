import { redirect } from "next/navigation";

import { AuthShell } from "@/app/(auth)/auth-shell";
import { createClient } from "@/lib/supabase/server";

import { SetPasswordForm } from "./set-password-form";

export default async function SetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <SetPasswordScreen email={user.email ?? ""} />;
}

export function SetPasswordScreen({ email }: { email: string }) {
  return (
    <AuthShell
      pose="point"
      message="Welcome aboard! Pick a password and you're in."
    >
      <h1 className="font-[family-name:var(--font-display)] text-[28px] leading-tight font-bold text-[var(--ink-900)]">
        Set your password
      </h1>
      <p className="font-[family-name:var(--font-body)] text-sm leading-[1.55] font-semibold text-[var(--text-muted)]">
        Welcome to BMH Institute. Pick a password, then start your assigned
        training from the dashboard.
      </p>
      <SetPasswordForm email={email} />
    </AuthShell>
  );
}
