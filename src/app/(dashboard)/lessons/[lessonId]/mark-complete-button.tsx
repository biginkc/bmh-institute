"use client";

import { useTransition } from "react";
import { Check, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/bmh-ds/button";

import { markLessonComplete } from "./actions";

export function MarkCompleteButton({
  lessonId,
  alreadyComplete,
}: {
  lessonId: string;
  alreadyComplete: boolean;
}) {
  const [pending, startTransition] = useTransition();

  if (alreadyComplete) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full bg-[var(--success-soft)] px-3 py-2 font-[family-name:var(--font-body)] text-sm font-extrabold text-[var(--success)]">
        <CheckCircle2 className="size-4" />
        Lesson complete
      </div>
    );
  }

  return (
    <Button
      onClick={() => {
        startTransition(async () => {
          const result = await markLessonComplete(lessonId);
          if (result.ok) {
            toast.success(
              result.blocksMarked === 0
                ? "Lesson already complete."
                : "Lesson marked complete.",
            );
          } else {
            toast.error(result.error);
          }
        });
      }}
      disabled={pending}
      iconLeft={pending ? undefined : <Check aria-hidden="true" className="size-4" />}
    >
      {pending ? "Marking..." : "Mark complete"}
    </Button>
  );
}
