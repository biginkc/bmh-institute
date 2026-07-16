import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadVideoProgress = vi.fn();
const recordVideoProgress = vi.fn();

vi.mock("@/app/(dashboard)/lessons/[lessonId]/actions", () => ({
  loadVideoProgress: (...args: unknown[]) => loadVideoProgress(...args),
  recordVideoProgress: (...args: unknown[]) => recordVideoProgress(...args),
}));

import { VideoBlockPlayer } from "./video-block-player";

describe("<VideoBlockPlayer />", () => {
  beforeEach(() => {
    loadVideoProgress.mockReset();
    loadVideoProgress.mockResolvedValue({
      ok: true,
      positionSeconds: 0,
      watchedRanges: [],
      completed: false,
    });
    recordVideoProgress.mockReset();
    recordVideoProgress.mockResolvedValue({
      ok: true,
      watchedPercent: 0,
      completed: false,
    });
  });

  it("uses the real media duration in the branded play overlay", () => {
    render(<VideoBlockPlayer blockId="block-1" src="https://example.com/video.mp4" />);

    const video = screen.getByLabelText("Lesson video") as HTMLVideoElement;
    Object.defineProperty(video, "duration", { configurable: true, value: 100 });
    fireEvent.loadedMetadata(video);

    expect(screen.getByRole("button", { name: "Play lesson video" })).toBeVisible();
    expect(screen.getByText("1:40")).toBeVisible();
  });

  it("records only contiguous playback samples and does not complete from a seek", () => {
    render(<VideoBlockPlayer blockId="block-1" src="https://example.com/video.mp4" />);

    const video = screen.getByLabelText("Lesson video") as HTMLVideoElement;
    Object.defineProperties(video, {
      duration: { configurable: true, value: 100 },
      currentTime: { configurable: true, writable: true, value: 89 },
    });

    fireEvent.play(video);
    fireEvent.timeUpdate(video);
    fireEvent.seeking(video);
    video.currentTime = 94;
    fireEvent.seeked(video);
    fireEvent.timeUpdate(video);
    video.currentTime = 95;
    fireEvent.timeUpdate(video);

    expect(recordVideoProgress).not.toHaveBeenCalledWith(
      expect.objectContaining({ observedFrom: 89, observedTo: 94 }),
    );
  });

  it("serializes progress writes so a later sample cannot overwrite stale ranges", async () => {
    type ProgressSuccess = {
      ok: true;
      positionSeconds: number;
      watchedRanges: [];
      watchedPercent: number;
      completed: boolean;
    };
    let resolveFirst: (value: ProgressSuccess) => void = () => undefined;
    recordVideoProgress
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValue({
        ok: true,
        positionSeconds: 10,
        watchedRanges: [],
        watchedPercent: 10,
        completed: false,
      });

    render(<VideoBlockPlayer blockId="block-1" src="https://example.com/video.mp4" />);
    const video = screen.getByLabelText("Lesson video") as HTMLVideoElement;
    Object.defineProperties(video, {
      duration: { configurable: true, value: 100 },
      currentTime: { configurable: true, writable: true, value: 0 },
    });

    fireEvent.play(video);
    video.currentTime = 5;
    fireEvent.timeUpdate(video);
    video.currentTime = 10;
    fireEvent.timeUpdate(video);

    await waitFor(() => expect(recordVideoProgress).toHaveBeenCalledTimes(1));
    resolveFirst({
      ok: true,
      positionSeconds: 5,
      watchedRanges: [],
      watchedPercent: 5,
      completed: false,
    });
    await waitFor(() => expect(recordVideoProgress).toHaveBeenCalledTimes(2));
  });

  it("retries a failed write once and shows a visible save warning", async () => {
    recordVideoProgress.mockResolvedValue({
      ok: false,
      error: "temporary database error",
    });
    render(<VideoBlockPlayer blockId="block-1" src="https://example.com/video.mp4" />);
    const video = screen.getByLabelText("Lesson video") as HTMLVideoElement;
    Object.defineProperties(video, {
      duration: { configurable: true, value: 100 },
      currentTime: { configurable: true, writable: true, value: 0 },
    });

    fireEvent.play(video);
    video.currentTime = 5;
    fireEvent.timeUpdate(video);

    await waitFor(() => expect(recordVideoProgress).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Video progress could not be saved",
    );
  });
});
