import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const inventoryPath = path.join(root, "docs/course-production/thumbnail-pilots/production-inventory.json");
const groupedRecordPath = path.join(root, "docs/course-production/thumbnail-pilots/references/production-video-stills/contact-sheets.json");
const distinctRecordPath = path.join(root, "docs/course-production/thumbnail-pilots/references/production-video-stills/distinct-posters/contact-sheets.json");
const promptDirectoryDefault = path.join(root, "docs/course-production/thumbnail-pilots/prompts/production-distinct-posters");

export const DISTINCT_POSTER_DEFINITIONS = [
  {
    slot: "slot-04",
    video: "video-slot-04-humanizing-b",
    character: "recurring-seller-approved",
    background: [255, 211, 1],
    pose: "poster-humanizing-b-seller-side-stool-story-folder",
    posture: "seated-sideways-on-stool-leaning-forward",
    orientation: "three-quarter view facing right",
    gesture: "both hands holding a blank story folder across his knees",
    placement: "in the left safe zone",
    prop: "a blank story folder with house heart and checklist cues",
    cue: "Humanizing the Seller B video and turning a personal seller story into a clear next step",
  },
  {
    slot: "slot-04",
    video: "video-slot-04-ideal-seller",
    character: "recurring-seller-approved",
    background: [255, 211, 1],
    pose: "poster-ideal-seller-kneeling-key-magnifier",
    posture: "kneeling-on-one-knee",
    orientation: "right profile facing left",
    gesture: "holding a magnifier over a key while steadying a blank checklist",
    placement: "in the right-center safe zone",
    prop: "a key magnifier house clock and blank qualification checklist",
    cue: "Ideal Seller Profile video and recognizing seller-property fit quickly",
  },
  {
    slot: "slot-05",
    video: "video-slot-05-offer-b",
    character: "recurring-seller-approved",
    background: [103, 182, 255],
    pose: "poster-offer-b-seller-walking-offer-folder",
    posture: "walking-briskly",
    orientation: "full-body profile facing right",
    gesture: "carrying a sealed blank offer folder and extending one open hand",
    placement: "in the left safe zone",
    prop: "a sealed offer folder distressed house choice path and shield",
    cue: "Offer Presentation B video and moving from property condition to a protected decision",
  },
  {
    slot: "slot-06",
    video: "video-slot-06-framework",
    character: "andrea-approved",
    background: [255, 211, 1],
    pose: "poster-framework-andrea-round-table-five-cards",
    posture: "seated-at-round-table",
    orientation: "three-quarter view facing right",
    gesture: "one hand touching her headset and the other pointing across five blank step cards",
    placement: "in the left-center safe zone",
    prop: "a round table five blank framework cards ear question handshake and heart cues",
    cue: "Call Framework video and listening through a structured five-step conversation",
  },
  {
    slot: "slot-11",
    video: "video-slot-11-trust",
    character: "recurring-seller-approved",
    background: [255, 211, 1],
    pose: "poster-trust-seller-sofa-open-palm",
    posture: "seated-upright-on-sofa-edge",
    orientation: "three-quarter view facing left",
    gesture: "one arm folded and the other palm open in a considered response",
    placement: "in the right safe zone",
    prop: "a sofa with ear heart conversation and bridge-shield cues",
    cue: "Trust and Objections video and listening acknowledging asking and redirecting",
  },
  {
    slot: "slot-12",
    video: "video-slot-12-faq-b",
    character: "recurring-seller-approved",
    background: [103, 182, 255],
    pose: "poster-faq-b-seller-bench-question-folder",
    posture: "seated-on-park-bench-with-ankles-crossed",
    orientation: "front three-quarter view facing left",
    gesture: "holding a blank contract folder on his lap with one questioning hand raised",
    placement: "in the center safe zone",
    prop: "a bench blank contract folder house question choice signs and shield",
    cue: "FAQ B video and calmly resolving property and contract questions",
  },
  {
    slot: "slot-18",
    video: "video-slot-18-operator",
    character: "andrea-approved",
    background: [103, 182, 255],
    pose: "poster-operator-andrea-seated-workstation-checklist",
    posture: "seated-at-workstation",
    orientation: "three-quarter view facing right",
    gesture: "one hand typing while the other holds a blank checklist",
    placement: "in the left safe zone",
    prop: "a workstation blank checklist phone calendar timer and priority tray",
    cue: "Operator Standards video and disciplined daily preparation and execution",
  },
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function clone(value) {
  return structuredClone(value);
}

function productionRecord() {
  return {
    status: "not-produced",
    generated_at: null,
    generated_by: null,
    generation_call_id: null,
    source_sha256: null,
    flat_master_sha256: null,
    review_decision: null,
    reviewed_at: null,
    reviewed_by: null,
    review_evidence: null,
  };
}

function provenance(callId) {
  return {
    generator: "built-in image_gen",
    generation_call: "one-distinct-call",
    planned_generation_call_id: callId,
    source_capture_required: true,
    prompt_checksum_required: true,
    reference_checksums_required: true,
    generated_at_required: true,
    generated_by_required: true,
    model_output_path_required: true,
  };
}

export async function applyDistinctPosterInventoryOverlay({
  inventory,
  grouped,
  distinct,
  promptDirectory = promptDirectoryDefault,
}) {

const historicalTermsV9Reference = {
  id: "video-contact-sheet-slot-02",
  role: "checksum-bound historical Terms v9 contact sheet retained for immutable lineage",
  path: "docs/course-production/thumbnail-pilots/references/production-video-stills/slot-02-contact-sheet.png",
  sha256: "d041f8ddc39a73a14acb25c17c6d42b6286b9a45bd2189fdcc732a11e217d783",
  dimensions: [960, 180],
  frame_count: 3,
};
const termsV10Record = grouped.records.find((record) => record.master_id === "master-slot-02");
if (!termsV10Record) throw new Error("Grouped evidence is missing the approved Terms v10 record");
const termsReferenceIds = new Set([
  historicalTermsV9Reference.id,
  termsV10Record.contact_sheet_input.id,
]);
const existingTermsIndex = inventory.style_system.reference_inputs.findIndex(
  (reference) => termsReferenceIds.has(reference.id),
);
const referencesWithoutTerms = inventory.style_system.reference_inputs.filter(
  (reference) => !termsReferenceIds.has(reference.id),
);
referencesWithoutTerms.splice(
  existingTermsIndex === -1 ? referencesWithoutTerms.length : existingTermsIndex,
  0,
  historicalTermsV9Reference,
);
inventory.style_system.reference_inputs = referencesWithoutTerms;

// Refresh every grouped contact-sheet binding from its current checksum-locked manifest source.
// This is what moves slot 02 from the superseded Terms v9 evidence to approved Terms v10.
for (const record of grouped.records) {
  if (record.master_id === "master-slot-02") continue;
  const referenceIndex = inventory.style_system.reference_inputs.findIndex(
    (reference) => reference.id === record.contact_sheet_input.id,
  );
  if (referenceIndex === -1) inventory.style_system.reference_inputs.push(clone(record.contact_sheet_input));
  else inventory.style_system.reference_inputs[referenceIndex] = clone(record.contact_sheet_input);
  const lesson = inventory.lessons.find((candidate) => candidate.master.id === record.master_id);
  if (lesson) {
    if (record.master_id === "master-slot-02") {
      lesson.reference_ids = lesson.reference_ids.map((id) => id === "video-contact-sheet-slot-02" ? record.contact_sheet_input.id : id);
    }
    lesson.master.video_evidence = clone(record.video_evidence);
    lesson.master.contact_sheet_input = clone(record.contact_sheet_input);
  } else {
    const poster = inventory.lessons.flatMap((candidate) => candidate.posters).find(
      (candidate) => candidate.direct_master?.id === record.master_id,
    );
    if (!poster) throw new Error(`No inventory master resolves ${record.master_id}`);
    poster.direct_master.video_evidence = clone(record.video_evidence);
    poster.direct_master.contact_sheet_input = clone(record.contact_sheet_input);
  }
}

for (const record of distinct.records) {
  const index = inventory.style_system.reference_inputs.findIndex(
    (reference) => reference.id === record.contact_sheet_input.id,
  );
  if (index === -1) inventory.style_system.reference_inputs.push(clone(record.contact_sheet_input));
  else inventory.style_system.reference_inputs[index] = clone(record.contact_sheet_input);
}
inventory.style_system.reference_inputs.push(clone(termsV10Record.contact_sheet_input));

const termsLesson = inventory.lessons.find(
  (candidate) => candidate.master.id === "master-slot-02",
);
if (!termsLesson) throw new Error("Inventory is missing the Terms lesson master");
termsLesson.reference_ids = termsLesson.reference_ids.map((id) =>
  id === historicalTermsV9Reference.id ? termsV10Record.contact_sheet_input.id : id,
);
termsLesson.master.video_evidence = clone(termsV10Record.video_evidence);
termsLesson.master.contact_sheet_input = clone(termsV10Record.contact_sheet_input);

for (const definition of DISTINCT_POSTER_DEFINITIONS) {
  const lesson = inventory.lessons.find((candidate) => candidate.slot === definition.slot);
  const posterKey = `poster-${definition.video}`;
  const poster = lesson?.posters.find((candidate) => candidate.asset_key === posterKey);
  if (!poster) throw new Error(`Missing poster ${posterKey}`);
  const evidence = distinct.records.find((candidate) => candidate.master_id === `master-poster-${definition.video}`);
  if (!evidence) throw new Error(`Missing distinct evidence for ${definition.video}`);
  const prompt = (await readFile(path.join(promptDirectory, `${definition.video}.txt`), "utf8")).trimEnd();
  const masterId = `master-poster-${definition.video}`;
  const callId = `imagegen-poster-${definition.video}`;
  const characterName = definition.character === "andrea-approved" ? "Andrea" : "the recurring curly-haired seller";
  const artDirection = {
    master_id: masterId,
    pose_id: definition.pose,
    people_count: 1,
    character_id: definition.character,
    skin_fill: "pure white",
    posture: definition.posture,
    orientation: definition.orientation,
    gesture: definition.gesture,
    placement: definition.placement,
    prop: definition.prop,
    background_rgb: clone(definition.background),
    lesson_or_video_cue: definition.cue,
    lineage_pose_signature: null,
    pose_instruction: `Show exactly one person: ${characterName}. Preserve the approved identity, proportions, clothing language, pure-white skin fill, and line weight. Place ${characterName} ${definition.placement}, ${definition.posture}, ${definition.orientation}, ${definition.gesture}, using ${definition.prop}. This pose and placement must be visibly different from every other independently generated master.`,
  };
  const referenceIds = [
    "style-ref-1",
    "style-ref-2",
    definition.character,
    evidence.contact_sheet_input.id,
  ];
  poster.production_source_mode = "generate-distinct-after-pilot-approval";
  poster.art_direction = clone(artDirection);
  poster.direct_master = {
    id: masterId,
    source_path: `course-assets/posters/production/sources/${definition.video}-generated.png`,
    flat_master_path: `course-assets/posters/production/flat-masters/${definition.video}-flat-master.png`,
    background_rgb: clone(definition.background),
    art_direction: clone(artDirection),
    expected_aspect_ratio: "16:9",
    reference_ids: referenceIds,
    video_evidence: clone(evidence.video_evidence),
    contact_sheet_input: clone(evidence.contact_sheet_input),
    prompt,
    prompt_sha256: sha256(prompt),
    provenance: provenance(callId),
    production_record: productionRecord(),
  };
  poster.derivative = {
    ...poster.derivative,
    source_master_id: masterId,
    crop_profile: "full-safe",
    normalize_background_rgb: clone(definition.background),
    crop_pixels_after_normalize: [0, 0, 1280, 720],
  };
  poster.provenance = provenance(callId);
}

inventory.generation_policy.call_strategy =
  "one distinct image_gen call per cover or non-pilot lesson master, plus eight separate video-poster master calls";

return inventory;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [inventory, grouped, distinct] = await Promise.all([
    readFile(inventoryPath, "utf8").then(JSON.parse),
    readFile(groupedRecordPath, "utf8").then(JSON.parse),
    readFile(distinctRecordPath, "utf8").then(JSON.parse),
  ]);
  await applyDistinctPosterInventoryOverlay({ inventory, grouped, distinct });
  await writeFile(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);
  console.log(JSON.stringify({
    grouped_bindings_refreshed: grouped.records.length,
    distinct_poster_masters: DISTINCT_POSTER_DEFINITIONS.length,
  }, null, 2));
}
