"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
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
  const iframeRef = useRef<HTMLIFrameElement>(null);
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
          eventSource: event.source,
          trustedSource: iframeRef.current?.contentWindow ?? null,
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
            completionToken: data.completion_token,
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
      <div className="rounded-[var(--bmh-radius-md)] border border-dashed border-[var(--ink-300)] bg-[var(--ink-050)] p-6 text-center font-[family-name:var(--font-body)] text-sm font-semibold text-[var(--text-muted)]">
        Role play not configured.
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-[var(--bmh-radius-lg)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--bmh-shadow-sm)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-hairline)] bg-[var(--surface-tint)] px-5 py-4 font-[family-name:var(--font-body)]">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-[var(--ink-900)]">
            {title || "Role play"}
          </h2>
          <p className="mt-0.5 text-xs font-bold text-[var(--text-muted)]">
            {complete
              ? "Completed"
              : ready
                ? "Ready"
                : "Loading role play"}
          </p>
        </div>
        {complete ? (
          <div className="flex items-center gap-1 rounded-full bg-[var(--success-soft)] px-2.5 py-1 text-xs font-extrabold text-[var(--success)]">
            <CheckCircle2 className="size-4" />
            Complete
          </div>
        ) : null}
      </div>
      <iframe
        ref={iframeRef}
        src={iframeSrc}
        title={title || "Role play"}
        allow="microphone; camera; clipboard-write"
        sandbox="allow-scripts allow-same-origin allow-forms"
        className={cn("w-full", pending && "opacity-80")}
        style={{ height: `${heightPx}px` }}
      />
      {error ? (
        <p className="border-t border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 font-[family-name:var(--font-body)] text-sm font-bold text-[var(--danger)]">
          {error}
        </p>
      ) : null}
    </section>
  );
}
