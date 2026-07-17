import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createEmptyProductionRecord, sha256, validateProductionRecord } from "./artwork-production-contract.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const manifestPath = path.join(repoRoot, "content/course-manifests/bmh-employee-training.v1.json");
const outputPath = path.join(repoRoot, "docs/course-production/thumbnail-pilots/production-inventory.json");
const pilotChecksumsPath = path.join(repoRoot, "docs/course-production/thumbnail-pilots/checksums.json");
const pilotGenerationLineagePath = path.join(repoRoot, "docs/course-production/thumbnail-pilots/generation-lineage.json");
const args = process.argv.slice(2);
const unknownArgs = args.filter((arg) => arg !== "--check");
if (unknownArgs.length > 0) {
  throw new Error(`Unknown argument(s): ${unknownArgs.join(", ")}`);
}
const checkMode = args.includes("--check");

const [manifest, pilotChecksums, pilotGenerationLineage] = await Promise.all([
  readFile(manifestPath, "utf8").then(JSON.parse),
  readFile(pilotChecksumsPath, "utf8").then(JSON.parse),
  readFile(pilotGenerationLineagePath, "utf8").then(JSON.parse),
]);
const course = manifest.program.courses[0];
const lessons = course.modules.flatMap((module) => module.lessons.filter((lesson) => lesson.type === "content"));
const manifestAssets = new Map(manifest.assets.map((asset) => [asset.source_key, asset]));

const BLUE_RGB = [103, 182, 255];
const YELLOW_RGB = [255, 211, 1];
const ALLOWED_BACKGROUND_RGB = new Set([BLUE_RGB.join(","), YELLOW_RGB.join(",")]);

const baseReferences = [
  {
    id: "style-ref-1",
    role: "canonical BMH Sticker System style",
    path: "docs/design/style-ref-1.png",
    sha256: "d65ce4c3fc84a0a52b08e513d42d978f94d5db2f6e59034aedbbd1e9486c18ca",
  },
  {
    id: "style-ref-2",
    role: "canonical BMH Sticker System style",
    path: "docs/design/style-ref-2.png",
    sha256: "f1affc2ab6b931be8cfd6920165dff330d49b79e6f4abfe5568e67e70c6934a6",
  },
  {
    id: "orientation-building",
    role: "Orientation subject reference only",
    path: "docs/course-production/thumbnail-pilots/references/mV0_LV0_s10_bmh-lowangle.png",
    sha256: "438bab4f68f7b71e5daec17def6ea1ceb091e010b57c135968746fba92ba42dc",
  },
  {
    id: "opening-phone-shapes",
    role: "Opening the Call subject reference only",
    path: "docs/course-production/thumbnail-pilots/references/m05_L5A_phones.png",
    sha256: "2d59d64e913c43b1fba45080b0bf59c9e51356f1d4b057c5d2831bfa0f7af6e8",
  },
  {
    id: "objection-character",
    role: "Objection Architecture character reference only",
    path: "docs/course-production/thumbnail-pilots/references/m07_L7A_b03_reframe.png",
    sha256: "57fe03b31eca46336c664c2ca78cf877b8db3138443964e7976ce70eb91db311",
  },
];

function repoPath(localPath) {
  const candidate = path.resolve(repoRoot, localPath);
  if (candidate !== repoRoot && !candidate.startsWith(`${repoRoot}${path.sep}`)) {
    throw new Error(`Pilot lineage path escapes the repository: ${localPath}`);
  }
  return candidate;
}

function pngDimensions(contents, localPath) {
  const signature = "89504e470d0a1a0a";
  if (contents.length < 24 || contents.subarray(0, 8).toString("hex") !== signature) {
    throw new Error(`Pilot lineage output is not a PNG: ${localPath}`);
  }
  return [contents.readUInt32BE(16), contents.readUInt32BE(20)];
}

function validateBackgroundRgb(value, label) {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    value.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > 255) ||
    !ALLOWED_BACKGROUND_RGB.has(value.join(","))
  ) {
    throw new Error(`${label} must be the locked blue or yellow RGB value`);
  }
  return value;
}

function validateToolEvidence(evidence, label) {
  const invokedAt = Date.parse(evidence?.invoked_at ?? "");
  const completedAt = Date.parse(evidence?.completed_at ?? "");
  if (
    !evidence?.thread_id ||
    !evidence?.agent_path ||
    !evidence?.invocation_call_id ||
    !evidence?.tool_output_call_id ||
    !evidence?.tool_output_id ||
    !Number.isFinite(invokedAt) ||
    !Number.isFinite(completedAt) ||
    completedAt < invokedAt
  ) {
    throw new Error(`${label} tool evidence is incomplete`);
  }
}

async function validateLineageInput(input, label, { requireId = false } = {}) {
  if (requireId && (!input?.id || !input?.role)) {
    throw new Error(`${label} must have a stable id and role`);
  }
  const contents = await readFile(repoPath(input.path));
  if (sha256(contents) !== input.sha256) {
    throw new Error(`${label} checksum changed: ${input.path}`);
  }
}

async function validateLineageOutput(output, label) {
  const outputContents = await readFile(repoPath(output.path));
  if (
    sha256(outputContents) !== output.sha256 ||
    outputContents.length !== output.size_bytes ||
    JSON.stringify(pngDimensions(outputContents, output.path)) !== JSON.stringify(output.dimensions)
  ) {
    throw new Error(`${label} output checksum, size, or dimensions changed`);
  }
}

async function readAndValidatePrompt(promptPath, promptSha256, label) {
  const promptBytes = await readFile(repoPath(promptPath), "utf8");
  const prompt = promptBytes.replace(/\r?\n$/, "");
  if (sha256(prompt) !== promptSha256) {
    throw new Error(`${label} prompt checksum changed`);
  }
  return prompt;
}

async function validatePilotGenerationLineage() {
  const schemaVersion = pilotGenerationLineage.schema_version;
  if (schemaVersion !== "bmh-thumbnail-pilot-lineage/v1" && schemaVersion !== "bmh-thumbnail-pilot-lineage/v2") {
    throw new Error("Pilot generation lineage schema is invalid");
  }
  const version = schemaVersion.endsWith("/v2") ? 2 : 1;
  if (pilotGenerationLineage.status !== "awaiting-jarrad-approval") {
    throw new Error("Pilot generation lineage must remain awaiting Jarrad approval");
  }
  if (!Array.isArray(pilotGenerationLineage.records)) {
    throw new Error("Pilot generation lineage records are missing");
  }
  const expectedSlugs = Object.values(pilotSlugBySlot);
  if (
    pilotGenerationLineage.records.length !== expectedSlugs.length ||
    new Set(pilotGenerationLineage.records.map((record) => record.slug)).size !== expectedSlugs.length ||
    expectedSlugs.some((slug) => !pilotGenerationLineage.records.some((record) => record.slug === slug))
  ) {
    throw new Error("Pilot generation lineage must cover each pilot exactly once");
  }

  const sharedParentsById = new Map();
  const v2InvocationIds = new Set();
  const v2ToolOutputIds = new Set();
  if (version === 2) {
    if (!Array.isArray(pilotGenerationLineage.shared_parents) || pilotGenerationLineage.shared_parents.length !== 1) {
      throw new Error("Pilot lineage v2 requires exactly one shared generated cast parent");
    }
    for (const parent of pilotGenerationLineage.shared_parents) {
      if (!parent?.id || sharedParentsById.has(parent.id)) {
        throw new Error("Pilot lineage v2 shared parent ids must be present and unique");
      }
      if (parent.operation !== "generate") {
        throw new Error(`${parent.id} shared parent operation must be generate`);
      }
      if (!Array.isArray(parent.inputs) || parent.inputs.length === 0) {
        throw new Error(`${parent.id} shared parent inputs are missing`);
      }
      await readAndValidatePrompt(parent.prompt_path, parent.prompt_sha256, parent.id);
      for (const input of parent.inputs) {
        await validateLineageInput(input, `${parent.id} shared parent input`, {
          requireId: true,
        });
      }
      validateToolEvidence(parent.tool_evidence, parent.id);
      v2InvocationIds.add(parent.tool_evidence.invocation_call_id);
      v2ToolOutputIds.add(parent.tool_evidence.tool_output_id);
      await validateLineageOutput(parent.output, parent.id);
      sharedParentsById.set(parent.id, parent);
    }
    if (new Set(pilotGenerationLineage.shared_parents.map((parent) => parent.output.sha256)).size !== pilotGenerationLineage.shared_parents.length) {
      throw new Error("Pilot lineage v2 shared parent outputs must be unique");
    }
  } else if (pilotGenerationLineage.shared_parents !== undefined) {
    throw new Error("Pilot lineage v1 cannot declare shared generated parents");
  }

  const promptBySlug = new Map();
  const referenceIdsBySlug = new Map();
  for (const record of pilotGenerationLineage.records) {
    const checksumRecord = pilotChecksums.assets.find((asset) => asset.slug === record.slug);
    if (!checksumRecord || !Array.isArray(record.steps) || record.steps.length === 0) {
      throw new Error(`Pilot generation lineage is incomplete for ${record.slug}`);
    }

    const sharedParent = version === 2 ? sharedParentsById.get(record.shared_parent_id) : null;
    if (version === 2 && !sharedParent) {
      throw new Error(`${record.slug} does not resolve a shared generated parent`);
    }
    const renderContract = version === 2 ? record.render_contract : null;
    if (version === 2) {
      validateBackgroundRgb(renderContract?.master_background_rgb, `${record.slug} master background`);
      validateBackgroundRgb(renderContract?.lesson_card?.normalize_background_rgb, `${record.slug} lesson-card normalization background`);
      validateBackgroundRgb(renderContract?.lesson_card?.padding_color_rgb, `${record.slug} lesson-card padding`);
      validateBackgroundRgb(renderContract?.video_poster?.normalize_background_rgb, `${record.slug} video-poster normalization background`);
    }

    let priorOutput = version === 2 ? sharedParent.output : null;
    for (const [index, step] of record.steps.entries()) {
      if (step.step !== index + 1) {
        throw new Error(`${record.slug} generation lineage is out of order`);
      }
      const expectedOperation = version === 2 ? "edit" : index === 0 ? "generate" : "edit";
      if (step.operation !== expectedOperation) {
        throw new Error(`${record.slug} generation lineage operation is invalid`);
      }
      const prompt = await readAndValidatePrompt(step.prompt_path, step.prompt_sha256, `${record.slug} generation`);
      if (!Array.isArray(step.inputs) || step.inputs.length === 0) {
        throw new Error(`${record.slug} generation inputs are missing`);
      }
      for (const input of step.inputs) {
        await validateLineageInput(input, `${record.slug} generation input`, {
          requireId: version === 2,
        });
      }
      if ((version === 2 || index > 0) && (step.inputs[0]?.sha256 !== priorOutput?.sha256 || step.inputs[0]?.path !== priorOutput?.path)) {
        throw new Error(`${record.slug} edit step is not tied to the prior output`);
      }
      if (version === 2 && index === 0 && (step.parent_source_sha256 !== sharedParent.output.sha256 || step.inputs[0]?.id !== record.shared_parent_id)) {
        throw new Error(`${record.slug} first edit is not bound to its shared generated parent`);
      }
      if (version === 2 && index > 0 && step.parent_source_sha256 !== priorOutput.sha256) {
        throw new Error(`${record.slug} edit parent checksum is out of order`);
      }

      validateToolEvidence(step.tool_evidence, `${record.slug} generation`);
      if (version === 2 && (v2InvocationIds.has(step.tool_evidence.invocation_call_id) || v2ToolOutputIds.has(step.tool_evidence.tool_output_id))) {
        throw new Error(`${record.slug} reuses image-generation tool evidence`);
      }
      if (version === 2) {
        v2InvocationIds.add(step.tool_evidence.invocation_call_id);
        v2ToolOutputIds.add(step.tool_evidence.tool_output_id);
      }
      await validateLineageOutput(step.output, `${record.slug} generation`);
      priorOutput = step.output;
      if (index === 0) {
        promptBySlug.set(record.slug, prompt);
        referenceIdsBySlug.set(
          record.slug,
          step.inputs.map((input) => input.id),
        );
      }
    }

    const terminal = record.steps.at(-1).output;
    if (record.terminal_output_sha256 !== terminal.sha256 || terminal.sha256 !== checksumRecord.source.sha256 || terminal.path !== checksumRecord.source.path) {
      throw new Error(`${record.slug} terminal generation output does not match the review source`);
    }
  }
  return { version, sharedParentsById, promptBySlug, referenceIdsBySlug };
}

function buildProvenance(plannedGenerationCallId, generationCall) {
  return {
    generator: "built-in image_gen",
    generation_call: generationCall,
    planned_generation_call_id: plannedGenerationCallId,
    source_capture_required: true,
    prompt_checksum_required: true,
    reference_checksums_required: true,
    generated_at_required: true,
    generated_by_required: true,
    model_output_path_required: true,
  };
}

const blockedApproval = {
  status: "blocked-pending-pilot-approval",
  approved_by: null,
  approved_at: null,
  evidence: null,
};

const pilotSlugBySlot = {
  "slot-01": "orientation",
  "slot-07": "opening-the-call",
  "slot-09": "objection-architecture",
};

const pilotLineageContract = await validatePilotGenerationLineage();
const usesSharedPilotLineage = pilotLineageContract.version === 2;

const references = usesSharedPilotLineage
  ? (() => {
      const collected = new Map(
        baseReferences.filter((reference) => reference.id === "style-ref-1" || reference.id === "style-ref-2").map((reference) => [reference.id, reference]),
      );
      for (const parent of pilotLineageContract.sharedParentsById.values()) {
        for (const input of parent.inputs) {
          const existing = collected.get(input.id);
          if (existing && (existing.path !== input.path || existing.sha256 !== input.sha256)) {
            throw new Error(`Pilot lineage v2 reference id drifted: ${input.id}`);
          }
          collected.set(input.id, {
            id: input.id,
            role: input.role,
            path: input.path,
            sha256: input.sha256,
          });
        }
        collected.set(parent.id, {
          id: parent.id,
          role: "shared generated cast parent",
          path: parent.output.path,
          sha256: parent.output.sha256,
        });
      }
      for (const record of pilotGenerationLineage.records) {
        for (const step of record.steps) {
          for (const input of step.inputs) {
            const existing = collected.get(input.id);
            if (existing && (existing.path !== input.path || existing.sha256 !== input.sha256)) {
              throw new Error(`Pilot lineage v2 reference id drifted: ${input.id}`);
            }
            if (!existing) {
              collected.set(input.id, {
                id: input.id,
                role: input.role,
                path: input.path,
                sha256: input.sha256,
              });
            }
          }
        }
      }
      return [...collected.values()];
    })()
  : baseReferences;

for (const reference of references) {
  const contents = await readFile(path.join(repoRoot, reference.path));
  const actualSha256 = sha256(contents);
  if (actualSha256 !== reference.sha256) {
    throw new Error(`Reference ${reference.id} SHA-256 mismatch: ${actualSha256} != ${reference.sha256}`);
  }
}

const pilotApproval = {
  status: "awaiting-jarrad-approval",
  approved_by: null,
  approved_at: null,
  evidence: null,
};

const pilotPrompts = {
  "slot-01": `Use case: stylized-concept
Asset type: BMH Institute lesson-thumbnail pilot, wide 16:9 master designed to crop safely to 16:10
Primary request: Create the Orientation thumbnail for a new employee beginning BMH Institute. Show an iconic welcoming BMH training building as one large central sticker, with a simple open doorway, a tiny new learner approaching, a small compass, checklist, and upward path markers floating as separate supporting stickers. The five-second read should be “welcome, direction, begin training.”
Input images: Image 1 and Image 2 are the canonical BMH Sticker System style references; Image 3 is a subject reference for the recognizable BMH building only. Preserve the flat sticker language from Images 1–2 and simplify the building from Image 3 into an icon rather than a realistic scene.
Scene/backdrop: uninterrupted flat cornflower-blue field with generous active negative space; floating sticker composition, never a continuous environment
Style/medium: hand-drawn flat sticker-sheet illustration; thick slightly wobbly black outlines; rounded imperfect primitive geometry; every object is an individually croppable sticker
Composition/framing: large building sticker centered slightly right, tiny learner and open-door cue lower left, small compass/checklist/path marks balanced around it; keep all meaningful content inside the central 80% so both 16:9 and 16:10 crops remain intact
Color palette: cornflower blue, golden yellow, orange, cream, white, black, and at most one muted green; 6–8 flat colors maximum
Characters: tiny scale, dot eyes, minimal face, cylindrical limbs, simple silhouette
Constraints: no title, no words, no letters, no logos, no watermark; flat fills only; strong silhouettes; uniform complexity; decorative doodles limited to a few purposeful sparkles and motion marks
Avoid: gradients, texture, lighting, shadows, reflections, depth, realistic perspective, photorealism, 3D rendering, detailed architecture, busy interiors, edge-cropped key objects`,
  "slot-07": `Use case: stylized-concept
Asset type: BMH Institute lesson-thumbnail pilot, wide 16:9 master designed to crop safely to 16:10
Primary request: Create the Opening the Call thumbnail. The five-second read must be “start a confident, human phone conversation.” Use a large friendly telephone handset as the hero sticker bridging two simple speech bubbles, with a tiny headset-wearing employee on one side and a tiny homeowner on the other. Add a small open-door icon and a few purposeful sound-wave marks as supporting stickers.
Input images: Image 1 and Image 2 are the canonical BMH Sticker System style references; Image 3 is a subject reference for phone icon shapes only. Match the loose flat sticker-sheet language of Images 1–2; simplify the phones from Image 3 and do not reproduce a scene.
Scene/backdrop: perfectly uniform flat cornflower-blue field with generous active negative space; floating sticker composition, never a continuous room or environment
Style/medium: hand-drawn flat sticker-sheet illustration; thick slightly wobbly black outlines; rounded imperfect primitive geometry; every object is independently croppable
Composition/framing: large curved handset near center linking left and right speech bubbles; tiny employee and homeowner separated but visibly connected through the call; open-door icon and sound marks balanced around the hero; keep meaningful content inside the central 80% for safe 16:9 and 16:10 crops
Color palette: cornflower blue, golden yellow, orange, cream, white, and black only; 6 flat colors maximum
Characters: tiny scale, dot eyes, minimal faces, cylindrical limbs, simple hair silhouettes, one headset prop
Constraints: no title, no words, no letters, no numbers, no logos, no watermark; absolutely uniform flat fills; no white sticker border; strong silhouettes; uniform complexity; decorative rhythm limited to speech bubbles, sound marks, and two sparkles
Avoid: any gradient, texture, lighting, glow, shadow, reflection, depth, realistic perspective, photorealism, 3D rendering, detailed smartphone interface, busy interiors, edge-cropped key objects`,
  "slot-09": `Use case: stylized-concept
Asset type: BMH Institute lesson-thumbnail pilot, wide 16:9 master designed to crop safely to 16:10
Primary request: Create the Objection Architecture thumbnail. The five-second read must be “hear an objection, reframe it, build a calm response.” Use a large central bridge or modular arch assembled from three chunky sticker blocks: an ear icon on the left block, a curved reframe arrow on the center block, and a calm speech bubble with a check mark on the right block. Include a tiny thoughtful phone rep below the arch and two small floating puzzle-piece/support-beam icons.
Input images: Image 1 and Image 2 are the canonical BMH Sticker System style references; Image 3 is a subject reference for the thoughtful phone-rep character only. Preserve the flat, loose sticker-sheet language of Images 1–2, simplify the character from Image 3, and do not reproduce a scene.
Scene/backdrop: perfectly uniform flat cornflower-blue field with generous active negative space; floating sticker composition, never a continuous room, construction site, or environment
Style/medium: hand-drawn flat sticker-sheet illustration; thick slightly wobbly black outlines; rounded imperfect primitive geometry; every object independently croppable
Composition/framing: three-block arch centered and instantly legible left-to-right; small rep below but not touching an edge; support icons and a few purposeful doodle marks around it; keep all meaningful content inside central 80% for safe 16:9 and 16:10 crops
Color palette: cornflower blue, golden yellow, orange, cream, white, and black only; 6 flat colors maximum
Characters: one tiny rep with dot eyes, minimal facial features, cylindrical limbs, light hair, orange goggles resting on head, phone prop
Constraints: no title, no words, no letters, no numbers, no logos, no watermark; absolutely uniform flat fills; no white sticker border; strong silhouettes; uniform complexity; the three-step visual logic must be obvious without labels
Avoid: any gradient, texture, lighting, glow, shadow, reflection, depth, realistic perspective, photorealism, 3D rendering, complex diagrams, busy masonry, detailed interiors, edge-cropped key objects`,
};

const factFindPosterPrompt = `Use case: stylized-concept
Asset type: BMH Institute Fact Find video-poster master, wide 16:9 artwork generated independently from the Opening the Call lesson-card master
Primary request: Create a focused Fact Find illustration. The five-second read must be “ask with curiosity, listen carefully, and organize the seller facts.” Show one calm employee and one homeowner connected by a simple speech bubble, with a large listening ear, a magnifier, and a clean fact checklist made only from unlabeled lines and check marks. This image must stand on its own as the Fact Find video poster and must not reuse the Opening the Call pilot composition.
Input images: Image 1 and Image 2 are the canonical BMH Sticker System style references. Use them only for flat visual language, line quality, palette, character simplicity, and sticker spacing. Do not copy their subjects or layouts. No subject reference is authorized for this call.
Scene/backdrop: perfectly uniform flat cornflower-blue field with generous active negative space; a floating sticker composition, never a continuous room or realistic environment
Style/medium: hand-drawn flat sticker-sheet illustration; thick slightly wobbly black outlines; rounded imperfect primitive geometry; strong simple silhouettes; every object independently croppable
Composition/framing: center the listening conversation, keep the ear and magnifier as clearly separate supporting stickers, and place the fact checklist to the right; keep every meaningful object inside the central 80% so the complete 16:9 master can be used without a crop
Color palette: cornflower blue, golden yellow, amber, orange, cream, white, black, and at most one muted green; exactly the locked eight-color palette after deterministic flattening; no extra colors
Characters: two tiny people with dot eyes, minimal faces, cylindrical limbs, and simple hair and clothing silhouettes
Constraints: no title, no words, no letters, no numbers, no currency amounts, no logos, no watermark; absolutely uniform flat fills; no white sticker border; no invented software interface; no fixed performance promises; no reuse of the Opening the Call hero handset composition
Avoid: gradients, texture, lighting, glow, shadows, reflections, depth, realistic perspective, photorealism, 3D rendering, detailed screens, tiny unreadable symbols, busy backgrounds, edge-cropped key objects, sales-pressure imagery, and unrelated lesson subjects`;

const lessonSpecs = [
  {
    slot: "slot-01",
    title: "Welcome and Mindset",
    pilot: true,
    references: ["style-ref-1", "style-ref-2", "orientation-building"],
    fiveSecondRead: "welcome, direction, and the calm service mindset",
    scene: "a welcoming training building, learner, compass, checklist, and steady path",
    anchors: [
      ["welcome at the open training doorway", "full-safe"],
      ["learner choosing a steady compass-led path", "left-safe"],
    ],
  },
  {
    slot: "slot-02",
    title: "Real Estate Terms Glossary",
    fiveSecondRead: "turn unfamiliar real estate language into clear shared meaning",
    scene: "an open reference book surrounded by a house, key, contract page, map pin, and speech bubble stickers",
    anchors: [["plain-language real estate reference kit", "full-safe"]],
  },
  {
    slot: "slot-03",
    title: "Tech Stack and Systems",
    fiveSecondRead: "use connected tools as one reliable operating system",
    scene: "a central hub linking a lead card, phone, task checklist, coaching headset, and clean dashboard stickers",
    anchors: [["connected tool hub and reliable handoffs", "full-safe"]],
  },
  {
    slot: "slot-04",
    title: "Humanizing the Lead",
    fiveSecondRead: "see the person and situation before the property",
    scene:
      "three separate human-first stickers: a homeowner beside a small house, an unfolding story path, and a calm fit lens aligning person, property, and timing",
    anchors: [
      ["homeowner before property details", "left-safe"],
      ["seller story and situation path", "center-safe"],
      ["ideal seller fit lens", "right-safe"],
    ],
  },
  {
    slot: "slot-05",
    title: "The BMH Offer Playbook",
    fiveSecondRead: "match a seller situation to a clear respectful option",
    scene: "two balanced offer stations: a situation-to-option scale and a choice path ending in a calm handshake",
    anchors: [
      ["situation-to-option balance", "left-safe"],
      ["clear choice path and respectful agreement", "right-safe"],
    ],
  },
  {
    slot: "slot-06",
    title: "Sales Pipeline and Stage Ownership",
    fiveSecondRead: "move each conversation through clear owned stages",
    scene: "a pipeline of distinct stage cards passed with a baton, beside a five-step stepping-stone conversation path",
    anchors: [
      ["owned pipeline stages and baton handoff", "left-safe"],
      ["five-step conversation path", "right-safe"],
    ],
  },
  {
    slot: "slot-07",
    title: "Opening the Call",
    pilot: true,
    references: ["style-ref-1", "style-ref-2", "opening-phone-shapes"],
    fiveSecondRead: "start a confident human call and uncover the facts",
    scene: "a friendly handset linking an employee and homeowner, with speech bubbles, an open door, and a small fact-finding checklist",
    anchors: [
      ["confident human call opening", "full-safe"],
      ["curious fact-finding conversation", "right-safe"],
    ],
  },
  {
    slot: "slot-08",
    title: "Discovery and Handoff",
    fiveSecondRead: "listen deeply then transfer clear context without dropping it",
    scene: "a listening magnifier uncovering a seller need, beside two teammates passing a complete context folder across a short bridge",
    anchors: [
      ["listening-led discovery", "left-safe"],
      ["complete context handoff", "right-safe"],
    ],
  },
  {
    slot: "slot-09",
    title: "Objection Architecture",
    pilot: true,
    references: ["style-ref-1", "style-ref-2", "objection-character"],
    fiveSecondRead: "hear, reframe, and build a calm response",
    scene: "a modular arch built from an ear, reframe arrow, and checked speech bubble, with a thoughtful phone rep",
    anchors: [["hear reframe and respond architecture", "full-safe"]],
  },
  {
    slot: "slot-10",
    title: "Objection Scripts Playbook",
    fiveSecondRead: "use a flexible response tool without sounding robotic",
    scene: "a compact toolbox holding modular speech-bubble cards, an ear, a curved response arrow, and a calm rep",
    anchors: [["flexible objection response toolbox", "full-safe"]],
  },
  {
    slot: "slot-11",
    title: "Complex Objections",
    fiveSecondRead: "untangle layered concerns while preserving trust",
    scene: "a rep calmly untangling a knot of house, clock, contract, and price symbols, beside a shield-shaped bridge connecting two people",
    anchors: [
      ["untangling layered objections", "left-safe"],
      ["trust and people bridge", "right-safe"],
    ],
  },
  {
    slot: "slot-12",
    title: "Seller FAQ Decoder",
    fiveSecondRead: "decode common seller questions into clear helpful answers",
    scene: "two question clusters connected to an answer lens: one around process and timing, one around property, contract, and next steps",
    anchors: [
      ["process and timing question cluster", "left-safe"],
      ["property contract and next-step question cluster", "right-safe"],
    ],
  },
  {
    slot: "slot-13",
    title: "Follow-Up Cadence",
    fiveSecondRead: "follow up consistently with purpose and respect",
    scene: "a calendar loop connecting a phone, message bubble, task check, and pause marker around one calm homeowner",
    anchors: [["purposeful respectful follow-up loop", "full-safe"]],
  },
  {
    slot: "slot-14",
    title: "Conversation Flow Mastery",
    fiveSecondRead: "guide a natural conversation from opening to clear next step",
    scene: "a flowing path of listening, discovery, option, agreement, and next-step stickers led by one calm rep",
    anchors: [["natural conversation flow from listen to next step", "full-safe"]],
  },
  {
    slot: "slot-15",
    title: "Closing and Deal Engineering",
    fiveSecondRead: "assemble a sound agreement that works for both sides",
    scene: "two sides of a bridge joined by contract, calendar, house, and handshake puzzle pieces with a final fit check",
    anchors: [["sound agreement and deal-fit bridge", "full-safe"]],
  },
  {
    slot: "slot-16",
    title: "KPIs and Sales Telemetry",
    fiveSecondRead: "use quality signals to improve the work without chasing vanity numbers",
    scene: "a clean signal dashboard with a gauge, conversation-quality waveform, funnel, coaching magnifier, and improvement arrow",
    anchors: [["quality signals coaching and improvement", "full-safe"]],
  },
  {
    slot: "slot-17",
    title: "Compensation Engine",
    fiveSecondRead: "understand how role expectations and verified outcomes connect to the current written plan",
    scene: "a written role sheet connected by gears to quality work, verified outcome, and review check stickers, with no money symbols",
    anchors: [["written role plan linked to verified outcomes", "full-safe"]],
  },
  {
    slot: "slot-18",
    title: "Operator Playbook and Daily Mission Control",
    fiveSecondRead: "own the daily operating rhythm and keep priorities visible",
    scene: "an operator station with an ownership checklist, beside a mission-control board linking calendar, calls, tasks, pipeline, and coaching",
    anchors: [
      ["operator ownership checklist", "left-safe"],
      ["daily mission-control board", "right-safe"],
    ],
  },
  {
    slot: "slot-19",
    title: "Career Growth Path",
    fiveSecondRead: "build capability through practice feedback and increasing ownership",
    scene: "a learner climbing broad steps marked only by practice, coaching, capability, and ownership icons toward a guiding beacon",
    anchors: [["practice coaching capability and ownership path", "full-safe"]],
  },
];

function buildPrompt(spec) {
  if (usesSharedPilotLineage && spec.pilot) {
    const prompt = pilotLineageContract.promptBySlug.get(pilotSlugBySlot[spec.slot]);
    if (!prompt) throw new Error(`${spec.slot} pilot edit prompt is missing from lineage v2`);
    return prompt;
  }
  if (pilotPrompts[spec.slot]) return pilotPrompts[spec.slot];
  const anchorSentence = spec.anchors
    .map(([subject, crop], index) => {
      const placement = crop.startsWith("left") ? "left" : crop.startsWith("right") ? "right" : "center";
      return `poster anchor ${index + 1} is ${subject} in the ${placement} safe zone`;
    })
    .join("; ");

  return `Use case: stylized-concept
Asset type: BMH Institute ${spec.title} lesson master, wide 16:9 artwork designed for one 16:10 lesson card and distinct 16:9 video posters
Primary request: Create the ${spec.title} lesson illustration. The five-second read must be “${spec.fiveSecondRead}.” Build the visual around ${spec.scene}. Each requested poster anchor must be visually independent and recognizable without labels.
Input images: Image 1 and Image 2 are the canonical BMH Sticker System style references. Use them only for the flat visual language, line quality, palette, character simplicity, and sticker spacing. Do not copy their subjects or layouts.
Scene/backdrop: perfectly uniform flat cornflower-blue field with generous active negative space; a floating sticker composition, never a continuous room, landscape, or realistic environment
Style/medium: hand-drawn flat sticker-sheet illustration; thick slightly wobbly black outlines; rounded imperfect primitive geometry; strong silhouettes; every object independently croppable
Composition/framing: ${anchorSentence}; balance the anchors as one coherent lesson composition; keep all meaningful content inside the central 80% and each named anchor fully inside its assigned safe zone so the 16:10 padded card and focused 16:9 poster crops stay intact
Color palette: cornflower blue, golden yellow, amber, orange, cream, white, black, and at most one muted green; exactly the locked eight-color palette after deterministic flattening; no extra colors
Characters: tiny scale, dot eyes, minimal faces, cylindrical limbs, simple hair and clothing silhouettes; use only the minimum people needed to explain the subject
Constraints: no title, no words, no letters, no numbers, no currency amounts, no logos, no watermark; absolutely uniform flat fills; no white sticker border; no invented software interface; no fixed performance promises; no decorative object without a teaching purpose
Avoid: gradients, texture, lighting, glow, shadows, reflections, depth, realistic perspective, photorealism, 3D rendering, detailed screens, tiny unreadable symbols, busy backgrounds, edge-cropped key objects, duplicated poster anchors, and subject matter from another lesson`;
}

function assertAsset(assetKey, localPath) {
  const asset = manifestAssets.get(assetKey);
  if (!asset) throw new Error(`Manifest is missing ${assetKey}`);
  if (asset.local_path !== localPath) {
    throw new Error(`${assetKey} path mismatch: ${asset.local_path} != ${localPath}`);
  }
  if (!["missing", "approved"].includes(asset.approval_status)) {
    throw new Error(`${assetKey} has unsupported artwork approval status ${asset.approval_status}`);
  }
  if (asset.approval_status === "approved") {
    if (!/^[a-f0-9]{64}$/.test(asset.checksum_sha256 ?? "")) {
      throw new Error(`${assetKey} approved artwork is missing a valid SHA-256`);
    }
    if (!Number.isSafeInteger(asset.size_bytes) || asset.size_bytes <= 0) {
      throw new Error(`${assetKey} approved artwork is missing a valid size`);
    }
    if (!asset.storage_path.includes(asset.checksum_sha256)) {
      throw new Error(`${assetKey} approved artwork storage path is not checksum-addressed`);
    }
  }
}

const inventoryLessons = lessonSpecs.map((spec, index) => {
  const lesson = lessons[index];
  if (!lesson || lesson.title !== spec.title) {
    throw new Error(`${spec.slot} title mismatch: expected ${spec.title}, got ${lesson?.title}`);
  }
  const videoBlocks = lesson.blocks.filter((block) => block.type === "video");
  if (videoBlocks.length !== spec.anchors.length) {
    throw new Error(`${spec.slot} video and poster-anchor counts differ`);
  }

  const cardPath = `course-assets/thumbnails/${spec.slot}.webp`;
  assertAsset(lesson.thumbnail_asset_key, cardPath);
  const pilotSlug = spec.pilot ? pilotSlugBySlot[spec.slot] : null;
  const pilotLineage = pilotSlug ? pilotGenerationLineage.records.find((record) => record.slug === pilotSlug) : null;
  const renderContract =
    usesSharedPilotLineage && pilotLineage
      ? pilotLineage.render_contract
      : {
          master_background_rgb: BLUE_RGB,
          lesson_card: {
            normalize_background_rgb: BLUE_RGB,
            padding_color_rgb: BLUE_RGB,
          },
          video_poster: { normalize_background_rgb: BLUE_RGB },
        };
  const lessonReferenceIds =
    usesSharedPilotLineage && pilotSlug ? pilotLineageContract.referenceIdsBySlug.get(pilotSlug) : (spec.references ?? ["style-ref-1", "style-ref-2"]);
  const prompt = buildPrompt(spec);
  const plannedGenerationCallId = spec.pilot ? null : `imagegen-lesson-${spec.slot}`;
  const lessonProvenance = buildProvenance(plannedGenerationCallId, spec.pilot ? "promote-existing-pilot-call" : "one-distinct-call");

  const master = {
    id: `master-${spec.slot}`,
    source_path: `course-assets/thumbnails/production/sources/${spec.slot}-generated.png`,
    flat_master_path: `course-assets/thumbnails/production/flat-masters/${spec.slot}-flat-master.png`,
    ...(usesSharedPilotLineage ? { background_rgb: renderContract.master_background_rgb } : {}),
    expected_aspect_ratio: "16:9",
    meaningful_content_bounds: {
      x_min_percent: 10,
      x_max_percent: 90,
      y_min_percent: 10,
      y_max_percent: 90,
    },
    production_record: createEmptyProductionRecord(),
  };

  const posters = videoBlocks.map((block, posterIndex) => {
    const [focusSubject, cropProfile] = spec.anchors[posterIndex];
    const assetKey = block.content.poster_asset_key;
    const outputPath = `course-assets/posters/${block.content.asset_key}.webp`;
    assertAsset(assetKey, outputPath);
    const isFactFind = assetKey === "poster-video-slot-07-fact-find";
    const directMaster = isFactFind
      ? {
          id: "master-poster-video-slot-07-fact-find",
          source_path: "course-assets/posters/production/sources/video-slot-07-fact-find-generated.png",
          flat_master_path: "course-assets/posters/production/flat-masters/video-slot-07-fact-find-flat-master.png",
          ...(usesSharedPilotLineage ? { background_rgb: BLUE_RGB } : {}),
          expected_aspect_ratio: "16:9",
          reference_ids: ["style-ref-1", "style-ref-2"],
          prompt: factFindPosterPrompt,
          prompt_sha256: sha256(factFindPosterPrompt),
          provenance: buildProvenance("imagegen-poster-video-slot-07-fact-find", "one-distinct-call"),
          production_record: createEmptyProductionRecord(),
        }
      : null;
    const posterProvenance = directMaster?.provenance ?? lessonProvenance;
    const effectiveCropProfile = directMaster ? "full-safe" : cropProfile;
    return {
      asset_key: assetKey,
      video_asset_key: block.content.asset_key,
      video_title: block.content.title,
      output_path: outputPath,
      focus_subject: focusSubject,
      production_source_mode: directMaster ? "generate-distinct-after-pilot-approval" : "derive-from-lesson-master",
      direct_master: directMaster,
      derivative: {
        recipe_id: `${spec.slot}-${block.content.asset_key}-${effectiveCropProfile}`,
        source_master_id: directMaster?.id ?? master.id,
        crop_profile: effectiveCropProfile,
        normalize_master_dimensions: [1280, 720],
        normalize_method: "contain-with-padding",
        normalize_background_rgb: directMaster ? BLUE_RGB : renderContract.video_poster.normalize_background_rgb,
        crop_pixels_after_normalize: {
          "full-safe": [0, 0, 1280, 720],
          "left-safe": [64, 144, 768, 432],
          "center-safe": [256, 144, 768, 432],
          "right-safe": [448, 144, 768, 432],
        }[effectiveCropProfile],
        target_dimensions: [1280, 720],
        resample: "lanczos",
        output_format: "lossless-webp",
        duplicate_pixel_sha256_forbidden: true,
        visual_subject_confirmation_required: true,
      },
      provenance: posterProvenance,
      approval: blockedApproval,
    };
  });

  return {
    slot: spec.slot,
    lesson_source_key: lesson.source_key,
    title: spec.title,
    pilot: Boolean(spec.pilot),
    production_source_mode: spec.pilot ? "promote-approved-pilot-flat-master" : "generate-after-pilot-approval",
    reference_ids: lessonReferenceIds,
    prompt,
    prompt_sha256: sha256(prompt),
    master,
    lesson_card: {
      asset_key: lesson.thumbnail_asset_key,
      output_path: cardPath,
      derivative: {
        recipe_id: `${spec.slot}-lesson-card-16x10`,
        source_master_id: master.id,
        target_dimensions: [1280, 800],
        method: "contain-master-in-1280x720-and-pad-40px-top-and-bottom",
        normalize_master_dimensions: [1280, 720],
        normalize_method: "contain-with-padding",
        normalize_background_rgb: renderContract.lesson_card.normalize_background_rgb,
        padding_color_rgb: renderContract.lesson_card.padding_color_rgb,
        crop_allowed: false,
        resample: "lanczos",
        output_format: "lossless-webp",
      },
      provenance: lessonProvenance,
      approval: blockedApproval,
    },
    posters,
    pilot_review: spec.pilot
      ? {
          slug: pilotSlug,
          status: pilotChecksums.status,
          assets: pilotChecksums.assets.find((asset) => asset.slug === pilotSlug),
          checksum_record_path: "docs/course-production/thumbnail-pilots/checksums.json",
          generation_lineage_record_path: "docs/course-production/thumbnail-pilots/generation-lineage.json",
          generation_lineage: pilotLineage,
          ...(usesSharedPilotLineage
            ? {
                lineage_schema_version: pilotGenerationLineage.schema_version,
                shared_generation_parent: pilotLineageContract.sharedParentsById.get(pilotLineage.shared_parent_id),
              }
            : {}),
        }
      : null,
    provenance: lessonProvenance,
    approval: spec.pilot ? pilotApproval : blockedApproval,
  };
});

const coverPath = "course-assets/thumbnails/program-bmh-employee-training.webp";
assertAsset(course.thumbnail_asset_key, coverPath);

const inventory = {
  schema_version: usesSharedPilotLineage ? "bmh-artwork-production/v2" : "bmh-artwork-production/v1",
  status: "blocked-pending-pilot-approval",
  generation_policy: {
    gate: "Jarrad must approve all three pilots before any new image generation",
    generator: "built-in image_gen",
    call_strategy: "one distinct image_gen call per cover or non-pilot lesson master, plus a separate Fact Find poster-master call",
    ...(usesSharedPilotLineage
      ? {
          pilot_call_strategy: "one checksum-locked shared cast generation followed by one independently evidenced edit chain per pilot",
        }
      : {}),
    model_native_text: "forbidden",
    manifest_approval_updates: "forbidden until visual QA and explicit approval",
    upload_or_publish: "forbidden in artwork production",
  },
  style_system: {
    name: "BMH Sticker System",
    reference_inputs: references,
    palette_rgb: [
      [103, 182, 255],
      [255, 211, 1],
      [255, 174, 1],
      [255, 110, 0],
      [254, 255, 198],
      [255, 255, 255],
      [0, 0, 0],
      [105, 153, 53],
    ],
    ...(usesSharedPilotLineage
      ? {
          background_contract: {
            allowed_rgb: [BLUE_RGB, YELLOW_RGB],
            master_field: "background_rgb",
            derivative_normalization_field: "normalize_background_rgb",
            lesson_card_padding_field: "padding_color_rgb",
          },
        }
      : {}),
    crop_profiles: {
      "full-safe": { x: 0, y: 0, width: 1, height: 1 },
      "left-safe": { x: 0.05, y: 0.2, width: 0.6, height: 0.6 },
      "center-safe": { x: 0.2, y: 0.2, width: 0.6, height: 0.6 },
      "right-safe": { x: 0.35, y: 0.2, width: 0.6, height: 0.6 },
    },
    safe_crop_rules: [
      "Generate a 16:9 master with all meaningful objects inside the central 80 percent.",
      "Build the 16:10 lesson card by containment and solid palette padding. Never crop a lesson master to make the card.",
      "A focused poster crop must contain its complete named subject with at least 5 percent internal breathing room.",
      "If a generated anchor misses its declared safe zone, reject or correct the master. Do not move the crop to another subject.",
      "All 29 final poster pixel SHA-256 values must be unique. A checksum collision means a duplicated poster and blocks approval.",
      "A human must confirm each focused poster still depicts its mapped video title before manifest approval.",
    ],
  },
  course_cover: {
    id: "master-program-bmh-employee-training",
    asset_key: course.thumbnail_asset_key,
    output_path: coverPath,
    source_path: "course-assets/thumbnails/production/sources/program-bmh-employee-training-generated.png",
    flat_master_path: "course-assets/thumbnails/production/flat-masters/program-bmh-employee-training-flat-master.png",
    ...(usesSharedPilotLineage ? { background_rgb: BLUE_RGB } : {}),
    derivative: {
      recipe_id: "course-cover-card-16x10",
      source_master_id: "master-program-bmh-employee-training",
      target_dimensions: [1280, 800],
      method: "contain-master-in-1280x720-and-pad-40px-top-and-bottom",
      normalize_master_dimensions: [1280, 720],
      normalize_method: "contain-with-padding",
      normalize_background_rgb: [103, 182, 255],
      padding_color_rgb: [103, 182, 255],
      crop_allowed: false,
      resample: "lanczos",
      output_format: "lossless-webp",
    },
    reference_ids: ["style-ref-1", "style-ref-2"],
    prompt: `Use case: stylized-concept
Asset type: BMH Institute BMH Employee Training course cover, wide 16:9 master designed to crop safely to 16:10
Primary request: Create the course cover for BMH Employee Training. The five-second read must be “one clear path from orientation through confident service and career growth.” Use a welcoming training doorway as the central hero sticker. Arrange six small supporting stickers around it for the six course sections: compass and checklist, homeowner and heart, connected speech bubbles, ear and reframe arrow, calendar and handshake, and a clean dashboard leading to broad growth steps.
Input images: Image 1 and Image 2 are the canonical BMH Sticker System style references. Use them only for the flat visual language, line quality, palette, character simplicity, and sticker spacing. Do not copy their subjects or layouts.
Scene/backdrop: perfectly uniform flat cornflower-blue field with generous active negative space; a floating sticker composition, never a continuous building interior, landscape, or realistic environment
Style/medium: hand-drawn flat sticker-sheet illustration; thick slightly wobbly black outlines; rounded imperfect primitive geometry; strong simple silhouettes; every object independently croppable
Composition/framing: large welcoming doorway centered with a tiny learner moving toward it; six supporting course-section stickers form a loose balanced path around the doorway; keep all meaningful content inside the central 80% so the 16:9 source and 16:10 contained card remain intact
Color palette: cornflower blue, golden yellow, amber, orange, cream, white, black, and one muted green; exactly the locked eight-color palette after deterministic flattening; no extra colors
Characters: one tiny learner with dot eyes, minimal face, cylindrical limbs, and a simple silhouette
Constraints: no title, no words, no letters, no numbers, no currency amounts, no logos, no watermark; absolutely uniform flat fills; no white sticker border; no fixed performance promises; the six section motifs must read as one learning journey rather than six disconnected scenes
Avoid: gradients, texture, lighting, glow, shadows, reflections, depth, realistic perspective, photorealism, 3D rendering, detailed architecture, tiny unreadable symbols, busy backgrounds, edge-cropped key objects, and lesson-specific subject dominance`,
    provenance: buildProvenance("imagegen-course-cover", "one-distinct-call"),
    production_record: createEmptyProductionRecord(),
    approval: blockedApproval,
  },
  lessons: inventoryLessons,
};

inventory.course_cover.prompt_sha256 = sha256(inventory.course_cover.prompt);

const productionRecords = [
  ["course cover", inventory.course_cover.production_record],
  ...inventory.lessons.flatMap((lesson) => [
    [`${lesson.slot} lesson master`, lesson.master.production_record],
    ...lesson.posters.filter((poster) => poster.direct_master).map((poster) => [`${poster.asset_key} direct master`, poster.direct_master.production_record]),
  ]),
];
for (const [label, record] of productionRecords) {
  validateProductionRecord(record, label);
}

const serializedInventory = `${JSON.stringify(inventory, null, 2)}\n`;
if (checkMode) {
  const currentInventory = await readFile(outputPath, "utf8");
  if (currentInventory !== serializedInventory) {
    throw new Error(`${path.relative(repoRoot, outputPath)} is stale; run the builder without --check`);
  }
  console.log(`Verified ${path.relative(repoRoot, outputPath)}`);
} else {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serializedInventory);
  console.log(`Wrote ${path.relative(repoRoot, outputPath)}`);
}
