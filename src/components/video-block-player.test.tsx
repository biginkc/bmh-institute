import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadVideoProgress = vi.fn();
const recordVideoProgress = vi.fn();
const recordVideoSeek = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/app/(dashboard)/lessons/[lessonId]/actions", () => ({
  loadVideoProgress: (...args: unknown[]) => loadVideoProgress(...args),
  recordVideoProgress: (...args: unknown[]) => recordVideoProgress(...args),
  recordVideoSeek: (...args: unknown[]) => recordVideoSeek(...args),
}));

import { VideoBlockPlayer } from "./video-block-player";

describe("<VideoBlockPlayer />", () => {
  beforeEach(() => {
    refresh.mockReset();
    loadVideoProgress.mockReset();
    loadVideoProgress.mockResolvedValue({
      ok: true,
      positionSeconds: 0,
      watchedRanges: [],
      watchedPercent: 0,
      completed: false,
    });
    recordVideoProgress.mockReset();
    recordVideoProgress.mockResolvedValue({
      ok: true,
      watchedPercent: 0,
      completed: false,
    });
    recordVideoSeek.mockReset();
    recordVideoSeek.mockResolvedValue({ ok: true, positionSeconds: 0 });
  });

  it("restores and announces persisted watched progress", async () => {
    loadVideoProgress.mockResolvedValue({
      ok: true,
      positionSeconds: 42,
      watchedRanges: [[0, 42]],
      watchedPercent: 42,
      completed: false,
    });

    render(
      <VideoBlockPlayer
        blockId="block-1"
        src="https://example.com/video.mp4"
        title="Opening the call"
      />,
    );

    expect(await screen.findByRole("status")).toHaveTextContent("42% watched");
    expect(screen.getByLabelText("Opening the call")).toBeVisible();
  });

  it("keeps server-rendered completion when the client load fails", async () => {
    loadVideoProgress.mockResolvedValue({
      ok: false,
      error: "Video progress could not be loaded.",
    });

    render(
      <VideoBlockPlayer
        blockId="block-1"
        src="https://example.com/video.mp4"
        initialComplete
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Complete");
    await waitFor(() => expect(loadVideoProgress).toHaveBeenCalled());
    expect(screen.getByRole("status")).toHaveTextContent("Complete");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does not apply a stale resume position after playback starts", async () => {
    let resolveLoad: (value: {
      ok: true;
      positionSeconds: number;
      watchedRanges: [];
      watchedPercent: number;
      completed: boolean;
    }) => void = () => undefined;
    loadVideoProgress.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLoad = resolve;
        }),
    );
    render(
      <VideoBlockPlayer
        blockId="block-1"
        src="https://example.com/video.mp4"
      />,
    );
    const video = screen.getByLabelText("Lesson video") as HTMLVideoElement;
    Object.defineProperties(video, {
      readyState: { configurable: true, value: 4 },
      duration: { configurable: true, value: 100 },
      currentTime: { configurable: true, writable: true, value: 15 },
    });

    fireEvent.play(video);
    await act(async () => {
      resolveLoad({
        ok: true,
        positionSeconds: 3,
        watchedRanges: [],
        watchedPercent: 3,
        completed: false,
      });
    });

    expect(video.currentTime).toBe(15);
  });

  it("announces completion but defers the lesson refresh until playback ends", async () => {
    recordVideoProgress.mockResolvedValue({
      ok: true,
      positionSeconds: 95,
      watchedRanges: [[0, 95]],
      watchedPercent: 95,
      completed: true,
    });
    render(
      <VideoBlockPlayer
        blockId="block-1"
        src="https://example.com/video.mp4"
      />,
    );
    const video = screen.getByLabelText("Lesson video") as HTMLVideoElement;
    Object.defineProperties(video, {
      duration: { configurable: true, value: 100 },
      currentTime: { configurable: true, writable: true, value: 0 },
    });

    fireEvent.play(video);
    video.currentTime = 95;
    fireEvent.timeUpdate(video);

    expect(await screen.findByText("Complete")).toBeVisible();
    expect(refresh).not.toHaveBeenCalled();

    fireEvent.ended(video);
    fireEvent.ended(video);
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("refreshes once when the completion response arrives after playback ends", async () => {
    let resolveCompletion: (value: {
      ok: true;
      positionSeconds: number;
      watchedRanges: [number, number][];
      watchedPercent: number;
      completed: true;
    }) => void = () => undefined;
    recordVideoProgress.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCompletion = resolve;
        }),
    );
    render(
      <VideoBlockPlayer
        blockId="block-1"
        src="https://example.com/video.mp4"
      />,
    );
    const video = screen.getByLabelText("Lesson video") as HTMLVideoElement;
    Object.defineProperties(video, {
      duration: { configurable: true, value: 100 },
      currentTime: { configurable: true, writable: true, value: 0 },
    });

    fireEvent.play(video);
    video.currentTime = 95;
    fireEvent.timeUpdate(video);
    await waitFor(() => expect(recordVideoProgress).toHaveBeenCalledTimes(1));

    fireEvent.ended(video);
    expect(refresh).not.toHaveBeenCalled();

    await act(async () => {
      resolveCompletion({
        ok: true,
        positionSeconds: 95,
        watchedRanges: [[0, 95]],
        watchedPercent: 95,
        completed: true,
      });
    });
    expect(await screen.findByText("Complete")).toBeVisible();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("uses the real media duration in the branded play overlay", async () => {
    render(
      <VideoBlockPlayer
        blockId="block-1"
        src="https://example.com/video.mp4"
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const video = screen.getByLabelText("Lesson video") as HTMLVideoElement;
    Object.defineProperty(video, "duration", {
      configurable: true,
      value: 100,
    });
    fireEvent.loadedMetadata(video);

    expect(
      screen.getByRole("button", { name: "Play lesson video" }),
    ).toBeVisible();
    expect(screen.getByText("1:40")).toBeVisible();
  });

  it("refreshes server-rendered lesson state once after completion reconciliation", async () => {
    loadVideoProgress.mockResolvedValueOnce({
      ok: true,
      positionSeconds: 90,
      watchedRanges: [[0, 90]],
      watchedPercent: 90,
      completed: true,
      reconciled: true,
    });

    render(
      <VideoBlockPlayer
        blockId="block-1"
        src="https://example.com/video.mp4"
      />,
    );

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("moves the resume anchor on seek without submitting the skipped range", async () => {
    render(
      <VideoBlockPlayer
        blockId="block-1"
        src="https://example.com/video.mp4"
      />,
    );

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
    await waitFor(() =>
      expect(recordVideoSeek).toHaveBeenCalledWith({
        blockId: "block-1",
        positionSeconds: 94,
        durationSeconds: 100,
      }),
    );
    fireEvent.timeUpdate(video);
    video.currentTime = 96;
    fireEvent.timeUpdate(video);

    expect(recordVideoProgress).not.toHaveBeenCalledWith(
      expect.objectContaining({ observedFrom: 89, observedTo: 94 }),
    );
    await waitFor(() =>
      expect(recordVideoProgress).toHaveBeenCalledWith(
        expect.objectContaining({ observedFrom: 94, observedTo: 96 }),
      ),
    );
  });

  it("restores the latest saved position after an unexpected media reset", async () => {
    recordVideoProgress.mockResolvedValue({
      ok: true,
      positionSeconds: 2,
      watchedRanges: [[0, 2]],
      watchedPercent: 2,
      completed: false,
    });
    render(
      <VideoBlockPlayer
        blockId="block-1"
        src="https://example.com/video.mp4?token=first"
      />,
    );
    const video = screen.getByLabelText("Lesson video") as HTMLVideoElement;
    Object.defineProperties(video, {
      duration: { configurable: true, value: 100 },
      currentTime: { configurable: true, writable: true, value: 0 },
    });

    fireEvent.play(video);
    video.currentTime = 2;
    fireEvent.timeUpdate(video);
    await waitFor(() => expect(recordVideoProgress).toHaveBeenCalledTimes(1));
    await act(async () => {
      await Promise.resolve();
    });

    video.currentTime = 0;
    fireEvent.play(video);
    expect(video.currentTime).toBe(2);

    fireEvent.seeking(video);
    video.currentTime = 0;
    fireEvent.seeked(video);
    fireEvent.play(video);
    expect(video.currentTime).toBe(0);
  });

  it("does not replace active media when only a signed URL token changes", () => {
    const { rerender } = render(
      <VideoBlockPlayer
        blockId="block-1"
        src="https://example.com/video.mp4?token=first"
        captionsSrc="https://example.com/video.vtt?token=first"
      />,
    );

    rerender(
      <VideoBlockPlayer
        blockId="block-1"
        src="https://example.com/video.mp4?token=second"
        captionsSrc="https://example.com/video.vtt?token=second"
      />,
    );

    expect(screen.getByLabelText("Lesson video")).toHaveAttribute(
      "src",
      "https://example.com/video.mp4?token=first",
    );
    expect(document.querySelector('track[kind="captions"]')).toHaveAttribute(
      "src",
      "https://example.com/video.vtt?token=first",
    );
  });

  it("offers a fresh secure media link after a playback failure", async () => {
    render(
      <VideoBlockPlayer
        blockId="block-1"
        src="https://example.com/video.mp4?token=expired"
      />,
    );

    fireEvent.error(screen.getByLabelText("Lesson video"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "fresh secure media link",
    );
    fireEvent.click(screen.getByRole("button", { name: "Reload video" }));
    expect(refresh).toHaveBeenCalledTimes(1);
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

    render(
      <VideoBlockPlayer
        blockId="block-1"
        src="https://example.com/video.mp4"
      />,
    );
    const video = screen.getByLabelText("Lesson video") as HTMLVideoElement;
    Object.defineProperties(video, {
      duration: { configurable: true, value: 100 },
      currentTime: { configurable: true, writable: true, value: 0 },
    });

    fireEvent.play(video);
    video.currentTime = 2;
    fireEvent.timeUpdate(video);
    video.currentTime = 4;
    fireEvent.timeUpdate(video);

    await waitFor(() => expect(recordVideoProgress).toHaveBeenCalledTimes(1));
    resolveFirst({
      ok: true,
      positionSeconds: 2,
      watchedRanges: [],
      watchedPercent: 2,
      completed: false,
    });
    await waitFor(() => expect(recordVideoProgress).toHaveBeenCalledTimes(2));
  });

  it("flushes the final contiguous sample when the player unmounts", async () => {
    const { unmount } = render(
      <VideoBlockPlayer
        blockId="block-1"
        src="https://example.com/video.mp4"
      />,
    );
    const video = screen.getByLabelText("Lesson video") as HTMLVideoElement;
    Object.defineProperties(video, {
      duration: { configurable: true, value: 100 },
      currentTime: { configurable: true, writable: true, value: 0 },
      paused: { configurable: true, value: false },
    });

    fireEvent.play(video);
    video.currentTime = 2;
    fireEvent.timeUpdate(video);
    video.currentTime = 4;
    unmount();

    await waitFor(() =>
      expect(recordVideoProgress).toHaveBeenCalledWith({
        blockId: "block-1",
        positionSeconds: 4,
        durationSeconds: 100,
        observedFrom: 2,
        observedTo: 4,
      }),
    );
  });

  it("retries a failed write once and shows a visible save warning", async () => {
    loadVideoProgress
      .mockResolvedValueOnce({
        ok: true,
        positionSeconds: 0,
        watchedRanges: [],
        completed: false,
      })
      .mockResolvedValue({ ok: false, error: "reload failed" });
    recordVideoProgress.mockResolvedValue({
      ok: false,
      error: "temporary database error",
    });
    render(
      <VideoBlockPlayer
        blockId="block-1"
        src="https://example.com/video.mp4"
      />,
    );
    const video = screen.getByLabelText("Lesson video") as HTMLVideoElement;
    Object.defineProperties(video, {
      duration: { configurable: true, value: 100 },
      currentTime: { configurable: true, writable: true, value: 0 },
    });

    await waitFor(() => expect(loadVideoProgress).toHaveBeenCalledTimes(1));
    fireEvent.play(video);
    video.currentTime = 2;
    fireEvent.timeUpdate(video);

    await waitFor(() => expect(recordVideoProgress).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Video progress could not be saved",
    );
  });

  it("resynchronizes the playhead after a rejected progress write", async () => {
    loadVideoProgress
      .mockResolvedValueOnce({
        ok: true,
        positionSeconds: 0,
        watchedRanges: [],
        completed: false,
      })
      .mockResolvedValue({
        ok: true,
        positionSeconds: 10,
        watchedRanges: [[0, 10]],
        completed: false,
      });
    recordVideoProgress
      .mockResolvedValueOnce({ ok: false, error: "write rejected" })
      .mockResolvedValueOnce({ ok: false, error: "write rejected" })
      .mockResolvedValue({
        ok: true,
        positionSeconds: 12,
        watchedRanges: [[0, 12]],
        watchedPercent: 12,
        completed: false,
      });

    render(
      <VideoBlockPlayer
        blockId="block-1"
        src="https://example.com/video.mp4"
      />,
    );
    const video = screen.getByLabelText("Lesson video") as HTMLVideoElement;
    Object.defineProperties(video, {
      duration: { configurable: true, value: 100 },
      currentTime: { configurable: true, writable: true, value: 0 },
    });

    await waitFor(() => expect(loadVideoProgress).toHaveBeenCalledTimes(1));
    fireEvent.play(video);
    video.currentTime = 2;
    fireEvent.timeUpdate(video);

    await waitFor(() => expect(loadVideoProgress).toHaveBeenCalledTimes(2));
    expect(video.currentTime).toBe(10);

    video.currentTime = 12;
    fireEvent.timeUpdate(video);
    await waitFor(() =>
      expect(recordVideoProgress).toHaveBeenLastCalledWith({
        blockId: "block-1",
        positionSeconds: 12,
        durationSeconds: 100,
        observedFrom: 10,
        observedTo: 12,
      }),
    );
  });

  it("renders a poster, English captions, and transcript link", () => {
    const { container } = render(
      <VideoBlockPlayer
        blockId="block-1"
        src="https://example.com/video.mp4"
        posterSrc="https://example.com/poster.webp"
        captionsSrc="https://example.com/captions.vtt"
        transcriptSrc="https://example.com/transcript.pdf"
      />,
    );

    expect(screen.getByLabelText("Lesson video")).toHaveAttribute(
      "poster",
      "https://example.com/poster.webp",
    );
    expect(screen.getByLabelText("Lesson video")).toHaveAttribute(
      "crossorigin",
      "anonymous",
    );
    expect(container.querySelector('track[kind="captions"]')).toHaveAttribute(
      "src",
      "https://example.com/captions.vtt",
    );
    expect(
      screen.getByRole("link", { name: "Open video transcript" }),
    ).toHaveAttribute("href", "https://example.com/transcript.pdf");
  });
});
