"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useActionState } from "react";

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
  const actionError = state && !state.ok ? state.error : null;
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "";
  const urlError = searchParams.get("error");

  const errorMessage =
    actionError ??
    (urlError === "invite_failed"
      ? "Invite link couldn't be verified. Ask an admin to resend it."
      : null);

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
