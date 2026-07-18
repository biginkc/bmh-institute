const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export const APPROVED_MEDIA_ROLE_POLICY_ID = "approved-media-role-agnostic-v1";
export const APPROVED_MEDIA_NAMED_ROLE_PATTERN = /\b(?:navigator|virtual onboarding specialist|lead sourcing specialist|lead sourcing seat|lead generator|acquisitions? managers?|acquisitions? teams?|transaction coordinators?|transaction teams?|follow-up specialists?|setters?|sales managers?|team leads?|SDRs?)\b/gi;

export function normalizeApprovedMediaProse(value) {
  return String(value)
    .replace(/^#.*$/gm, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function approvedMediaNamedRolePhrases(value) {
  return [...new Set(
    [...normalizeApprovedMediaProse(value).matchAll(APPROVED_MEDIA_NAMED_ROLE_PATTERN)]
      .map((match) => match[0].toLowerCase()),
  )].sort();
}

function bindingKey(record) {
  return [
    record?.video_source_key,
    record?.video_sha256,
    record?.caption_source_key,
    record?.caption_sha256,
    record?.transcript_source_key,
    record?.transcript_sha256,
  ].join(":");
}

function sameStrings(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function exactBinding(binding) {
  return {
    video_source_key: binding.video.source_key,
    video_sha256: binding.video.checksum_sha256,
    caption_source_key: binding.caption.source_key,
    caption_sha256: binding.caption.checksum_sha256,
    transcript_source_key: binding.transcript.source_key,
    transcript_sha256: binding.transcript.checksum_sha256,
  };
}

function validateBindingShape(record, label, errors) {
  for (const field of ["video_source_key", "caption_source_key", "transcript_source_key"]) {
    if (typeof record?.[field] !== "string" || record[field].trim().length === 0) {
      errors.push(`${label} requires ${field}`);
    }
  }
  for (const field of ["video_sha256", "caption_sha256", "transcript_sha256"]) {
    if (!SHA256_PATTERN.test(record?.[field] ?? "")) {
      errors.push(`${label} requires a lowercase ${field}`);
    }
  }
}

function validException(record, detection) {
  return record?.status === "approved"
    && typeof record.approver === "string"
    && record.approver.trim().length > 0
    && typeof record.approved_at === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(record.approved_at)
    && typeof record.rationale === "string"
    && record.rationale.trim().length > 0
    && sameStrings(record.allowed_phrases, detection.detected_phrases);
}

export function evaluateApprovedMediaRolePolicy({
  bindings,
  reviewLedger,
  exceptionLedger,
}) {
  const errors = [];
  const detections = [];

  for (const binding of bindings) {
    const captionPhrases = approvedMediaNamedRolePhrases(binding.captionProse);
    const transcriptPhrases = approvedMediaNamedRolePhrases(binding.transcriptProse);
    if (!sameStrings(captionPhrases, transcriptPhrases)) {
      errors.push(`${binding.video.source_key} caption and transcript named-role findings disagree`);
    }
    const detectedPhrases = [...new Set([...captionPhrases, ...transcriptPhrases])].sort();
    if (detectedPhrases.length === 0) continue;
    detections.push({
      ...exactBinding(binding),
      detected_phrases: detectedPhrases,
    });
  }

  detections.sort((left, right) => left.video_source_key.localeCompare(right.video_source_key));

  if (reviewLedger?.schema_version !== "1.0.0") {
    errors.push("Approved-media role-policy review ledger schema_version must be 1.0.0");
  }
  if (reviewLedger?.policy_id !== APPROVED_MEDIA_ROLE_POLICY_ID) {
    errors.push("Approved-media role-policy review ledger has the wrong policy_id");
  }
  if (reviewLedger?.status !== "pending_review") {
    errors.push("Approved-media role-policy review ledger must remain pending_review");
  }

  const reviewRecords = reviewLedger?.records ?? [];
  const reviewByKey = new Map();
  for (const [index, record] of reviewRecords.entries()) {
    validateBindingShape(record, `Approved-media review record ${index + 1}`, errors);
    const key = bindingKey(record);
    if (reviewByKey.has(key)) errors.push(`${record.video_source_key} has a duplicate approved-media review record`);
    reviewByKey.set(key, record);
  }

  for (const detection of detections) {
    const record = reviewByKey.get(bindingKey(detection));
    if (!record) {
      errors.push(`${detection.video_source_key} is missing its exact checksum-bound approved-media review record`);
      continue;
    }
    if (record.cut_approval_status !== "approved") {
      errors.push(`${detection.video_source_key} review record must preserve cut_approval_status approved`);
    }
    if (record.policy_review_status !== "pending_policy_exception_or_recut") {
      errors.push(`${detection.video_source_key} review record has an invalid policy_review_status`);
    }
    if (!sameStrings(record.detected_phrases, detection.detected_phrases)) {
      errors.push(`${detection.video_source_key} review record does not list the exact detected phrases`);
    }
  }
  const detectionKeys = new Set(detections.map(bindingKey));
  for (const record of reviewRecords) {
    if (!detectionKeys.has(bindingKey(record))) {
      errors.push(`${record.video_source_key} review record is stale or does not match an exact approved media binding`);
    }
  }

  if (exceptionLedger?.schema_version !== "1.0.0") {
    errors.push("Approved-media policy-exception ledger schema_version must be 1.0.0");
  }
  if (exceptionLedger?.policy_id !== APPROVED_MEDIA_ROLE_POLICY_ID) {
    errors.push("Approved-media policy-exception ledger has the wrong policy_id");
  }

  const exceptionsByKey = new Map();
  for (const [index, record] of (exceptionLedger?.records ?? []).entries()) {
    validateBindingShape(record, `Approved-media policy exception ${index + 1}`, errors);
    const key = bindingKey(record);
    if (exceptionsByKey.has(key)) errors.push(`${record.video_source_key} has a duplicate approved-media policy exception`);
    exceptionsByKey.set(key, record);
  }

  let approvedExceptions = 0;
  const publicationBlockers = [];
  for (const detection of detections) {
    const exception = exceptionsByKey.get(bindingKey(detection));
    if (exception && validException(exception, detection)) {
      approvedExceptions += 1;
      continue;
    }
    if (exception) {
      errors.push(`${detection.video_source_key} policy exception is not a complete exact approval`);
    }
    publicationBlockers.push(
      `${detection.video_source_key} exact approved cut ${detection.video_sha256} contains named-role spoken language pending recut or checksum-bound policy exception: ${detection.detected_phrases.join(", ")}`,
    );
  }

  for (const record of exceptionLedger?.records ?? []) {
    if (!detectionKeys.has(bindingKey(record))) {
      errors.push(`${record.video_source_key} policy exception is stale or does not match current approved media`);
    }
  }

  return {
    detections,
    reviewedBindings: reviewRecords.length,
    approvedExceptions,
    publicationBlockers,
    errors,
  };
}
