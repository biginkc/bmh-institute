const BLUE_RGB = [103, 182, 255];
const YELLOW_RGB = [255, 211, 1];

export const ALLOWED_ARTWORK_CHARACTERS = ["andrea-approved", "recurring-seller-approved"];
export const ALLOWED_ARTWORK_POSTURES = [
  "standing",
  "seated-at-desk",
  "seated-at-table",
  "walking",
  "leaning-forward",
  "leaning-side",
  "perched-on-stool",
  "half-turn-standing",
];

function pose({
  masterId,
  poseId,
  characterId,
  posture,
  orientation,
  gesture,
  placement,
  prop,
  backgroundRgb,
  cue,
  lineagePoseSignature = null,
}) {
  const characterName = characterId === "andrea-approved" ? "Andrea" : "the recurring curly-haired seller";
  return {
    master_id: masterId,
    pose_id: poseId,
    people_count: 1,
    character_id: characterId,
    skin_fill: "pure white",
    posture,
    orientation,
    gesture,
    placement,
    prop,
    background_rgb: backgroundRgb,
    lesson_or_video_cue: cue,
    lineage_pose_signature: lineagePoseSignature,
    pose_instruction: `Show exactly one person: ${characterName}. Keep the approved face, hair, proportions, clothing language, pure-white skin fill, and line weight consistent. Place ${characterName} ${placement}, ${posture}, ${orientation}, ${gesture}, using ${prop}. This pose and placement must be visibly different from every other independently generated master.`,
  };
}

export const ARTWORK_MASTER_POSE_CONTRACT = [
  pose({
    masterId: "master-program-bmh-employee-training",
    poseId: "cover-andrea-walking-right-doorway",
    characterId: "andrea-approved",
    posture: "walking",
    orientation: "three-quarter view facing right",
    gesture: "one arm swinging and one hand carrying a slim learner guide",
    placement: "in the lower-left safe zone moving toward the center",
    prop: "a slim unlabeled learner guide",
    backgroundRgb: BLUE_RGB,
    cue: "the full course journey from orientation through confident service and growth",
  }),
  pose({
    masterId: "master-slot-01",
    poseId: "standing-welcome",
    characterId: "andrea-approved",
    posture: "standing",
    orientation: "front-facing and centered",
    gesture: "both arms relaxed beneath the doorway cue",
    placement: "in the center safe zone beneath the doorway",
    prop: "the open training doorway beside her",
    backgroundRgb: BLUE_RGB,
    cue: "Welcome and the Navigator's Playbook plus the service mindset",
    lineagePoseSignature: "standing-front-centered-arms-relaxed-beneath-doorway-cue",
  }),
  pose({
    masterId: "master-slot-02",
    poseId: "slot-02-seller-desk-reference-book",
    characterId: "recurring-seller-approved",
    posture: "seated-at-desk",
    orientation: "three-quarter view facing left",
    gesture: "one finger following an icon in an open reference book",
    placement: "in the right-center safe zone",
    prop: "an open unlabeled real estate reference book",
    backgroundRgb: YELLOW_RGB,
    cue: "Real Estate Terms Glossary and clear shared meaning",
  }),
  pose({
    masterId: "master-slot-03",
    poseId: "slot-03-andrea-stool-tool-hub",
    characterId: "andrea-approved",
    posture: "perched-on-stool",
    orientation: "side-on facing right",
    gesture: "one hand reaching toward the central tool hub and one hand holding a checklist",
    placement: "in the lower-left safe zone",
    prop: "an unlabeled operations checklist",
    backgroundRgb: BLUE_RGB,
    cue: "Tech Stack and Systems as one connected operating system",
  }),
  pose({
    masterId: "master-slot-04",
    poseId: "slot-04-seller-half-turn-house-story",
    characterId: "recurring-seller-approved",
    posture: "half-turn-standing",
    orientation: "three-quarter back view turning toward the viewer",
    gesture: "one hand over his heart and one hand indicating the story path",
    placement: "in the left safe zone beside the small house",
    prop: "a simple house and unfolding situation path",
    backgroundRgb: YELLOW_RGB,
    cue: "Humanizing the Lead and seeing the person before the property",
  }),
  pose({
    masterId: "master-slot-05",
    poseId: "slot-05-seller-table-options",
    characterId: "recurring-seller-approved",
    posture: "seated-at-table",
    orientation: "profile view facing right",
    gesture: "both open hands calmly comparing two option cards",
    placement: "in the center-left safe zone",
    prop: "two balanced unlabeled option cards",
    backgroundRgb: BLUE_RGB,
    cue: "The BMH Offer Playbook and matching a situation to a respectful option",
  }),
  pose({
    masterId: "master-slot-06",
    poseId: "slot-06-andrea-walking-pipeline-baton",
    characterId: "andrea-approved",
    posture: "walking",
    orientation: "profile view moving left to right",
    gesture: "carrying a baton forward between pipeline stage cards",
    placement: "across the lower-center safe zone",
    prop: "a simple handoff baton",
    backgroundRgb: YELLOW_RGB,
    cue: "Sales Pipeline and Stage Ownership plus the five-step conversation framework",
  }),
  pose({
    masterId: "master-slot-07",
    poseId: "seated-desk-call",
    characterId: "andrea-approved",
    posture: "seated-at-desk",
    orientation: "three-quarter view facing right",
    gesture: "left hand open and right hand lightly touching the headset",
    placement: "behind the desk in the lower-center safe zone",
    prop: "a headset and one unlabeled note card",
    backgroundRgb: BLUE_RGB,
    cue: "Opening the Call with a confident human first line",
    lineagePoseSignature: "seated-three-quarter-behind-desk-left-hand-open-right-hand-at-headset",
  }),
  pose({
    masterId: "master-slot-08",
    poseId: "slot-08-andrea-standing-folder-handoff",
    characterId: "andrea-approved",
    posture: "standing",
    orientation: "side-on facing left",
    gesture: "holding a complete context folder forward with both hands",
    placement: "in the right-center safe zone",
    prop: "a complete unlabeled context folder",
    backgroundRgb: BLUE_RGB,
    cue: "Discovery and Handoff with careful listening and complete context",
  }),
  pose({
    masterId: "master-slot-09",
    poseId: "standing-reframe-gesture",
    characterId: "recurring-seller-approved",
    posture: "standing",
    orientation: "three-quarter view facing left",
    gesture: "left hand open and right arm relaxed",
    placement: "in the lower-left safe zone",
    prop: "the hear-reframe-respond arch",
    backgroundRgb: YELLOW_RGB,
    cue: "Objection Architecture and a calm reframe",
    lineagePoseSignature: "standing-three-quarter-left-hand-open-right-arm-relaxed",
  }),
  pose({
    masterId: "master-slot-10",
    poseId: "slot-10-andrea-half-turn-toolbox",
    characterId: "andrea-approved",
    posture: "half-turn-standing",
    orientation: "three-quarter view facing right",
    gesture: "one hand selecting a speech-bubble card while the other steadies the toolbox",
    placement: "in the center-right safe zone",
    prop: "a compact objection-response toolbox",
    backgroundRgb: BLUE_RGB,
    cue: "Objection Scripts Playbook used flexibly rather than robotically",
  }),
  pose({
    masterId: "master-slot-11",
    poseId: "slot-11-seller-leaning-knot",
    characterId: "recurring-seller-approved",
    posture: "leaning-forward",
    orientation: "front-facing with shoulders angled right",
    gesture: "both hands carefully loosening one strand of the objection knot",
    placement: "in the left-center safe zone",
    prop: "a loose knot of house clock contract and price icons",
    backgroundRgb: YELLOW_RGB,
    cue: "Complex Objections and preserving trust while untangling layered concerns",
  }),
  pose({
    masterId: "master-slot-12",
    poseId: "slot-12-seller-desk-question-cards",
    characterId: "recurring-seller-approved",
    posture: "seated-at-desk",
    orientation: "front-facing with head turned left",
    gesture: "one hand lifting a question card and one hand pointing toward the answer lens",
    placement: "in the lower-center safe zone",
    prop: "one blank question card and a clear answer lens",
    backgroundRgb: BLUE_RGB,
    cue: "Seller FAQ Decoder questions about process timing property and next steps",
  }),
  pose({
    masterId: "master-slot-13",
    poseId: "slot-13-seller-stool-phone-pause",
    characterId: "recurring-seller-approved",
    posture: "perched-on-stool",
    orientation: "profile view facing left",
    gesture: "holding a phone away from his ear while considering the next respectful touch",
    placement: "in the right safe zone",
    prop: "a simple phone beside a calendar loop",
    backgroundRgb: YELLOW_RGB,
    cue: "Follow-Up Cadence with consistent purposeful and respectful contact",
  }),
  pose({
    masterId: "master-slot-14",
    poseId: "slot-14-andrea-walking-conversation-path",
    characterId: "andrea-approved",
    posture: "walking",
    orientation: "three-quarter view moving toward the viewer's left",
    gesture: "one hand gesturing to the next conversation step and one arm relaxed",
    placement: "in the center-right safe zone moving left",
    prop: "a flowing path of conversation-step icons",
    backgroundRgb: BLUE_RGB,
    cue: "Conversation Flow Mastery from listening through a clear next step",
  }),
  pose({
    masterId: "master-slot-15",
    poseId: "slot-15-seller-table-agreement-review",
    characterId: "recurring-seller-approved",
    posture: "seated-at-table",
    orientation: "three-quarter view facing left",
    gesture: "one hand resting near the agreement and one hand making a calm fit-check gesture",
    placement: "in the lower-right safe zone",
    prop: "an unlabeled agreement beside calendar and house pieces",
    backgroundRgb: YELLOW_RGB,
    cue: "Closing and Deal Engineering as a sound agreement that works for both sides",
  }),
  pose({
    masterId: "master-slot-16",
    poseId: "slot-16-andrea-standing-dashboard-signal",
    characterId: "andrea-approved",
    posture: "standing",
    orientation: "profile view facing left",
    gesture: "one hand pointing to the quality signal and one hand holding a coaching magnifier",
    placement: "in the right-center safe zone",
    prop: "a coaching magnifier and clean signal dashboard",
    backgroundRgb: BLUE_RGB,
    cue: "KPIs and Sales Telemetry for coaching quality and improvement",
  }),
  pose({
    masterId: "master-slot-17",
    poseId: "slot-17-andrea-desk-role-sheet",
    characterId: "andrea-approved",
    posture: "seated-at-desk",
    orientation: "profile view facing right",
    gesture: "one finger tracing the role sheet toward a verified outcome check",
    placement: "in the left-center safe zone",
    prop: "the current unlabeled written role sheet",
    backgroundRgb: YELLOW_RGB,
    cue: "Compensation Engine tied to the current written plan and verified outcomes without pay figures",
  }),
  pose({
    masterId: "master-slot-18",
    poseId: "slot-18-andrea-half-turn-mission-control",
    characterId: "andrea-approved",
    posture: "half-turn-standing",
    orientation: "back three-quarter view facing the board",
    gesture: "one hand moving a priority marker and one hand holding the ownership checklist",
    placement: "in the lower-left safe zone facing center",
    prop: "an unlabeled ownership checklist and mission-control board",
    backgroundRgb: BLUE_RGB,
    cue: "Operator Playbook and Daily Mission Control with visible priorities",
  }),
  pose({
    masterId: "master-slot-19",
    poseId: "slot-19-andrea-walking-growth-steps",
    characterId: "andrea-approved",
    posture: "walking",
    orientation: "profile view climbing up and right",
    gesture: "one arm reaching toward the next broad step and one arm balancing",
    placement: "in the center safe zone on the growth steps",
    prop: "broad practice coaching capability and ownership steps",
    backgroundRgb: YELLOW_RGB,
    cue: "Career Growth Path through practice feedback capability and increasing ownership",
  }),
  pose({
    masterId: "master-poster-video-slot-07-fact-find",
    poseId: "poster-fact-find-andrea-forward-listening",
    characterId: "andrea-approved",
    posture: "leaning-forward",
    orientation: "three-quarter view facing right",
    gesture: "one hand cupped near her ear and one hand taking a short note",
    placement: "in the left-center safe zone",
    prop: "a blank fact checklist and listening ear icon",
    backgroundRgb: YELLOW_RGB,
    cue: "The Fact Find video with curiosity listening and organized seller facts",
  }),
];

export function validateArtworkPoseContract(contract = ARTWORK_MASTER_POSE_CONTRACT) {
  if (!Array.isArray(contract) || contract.length !== 21) {
    throw new Error("Artwork pose contract must contain the cover, 19 lesson masters, and one distinct Fact Find master");
  }
  const expectedMasterIds = new Set([
    "master-program-bmh-employee-training",
    ...Array.from({ length: 19 }, (_, index) => `master-slot-${String(index + 1).padStart(2, "0")}`),
    "master-poster-video-slot-07-fact-find",
  ]);
  const masterIds = new Set();
  const poseIds = new Set();
  const signatures = new Set();
  const postureCounts = new Map();
  const characters = new Set();
  const backgrounds = new Set();

  for (const entry of contract) {
    if (!expectedMasterIds.has(entry.master_id) || masterIds.has(entry.master_id)) {
      throw new Error(`${entry.master_id} must be a unique expected artwork master`);
    }
    if (!entry.pose_id || poseIds.has(entry.pose_id)) {
      throw new Error(`${entry.master_id} must have a unique pose_id`);
    }
    if (entry.people_count !== 1) {
      throw new Error(`${entry.master_id} must depict exactly one person`);
    }
    if (!ALLOWED_ARTWORK_CHARACTERS.includes(entry.character_id)) {
      throw new Error(`${entry.master_id} must use Andrea or the recurring seller`);
    }
    if (entry.skin_fill !== "pure white") {
      throw new Error(`${entry.master_id} must preserve the pure white skin fill`);
    }
    if (!ALLOWED_ARTWORK_POSTURES.includes(entry.posture)) {
      throw new Error(`${entry.master_id} has an unsupported posture`);
    }
    if (![BLUE_RGB.join(","), YELLOW_RGB.join(",")].includes(entry.background_rgb?.join(","))) {
      throw new Error(`${entry.master_id} must use the locked blue or yellow background`);
    }
    for (const field of ["orientation", "gesture", "placement", "prop", "lesson_or_video_cue", "pose_instruction"]) {
      if (typeof entry[field] !== "string" || entry[field].trim().length < 8) {
        throw new Error(`${entry.master_id} is missing ${field}`);
      }
    }
    const signature = [entry.posture, entry.orientation, entry.gesture, entry.placement].join("|");
    if (signatures.has(signature)) {
      throw new Error(`${entry.master_id} repeats an existing pose`);
    }
    masterIds.add(entry.master_id);
    poseIds.add(entry.pose_id);
    signatures.add(signature);
    characters.add(entry.character_id);
    backgrounds.add(entry.background_rgb.join(","));
    postureCounts.set(entry.posture, (postureCounts.get(entry.posture) ?? 0) + 1);
  }

  if (masterIds.size !== expectedMasterIds.size || [...expectedMasterIds].some((id) => !masterIds.has(id))) {
    throw new Error("Artwork pose contract does not cover every expected master exactly once");
  }
  if (characters.size !== 2) {
    throw new Error("Artwork pose contract must use both Andrea and the recurring seller");
  }
  if (backgrounds.size !== 2) {
    throw new Error("Artwork pose contract must use both locked background colors");
  }
  if (postureCounts.size < 7 || [...postureCounts.values()].some((count) => count > 4)) {
    throw new Error("Artwork pose contract must vary posture and may not use one posture more than four times");
  }
  for (const masterId of ["master-slot-01", "master-slot-07", "master-slot-09"]) {
    const pilot = contract.find((entry) => entry.master_id === masterId);
    if (typeof pilot?.lineage_pose_signature !== "string" || pilot.lineage_pose_signature.length < 12) {
      throw new Error(`${masterId} must bind its approved pilot pose signature`);
    }
  }
  return true;
}

export function getArtworkPose(masterId) {
  const entry = ARTWORK_MASTER_POSE_CONTRACT.find((candidate) => candidate.master_id === masterId);
  if (!entry) throw new Error(`Artwork pose is missing for ${masterId}`);
  return entry;
}

export function buildArtworkOutputPosePlan(manifest) {
  validateArtworkPoseContract();
  const course = manifest?.program?.courses?.[0];
  if (!course) throw new Error("Artwork output pose plan requires one course");
  const lessons = course.modules.flatMap((module) => module.lessons.filter((lesson) => lesson.type === "content"));
  if (lessons.length !== 19) throw new Error("Artwork output pose plan requires 19 content lessons");
  const outputs = [];

  const addOutput = ({ assetKey, kind, sourceMasterId, lessonOrVideoCue, videoAssetKey = null, videoTitle = null }) => {
    const source = getArtworkPose(sourceMasterId);
    outputs.push({
      asset_key: assetKey,
      kind,
      source_master_id: sourceMasterId,
      pose_id: source.pose_id,
      character_id: source.character_id,
      people_count: source.people_count,
      skin_fill: source.skin_fill,
      background_rgb: source.background_rgb,
      lesson_or_video_cue: lessonOrVideoCue,
      video_asset_key: videoAssetKey,
      video_title: videoTitle,
    });
  };

  addOutput({
    assetKey: course.thumbnail_asset_key,
    kind: "course-cover",
    sourceMasterId: "master-program-bmh-employee-training",
    lessonOrVideoCue: "BMH Employee Training full course journey",
  });

  for (const [index, lesson] of lessons.entries()) {
    const slot = `slot-${String(index + 1).padStart(2, "0")}`;
    const lessonMasterId = `master-${slot}`;
    addOutput({
      assetKey: lesson.thumbnail_asset_key,
      kind: "lesson-card",
      sourceMasterId: lessonMasterId,
      lessonOrVideoCue: lesson.title,
    });
    for (const block of lesson.blocks.filter((candidate) => candidate.type === "video")) {
      const sourceMasterId = block.content.asset_key === "video-slot-07-fact-find" ? "master-poster-video-slot-07-fact-find" : lessonMasterId;
      addOutput({
        assetKey: block.content.poster_asset_key,
        kind: "video-poster",
        sourceMasterId,
        lessonOrVideoCue: `${block.content.title}: ${getArtworkPose(sourceMasterId).lesson_or_video_cue}`,
        videoAssetKey: block.content.asset_key,
        videoTitle: block.content.title,
      });
    }
  }

  if (outputs.length !== 49 || new Set(outputs.map((output) => output.asset_key)).size !== 49) {
    throw new Error("Artwork output pose plan must map 49 unique manifest assets");
  }
  return outputs;
}
