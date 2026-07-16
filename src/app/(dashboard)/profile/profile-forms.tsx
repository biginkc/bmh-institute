"use client";

import { useActionState } from "react";
import { LockKeyhole, UserRound } from "lucide-react";

import { Button } from "@/components/bmh-ds/button";
import { Input } from "@/components/bmh-ds/input";

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
    <form action={formAction} className="flex flex-col gap-4">
      <Input
        id="full_name"
        name="full_name"
        label="Full name"
        hint="Shown on certificates and in admin reports"
        icon={<UserRound aria-hidden="true" size={18} />}
        defaultValue={defaultName}
        maxLength={200}
        required
      />
      {state && !state.ok ? (
        <div
          role="alert"
          className="rounded-[var(--bmh-radius-md)] border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 font-[family-name:var(--font-body)] text-sm font-bold text-[var(--danger)]"
        >
          {state.error}
        </div>
      ) : null}
      {state && state.ok ? (
        <div
          role="status"
          className="rounded-[var(--bmh-radius-md)] border border-[var(--success)] bg-[var(--success-soft)] px-4 py-3 font-[family-name:var(--font-body)] text-sm font-bold text-[var(--success)]"
        >
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
    <form action={formAction} className="flex flex-col gap-4">
      <Input
        id="password"
        name="password"
        label="New password"
        hint="At least 8 characters"
        icon={<LockKeyhole aria-hidden="true" size={18} />}
        type="password"
        minLength={8}
        autoComplete="new-password"
        required
      />
      <Input
        id="confirm"
        name="confirm"
        label="Confirm new password"
        icon={<LockKeyhole aria-hidden="true" size={18} />}
        type="password"
        minLength={8}
        autoComplete="new-password"
        required
      />
      {state && !state.ok ? (
        <div
          role="alert"
          className="rounded-[var(--bmh-radius-md)] border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 font-[family-name:var(--font-body)] text-sm font-bold text-[var(--danger)]"
        >
          {state.error}
        </div>
      ) : null}
      {state && state.ok ? (
        <div
          role="status"
          className="rounded-[var(--bmh-radius-md)] border border-[var(--success)] bg-[var(--success-soft)] px-4 py-3 font-[family-name:var(--font-body)] text-sm font-bold text-[var(--success)]"
        >
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
