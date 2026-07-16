"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/bmh-ds/button";
import { Coach } from "@/components/bmh-ds/coach";

import {
  BMH_DEMO_WALKTHROUGH_ID,
  getBmhDemoWalkthroughStep,
  getBmhDemoWalkthroughUrl,
} from "@/lib/walkthrough/bmh-demo";

const STORAGE_KEY = "bmh-institute.walkthrough";
const PROGRESS_STEP_COUNT = 4;

const STEP_EMOTIONS = ["smile", "curious", "thinking", "content"] as const;

type WalkthroughState = {
  caption: string;
  backHref: string | null;
  nextHref: string | null;
  path: string;
};

function normalizeHref(href: string | null) {
  const trimmed = href?.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("/") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  return null;
}

function readStoredWalkthrough(): WalkthroughState | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<WalkthroughState>;
    const caption = typeof parsed.caption === "string" ? parsed.caption : "";
    const path = typeof parsed.path === "string" ? parsed.path : "";

    if (!caption.trim() || !path || path !== window.location.pathname) {
      return null;
    }

    return {
      caption: caption.trim(),
      backHref: normalizeHref(parsed.backHref ?? null),
      nextHref: normalizeHref(parsed.nextHref ?? null),
      path,
    };
  } catch {
    return null;
  }
}

function writeStoredWalkthrough(state: WalkthroughState) {
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getDisplayedStep(caption: string, nativeStep: number | null) {
  if (nativeStep && Number.isInteger(nativeStep) && nativeStep > 0) {
    return nativeStep;
  }

  const captionStep = caption.match(/^Step\s+(\d+)/i)?.[1];
  const parsedStep = Number(captionStep);

  return Number.isInteger(parsedStep) && parsedStep > 0 ? parsedStep : null;
}

export function WalkthroughCaptionOverlay() {
  const searchParams = useSearchParams();
  const captionFromUrl = searchParams.get("walkthroughCaption")?.trim() ?? "";
  const backFromUrl = searchParams.get("walkthroughBack");
  const nextFromUrl = searchParams.get("walkthroughNext");
  const walkthroughId = searchParams.get("walkthrough");
  const walkthroughStep = Number(searchParams.get("step"));
  const nativeStepState = useMemo(() => {
    if (
      walkthroughId !== BMH_DEMO_WALKTHROUGH_ID ||
      !Number.isInteger(walkthroughStep)
    ) {
      return null;
    }

    const step = getBmhDemoWalkthroughStep(walkthroughStep);

    if (!step) {
      return null;
    }

    return {
      caption: step.caption,
      backHref: getBmhDemoWalkthroughUrl(walkthroughStep - 1),
      nextHref: getBmhDemoWalkthroughUrl(walkthroughStep + 1),
      path: step.path,
    };
  }, [walkthroughId, walkthroughStep]);
  const stateFromUrl = useMemo(
    () =>
      nativeStepState ??
      (captionFromUrl
        ? {
            caption: captionFromUrl,
            backHref: normalizeHref(backFromUrl),
            nextHref: normalizeHref(nextFromUrl),
            path: typeof window === "undefined" ? "" : window.location.pathname,
          }
        : null),
    [backFromUrl, captionFromUrl, nativeStepState, nextFromUrl],
  );
  const [storedState, setStoredState] = useState<WalkthroughState | null>(() =>
    typeof window === "undefined" ? null : readStoredWalkthrough(),
  );
  const activeState = stateFromUrl ?? storedState;

  useEffect(() => {
    if (!stateFromUrl) {
      return;
    }

    writeStoredWalkthrough(stateFromUrl);
    const timer = window.setTimeout(() => setStoredState(stateFromUrl), 0);
    return () => window.clearTimeout(timer);
  }, [stateFromUrl]);

  if (!activeState) {
    return null;
  }

  const displayedStep = getDisplayedStep(
    activeState.caption,
    nativeStepState ? walkthroughStep : null,
  );
  const emotion = STEP_EMOTIONS[
    Math.min(displayedStep ?? 2, PROGRESS_STEP_COUNT) - 1
  ];
  const skipPath = activeState.path;

  function skipTour() {
    window.sessionStorage.removeItem(STORAGE_KEY);
    window.location.assign(skipPath);
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto fixed bottom-4 left-1/2 z-[60] max-h-[18vh] w-[min(35rem,calc(100vw-2rem))] max-w-[min(48rem,calc(100vw-2rem))] -translate-x-1/2 overflow-y-auto bg-slate-950/80 text-white print:hidden"
      style={{
        background: "transparent",
        color: "var(--ink-900)",
        maxHeight: "none",
      }}
    >
      <Coach
        emotion={emotion}
        height={72}
        tone="white"
        size="sm"
        align="flex-start"
        message={
          <div className="min-w-0 font-[family-name:var(--font-body)]">
            <div className="mb-2 flex items-center justify-between gap-3">
              {displayedStep ? (
                <div
                  aria-label={`Walkthrough progress, step ${displayedStep}`}
                  className="flex items-center gap-1.5"
                >
                  <span className="text-[11px] font-extrabold text-[var(--text-muted)]">
                    Step {displayedStep}
                  </span>
                  <span aria-hidden="true" className="flex gap-1">
                    {Array.from({ length: PROGRESS_STEP_COUNT }, (_, index) => (
                      <span
                        key={index}
                        className={`h-1.5 w-5 rounded-full ${
                          index < Math.min(displayedStep, PROGRESS_STEP_COUNT)
                            ? "bg-[var(--yellow-500)]"
                            : "bg-[var(--ink-200)]"
                        }`}
                      />
                    ))}
                  </span>
                </div>
              ) : (
                <span />
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={skipTour}
                style={{ padding: "5px 7px", color: "var(--text-muted)" }}
              >
                Skip tour
              </Button>
            </div>
            <p className="text-sm leading-snug font-bold text-[var(--ink-900)]">
              {activeState.caption}
            </p>
            <div className="mt-3 flex items-center justify-end gap-2">
              <WizardControl direction="back" href={activeState.backHref} />
              <WizardControl direction="next" href={activeState.nextHref} />
            </div>
          </div>
        }
      />
    </div>
  );
}

function WizardControl({
  direction,
  href,
}: {
  direction: "back" | "next";
  href: string | null;
}) {
  const label = direction === "back" ? "Back" : "Next";
  const icon =
    direction === "back" ? (
      <ChevronLeft aria-hidden="true" size={16} />
    ) : (
      <ChevronRight aria-hidden="true" size={16} />
    );

  if (!href) {
    return (
      <Button
        disabled
        aria-label={label}
        variant={direction === "back" ? "secondary" : "primary"}
        size="sm"
        iconLeft={direction === "back" ? icon : undefined}
        iconRight={direction === "next" ? icon : undefined}
      >
        {label}
      </Button>
    );
  }

  return (
    <span className="relative inline-flex">
      <Button
        tabIndex={-1}
        aria-hidden="true"
        variant={direction === "back" ? "secondary" : "primary"}
        size="sm"
        iconLeft={direction === "back" ? icon : undefined}
        iconRight={direction === "next" ? icon : undefined}
        style={{ pointerEvents: "none" }}
      >
        {label}
      </Button>
      <a
        href={href}
        aria-label={label}
        className="absolute inset-0 rounded-[var(--bmh-radius-sm)] focus-visible:ring-4 focus-visible:ring-[var(--focus-ring)] focus-visible:outline-none"
      />
    </span>
  );
}
