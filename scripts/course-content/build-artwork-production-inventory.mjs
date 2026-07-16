import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const manifestPath = path.join(
  repoRoot,
  "content/course-manifests/bmh-employee-training.v1.json",
);
const outputPath = path.join(
  repoRoot,
  "docs/course-production/thumbnail-pilots/production-inventory.json",
);
const pilotChecksumsPath = path.join(
  repoRoot,
  "docs/course-production/thumbnail-pilots/checksums.json",
);

const [manifest, pilotChecksums] = await Promise.all([
  readFile(manifestPath, "utf8").then(JSON.parse),
  readFile(pilotChecksumsPath, "utf8").then(JSON.parse),
]);
const course = manifest.program.courses[0];
const lessons = course.modules.flatMap((module) =>
  module.lessons.filter((lesson) => lesson.type === "content"),
);
const manifestAssets = new Map(
  manifest.assets.map((asset) => [asset.source_key, asset]),
);

const references = [
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
    path: "course-assets/scenes/module-v0/mV0_LV0_s10_bmh-lowangle.png",
    sha256: "438bab4f68f7b71e5daec17def6ea1ceb091e010b57c135968746fba92ba42dc",
  },
  {
    id: "opening-phone-shapes",
    role: "Opening the Call subject reference only",
    path: "course-assets/scenes/module-05/m05_L5A_phones.png",
    sha256: "2d59d64e913c43b1fba45080b0bf59c9e51356f1d4b057c5d2831bfa0f7af6e8",
  },
  {
    id: "objection-character",
    role: "Objection Architecture character reference only",
    path: "course-assets/scenes/module-07/m07_L7A_b03_reframe.png",
    sha256: "57fe03b31eca46336c664c2ca78cf877b8db3138443964e7976ce70eb91db311",
  },
];

const provenance = {
  generator: "built-in image_gen",
  generation_call: "one-distinct-call",
  source_capture_required: true,
  prompt_checksum_required: true,
  reference_checksums_required: true,
  generated_at_required: true,
  generated_by_required: true,
  model_output_path_required: true,
};

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
    scene: "three separate human-first stickers: a homeowner beside a small house, an unfolding story path, and a calm fit lens aligning person, property, and timing",
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
  if (pilotPrompts[spec.slot]) return pilotPrompts[spec.slot];
  const anchorSentence = spec.anchors
    .map(([subject, crop], index) => {
      const placement = crop.startsWith("left")
        ? "left"
        : crop.startsWith("right")
          ? "right"
          : "center";
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
  if (asset.approval_status !== "missing") {
    throw new Error(`${assetKey} is no longer missing. Reconcile approvals first.`);
  }
}

const inventoryLessons = lessonSpecs.map((spec, index) => {
  const lesson = lessons[index];
  if (!lesson || lesson.title !== spec.title) {
    throw new Error(
      `${spec.slot} title mismatch: expected ${spec.title}, got ${lesson?.title}`,
    );
  }
  const videoBlocks = lesson.blocks.filter((block) => block.type === "video");
  if (videoBlocks.length !== spec.anchors.length) {
    throw new Error(`${spec.slot} video and poster-anchor counts differ`);
  }

  const cardPath = `course-assets/thumbnails/${spec.slot}.webp`;
  assertAsset(lesson.thumbnail_asset_key, cardPath);

  const master = {
    id: `master-${spec.slot}`,
    source_path: `course-assets/thumbnails/production/sources/${spec.slot}-generated.png`,
    flat_master_path: `course-assets/thumbnails/production/flat-masters/${spec.slot}-flat-master.png`,
    expected_aspect_ratio: "16:9",
    meaningful_content_bounds: {
      x_min_percent: 10,
      x_max_percent: 90,
      y_min_percent: 10,
      y_max_percent: 90,
    },
  };

  const posters = videoBlocks.map((block, posterIndex) => {
    const [focusSubject, cropProfile] = spec.anchors[posterIndex];
    const assetKey = block.content.poster_asset_key;
    const outputPath = `course-assets/posters/${block.content.asset_key}.webp`;
    assertAsset(assetKey, outputPath);
    return {
      asset_key: assetKey,
      video_asset_key: block.content.asset_key,
      video_title: block.content.title,
      output_path: outputPath,
      focus_subject: focusSubject,
      derivative: {
        recipe_id: `${spec.slot}-${block.content.asset_key}-${cropProfile}`,
        source_master_id: master.id,
        crop_profile: cropProfile,
        target_dimensions: [1280, 720],
        resample: "lanczos",
        output_format: "lossless-webp",
        duplicate_pixel_sha256_forbidden: true,
        visual_subject_confirmation_required: true,
      },
      provenance,
      approval: blockedApproval,
    };
  });

  return {
    slot: spec.slot,
    lesson_source_key: lesson.source_key,
    title: spec.title,
    pilot: Boolean(spec.pilot),
    production_source_mode: spec.pilot
      ? "promote-approved-pilot-flat-master"
      : "generate-after-pilot-approval",
    reference_ids: spec.references ?? ["style-ref-1", "style-ref-2"],
    prompt: buildPrompt(spec),
    master,
    lesson_card: {
      asset_key: lesson.thumbnail_asset_key,
      output_path: cardPath,
      derivative: {
        source_master_id: master.id,
        target_dimensions: [1280, 800],
        method: "contain-master-at-1280x720-and-pad-40px-top-and-bottom",
        padding_color_rgb: [103, 182, 255],
        crop_allowed: false,
        resample: "lanczos",
        output_format: "lossless-webp",
      },
      provenance,
      approval: blockedApproval,
    },
    posters,
    pilot_review: spec.pilot
      ? {
          slug: pilotSlugBySlot[spec.slot],
          status: pilotChecksums.status,
          assets: pilotChecksums.assets.find(
            (asset) => asset.slug === pilotSlugBySlot[spec.slot],
          ),
          checksum_record_path:
            "docs/course-production/thumbnail-pilots/checksums.json",
        }
      : null,
    provenance,
    approval: spec.pilot ? pilotApproval : blockedApproval,
  };
});

const coverPath = "course-assets/thumbnails/program-bmh-employee-training.webp";
assertAsset(course.thumbnail_asset_key, coverPath);

const inventory = {
  schema_version: "bmh-artwork-production/v1",
  status: "blocked-pending-pilot-approval",
  generation_policy: {
    gate: "Jarrad must approve all three pilots before any new image generation",
    generator: "built-in image_gen",
    call_strategy: "one distinct image_gen call per cover or lesson master",
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
    asset_key: course.thumbnail_asset_key,
    output_path: coverPath,
    source_path:
      "course-assets/thumbnails/production/sources/program-bmh-employee-training-generated.png",
    flat_master_path:
      "course-assets/thumbnails/production/flat-masters/program-bmh-employee-training-flat-master.png",
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
    provenance,
    approval: blockedApproval,
  },
  lessons: inventoryLessons,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(inventory, null, 2)}\n`);
console.log(`Wrote ${path.relative(repoRoot, outputPath)}`);
