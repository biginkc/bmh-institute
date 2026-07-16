import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants, createReadStream } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";

import type { CourseImportAsset, CourseImportManifest } from "./manifest";

const MARKER_NAME = ".bmh-course-asset-stage.json";
const OWNER = "bmh-course-asset-stager";
const FORMAT_VERSION = 2;

type StagingMode = "check" | "stage";
type SnapshotMaterialization = "clone" | "copy";
type Materialization = SnapshotMaterialization | "reused" | null;

export type AssetCandidate = {
  root: string;
  path: string;
  size_bytes: number;
  checksum_sha256: string;
};

export type AssetStagingResult = {
  source_key: string;
  local_path: string;
  approval_status: CourseImportAsset["approval_status"];
  outcome: "verified" | "staged" | "reused" | "blocked" | "error";
  code:
    | "verified"
    | "staged"
    | "reused"
    | "approval_hold"
    | "approval_missing"
    | "approved_asset_missing"
    | "invalid_local_path"
    | "source_escape"
    | "source_not_file"
    | "source_conflict"
    | "manifest_integrity_missing"
    | "size_mismatch"
    | "checksum_mismatch"
    | "stage_path_unsafe"
    | "stage_write_failed";
  message: string;
  selected_root: string | null;
  selected_path: string | null;
  staged_path: string | null;
  materialization: Materialization;
  candidates: AssetCandidate[];
};

export type AssetStagingReport = {
  schema_version: 1;
  tool: typeof OWNER;
  mode: StagingMode;
  manifest_path: string;
  manifest_sha256: string;
  import_id: string;
  source_roots: string[];
  staging_root: string | null;
  ready_for_upload: boolean;
  counts: {
    total: number;
    approved: number;
    held: number;
    missing: number;
    verified: number;
    staged: number;
    reused: number;
    blockers: number;
    errors: number;
  };
  blockers: Array<{ source_key: string; code: string; message: string }>;
  errors: Array<{ source_key: string; code: string; message: string }>;
  assets: AssetStagingResult[];
};

type StageMarker = {
  owner: typeof OWNER;
  format_version: typeof FORMAT_VERSION;
  staging_root: string;
  staging_device: string;
  staging_inode: string;
  import_id: string;
  manifest_sha256: string;
};

export async function stageManifestAssets(options: {
  manifest: CourseImportManifest;
  manifestPath: string;
  manifestBytes: Buffer;
  sourceRoots: string[];
  mode: StagingMode;
  stagingRoot?: string;
}): Promise<AssetStagingReport> {
  let manifestFromBytes: unknown;
  try {
    manifestFromBytes = JSON.parse(options.manifestBytes.toString("utf8"));
  } catch {
    throw new Error("Manifest bytes are not valid JSON.");
  }
  if (JSON.stringify(manifestFromBytes) !== JSON.stringify(options.manifest)) {
    throw new Error("Manifest object does not match the supplied manifest bytes.");
  }
  if (options.sourceRoots.length === 0) {
    throw new Error("At least one explicit --source-root is required.");
  }
  if (options.mode === "stage" && !options.stagingRoot) {
    throw new Error("--staging-root is required in stage mode.");
  }

  const roots = await resolveTrustedRoots(options.sourceRoots);
  const manifestPath = resolve(options.manifestPath);
  const manifestSha256 = sha256Bytes(options.manifestBytes);
  let stagingRoot = options.stagingRoot ? resolve(options.stagingRoot) : null;
  if (options.mode === "stage" && stagingRoot) {
    stagingRoot = await claimStagingRoot(stagingRoot, {
      import_id: options.manifest.import_id,
      manifest_sha256: manifestSha256,
    });
  }

  const assets: AssetStagingResult[] = [];
  for (const asset of options.manifest.assets) {
    assets.push(
      await inspectAsset({
        asset,
        roots,
        mode: options.mode,
        stagingRoot,
      }),
    );
  }

  const blockers = assets
    .filter((asset) => asset.outcome === "blocked")
    .map(({ source_key, code, message }) => ({ source_key, code, message }));
  const errors = assets
    .filter((asset) => asset.outcome === "error")
    .map(({ source_key, code, message }) => ({ source_key, code, message }));
  const counts = {
    total: assets.length,
    approved: options.manifest.assets.filter((asset) => asset.approval_status === "approved").length,
    held: options.manifest.assets.filter((asset) => asset.approval_status === "hold").length,
    missing: options.manifest.assets.filter((asset) => asset.approval_status === "missing").length,
    verified: assets.filter((asset) => asset.outcome === "verified").length,
    staged: assets.filter((asset) => asset.outcome === "staged").length,
    reused: assets.filter((asset) => asset.outcome === "reused").length,
    blockers: blockers.length,
    errors: errors.length,
  };

  return {
    schema_version: 1,
    tool: OWNER,
    mode: options.mode,
    manifest_path: manifestPath,
    manifest_sha256: manifestSha256,
    import_id: options.manifest.import_id,
    source_roots: roots,
    staging_root: stagingRoot,
    ready_for_upload: blockers.length === 0 && errors.length === 0,
    counts,
    blockers,
    errors,
    assets,
  };
}

export async function cleanupStagingRoot(
  stagingRoot: string,
  hooks: { beforeQuarantineRename?: () => Promise<void> } = {},
) {
  const requestedRoot = resolve(stagingRoot);
  const rootStat = await lstatOrNull(requestedRoot);
  if (!rootStat) {
    return {
      schema_version: 1 as const,
      tool: OWNER,
      staging_root: requestedRoot,
      removed: false,
    };
  }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error(`Refusing cleanup: staging root is not a real directory: ${requestedRoot}`);
  }
  const { canonicalRoot, marker } = await readAndValidateMarker(requestedRoot);
  await assertStagingIdentity(canonicalRoot, marker);
  const quarantinePath = resolve(
    dirname(canonicalRoot),
    `.${basename(canonicalRoot)}.bmh-quarantine-${randomUUID()}`,
  );
  await hooks.beforeQuarantineRename?.();
  await rename(canonicalRoot, quarantinePath);
  const quarantined = await lstat(quarantinePath);
  if (
    quarantined.isSymbolicLink() ||
    !quarantined.isDirectory() ||
    String(quarantined.dev) !== marker.staging_device ||
    String(quarantined.ino) !== marker.staging_inode
  ) {
    throw new Error(
      `Refusing cleanup: quarantined staging root identity changed. Preserved without deletion: ${quarantinePath}`,
    );
  }
  await rm(quarantinePath, { recursive: true, force: false });
  return {
    schema_version: 1 as const,
    tool: OWNER,
    staging_root: canonicalRoot,
    removed: true,
  };
}

export async function writeMachineReport(reportPath: string, report: unknown) {
  const destination = resolve(reportPath);
  await mkdir(dirname(destination), { recursive: true });
  const temp = `${destination}.tmp-${randomUUID()}`;
  await writeFile(temp, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  await rename(temp, destination);
}

async function inspectAsset({
  asset,
  roots,
  mode,
  stagingRoot,
}: {
  asset: CourseImportAsset;
  roots: string[];
  mode: StagingMode;
  stagingRoot: string | null;
}): Promise<AssetStagingResult> {
  const base = {
    source_key: asset.source_key,
    local_path: asset.local_path,
    approval_status: asset.approval_status,
    selected_root: null,
    selected_path: null,
    staged_path: null,
    materialization: null,
    candidates: [] as AssetCandidate[],
  };

  const localPathProblem = validateLocalPath(asset.local_path);
  if (localPathProblem) {
    return {
      ...base,
      outcome: "error",
      code: "invalid_local_path",
      message: localPathProblem,
    };
  }
  if (asset.local_path === MARKER_NAME || basename(asset.local_path) === MARKER_NAME) {
    return {
      ...base,
      outcome: "error",
      code: "invalid_local_path",
      message: `${MARKER_NAME} is reserved for staging ownership metadata.`,
    };
  }
  if (asset.approval_status === "hold") {
    return {
      ...base,
      outcome: "blocked",
      code: "approval_hold",
      message: "Asset remains on approval hold and was not staged.",
    };
  }
  if (asset.approval_status === "missing") {
    return {
      ...base,
      outcome: "blocked",
      code: "approval_missing",
      message: "Asset is marked missing and was not staged.",
    };
  }
  if (asset.size_bytes === null || asset.checksum_sha256 === null) {
    return {
      ...base,
      outcome: "error",
      code: "manifest_integrity_missing",
      message: "Approved assets require both size_bytes and checksum_sha256 before staging.",
    };
  }

  const discovered = await discoverCandidates(roots, asset.local_path);
  if (discovered.error) {
    return {
      ...base,
      outcome: "error",
      code: discovered.error.code,
      message: discovered.error.message,
    };
  }
  const candidates = discovered.candidates;
  if (candidates.length === 0) {
    return {
      ...base,
      outcome: "blocked",
      code: "approved_asset_missing",
      message: "Approved asset is absent from every trusted source root.",
    };
  }

  const distinctChecksums = new Set(candidates.map((candidate) => candidate.checksum_sha256));
  if (distinctChecksums.size > 1) {
    return {
      ...base,
      candidates,
      outcome: "error",
      code: "source_conflict",
      message: "The same relative path has different bytes in trusted source roots.",
    };
  }

  const selected = candidates[0];
  const selectedFields = {
    candidates,
    selected_root: selected.root,
    selected_path: selected.path,
  };
  if (selected.size_bytes !== asset.size_bytes) {
    return {
      ...base,
      ...selectedFields,
      outcome: "error",
      code: "size_mismatch",
      message: `Manifest size ${asset.size_bytes} does not match source size ${selected.size_bytes}.`,
    };
  }
  if (selected.checksum_sha256 !== asset.checksum_sha256) {
    return {
      ...base,
      ...selectedFields,
      outcome: "error",
      code: "checksum_mismatch",
      message: "Manifest SHA-256 does not match the source file.",
    };
  }

  if (mode === "check") {
    return {
      ...base,
      ...selectedFields,
      outcome: "verified",
      code: "verified",
      message: "Source bytes match the manifest.",
    };
  }

  try {
    const materialized = await materializeAsset({
      source: selected.path,
      stagingRoot: stagingRoot!,
      localPath: asset.local_path,
      expectedSize: asset.size_bytes,
      expectedChecksum: asset.checksum_sha256,
    });
    return {
      ...base,
      ...selectedFields,
      outcome: materialized.method === "reused" ? "reused" : "staged",
      code: materialized.method === "reused" ? "reused" : "staged",
      message:
        materialized.method === "reused"
          ? "Existing staged bytes already match the manifest."
          : `Staged with ${materialized.method}.`,
      staged_path: materialized.destination,
      materialization: materialized.method,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...base,
      ...selectedFields,
      outcome: "error",
      code: message.startsWith("Unsafe staging path:") ? "stage_path_unsafe" : "stage_write_failed",
      message,
    };
  }
}

async function resolveTrustedRoots(sourceRoots: string[]) {
  const roots: string[] = [];
  const seen = new Set<string>();
  for (const sourceRoot of sourceRoots) {
    const root = await realpath(resolve(sourceRoot));
    const rootStat = await stat(root);
    if (!rootStat.isDirectory()) throw new Error(`Source root is not a directory: ${sourceRoot}`);
    if (!seen.has(root)) {
      roots.push(root);
      seen.add(root);
    }
  }
  return roots;
}

async function discoverCandidates(
  roots: string[],
  localPath: string,
): Promise<
  | { candidates: AssetCandidate[]; error?: never }
  | {
      candidates: [];
      error: {
        code: "source_escape" | "source_not_file";
        message: string;
      };
    }
> {
  const candidates: AssetCandidate[] = [];
  for (const root of roots) {
    const unresolved = resolve(root, localPath);
    const entry = await lstatOrNull(unresolved);
    if (!entry) continue;

    let resolvedPath: string;
    try {
      resolvedPath = await realpath(unresolved);
    } catch (error) {
      return {
        candidates: [],
        error: {
          code: "source_not_file",
          message: `Unable to resolve source path in ${root}: ${error instanceof Error ? error.message : error}`,
        },
      };
    }
    if (!isWithin(root, resolvedPath)) {
      return {
        candidates: [],
        error: {
          code: "source_escape",
          message: `Source path resolves outside trusted root ${root}.`,
        },
      };
    }
    const fileStat = await stat(resolvedPath);
    if (!fileStat.isFile()) {
      return {
        candidates: [],
        error: {
          code: "source_not_file",
          message: `Source path is not a regular file: ${resolvedPath}`,
        },
      };
    }
    candidates.push({
      root,
      path: resolvedPath,
      size_bytes: fileStat.size,
      checksum_sha256: await sha256File(resolvedPath),
    });
  }
  return { candidates };
}

async function materializeAsset(options: {
  source: string;
  stagingRoot: string;
  localPath: string;
  expectedSize: number;
  expectedChecksum: string;
}) {
  const destination = resolve(options.stagingRoot, options.localPath);
  if (!isWithin(options.stagingRoot, destination)) {
    throw new Error(`Unsafe staging path: ${options.localPath}`);
  }
  await ensureSafeParent(options.stagingRoot, dirname(destination));

  const existing = await lstatOrNull(destination);
  if (existing) {
    if (existing.isSymbolicLink() || !existing.isFile()) {
      throw new Error(`Unsafe staging path: destination is not a regular file: ${destination}`);
    }
    const existingStat = await stat(destination);
    if (
      existingStat.size === options.expectedSize &&
      (await sha256File(destination)) === options.expectedChecksum
    ) {
      return { destination, method: "reused" as const };
    }
  }

  const temp = `${destination}.tmp-${randomUUID()}`;
  try {
    const snapshot = await createVerifiedFileSnapshot({
      source: options.source,
      destination: temp,
      expectedSize: options.expectedSize,
      expectedChecksum: options.expectedChecksum,
    });
    await rename(temp, destination);
    return { destination, method: snapshot.method };
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

export async function createVerifiedFileSnapshot(options: {
  source: string;
  destination: string;
  expectedSize?: number | null;
  expectedChecksum?: string | null;
}) {
  if (await lstatOrNull(options.destination)) {
    throw new Error(`Refusing to replace an existing snapshot destination: ${options.destination}`);
  }
  let method: SnapshotMaterialization = "clone";
  try {
    try {
      await copyFile(
        options.source,
        options.destination,
        fsConstants.COPYFILE_FICLONE_FORCE | fsConstants.COPYFILE_EXCL,
      );
    } catch (error) {
      if (isNodeError(error) && error.code === "EEXIST") throw error;
      method = "copy";
      await rm(options.destination, { force: true });
      await copyFile(options.source, options.destination, fsConstants.COPYFILE_EXCL);
    }

    const sourceStat = await stat(options.source);
    const destinationEntry = await lstat(options.destination);
    if (destinationEntry.isSymbolicLink() || !destinationEntry.isFile()) {
      throw new Error(`Snapshot destination is not a regular file: ${options.destination}`);
    }
    const handle = await open(
      options.destination,
      fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0),
    );
    try {
      const destinationStat = await handle.stat();
      if (!destinationStat.isFile()) {
        throw new Error(`Snapshot destination is not a regular file: ${options.destination}`);
      }
      if (sourceStat.dev === destinationStat.dev && sourceStat.ino === destinationStat.ino) {
        throw new Error(`Snapshot destination aliases its source: ${options.destination}`);
      }

      const checksum = await sha256FileHandle(handle, destinationStat.size);
      if (
        (options.expectedSize !== undefined &&
          options.expectedSize !== null &&
          destinationStat.size !== options.expectedSize) ||
        (options.expectedChecksum && checksum !== options.expectedChecksum)
      ) {
        throw new Error(`Snapshot bytes do not match the expected integrity: ${options.destination}`);
      }
      return {
        path: options.destination,
        method,
        size: destinationStat.size,
        checksum_sha256: checksum,
        device: String(destinationStat.dev),
        inode: String(destinationStat.ino),
      };
    } finally {
      await handle.close();
    }
  } catch (error) {
    await rm(options.destination, { force: true });
    throw error;
  }
}

async function claimStagingRoot(
  root: string,
  ownership: Pick<StageMarker, "import_id" | "manifest_sha256">,
) {
  const existing = await lstatOrNull(root);
  if (existing) {
    if (!existing.isDirectory() || existing.isSymbolicLink()) {
      throw new Error(`Refusing staging root that is not a real directory: ${root}`);
    }
    const { canonicalRoot, marker: current } = await readAndValidateMarker(root);
    if (
      current.import_id !== ownership.import_id ||
      current.manifest_sha256 !== ownership.manifest_sha256
    ) {
      throw new Error(
        "Refusing to reuse a staging tree owned by a different manifest. Clean it explicitly first.",
      );
    }
    return canonicalRoot;
  }

  await mkdir(dirname(root), { recursive: true });
  await mkdir(root, { recursive: false });
  const canonicalRoot = await realpath(root);
  const rootIdentity = await lstat(canonicalRoot);
  if (rootIdentity.isSymbolicLink() || !rootIdentity.isDirectory()) {
    throw new Error(`Refusing staging root that is not a real directory: ${root}`);
  }
  const marker: StageMarker = {
    owner: OWNER,
    format_version: FORMAT_VERSION,
    staging_root: canonicalRoot,
    staging_device: String(rootIdentity.dev),
    staging_inode: String(rootIdentity.ino),
    ...ownership,
  };
  await writeFile(resolve(canonicalRoot, MARKER_NAME), `${JSON.stringify(marker, null, 2)}\n`, {
    flag: "wx",
  });
  return canonicalRoot;
}

async function readAndValidateMarker(root: string) {
  const canonicalRoot = await realpath(root);
  const markerPath = resolve(canonicalRoot, MARKER_NAME);
  const markerStat = await lstatOrNull(markerPath);
  if (!markerStat || markerStat.isSymbolicLink() || !markerStat.isFile()) {
    throw new Error(`Refusing operation on an unowned staging tree: ${root}`);
  }
  let marker: unknown;
  try {
    marker = JSON.parse(await readFile(markerPath, "utf8"));
  } catch {
    throw new Error(`Refusing operation with an invalid staging marker: ${root}`);
  }
  if (
    !isRecord(marker) ||
    marker.owner !== OWNER ||
    marker.format_version !== FORMAT_VERSION ||
    marker.staging_root !== canonicalRoot ||
    typeof marker.staging_device !== "string" ||
    typeof marker.staging_inode !== "string" ||
    typeof marker.import_id !== "string" ||
    typeof marker.manifest_sha256 !== "string"
  ) {
    throw new Error(
      `Refusing operation: canonical staging root does not match ${OWNER} ownership: ${root}`,
    );
  }
  await assertStagingIdentity(canonicalRoot, marker as StageMarker);
  return { canonicalRoot, marker: marker as StageMarker };
}

async function assertStagingIdentity(canonicalRoot: string, marker: StageMarker) {
  const current = await lstat(canonicalRoot);
  if (
    current.isSymbolicLink() ||
    !current.isDirectory() ||
    String(current.dev) !== marker.staging_device ||
    String(current.ino) !== marker.staging_inode
  ) {
    throw new Error(`Refusing operation: canonical staging root identity changed: ${canonicalRoot}`);
  }
}

async function ensureSafeParent(root: string, parent: string) {
  if (!isWithin(root, parent)) throw new Error(`Unsafe staging path: ${parent}`);
  const pathFromRoot = relative(root, parent);
  let cursor = root;
  if (!pathFromRoot) return;
  for (const segment of pathFromRoot.split(sep)) {
    cursor = resolve(cursor, segment);
    const existing = await lstatOrNull(cursor);
    if (!existing) {
      await mkdir(cursor, { recursive: false });
      continue;
    }
    if (existing.isSymbolicLink() || !existing.isDirectory()) {
      throw new Error(`Unsafe staging path: parent is not a real directory: ${cursor}`);
    }
  }
}

function validateLocalPath(localPath: string) {
  if (!localPath || localPath.includes("\0")) return "Asset local_path must be a non-empty path.";
  if (isAbsolute(localPath) || localPath.startsWith("/") || /^[A-Za-z]:[\\/]/.test(localPath)) {
    return `Asset local_path must be relative: ${localPath}`;
  }
  const segments = localPath.replaceAll("\\", "/").split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return `Asset local_path contains an unsafe path segment: ${localPath}`;
  }
  return null;
}

function isWithin(root: string, candidate: string) {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === "" || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== "..");
}

async function lstatOrNull(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return null;
    throw error;
  }
}

function sha256Bytes(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function sha256File(path: string) {
  return new Promise<string>((resolveHash, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolveHash(hash.digest("hex")));
  });
}

async function sha256FileHandle(
  handle: Awaited<ReturnType<typeof open>>,
  size: number,
) {
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(Math.min(1024 * 1024, Math.max(size, 1)));
  let position = 0;
  while (position < size) {
    const length = Math.min(buffer.length, size - position);
    const { bytesRead } = await handle.read(buffer, 0, length, position);
    if (bytesRead === 0) {
      throw new Error("Snapshot ended before its verified size.");
    }
    hash.update(buffer.subarray(0, bytesRead));
    position += bytesRead;
  }
  return hash.digest("hex");
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
