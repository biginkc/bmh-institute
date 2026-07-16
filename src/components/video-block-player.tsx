"use client";

import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";

import {
  loadVideoProgress,
  recordVideoProgress,
} from "@/app/(dashboard)/lessons/[lessonId]/actions";

/**
 * HTML5 video player that records short contiguous playback observations.
 * Seeking moves the resume point but does not add watched coverage.
 */
export function VideoBlockPlayer({
  blockId,
  src,
  posterSrc,
  captionsSrc,
  transcriptSrc,
}: {
  blockId: string;
  src: string;
  posterSrc?: string;
  captionsSrc?: string;
  transcriptSrc?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sampleStartRef = useRef<number | null>(null);
  const resumePositionRef = useRef(0);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [progressError, setProgressError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    mountedRef.current = true;
    void loadVideoProgress(blockId).then((result) => {
      if (!active || !result.ok) return;
      resumePositionRef.current = result.positionSeconds;
      const video = videoRef.current;
      if (video?.readyState && result.positionSeconds > 0) {
        video.currentTime = result.positionSeconds;
      }
    });
    return () => {
      active = false;
      mountedRef.current = false;
      const video = videoRef.current;
      if (video && !video.paused) flushProgress(video);
    };
  }, [blockId]);

  useEffect(() => {
    function flushWhenHidden() {
      if (document.visibilityState !== "hidden") return;
      const video = videoRef.current;
      if (video) flushProgress(video);
    }
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => document.removeEventListener("visibilitychange", flushWhenHidden);
  });

  function onTimeUpdate(e: React.SyntheticEvent<HTMLVideoElement>) {
    const el = e.currentTarget;
    if (!el.duration || !isFinite(el.duration)) return;
    if (sampleStartRef.current === null) {
      sampleStartRef.current = el.currentTime;
      return;
    }
    if (el.currentTime - sampleStartRef.current < 5) return;
    flushProgress(el);
  }

  function flushProgress(el: HTMLVideoElement) {
    const observedFrom = sampleStartRef.current;
    if (observedFrom === null || el.currentTime <= observedFrom) return;
    const observedTo = el.currentTime;
    sampleStartRef.current = observedTo;
    enqueueProgress({
      blockId,
      positionSeconds: observedTo,
      durationSeconds: el.duration,
      observedFrom,
      observedTo,
    });
  }

  function enqueueProgress(
    progress: Parameters<typeof recordVideoProgress>[0],
  ) {
    writeQueueRef.current = writeQueueRef.current.then(async () => {
      let result: Awaited<ReturnType<typeof recordVideoProgress>> | null = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          result = await recordVideoProgress(progress);
        } catch {
          result = null;
        }
        if (result?.ok) break;
      }
      if (!mountedRef.current) return;
      setProgressError(
        result?.ok
          ? null
          : "Video progress could not be saved. Pause and resume playback to retry.",
      );
    });
  }

  function playVideo() {
    const promise = videoRef.current?.play();
    if (promise) {
      void promise.catch(() => setPlaying(false));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-video overflow-hidden rounded-[var(--bmh-radius-lg)] border-[2.5px] border-[var(--ink-900)] bg-[var(--thumb-blue)] shadow-[var(--bmh-shadow-sm)]">
        <video
          ref={videoRef}
          src={src}
          poster={posterSrc}
          controls
          preload="metadata"
          aria-label="Lesson video"
          className="h-full w-full bg-[var(--ink-900)] object-contain"
          onLoadedMetadata={(event) => {
            const nextDuration = event.currentTarget.duration;
            setDuration(Number.isFinite(nextDuration) ? nextDuration : 0);
            if (resumePositionRef.current > 0) {
              event.currentTarget.currentTime = Math.min(
                resumePositionRef.current,
                nextDuration,
              );
            }
          }}
          onPlay={(event) => {
            setPlaying(true);
            sampleStartRef.current = event.currentTarget.currentTime;
          }}
          onSeeking={() => {
            sampleStartRef.current = null;
          }}
          onSeeked={(event) => {
            sampleStartRef.current = event.currentTarget.currentTime;
          }}
          onPause={(event) => {
            flushProgress(event.currentTarget);
            setPlaying(false);
          }}
          onEnded={(event) => {
            flushProgress(event.currentTarget);
            setPlaying(false);
          }}
          onTimeUpdate={onTimeUpdate}
        >
          {captionsSrc ? (
            <track
              kind="captions"
              src={captionsSrc}
              srcLang="en"
              label="English"
              default
            />
          ) : null}
        </video>
        {!playing ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-gradient-to-b from-transparent via-transparent to-[rgb(14_17_22_/_18%)]">
            <button
              type="button"
              onClick={playVideo}
              aria-label="Play lesson video"
              className="pointer-events-auto flex size-20 items-center justify-center rounded-full bg-[rgb(14_17_22_/_86%)] text-white shadow-[var(--bmh-shadow-md)] transition-transform hover:scale-105 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-white active:scale-95"
            >
              <Play aria-hidden="true" className="ml-1 size-8 fill-current" />
            </button>
            {duration > 0 ? (
              <span className="absolute bottom-4 right-4 rounded-[var(--bmh-radius-sm)] bg-[rgb(14_17_22_/_86%)] px-2.5 py-1 font-[family-name:var(--font-body)] text-xs font-extrabold text-white">
                {formatDuration(duration)}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      {progressError ? (
        <p role="status" className="text-sm font-bold text-[var(--danger)]">
          {progressError}
        </p>
      ) : null}
      {transcriptSrc ? (
        <a
          href={transcriptSrc}
          target="_blank"
          rel="noopener noreferrer"
          className="w-fit text-sm font-extrabold text-[var(--action)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--action)]"
        >
          Open video transcript
        </a>
      ) : null}
    </div>
  );
}

function formatDuration(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  const remainder = wholeSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}
