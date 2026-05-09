"use client";

import { useSearchParams } from "next/navigation";

export function WalkthroughCaptionOverlay() {
  const searchParams = useSearchParams();
  const caption = searchParams.get("walkthroughCaption")?.trim();

  if (!caption) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 left-1/2 z-[60] max-h-[18vh] w-auto max-w-[min(44rem,calc(100vw-2rem))] -translate-x-1/2 overflow-y-auto rounded-md bg-slate-950/80 px-4 py-3 text-sm leading-relaxed font-medium text-white shadow-2xl backdrop-blur-sm print:hidden"
    >
      {caption}
    </div>
  );
}
