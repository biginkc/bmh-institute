"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { resendInvite } from "./actions";

export function ResendInviteButton({ inviteId }: { inviteId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const result = await resendInvite(inviteId);
          if (!result.ok) toast.error(result.error);
          else toast.success("Fresh invite sent.");
        });
      }}
    >
      {pending ? "..." : "Resend"}
    </Button>
  );
}
