"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import {
  BMH_DEMO_WALKTHROUGH_ID,
  getBmhDemoWalkthroughStep,
  getBmhDemoWalkthroughUrl,
} from "@/lib/walkthrough/bmh-demo";

const STORAGE_KEY = "bmh-institute.walkthrough";

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
    setStoredState(stateFromUrl);
  }, [stateFromUrl]);

  if (!activeState) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto fixed bottom-4 left-1/2 z-[60] flex max-h-[18vh] w-auto max-w-[min(48rem,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 overflow-y-auto rounded-md bg-slate-950/80 px-4 py-3 text-sm leading-relaxed font-medium text-white shadow-2xl backdrop-blur-sm print:hidden"
    >
      <p className="min-w-0 flex-1">{activeState.caption}</p>
      <div className="flex shrink-0 items-center gap-2">
        <WizardControl direction="back" href={activeState.backHref} />
        <WizardControl direction="next" href={activeState.nextHref} />
      </div>
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
  const className =
    "rounded-md border border-white/25 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

  if (!href) {
    return (
      <button
        type="button"
        disabled
        aria-label={label}
        className={`${className} cursor-not-allowed opacity-45`}
      >
        {label}
      </button>
    );
  }

  return (
    <a href={href} aria-label={label} className={className}>
      {label}
    </a>
  );
}
