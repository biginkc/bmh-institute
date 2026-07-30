"use client";

import { useEffect, useRef, useState } from "react";

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
  onConfirm: () => void | Promise<void>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const activatedRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    if (activatedRef.current) return;
    activatedRef.current = true;
    setSubmitting(true);
    try {
      await onConfirm();
    } catch {
      activatedRef.current = false;
      setSubmitting(false);
    }
  }

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )).filter((element) => !element.hasAttribute("disabled"));
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!activatedRef.current) onCancel();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      if (!elements.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="destructive-confirmation-title"
        aria-describedby="destructive-confirmation-description"
        aria-busy={submitting}
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
            <Button variant="secondary" onClick={onCancel} disabled={submitting}>Cancel</Button>
            <Button variant="warm" onClick={handleConfirm} disabled={submitting} aria-busy={submitting}>
              {submitting ? "Deleting..." : confirmLabel}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
