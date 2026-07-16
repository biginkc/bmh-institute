"use client";

import { useActionState } from "react";
import { ArrowRight, LockKeyhole, Mail } from "lucide-react";

import { Button, Card, Input } from "@/components/bmh-ds";

import { setPassword, type SetPasswordState } from "./actions";

export function SetPasswordForm({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState<
    SetPasswordState,
    FormData
  >(setPassword, null);

  return (
    <form action={formAction} className="flex flex-col gap-[18px]">
      <Input
        id="email"
        label="Email"
        value={email}
        icon={<Mail aria-hidden size={18} />}
        disabled
        readOnly
      />
      <Input
        id="password"
        name="password"
        type="password"
        label="New password"
        icon={<LockKeyhole aria-hidden size={18} />}
        hint="At least 8 characters"
        autoComplete="new-password"
        required
        minLength={8}
      />
      <Input
        id="confirm"
        name="confirm"
        type="password"
        label="Confirm password"
        icon={<LockKeyhole aria-hidden size={18} />}
        autoComplete="new-password"
        required
        minLength={8}
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
      <Button
        type="submit"
        size="lg"
        block
        disabled={pending}
        iconRight={<ArrowRight aria-hidden size={20} />}
      >
        {pending ? "Saving..." : "Finish setup"}
      </Button>
    </form>
  );
}
