"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useActionState, useEffect, useState } from "react";
import { ArrowRight, KeyRound, LockKeyhole, Mail } from "lucide-react";

import { Button, Card, Input, Mascot } from "@/components/bmh-ds";
import { createClient } from "@/lib/supabase/client";

import { AuthShell } from "../auth-shell";
import { signIn } from "./actions";

const SUSPENDED_ERROR =
  "Your account has been suspended. Contact your administrator.";

const SSO_ERROR =
  "Hugo sign-in couldn't start. Try again or use your password.";

const SSO_CALLBACK_ERROR =
  "Hugo sign-in didn't complete. Try again or use your password.";

/**
 * Hugo single sign-on rollout flag. The button only renders when
 * NEXT_PUBLIC_BMH_ID_SSO=1 (set in Vercel at flip time), so merging this
 * code is decoupled from enabling the dashboard's custom:hugo OIDC provider.
 * Read at render time so tests can stub the env.
 */
function bmhIdSsoEnabled() {
  return process.env.NEXT_PUBLIC_BMH_ID_SSO === "1";
}

/**
 * Next 16 requires `useSearchParams` to live inside a Suspense boundary so
 * static prerender can bail out of the subtree instead of failing the build.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFormFallback />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [state, formAction, pending] = useActionState(signIn, null);
  const [hashAuthState, setHashAuthState] = useState<
    "idle" | "processing" | "failed"
  >("idle");
  const [ssoPending, setSsoPending] = useState(false);
  const [ssoError, setSsoError] = useState<string | null>(null);
  const actionError = state && !state.ok ? state.error : null;
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "";
  const urlError = searchParams.get("error");
  const inviteToken = searchParams.get("invite_token");

  async function signInWithBmhId() {
    setSsoPending(true);
    setSsoError(null);

    // flow=sso tags the callback so its failures map to an SSO-specific
    // login error instead of the invite message.
    const redirectTo = new URL("/auth/callback", window.location.origin);
    redirectTo.searchParams.set("flow", "sso");
    if (next) redirectTo.searchParams.set("next", next);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "custom:hugo",
        options: { redirectTo: redirectTo.toString() },
      });
      // signInWithOAuth resolves { error: null } and navigates away on
      // success; real startup failures (PKCE storage/crypto/URL setup)
      // REJECT, which the catch below turns back into a usable button.
      if (error) throw error;
    } catch {
      setSsoError(SSO_ERROR);
      setSsoPending(false);
    }
  }

  useEffect(() => {
    if (hashAuthState !== "idle") return;

    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    const type = hash.get("type");
    if (!accessToken || !refreshToken) return;
    if (!inviteToken && type !== "recovery" && type !== "invite") return;
    const sessionTokens = {
      access_token: accessToken,
      refresh_token: refreshToken,
    };

    let cancelled = false;
    const processingTimer = window.setTimeout(() => {
      if (!cancelled) setHashAuthState("processing");
    }, 0);

    async function finishHashAuth() {
      const supabase = createClient();
      const { error } = await supabase.auth.setSession(sessionTokens);
      if (error) {
        if (!cancelled) setHashAuthState("failed");
        return;
      }

      if (!inviteToken) {
        window.history.replaceState(null, "", "/auth/set-password");
        window.location.assign("/auth/set-password");
        return;
      }

      const response = await fetch("/auth/apply-invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: inviteToken, accessToken }),
      });

      if (response.ok) {
        window.history.replaceState(null, "", "/auth/set-password");
        window.location.assign("/auth/set-password");
        return;
      }

      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (body.error === "invite_expired") {
        window.history.replaceState(null, "", "/login?error=invite_expired");
        window.location.assign("/login?error=invite_expired");
        return;
      }

      if (!cancelled) setHashAuthState("failed");
    }

    void finishHashAuth();

    return () => {
      cancelled = true;
      window.clearTimeout(processingTimer);
    };
  }, [hashAuthState, inviteToken]);

  const errorMessage =
    actionError ??
    ssoError ??
    (hashAuthState === "failed"
      ? "Invite link couldn't be verified. Ask an admin to resend it."
      : urlError === "invite_failed"
      ? "Invite link couldn't be verified. Ask an admin to resend it."
      : urlError === "sso_failed"
        ? SSO_CALLBACK_ERROR
        : urlError === "invite_expired"
        ? "This invite link has expired. Ask your admin to send you a fresh one."
        : null);

  if (hashAuthState === "processing") {
    return (
      <AuthShell
        loginHero
        pose="wave"
        message="Hi! I'm Andrea. I'll walk you through your first calls."
      >
        <p
          role="status"
          className="font-[family-name:var(--font-body)] text-sm font-semibold text-[var(--text-muted)]"
        >
          Finishing sign in...
        </p>
      </AuthShell>
    );
  }

  if (errorMessage === SUSPENDED_ERROR) {
    return <SuspendedNotice />;
  }

  return (
    <AuthShell
      loginHero
      pose="wave"
      message="Hi! I'm Andrea. I'll walk you through your first calls."
    >
      <h2 className="font-[family-name:var(--font-display)] text-[30px] leading-tight font-bold text-[var(--ink-900)]">
        Sign in
      </h2>
      {bmhIdSsoEnabled() ? (
        <div className="flex flex-col gap-[18px]">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            block
            disabled={ssoPending}
            iconLeft={<KeyRound aria-hidden size={20} />}
            onClick={() => void signInWithBmhId()}
          >
            {ssoPending ? "Redirecting..." : "Continue with Hugo"}
          </Button>
          <div
            aria-hidden
            className="flex items-center gap-3 font-[family-name:var(--font-body)] text-sm font-bold text-[var(--text-muted)]"
          >
            <span className="h-[2px] flex-1 rounded-full bg-[var(--ink-100)]" />
            or
            <span className="h-[2px] flex-1 rounded-full bg-[var(--ink-100)]" />
          </div>
        </div>
      ) : null}
      <form action={formAction} className="flex flex-col gap-[18px]">
        <input type="hidden" name="next" value={next} />
        <Input
          id="email"
          name="email"
          type="email"
          label="Work email"
          icon={<Mail aria-hidden size={18} />}
          autoComplete="email"
          required
        />
        <Input
          id="password"
          name="password"
          type="password"
          label="Password"
          icon={<LockKeyhole aria-hidden size={18} />}
          autoComplete="current-password"
          required
        />
        {errorMessage ? (
          <Card
            role="alert"
            aria-live="assertive"
            padding="sm"
            tint
            style={{
              border: "2px solid var(--danger)",
              color: "var(--danger)",
              fontFamily: "var(--font-body)",
              fontSize: "var(--fs-body-sm)",
              fontWeight: 700,
            }}
          >
            {errorMessage}
          </Card>
        ) : null}
        <Button
          type="submit"
          size="lg"
          block
          disabled={pending}
          iconRight={<ArrowRight aria-hidden size={20} />}
        >
          {pending ? "Signing in..." : "Continue"}
        </Button>
        <Link
          href="/forgot-password"
          className="text-center font-[family-name:var(--font-body)] text-sm font-bold text-[var(--action)] underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--action)]"
        >
          Forgot password?
        </Link>
      </form>
    </AuthShell>
  );
}

function LoginFormFallback() {
  return (
    <AuthShell
      loginHero
      pose="wave"
      message="Hi! I'm Andrea. I'll walk you through your first calls."
    >
      <h2 className="font-[family-name:var(--font-display)] text-[30px] leading-tight font-bold text-[var(--ink-900)]">
        Sign in
      </h2>
      <div className="flex flex-col gap-[18px]" aria-busy="true">
        <Input id="email" label="Work email" type="email" disabled />
        <Input id="password" label="Password" type="password" disabled />
        <Button size="lg" block disabled>
          Loading...
        </Button>
      </div>
    </AuthShell>
  );
}

function SuspendedNotice() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--surface-app)] p-6">
      <div
        role="alert"
        aria-live="assertive"
        className="flex max-w-[460px] flex-col items-center gap-[18px] text-center"
      >
        <Mascot emotion="worried" height={150} />
        <h1 className="font-[family-name:var(--font-display)] text-[30px] leading-tight font-extrabold text-[var(--ink-900)]">
          Account paused
        </h1>
        <p className="font-[family-name:var(--font-body)] text-base leading-[1.55] font-semibold text-[var(--text-body)]">
          Your BMH Institute access is currently suspended. Contact your
          administrator to reactivate it.
        </p>
        <Button
          variant="secondary"
          onClick={() => window.location.assign("/login")}
        >
          Back to sign in
        </Button>
      </div>
    </main>
  );
}
