"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Mail } from "lucide-react";

import { Button, Card, Input } from "@/components/bmh-ds";

import { AuthShell } from "../auth-shell";
import {
  sendPasswordReset,
  type ForgotPasswordState,
} from "./actions";

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState<
    ForgotPasswordState,
    FormData
  >(sendPasswordReset, null);

  return (
    <AuthShell
      pose="present"
      message="No worries. Enter your email and I'll send a reset link."
    >
      {state && state.ok ? (
        <>
          <h1 className="font-[family-name:var(--font-display)] text-[28px] leading-tight font-bold text-[var(--ink-900)]">
            Check your email
          </h1>
          <Card
            role="status"
            aria-live="polite"
            padding="sm"
            tint
            style={{
              color: "var(--text-body)",
              fontFamily: "var(--font-body)",
              fontSize: "var(--fs-body-sm)",
              fontWeight: 700,
              lineHeight: 1.55,
            }}
          >
            Check your inbox for a reset link. If the address is on file,
            it&apos;ll land there in a minute or two.
          </Card>
          <AuthLink />
        </>
      ) : (
        <>
          <h1 className="font-[family-name:var(--font-display)] text-[28px] leading-tight font-bold text-[var(--ink-900)]">
            Reset password
          </h1>
          <p className="font-[family-name:var(--font-body)] text-sm leading-[1.55] font-semibold text-[var(--text-muted)]">
            Enter the email from your BMH Institute invite. We&apos;ll send a
            link to set a new password.
          </p>
          <form action={formAction} className="flex flex-col gap-[18px]">
            <Input
              id="email"
              name="email"
              type="email"
              label="Work email"
              icon={<Mail aria-hidden size={18} />}
              autoComplete="email"
              required
            />
            {state && !state.ok ? (
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
                {state.error}
              </Card>
            ) : null}
            <Button type="submit" size="lg" block disabled={pending}>
              {pending ? "Sending..." : "Send reset link"}
            </Button>
            <AuthLink />
          </form>
        </>
      )}
    </AuthShell>
  );
}

function AuthLink() {
  return (
    <Link
      href="/login"
      className="text-center font-[family-name:var(--font-body)] text-sm font-bold text-[var(--action)] underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--action)]"
    >
      Back to sign in
    </Link>
  );
}
