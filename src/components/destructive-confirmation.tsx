"use client";

import { useEffect } from "react";

import { Button, Card } from "@/components/bmh-ds";

export function DestructiveConfirmation({
  title,
  description,
  impact,
  confirmLabel = "Delete",
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  impact: string[];
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="destructive-confirmation-title"
        aria-describedby="destructive-confirmation-description"
        className="w-full max-w-lg"
      >
        <Card padding="md">
          <h2 id="destructive-confirmation-title" className="font-[family-name:var(--font-display)] text-xl font-bold text-[var(--ink-900)]">
            {title}
          </h2>
          <p id="destructive-confirmation-description" className="mt-2 text-sm text-[var(--text-muted)]">
            {description}
          </p>
          {impact.length ? (
            <div className="mt-4 rounded border border-[var(--border-hairline)] bg-[var(--paper)] p-3">
              <p className="text-xs font-extrabold uppercase tracking-wide text-[var(--text-muted)]">This will remove</p>
              <ul className="mt-2 list-disc pl-5 text-sm text-[var(--ink-900)]">
                {impact.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          ) : null}
          <div className="mt-5 flex justify-end gap-2">
            <Button autoFocus variant="secondary" onClick={onCancel}>Cancel</Button>
            <Button variant="warm" onClick={onConfirm}>{confirmLabel}</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
