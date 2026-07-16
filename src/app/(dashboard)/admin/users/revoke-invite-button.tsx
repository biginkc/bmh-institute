"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/bmh-ds";

import { revokeInvite } from "./actions";

export function RevokeInviteButton({ inviteId }: { inviteId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      style={{ color: "var(--danger)" }}
      size="sm"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const result = await revokeInvite(inviteId);
          if (!result.ok) toast.error(result.error);
          else toast.success("Invite revoked.");
        });
      }}
    >
      {pending ? "..." : "Revoke"}
    </Button>
  );
}
