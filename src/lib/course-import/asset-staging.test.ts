import { createHash } from "node:crypto";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { CourseImportAsset, CourseImportManifest } from "./manifest";
import {
  cleanupStagingRoot,
  createVerifiedFileSnapshot,
  stageManifestAssets,
} from "./asset-staging";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (root) => {
      const { rm } = await import("node:fs/promises");
      await rm(root, { recursive: true, force: true });
    }),
  );
});

describe("course asset composite staging", () => {
  it("resolves the Tech Stack split-root layout in declared priority order", async () => {
    const root = await makeTempRoot();
    const integration = join(root, "integration");
    const canonical = join(root, "canonical");
    const staging = join(root, "staging");
    await mkdir(integration);
    await mkdir(canonical);

    const video = await put(
      canonical,
      "course-assets/review-lessonTECHA/LESSON-TECHA-v5.mp4",
      "canonical-video",
    );
    const caption = await put(
      integration,
      "course-assets/captions/video-slot-03-tech-stack.vtt",
      "WEBVTT\n\n00:00.000 --> 00:01.000\nTech Stack\n",
    );
    const transcript = await put(
      integration,
      "course-assets/transcripts/video-slot-03-tech-stack.md",
      "# Tech Stack\n",
    );
    const guide = await put(
      integration,
      "output/pdf/slot-03-learner-guide.pdf",
      "%PDF-test-guide",
    );
    const manifest = manifestForAssets([
      asset("video-slot-03-tech-stack", video.path, video.bytes),
      asset("caption-video-slot-03-tech-stack", caption.path, caption.bytes),
      asset("transcript-video-slot-03-tech-stack", transcript.path, transcript.bytes),
      asset("guide-slot-03", guide.path, guide.bytes),
    ]);

    const report = await stageManifestAssets({
      manifest,
      manifestPath: join(root, "canary.json"),
      manifestBytes: Buffer.from(JSON.stringify(manifest)),
      sourceRoots: [integration, canonical],
      mode: "stage",
      stagingRoot: staging,
    });

    expect(report.ready_for_upload).toBe(true);
    expect(report.counts).toMatchObject({ staged: 4, blockers: 0, errors: 0 });
    expect(report.assets.map((item) => item.selected_root)).toEqual([
      await realpath(canonical),
      await realpath(integration),
      await realpath(integration),
      await realpath(integration),
    ]);
    await expect(readFile(join(staging, video.path), "utf8")).resolves.toBe("canonical-video");
    await expect(readFile(join(staging, caption.path), "utf8")).resolves.toContain("Tech Stack");
  });

  it("reports held and missing assets as blockers without materializing them", async () => {
    const root = await makeTempRoot();
    const source = join(root, "source");
    const staging = join(root, "staging");
    await mkdir(source);
    const held = await put(source, "assets/held.mp4", "held bytes");
    const missing = await put(source, "assets/missing.webp", "available but unapproved");
    const manifest = manifestForAssets([
      { ...asset("held", held.path, held.bytes), approval_status: "hold" },
      { ...asset("missing", missing.path, missing.bytes), approval_status: "missing" },
    ]);

    const report = await run(manifest, [source], "stage", staging);

    expect(report.ready_for_upload).toBe(false);
    expect(report.blockers.map((blocker) => blocker.code)).toEqual([
      "approval_hold",
      "approval_missing",
    ]);
    await expect(access(join(staging, held.path))).rejects.toThrow();
    await expect(access(join(staging, missing.path))).rejects.toThrow();
  });

  it("fails closed when trusted roots contain conflicting bytes at one relative path", async () => {
    const root = await makeTempRoot();
    const preferred = join(root, "preferred");
    const fallback = join(root, "fallback");
    await mkdir(preferred);
    await mkdir(fallback);
    const expected = await put(preferred, "assets/shared.bin", "approved");
    await put(fallback, "assets/shared.bin", "stale bytes");
    const manifest = manifestForAssets([asset("shared", expected.path, expected.bytes)]);

    const report = await run(manifest, [preferred, fallback], "check");

    expect(report.errors).toEqual([
      expect.objectContaining({ source_key: "shared", code: "source_conflict" }),
    ]);
    expect(report.assets[0].selected_path).toBeNull();
  });

  it("rejects a source whose checksum does not match the manifest", async () => {
    const root = await makeTempRoot();
    const source = join(root, "source");
    await mkdir(source);
    const file = await put(source, "assets/file.bin", "actual");
    const declaredBytes = Buffer.from("same-size-wrong".slice(0, file.bytes.length));
    const declared = asset("file", file.path, declaredBytes);
    declared.size_bytes = file.bytes.length;
    const manifest = manifestForAssets([declared]);

    const report = await run(manifest, [source], "check");

    expect(report.errors[0]).toMatchObject({ code: "checksum_mismatch" });
  });

  it("rejects traversal before resolving any source", async () => {
    const root = await makeTempRoot();
    const source = join(root, "source");
    await mkdir(source);
    const manifest = manifestForAssets([
      asset("escape", "../outside.bin", Buffer.from("outside")),
    ]);

    const report = await run(manifest, [source], "check");

    expect(report.errors[0]).toMatchObject({ code: "invalid_local_path" });
  });

  it("does not let an approval hold hide an unsafe local path", async () => {
    const root = await makeTempRoot();
    const source = join(root, "source");
    await mkdir(source);
    const unsafe = {
      ...asset("held-escape", "../outside.bin", Buffer.from("outside")),
      approval_status: "hold" as const,
    };

    const report = await run(manifestForAssets([unsafe]), [source], "check");

    expect(report.errors[0]).toMatchObject({ code: "invalid_local_path" });
    expect(report.blockers).toHaveLength(0);
  });

  it("rejects a symlink that resolves outside a trusted root", async () => {
    const root = await makeTempRoot();
    const source = join(root, "source");
    await mkdir(join(source, "assets"), { recursive: true });
    const outsidePath = join(root, "outside.bin");
    const bytes = Buffer.from("outside");
    await writeFile(outsidePath, bytes);
    await symlink(outsidePath, join(source, "assets/link.bin"));
    const manifest = manifestForAssets([asset("link", "assets/link.bin", bytes)]);

    const report = await run(manifest, [source], "check");

    expect(report.errors[0]).toMatchObject({ code: "source_escape" });
  });

  it("reuses verified staged bytes on an idempotent rerun", async () => {
    const root = await makeTempRoot();
    const source = join(root, "source");
    const staging = join(root, "staging");
    await mkdir(source);
    const file = await put(source, "assets/file.bin", "stable");
    const manifest = manifestForAssets([asset("file", file.path, file.bytes)]);

    const first = await run(manifest, [source], "stage", staging);
    const second = await run(manifest, [source], "stage", staging);

    expect(first.assets[0]).toMatchObject({ outcome: "staged" });
    expect(second.assets[0]).toMatchObject({ outcome: "reused", materialization: "reused" });
    await expect(readFile(join(staging, file.path), "utf8")).resolves.toBe("stable");
  });

  it("materializes an independent snapshot that source writes cannot mutate", async () => {
    const root = await makeTempRoot();
    const source = join(root, "source");
    const staging = join(root, "staging");
    await mkdir(source);
    const file = await put(source, "assets/file.bin", "approved");
    const manifest = manifestForAssets([asset("file", file.path, file.bytes)]);

    const report = await run(manifest, [source], "stage", staging);
    await writeFile(join(source, file.path), "mutated!");

    expect(report.ready_for_upload).toBe(true);
    expect(report.assets[0].materialization).toMatch(/^(clone|copy)$/);
    await expect(readFile(join(staging, file.path), "utf8")).resolves.toBe("approved");
    await expect(readFile(join(source, file.path), "utf8")).resolves.toBe("mutated!");
  });

  it("never removes an existing destination when snapshot creation is refused", async () => {
    const root = await makeTempRoot();
    const source = join(root, "source.bin");
    const destination = join(root, "existing.bin");
    await writeFile(source, "source");
    await writeFile(destination, "preserve me");

    await expect(
      createVerifiedFileSnapshot({ source, destination }),
    ).rejects.toThrow("existing snapshot destination");
    await expect(readFile(destination, "utf8")).resolves.toBe("preserve me");
  });

  it("check mode makes no staging tree", async () => {
    const root = await makeTempRoot();
    const source = join(root, "source");
    const staging = join(root, "never-created");
    await mkdir(source);
    const file = await put(source, "assets/file.bin", "stable");
    const manifest = manifestForAssets([asset("file", file.path, file.bytes)]);

    const report = await run(manifest, [source], "check", staging);

    expect(report.assets[0].outcome).toBe("verified");
    await expect(access(staging)).rejects.toThrow();
  });

  it("cleanup removes an owned tree but refuses an unowned directory", async () => {
    const root = await makeTempRoot();
    const source = join(root, "source");
    const staging = join(root, "staging");
    const unowned = join(root, "unowned");
    await mkdir(source);
    await mkdir(unowned);
    const file = await put(source, "assets/file.bin", "stable");
    const manifest = manifestForAssets([asset("file", file.path, file.bytes)]);
    await run(manifest, [source], "stage", staging);

    await expect(cleanupStagingRoot(unowned)).rejects.toThrow("unowned staging tree");
    await expect(cleanupStagingRoot(staging)).resolves.toMatchObject({ removed: true });
    await expect(access(staging)).rejects.toThrow();
    await expect(readFile(join(source, file.path), "utf8")).resolves.toBe("stable");
  });

  it("refuses to follow a symlink planted inside an owned staging tree", async () => {
    const root = await makeTempRoot();
    const source = join(root, "source");
    const staging = join(root, "staging");
    const outside = join(root, "outside");
    await mkdir(source);
    await mkdir(outside);
    const first = await put(source, "safe/first.bin", "first");
    const secondBytes = Buffer.from("second");
    const combined = manifestForAssets([
      asset("first", first.path, first.bytes),
      asset("second", "unsafe/second.bin", secondBytes),
    ]);
    const firstRun = await run(combined, [source], "stage", staging);
    expect(firstRun.assets.find((item) => item.source_key === "second")).toMatchObject({
      code: "approved_asset_missing",
    });
    await symlink(outside, join(staging, "unsafe"));

    const second = await put(source, "unsafe/second.bin", "second");
    expect(second.bytes).toEqual(secondBytes);
    const report = await run(combined, [source], "stage", staging);

    expect(report.assets.find((item) => item.source_key === "second")).toMatchObject({
      outcome: "error",
      code: "stage_path_unsafe",
    });
    await expect(access(join(outside, "second.bin"))).rejects.toThrow();
  });

  it("refuses cleanup when a staging root ancestor symlink is repointed", async () => {
    const root = await makeTempRoot();
    const source = join(root, "source");
    const firstTarget = join(root, "first-target");
    const secondTarget = join(root, "second-target");
    const alias = join(root, "stage-alias");
    const staging = join(alias, "stage");
    await Promise.all([mkdir(source), mkdir(firstTarget), mkdir(secondTarget)]);
    await symlink(firstTarget, alias);
    const file = await put(source, "assets/file.bin", "stable");
    const manifest = manifestForAssets([asset("file", file.path, file.bytes)]);
    await run(manifest, [source], "stage", staging);

    await cp(join(firstTarget, "stage"), join(secondTarget, "stage"), { recursive: true });
    await writeFile(join(secondTarget, "stage", "unrelated-important.txt"), "preserve me");
    await rm(alias);
    await symlink(secondTarget, alias);

    await expect(cleanupStagingRoot(staging)).rejects.toThrow(/canonical staging root/i);
    await expect(readFile(join(firstTarget, "stage", file.path), "utf8")).resolves.toBe("stable");
    await expect(
      readFile(join(secondTarget, "stage", "unrelated-important.txt"), "utf8"),
    ).resolves.toBe("preserve me");
  });

  it("refuses cleanup when the canonical staging directory inode changes", async () => {
    const root = await makeTempRoot();
    const source = join(root, "source");
    const staging = join(root, "staging");
    const original = join(root, "original-staging");
    await mkdir(source);
    const file = await put(source, "assets/file.bin", "stable");
    const manifest = manifestForAssets([asset("file", file.path, file.bytes)]);
    await run(manifest, [source], "stage", staging);

    await rename(staging, original);
    await cp(original, staging, { recursive: true });
    await writeFile(join(staging, "unrelated-important.txt"), "preserve me");

    await expect(cleanupStagingRoot(staging)).rejects.toThrow(/identity changed/i);
    await expect(readFile(join(staging, "unrelated-important.txt"), "utf8")).resolves.toBe(
      "preserve me",
    );
  });
});

async function run(
  manifest: CourseImportManifest,
  sourceRoots: string[],
  mode: "check" | "stage",
  stagingRoot?: string,
) {
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  return stageManifestAssets({
    manifest,
    manifestPath: join(sourceRoots[0], "manifest.json"),
    manifestBytes,
    sourceRoots,
    mode,
    stagingRoot,
  });
}

async function makeTempRoot() {
  const root = await mkdtemp(join(tmpdir(), "bmh-course-assets-"));
  tempRoots.push(root);
  return root;
}

async function put(root: string, path: string, content: string) {
  const bytes = Buffer.from(content);
  const destination = join(root, path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
  return { path, bytes };
}

function asset(
  sourceKey: string,
  localPath: string,
  bytes: Buffer,
): CourseImportAsset {
  return {
    source_key: sourceKey,
    kind: "download",
    local_path: localPath,
    storage_path: `courses/test/v1/${sourceKey}.${sha256(bytes)}.bin`,
    mime_type: "application/octet-stream",
    checksum_sha256: sha256(bytes),
    size_bytes: bytes.length,
    approval_status: "approved",
  };
}

function manifestForAssets(assets: CourseImportAsset[]): CourseImportManifest {
  return {
    schema_version: 1,
    import_id: "test-assets",
    status: "draft",
    qa_role_group: {
      source_key: "qa",
      name: "QA",
      description: "QA",
    },
    assets,
    program: {
      source_key: "program",
      title: "Test",
      description: null,
      thumbnail_asset_key: null,
      is_published: false,
      course_order_mode: "sequential",
      certificate_enabled: false,
      courses: [],
    },
  };
}

function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}
