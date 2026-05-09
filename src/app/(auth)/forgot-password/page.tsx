"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    <div className="flex min-h-screen flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Reset password</CardTitle>
          <CardDescription>
            Enter the email from your BMH Institute invite. We&apos;ll send a
            link to set a new password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state && state.ok ? (
            <div className="flex flex-col gap-4">
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
                Check your inbox for a reset link. If the address is on file,
                it&apos;ll land there in a minute or two.
              </div>
              <Link
                href="/login"
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                ← Back to sign in
              </Link>
            </div>
          ) : (
            <form action={formAction} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </div>
              {state && !state.ok ? (
                <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm">
                  {state.error}
                </div>
              ) : null}
              <Button type="submit" disabled={pending}>
                {pending ? "Sending..." : "Send reset link"}
              </Button>
              <Link
                href="/login"
                className="text-muted-foreground hover:text-foreground text-center text-xs"
              >
                ← Back to sign in
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
