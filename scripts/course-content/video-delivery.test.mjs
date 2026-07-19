import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_TARGET_BYTES,
  SUPABASE_GLOBAL_FILE_LIMIT_BYTES,
  VIDEO_DELIVERY_LEDGER_SCHEMA,
  applyVideoDeliveryLedger,
  assertDeliveryQc,
  canonicalJson,
  ffmpegPassArguments,
  sha256Text,
  targetVideoBitrate,
  transcodeContractSha256,
} from "./video-delivery.mjs";

function probe() {
  return {
    format_duration_seconds: 120.042,
    video: {
      codec: "h264", width: 1600, height: 900,
      sample_aspect_ratio: "1:1", display_aspect_ratio: "16:9",
      average_frame_rate: "30/1", start_seconds: 0,
      duration_seconds: 120, frames: 3600, packets: 3600,
    },
    audio: {
      codec: "aac", start_seconds: 0, duration_seconds: 120.042,
      bitrate: 192000, frames: 5627, packets: 5627,
    },
  };
}

test("bitrate planning reserves headroom below the global limit", () => {
  const bitrate = targetVideoBitrate({
    durationSeconds: 120,
    audioBitrate: 192000,
  });
  assert.ok(bitrate > 250000);
  assert.ok(((bitrate + 192000) * 120) / 8 < DEFAULT_TARGET_BYTES);
  assert.throws(() => targetVideoBitrate({
    durationSeconds: 120,
    audioBitrate: 192000,
    targetBytes: SUPABASE_GLOBAL_FILE_LIMIT_BYTES,
  }), /below the Supabase global file limit/);
});

test("ffmpeg contract changes video encoding only and copies audio", () => {
  const passOne = ffmpegPassArguments({
    sourcePath: "/source.mp4", outputPath: "/output.mp4",
    passLogPath: "/pass", videoBitrate: 900000, pass: 1,
  });
  const passTwo = ffmpegPassArguments({
    sourcePath: "/source.mp4", outputPath: "/output.mp4",
    passLogPath: "/pass", videoBitrate: 900000, pass: 2,
  });
  assert.ok(passOne.includes("-an"));
  assert.deepEqual(passTwo.slice(passTwo.indexOf("-c:a"), passTwo.indexOf("-c:a") + 2), ["-c:a", "copy"]);
  assert.ok(!passTwo.includes("-vf"));
  assert.ok(passTwo.includes("passthrough"));
});

test("QC accepts the same timeline and rejects editorial or sync changes", () => {
  const source = probe();
  assert.doesNotThrow(() => assertDeliveryQc(source, structuredClone(source), 47_000_000));
  const removedFrame = structuredClone(source);
  removedFrame.video.frames -= 1;
  assert.throws(() => assertDeliveryQc(source, removedFrame, 47_000_000), /video frames changed/);
  const shiftedAudio = structuredClone(source);
  shiftedAudio.audio.start_seconds = 0.01;
  assert.throws(() => assertDeliveryQc(source, shiftedAudio, 47_000_000), /sync offset changed/);
  assert.throws(() => assertDeliveryQc(source, structuredClone(source), 50_000_000), /byte ceiling/);
});

test("ledger application preserves the approved checksum as explicit provenance", () => {
  const sourceSha = "a".repeat(64);
  const deliverySha = "b".repeat(64);
  const recordWithoutEvidence = {
    source_key: "video-slot-01",
    approved_source: { local_path: "source.mp4", sha256: sourceSha, size_bytes: 80_000_000 },
    delivery: { local_path: "delivery.mp4", sha256: deliverySha, size_bytes: 47_000_000 },
    video_bitrate: 900000,
    source_probe: probe(),
    delivery_probe: probe(),
  };
  const ledger = {
    schema_version: VIDEO_DELIVERY_LEDGER_SCHEMA,
    target_max_bytes: DEFAULT_TARGET_BYTES,
    transcode_contract: {},
    transcode_contract_sha256: transcodeContractSha256(),
    records: [{
      ...recordWithoutEvidence,
      qc_evidence_sha256: sha256Text(canonicalJson(recordWithoutEvidence)),
    }],
  };
  const [delivery] = applyVideoDeliveryLedger([{
    source_key: "video-slot-01", kind: "video", local_path: "source.mp4",
    storage_path: `courses/x/video.${sourceSha}.mp4`, mime_type: "video/mp4",
    checksum_sha256: sourceSha, size_bytes: 80_000_000, approval_status: "approved",
  }], ledger);
  assert.equal(delivery.checksum_sha256, deliverySha);
  assert.equal(delivery.delivery_provenance.approved_source_sha256, sourceSha);
  assert.equal(delivery._approvedSourceSha256, sourceSha);

  const relabeled = structuredClone(ledger);
  relabeled.records[0].approved_source.sha256 = "c".repeat(64);
  assert.throws(() => applyVideoDeliveryLedger([{
    source_key: "video-slot-01", kind: "video", local_path: "source.mp4",
    storage_path: "x", mime_type: "video/mp4", checksum_sha256: sourceSha,
    size_bytes: 80_000_000, approval_status: "approved",
  }], relabeled), /source no longer matches/);
});
