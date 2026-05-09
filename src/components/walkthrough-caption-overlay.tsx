"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

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

export function WalkthroughCaptionOverlay() {
  const searchParams = useSearchParams();
  const caption = searchParams.get("walkthroughCaption")?.trim();
  const backHref = normalizeHref(searchParams.get("walkthroughBack"));
  const nextHref = normalizeHref(searchParams.get("walkthroughNext"));

  if (!caption) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto fixed bottom-4 left-1/2 z-[60] flex max-h-[18vh] w-auto max-w-[min(48rem,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 overflow-y-auto rounded-md bg-slate-950/80 px-4 py-3 text-sm leading-relaxed font-medium text-white shadow-2xl backdrop-blur-sm print:hidden"
    >
      <p className="min-w-0 flex-1">{caption}</p>
      <div className="flex shrink-0 items-center gap-2">
        <WizardControl direction="back" href={backHref} />
        <WizardControl direction="next" href={nextHref} />
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
    <Link href={href} aria-label={label} className={className}>
      {label}
    </Link>
  );
}
