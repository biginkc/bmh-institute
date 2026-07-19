import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { PRODUCTION_READINESS_VIDEO_BASE64 } from "./production-readiness-media";

describe("production-readiness video fixture", () => {
  it("is a complete one-second VP9 stream that fully decodes", () => {
    const media = Buffer.from(PRODUCTION_READINESS_VIDEO_BASE64, "base64");
    const probe = spawnSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=codec_name,width,height:format=duration",
        "-of",
        "json",
        "pipe:0",
      ],
      { input: media, encoding: "utf8" },
    );

    expect(probe.error).toBeUndefined();
    expect(probe.status, probe.stderr).toBe(0);
    const metadata = JSON.parse(probe.stdout) as {
      streams?: Array<{ codec_name?: string; width?: number; height?: number }>;
      format?: { duration?: string };
    };
    expect(metadata.streams).toEqual([
      { codec_name: "vp9", width: 160, height: 90 },
    ]);
    expect(Number(metadata.format?.duration)).toBeCloseTo(1, 3);

    const decode = spawnSync(
      "ffmpeg",
      ["-v", "error", "-i", "pipe:0", "-f", "null", "-"],
      { input: media, encoding: "utf8" },
    );
    expect(decode.error).toBeUndefined();
    expect(decode.status, decode.stderr).toBe(0);
  });
});
