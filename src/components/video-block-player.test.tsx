import { fireEvent, render, screen } from "@testing-library/react";
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
});
