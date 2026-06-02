"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  changePassword,
  updateProfile,
  type UpdateProfileState,
} from "./actions";

export function UpdateNameForm({ defaultName }: { defaultName: string }) {
  const [state, formAction, pending] = useActionState<
    UpdateProfileState,
    FormData
  >(updateProfile, null);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="full_name">Full name</Label>
        <Input
          id="full_name"
          name="full_name"
          defaultValue={defaultName}
          maxLength={200}
          required
        />
      </div>
      {state && !state.ok ? (
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm">
          {state.error}
        </div>
      ) : null}
      {state && state.ok ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
          Saved.
        </div>
      ) : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save name"}
        </Button>
      </div>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState<
    UpdateProfileState,
    FormData
  >(changePassword, null);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          minLength={8}
          autoComplete="new-password"
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          minLength={8}
          autoComplete="new-password"
          required
        />
      </div>
      {state && !state.ok ? (
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm">
          {state.error}
        </div>
      ) : null}
      {state && state.ok ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
          Password changed. It&apos;s live across the app.
        </div>
      ) : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Updating..." : "Change password"}
        </Button>
      </div>
    </form>
  );
}
