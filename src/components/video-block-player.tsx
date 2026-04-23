"use client";

import { useRef } from "react";

import { markBlockComplete } from "@/app/(dashboard)/lessons/[lessonId]/actions";

/**
 * HTML5 video player that auto-marks its owning content block complete
 * once playback crosses 90% of duration. Fires at most once per mount.
 */
export function VideoBlockPlayer({
  blockId,
  src,
}: {
  blockId: string;
  src: string;
}) {
  const firedRef = useRef(false);

  function onTimeUpdate(e: React.SyntheticEvent<HTMLVideoElement>) {
    if (firedRef.current) return;
    const el = e.currentTarget;
    if (!el.duration || !isFinite(el.duration)) return;
    const ratio = el.currentTime / el.duration;
    if (ratio >= 0.9) {
      firedRef.current = true;
      // Fire-and-forget. The next page render sees the updated
      // user_block_progress row.
      void markBlockComplete(blockId);
    }
  }

  return (
    <div className="overflow-hidden rounded-md border">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        src={src}
        controls
        preload="metadata"
        className="h-auto w-full"
        onTimeUpdate={onTimeUpdate}
      />
    </div>
  );
}
