import { createHash } from "node:crypto";

import {
  HEYGEN_DRAFT_CONTRACT,
  RECUT_SOURCE_KEYS,
  providerSceneSequence,
} from "./build-held-video-recut-docs.mjs";

export const HELD_VIDEO_STUDIO_SETUP_PATH =
  "docs/course-production/held-video-recuts/approvals/held-video-studio-draft-setup.v1.json";

export const HELD_VIDEO_STUDIO_BROWSER_AUDIT = Object.freeze({
  source: Object.freeze({
    tool: "Chrome Playwright DOM snapshot",
    thread_id: "019f6bec-4d36-7711-b205-e2042030e970",
    turn_id: "5762fad8-d7c2-48a8-9d82-53af3666844c",
  }),
  window: Object.freeze({
    first_success_at: "2026-07-18T17:12:06.346Z",
    finished_at: "2026-07-18T17:21:20.804Z",
  }),
  scene_selections_checked: 128,
  expected_scene_selections: 128,
  visible_labels: Object.freeze({
    avatar: "Doodle Andrea cafe (course)",
    voice: "Hope",
    motion_engine: "Avatar IV",
  }),
  evidence_scope:
    "Canonical rollout proof covers only the three visible labels for 128 of 128 scene selections; it does not prove provider IDs, Auto-enhance, pauses, voice speed, or any other Studio setting.",
});

export const EXPECTED_HEYGEN_STUDIO_DRAFTS = Object.freeze({
  "video-slot-01-welcome": Object.freeze({
    title: "Chapter 1A - Draft",
    draft_id: "2ebcb01279484cb4bc91263fa5965f46",
    url: "https://app.heygen.com/create-v4/2ebcb01279484cb4bc91263fa5965f46?vt=l&subPanel=home&sceneId=UlVysfFM&panel=scene",
  }),
  "video-slot-01-mindset": Object.freeze({
    title: "Chapter 1B - Draft",
    draft_id: "83d974c849714434b3fae447f9d1476e",
    url: "https://app.heygen.com/create-v4/83d974c849714434b3fae447f9d1476e?vt=l&panel=scene",
  }),
  "video-slot-10-objection-scripts": Object.freeze({
    title: "Chapter 7B - Draft",
    draft_id: "170194ab42314ba6b7bea0c6022fe440",
    url: "https://app.heygen.com/create-v4/170194ab42314ba6b7bea0c6022fe440?vt=l&panel=scene",
  }),
  "video-slot-15-closing": Object.freeze({
    title: "Chapter 11A - Draft",
    draft_id: "b32fd9f8d298490cbc7d5dafa533c616",
    url: "https://app.heygen.com/create-v4/b32fd9f8d298490cbc7d5dafa533c616?vt=l&panel=scene",
  }),
  "video-slot-17-compensation": Object.freeze({
    title: "Chapter 17 - Draft",
    draft_id: "a4c28243ffa7423398667f9e10f2fbc8",
    url: "https://app.heygen.com/create-v4/a4c28243ffa7423398667f9e10f2fbc8?vt=l&panel=scene",
  }),
  "video-slot-18-operator": Object.freeze({
    title: "Chapter 18 - Draft",
    draft_id: "58ac32f578d7447285905b05bf898304",
    url: "https://app.heygen.com/create-v4/58ac32f578d7447285905b05bf898304?vt=l&panel=scene",
  }),
  "video-slot-19-career": Object.freeze({
    title: "Chapter 19 - Draft",
    draft_id: "c07d8d30a05d4ee6abb0303a4168ec5e",
    url: "https://app.heygen.com/create-v4/c07d8d30a05d4ee6abb0303a4168ec5e?vt=l&panel=scene",
  }),
});

const sha256 = (value) =>
  createHash("sha256").update(value, "utf8").digest("hex");

const hasExactKeys = (value, expectedKeys) =>
  value
  && typeof value === "object"
  && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort())
    === JSON.stringify([...expectedKeys].sort());

export function validateHeldVideoStudioSetup({
  ledger,
  packages,
  requestText,
}) {
  const errors = [];
  if (ledger?.schema_version !== "bmh-held-video-studio-draft-setup/v1") {
    errors.push("Studio setup ledger schema is invalid");
  }
  if (
    ledger?.status
      !== "manual_studio_setup_evidence_only_pending_exact_script_approval"
  ) {
    errors.push("Studio setup ledger must remain pending exact script approval");
  }
  const request = JSON.parse(requestText);
  if (
    !hasExactKeys(ledger?.request_binding, ["request_id", "request_sha256"])
    || ledger.request_binding.request_sha256 !== sha256(requestText)
    || ledger.request_binding.request_id !== request.request_id
  ) {
    errors.push("Studio setup ledger request binding is invalid");
  }
  const expectedSetup = {
    provider_api_called: false,
    generate_clicked_by_codex: false,
    render_started: false,
    billed_generation_started: false,
    canvas: "landscape",
  };
  if (JSON.stringify(ledger?.manual_setup) !== JSON.stringify(expectedSetup)) {
    errors.push("Studio setup ledger safety state drifted");
  }
  const expectedOfflineContract = {
    evidence_kind: "offline_configuration_contract_not_browser_observation",
    avatar_group_name: "Doodle Andrea",
    avatar_group_id: HEYGEN_DRAFT_CONTRACT.avatarGroupId,
    generation_look_name: "cafe (course)",
    generation_look_id: HEYGEN_DRAFT_CONTRACT.avatarLookId,
    voice_name: "Hope",
    voice_id: HEYGEN_DRAFT_CONTRACT.voiceId,
    motion_engine: "Avatar IV",
  };
  if (
    JSON.stringify(ledger?.offline_identity_contract)
      !== JSON.stringify(expectedOfflineContract)
  ) {
    errors.push("Studio setup ledger offline identity contract drifted");
  }
  if (
    !hasExactKeys(ledger?.browser_audit, [
      "evidence_scope",
      "expected_scene_selections",
      "scene_selections_checked",
      "source",
      "visible_labels",
      "window",
    ])
    || !hasExactKeys(ledger.browser_audit.source, ["thread_id", "tool", "turn_id"])
    || !hasExactKeys(ledger.browser_audit.window, ["finished_at", "first_success_at"])
    || !hasExactKeys(ledger.browser_audit.visible_labels, [
      "avatar",
      "motion_engine",
      "voice",
    ])
    || JSON.stringify(ledger.browser_audit)
      !== JSON.stringify(HELD_VIDEO_STUDIO_BROWSER_AUDIT)
  ) {
    errors.push("Studio setup browser evidence widened beyond visible labels");
  }
  if (
    !Array.isArray(ledger?.drafts)
    || ledger.drafts.length !== RECUT_SOURCE_KEYS.length
    || JSON.stringify(ledger.drafts.map((draft) => draft.source_key))
      !== JSON.stringify(RECUT_SOURCE_KEYS)
  ) {
    errors.push("Studio setup ledger draft inventory is invalid");
    return errors;
  }
  const seenIds = new Set();
  for (const [index, draft] of ledger.drafts.entries()) {
    const pkg = packages[index];
    const exactDraft = EXPECTED_HEYGEN_STUDIO_DRAFTS[draft.source_key];
    if (
      !hasExactKeys(draft, ["draft_id", "scene_count", "source_key", "title", "url"])
      || !exactDraft
      || draft.title !== exactDraft.title
      || draft.draft_id !== exactDraft.draft_id
      || seenIds.has(draft.draft_id)
      || draft.url !== exactDraft.url
      || draft.scene_count !== providerSceneSequence(pkg).length
    ) {
      errors.push(`Studio setup ledger draft ${draft.source_key} is invalid`);
    }
    seenIds.add(draft.draft_id);
  }
  const expectedNextGate = {
    actor: "Jarrad Henry",
    action: "Provide the exact response to the checksum-bound script and scene approval question",
    exact_response_required: request.response_contract.exact_full_approval_response,
    retroactive_setup_authorized: false,
    settings_verification_authorized: false,
    generation_authorized: false,
    release_qa_status: "pending-script-approval",
  };
  if (JSON.stringify(ledger?.next_gate) !== JSON.stringify(expectedNextGate)) {
    errors.push("Studio setup ledger next gate is invalid");
  }
  return errors;
}
