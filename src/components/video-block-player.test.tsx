import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const markBlockComplete = vi.fn();

vi.mock("@/app/(dashboard)/lessons/[lessonId]/actions", () => ({
  markBlockComplete: (...args: unknown[]) => markBlockComplete(...args),
}));

import { VideoBlockPlayer } from "./video-block-player";

describe("<VideoBlockPlayer />", () => {
  beforeEach(() => {
    markBlockComplete.mockReset();
  });

  it("uses the real media duration in the branded play overlay", () => {
    render(<VideoBlockPlayer blockId="block-1" src="https://example.com/video.mp4" />);

    const video = screen.getByLabelText("Lesson video") as HTMLVideoElement;
    Object.defineProperty(video, "duration", { configurable: true, value: 100 });
    fireEvent.loadedMetadata(video);

    expect(screen.getByRole("button", { name: "Play lesson video" })).toBeVisible();
    expect(screen.getByText("1:40")).toBeVisible();
  });

  it("marks the block complete once after playback reaches 90 percent", () => {
    render(<VideoBlockPlayer blockId="block-1" src="https://example.com/video.mp4" />);

    const video = screen.getByLabelText("Lesson video") as HTMLVideoElement;
    Object.defineProperties(video, {
      duration: { configurable: true, value: 100 },
      currentTime: { configurable: true, writable: true, value: 89 },
    });

    fireEvent.timeUpdate(video);
    expect(markBlockComplete).not.toHaveBeenCalled();

    video.currentTime = 90;
    fireEvent.timeUpdate(video);
    video.currentTime = 95;
    fireEvent.timeUpdate(video);

    expect(markBlockComplete).toHaveBeenCalledTimes(1);
    expect(markBlockComplete).toHaveBeenCalledWith("block-1");
  });
});
