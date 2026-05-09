"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";

import { completeRolePlayBlock } from "@/app/(dashboard)/lessons/[lessonId]/actions";
import {
  clampRolePlayHeight,
  getTrustedOrigin,
  isTrustedRolePlayMessage,
  parseRolePlayEvent,
} from "@/lib/role-plays/embed-events";
import { cn } from "@/lib/utils";

type RolePlayBlockProps = {
  blockId: string;
  scenarioId: string;
  title: string;
  iframeSrc: string;
  initialHeightPx: number;
};

export function RolePlayBlock({
  blockId,
  scenarioId,
  title,
  iframeSrc,
  initialHeightPx,
}: RolePlayBlockProps) {
  const [ready, setReady] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [heightPx, setHeightPx] = useState(clampRolePlayHeight(initialHeightPx));
  const [pending, startTransition] = useTransition();
  const trustedOrigin = useMemo(() => getTrustedOrigin(iframeSrc), [iframeSrc]);

  useEffect(() => {
    if (!trustedOrigin) return;

    function onMessage(event: MessageEvent) {
      const data = parseRolePlayEvent(event.data);
      if (!data) return;
      if (
        !isTrustedRolePlayMessage({
          eventOrigin: event.origin,
          trustedOrigin,
          expectedScenarioId: scenarioId,
          event: data,
        })
      ) {
        return;
      }

      if (data.type === "rp.ready") {
        setReady(true);
      } else if (data.type === "rp.height") {
        setHeightPx(clampRolePlayHeight(data.height_px));
      } else if (data.type === "rp.error") {
        setError(data.message || "Role play failed. Please try again.");
      } else if (data.type === "rp.complete") {
        startTransition(async () => {
          const result = await completeRolePlayBlock({
            blockId,
            scenarioId,
            attemptId: data.attempt_id,
            score: data.score,
            summaryUrl: data.summary_url,
          });
          if (result.ok) {
            setComplete(true);
            setError(null);
          } else {
            setError(result.error);
          }
        });
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [blockId, scenarioId, trustedOrigin]);

  if (!iframeSrc || !trustedOrigin) {
    return (
      <div className="border-border bg-muted/40 text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm">
        Role play not configured.
      </div>
    );
  }

  return (
    <section className="border-border overflow-hidden rounded-md border">
      <div className="border-border bg-card flex items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-medium">{title || "Role play"}</h2>
          <p className="text-muted-foreground text-xs">
            {complete
              ? "Completed"
              : ready
                ? "Ready"
                : "Loading role play"}
          </p>
        </div>
        {complete ? (
          <div className="text-emerald-700 dark:text-emerald-300 flex items-center gap-1 text-xs font-medium">
            <CheckCircle2 className="size-4" />
            Complete
          </div>
        ) : null}
      </div>
      <iframe
        src={iframeSrc}
        title={title || "Role play"}
        allow="microphone; camera; clipboard-write"
        sandbox="allow-scripts allow-same-origin allow-forms"
        className={cn("w-full", pending && "opacity-80")}
        style={{ height: `${heightPx}px` }}
      />
      {error ? (
        <p className="border-border bg-destructive/5 text-destructive border-t px-4 py-3 text-sm">
          {error}
        </p>
      ) : null}
    </section>
  );
}
