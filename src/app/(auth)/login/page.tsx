"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ArrowRight, KeyRound } from "lucide-react";

import { Button, Card } from "@/components/bmh-ds";

import { AuthShell } from "../auth-shell";

const SSO_CALLBACK_ERROR =
  "Hugo sign-in didn't complete. Try again or contact your administrator.";

function authErrorMessage(error: string | null) {
  if (error === "access_denied") {
    return "This Hugo account has not been granted access to BMH Institute.";
  }
  if (error === "suspended") {
    return "Your BMH Institute access is paused. Contact your administrator.";
  }
  return error ? SSO_CALLBACK_ERROR : null;
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFormFallback />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "";
  const errorMessage = authErrorMessage(searchParams.get("error"));

  return (
    <AuthShell
      loginHero
      pose="wave"
      message="Hi! I'm Andrea. I'll walk you through your first calls."
    >
      <h2 className="font-[family-name:var(--font-display)] text-[30px] leading-tight font-bold text-[var(--ink-900)]">
        Sign in to BMH Institute
      </h2>
      <p className="font-[family-name:var(--font-body)] text-sm font-semibold text-[var(--text-muted)]">
        Hugo is the secure BMH account used to enter Institute.
      </p>
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
      <form action="/auth/hugo" method="get">
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <Button
          type="submit"
          size="lg"
          block
          iconLeft={<KeyRound aria-hidden size={20} />}
          iconRight={<ArrowRight aria-hidden size={20} />}
        >
          Continue with Hugo
        </Button>
      </form>
      <p className="font-[family-name:var(--font-body)] text-xs font-semibold text-[var(--text-muted)]">
        Passwords and recovery for Institute are managed in Hugo.
      </p>
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
        Sign in to BMH Institute
      </h2>
      <Button size="lg" block disabled>
        Loading Hugo sign-in...
      </Button>
    </AuthShell>
  );
}
