"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  loadVideoProgress,
  recordVideoProgress,
  recordVideoSeek,
} from "@/app/(dashboard)/lessons/[lessonId]/actions";

const PROGRESS_SAMPLE_SECONDS = 2;

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
  title = "Lesson video",
  initialComplete = false,
}: {
  blockId: string;
  src: string;
  posterSrc?: string;
  captionsSrc?: string;
  transcriptSrc?: string;
  title?: string;
  initialComplete?: boolean;
}) {
  const { refresh } = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const sampleStartRef = useRef<number | null>(null);
  const resumePositionRef = useRef(0);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);
  const completedRef = useRef(initialComplete);
  const hasRecordedProgressRef = useRef(false);
  const playbackStartedRef = useRef(false);
  const playbackEndedRef = useRef(false);
  const refreshPendingRef = useRef(false);
  const refreshRequestedRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [watchedPercent, setWatchedPercent] = useState(0);
  const [completed, setCompleted] = useState(initialComplete);

  useEffect(() => {
    if (!initialComplete || completedRef.current) return;
    completedRef.current = true;
    setCompleted(true);
  }, [initialComplete]);

  const requestRefresh = useCallback(() => {
    if (refreshRequestedRef.current) return;
    refreshRequestedRef.current = true;
    refreshPendingRef.current = false;
    refresh();
  }, [refresh]);

  const requestRefreshWhenPlaybackSafe = useCallback(() => {
    if (!playbackStartedRef.current || playbackEndedRef.current) {
      requestRefresh();
      return;
    }
    refreshPendingRef.current = true;
  }, [requestRefresh]);

  const resynchronizeProgress = useCallback(async () => {
    let result: Awaited<ReturnType<typeof loadVideoProgress>> | null = null;
    try {
      result = await loadVideoProgress(blockId);
    } catch {
      result = null;
    }
    if (!result?.ok) return false;

    resumePositionRef.current = result.positionSeconds;
    sampleStartRef.current = result.positionSeconds;
    setWatchedPercent(result.watchedPercent);
    const transitionedToComplete = result.completed && !completedRef.current;
    if (result.completed) {
      completedRef.current = true;
      setCompleted(true);
    }
    const video = videoRef.current;
    if (video && Number.isFinite(result.positionSeconds)) {
      video.currentTime = result.positionSeconds;
    }
    if (transitionedToComplete || result.reconciled) {
      requestRefreshWhenPlaybackSafe();
    }
    return true;
  }, [blockId, requestRefreshWhenPlaybackSafe]);

  const enqueueProgress = useCallback(
    (progress: Parameters<typeof recordVideoProgress>[0]) => {
      hasRecordedProgressRef.current = true;
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
        if (result?.ok) {
          setWatchedPercent(result.watchedPercent);
          if (result.completed && !completedRef.current) {
            completedRef.current = true;
            setCompleted(true);
            requestRefreshWhenPlaybackSafe();
          }
        }
        const recovered = result?.ok ? true : await resynchronizeProgress();
        if (!mountedRef.current) return;
        setProgressError(
          recovered
            ? null
            : "Video progress could not be saved. Pause and resume playback to retry.",
        );
      });
    },
    [requestRefreshWhenPlaybackSafe, resynchronizeProgress],
  );

  const enqueueSeek = useCallback(
    (seek: Parameters<typeof recordVideoSeek>[0]) => {
      writeQueueRef.current = writeQueueRef.current.then(async () => {
        let result: Awaited<ReturnType<typeof recordVideoSeek>> | null = null;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            result = await recordVideoSeek(seek);
          } catch {
            result = null;
          }
          if (result?.ok) break;
        }
        if (!mountedRef.current) return;
        const recovered = result?.ok ? true : await resynchronizeProgress();
        if (!mountedRef.current) return;
        setProgressError(
          recovered
            ? null
            : "Video progress could not be saved. Pause and resume playback to retry.",
        );
      });
    },
    [resynchronizeProgress],
  );

  const flushProgress = useCallback(
    (el: HTMLVideoElement) => {
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
    },
    [blockId, enqueueProgress],
  );

  useEffect(() => {
    let active = true;
    const video = videoRef.current;
    mountedRef.current = true;
    void loadVideoProgress(blockId).then((result) => {
      if (!active || !result.ok) return;
      const canRestorePosition =
        !playbackStartedRef.current && !hasRecordedProgressRef.current;
      if (canRestorePosition) {
        resumePositionRef.current = result.positionSeconds;
      }
      const transitionedToComplete = result.completed && !completedRef.current;
      if (!hasRecordedProgressRef.current) {
        setWatchedPercent(result.watchedPercent);
        if (result.completed) {
          completedRef.current = true;
          setCompleted(true);
        }
      }
      if (canRestorePosition && video?.readyState && result.positionSeconds > 0) {
        sampleStartRef.current = result.positionSeconds;
        video.currentTime = result.positionSeconds;
      }
      if (transitionedToComplete || result.reconciled) {
        requestRefreshWhenPlaybackSafe();
      }
    });
    return () => {
      active = false;
      mountedRef.current = false;
      if (video && !video.paused) flushProgress(video);
    };
  }, [blockId, flushProgress, requestRefreshWhenPlaybackSafe]);

  useEffect(() => {
    function flushWhenHidden() {
      if (document.visibilityState !== "hidden") return;
      const video = videoRef.current;
      if (video) flushProgress(video);
    }
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => document.removeEventListener("visibilitychange", flushWhenHidden);
  }, [flushProgress]);

  function onTimeUpdate(e: React.SyntheticEvent<HTMLVideoElement>) {
    const el = e.currentTarget;
    if (!el.duration || !isFinite(el.duration)) return;
    if (sampleStartRef.current === null) {
      sampleStartRef.current = el.currentTime;
      return;
    }
    if (el.currentTime - sampleStartRef.current < PROGRESS_SAMPLE_SECONDS) return;
    flushProgress(el);
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
          aria-label={title}
          className="h-full w-full bg-[var(--ink-900)] object-contain"
          onLoadedMetadata={(event) => {
            const nextDuration = event.currentTarget.duration;
            setDuration(Number.isFinite(nextDuration) ? nextDuration : 0);
            if (
              !playbackStartedRef.current &&
              resumePositionRef.current > 0
            ) {
              event.currentTarget.currentTime = Math.min(
                resumePositionRef.current,
                nextDuration,
              );
            }
          }}
          onPlay={(event) => {
            playbackStartedRef.current = true;
            playbackEndedRef.current = false;
            setPlaying(true);
            sampleStartRef.current = event.currentTarget.currentTime;
          }}
          onSeeking={() => {
            playbackStartedRef.current = true;
            playbackEndedRef.current = false;
            sampleStartRef.current = null;
          }}
          onSeeked={(event) => {
            const seekPosition = event.currentTarget.currentTime;
            sampleStartRef.current = seekPosition;
            enqueueSeek({
              blockId,
              positionSeconds: seekPosition,
              durationSeconds: event.currentTarget.duration,
            });
          }}
          onPause={(event) => {
            flushProgress(event.currentTarget);
            setPlaying(false);
          }}
          onEnded={(event) => {
            playbackEndedRef.current = true;
            flushProgress(event.currentTarget);
            setPlaying(false);
            if (refreshPendingRef.current) requestRefresh();
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
      <p
        role="status"
        aria-live="polite"
        className="text-sm font-extrabold text-[var(--text-muted)]"
      >
        {completed ? "Complete" : `${watchedPercent}% watched`}
      </p>
      {progressError ? (
        <p role="alert" className="text-sm font-bold text-[var(--danger)]">
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
