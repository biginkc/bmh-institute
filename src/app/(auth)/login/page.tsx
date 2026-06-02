"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useActionState, useEffect, useState } from "react";

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
import { createClient } from "@/lib/supabase/client";

import { signIn } from "./actions";

/**
 * Next 16 requires `useSearchParams` to live inside a Suspense boundary so
 * static prerender can bail out of the subtree instead of failing the build.
 */
export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>BMH Institute · BMH Group</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<LoginFormFallback />}>
            <LoginForm />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}

function LoginForm() {
  const [state, formAction, pending] = useActionState(signIn, null);
  const [hashAuthState, setHashAuthState] = useState<
    "idle" | "processing" | "failed"
  >("idle");
  const actionError = state && !state.ok ? state.error : null;
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "";
  const urlError = searchParams.get("error");
  const inviteToken = searchParams.get("invite_token");

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
    (hashAuthState === "failed"
      ? "Invite link couldn't be verified. Ask an admin to resend it."
      : urlError === "invite_failed"
      ? "Invite link couldn't be verified. Ask an admin to resend it."
      : urlError === "invite_expired"
        ? "This invite link has expired. Ask your admin to send you a fresh one."
        : null);

  if (hashAuthState === "processing") {
    return (
      <div className="text-muted-foreground text-sm">
        Finishing sign in...
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
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
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link
            href="/forgot-password"
            className="text-muted-foreground hover:text-foreground text-xs"
          >
            Forgot password?
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {errorMessage ? (
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm">
          {errorMessage}
        </div>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}

function LoginFormFallback() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" disabled />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" disabled />
      </div>
      <Button disabled>Loading...</Button>
    </div>
  );
}
