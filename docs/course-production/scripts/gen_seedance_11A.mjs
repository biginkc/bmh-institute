#!/usr/bin/env node

import {execFileSync} from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const BMH_ROOT = process.env.BMH_INSTITUTE_ROOT || decodeURIComponent(new URL("../../..", import.meta.url).pathname);

const ROOT = `${BMH_ROOT}`;
const ENDPOINT = "https://mcp.higgsfield.ai/mcp";
const OUT = path.join(ROOT, "course-assets/heygen/lesson11A/seedance");
const SCENES = path.join(ROOT, "course-assets/scenes/module-11");
const STATE_PATH = path.join(OUT, "_animations.json");
const ONLY = new Set(
  (process.env.LESSON11A_SEEDANCE_ONLY || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

const STYLE_REF = "b345db3c-3cf3-44e8-b890-53b1b80f6a91";
const CAST_REF = "c86e1fa9-df75-4cbc-ba32-8479b0829538";
const OBJECT_REF = "ff847fda-ecb4-450e-b1f9-0293e9bc1edb";
const DECLINED_3D_PRESET = "5a77643c-b6cc-4efd-bdc6-ab8ff48dfa82";

const STYLE_LOCK = [
  "Use the uploaded start image as the exact visual source.",
  "Animate it literally as a flat hand-drawn BMH Institute course illustration, not 3D.",
  "Preserve the exact approved still composition, character identities, outfits, faces, flat white skin, props, and colors.",
  "One single continuous shot for the entire duration; no cuts, no scene changes, no reference-sheet flashes.",
  "Cornflower-blue #62b3f3 background, thick slightly wobbly black outlines, flat yellow/orange/cream/white/black palette.",
  "No gradients, no shadows, no texture, no photorealism, no perspective depth, no skin-tone shading.",
  "Keep text already present in the source image exactly as-is if any; do not invent, rewrite, morph, or add text.",
].join(" ");

const NEGATIVE = [
  "NEGATIVE:",
  "photorealism, 3D render, cinematic lighting, shadows, gradients, texture, tan skin, peach skin, pink cheeks, detailed eyes,",
  "new text, captions, numbers, logos, watermarks, extra people, duplicate characters, clone characters,",
  "reference sheets, style board flashes, new props, floating speech bubbles, floating icons, cuts, scene changes,",
  "sudden zooms, heavy camera movement, prop morphing, text morphing, face drift, nose drift, outfit drift.",
].join(" ");

const BEATS = [
  {
    id: "b03_handoff_role",
    still: "m11_L11A_b03_handoff-role.png",
    out: "anim_b03_handoff_role.mp4",
    prompt:
      "Motion: Priya makes one small folder handoff gesture to the headset acquisition teammate. The teammate receives it with a tiny nod. Keep the desk, packet, headset, and bottom-right open blue pocket stable. No seller appears.",
  },
  {
    id: "b04_why_understand",
    still: "m11_L11A_b04_why-understand.png",
    out: "anim_b04_why_understand.mp4",
    prompt:
      "Motion: Priya is on a phone call at her desk. Add subtle phone-talking motion: tiny head nod, small mouth movement, and a gentle hand/shoulder shift. Phone, desk, paper, and character identity stay fixed.",
  },
  {
    id: "b05_offer_range",
    still: "m11_L11A_b05_offer-range.png",
    out: "anim_b05_offer_range.mp4",
    prompt:
      "Motion: acquisition team gives a very small professional idle: tiny nods and slight paper-settle motion. Preserve exactly three acquisition teammates, their headsets, shirts, and any existing ACQUISITION shirt text without changing letters.",
  },
  {
    id: "b06_clean_offer",
    still: "m11_L11A_b06_clean-offer.png",
    out: "anim_b06_clean_offer.mp4",
    prompt:
      "Motion: split phone call. The acquisition teammate on the left and seller on the right each make a small listening/talking nod. Keep the vertical split, both faces, both outfits, and all phone-call posture stable. No dollar signs or offer text appears.",
  },
  {
    id: "b07_hoping_more",
    still: "m11_L11A_b07_hoping-more.png",
    out: "anim_b07_hoping_more.mp4",
    prompt:
      "Motion: seller calmly reviews the offer sheet. Add a tiny thoughtful head tilt and slight paper movement. Preserve the OFFER word on the sheet exactly; do not alter or add any letters.",
  },
  {
    id: "b09_arm_wrestling_respect",
    still: "m11_L11A_b09_arm-wrestling-respect.png",
    out: "anim_b09_arm_wrestling_respect.mp4",
    prompt:
      "Motion: friendly arm-wrestling tension only. Priya and the seller hold position at the table with a small respectful push-pull and relaxed faces. No victory slam, no aggression, no spectators, no extra people, no face or outfit drift.",
  },
  {
    id: "b10_contract_signed",
    still: "m11_L11A_b10_contract-signed.png",
    out: "anim_b10_contract_signed.mp4",
    prompt:
      "Motion: seller calmly signs or reviews the agreement. Add a small pen movement and slight paper shift while the seller stays seated and composed. No readable legal text, no signature text, no new paperwork.",
  },
  {
    id: "b11_transaction_work",
    still: "m11_L11A_b11_transaction-work.png",
    out: "anim_b11_transaction_work.mp4",
    prompt:
      "Motion: very subtle office-door introduction. The door and small file stand hold steady; add only a tiny settle or gentle attention pulse. Preserve the Transaction Coordinator door label exactly; do not alter the letters or add words.",
  },
  {
    id: "b12_sellers_remorse",
    still: "m11_L11A_b12_sellers-remorse.png",
    out: "anim_b12_sellers_remorse.mp4",
    prompt:
      "Motion: seller shows quiet remorse after signing. Add subtle crying/remorse posture only: tiny shoulder movement and a small head dip. Keep seller identity, paper, pencil, table, and scene stable. No dramatic panic.",
  },
  {
    id: "b13_deal_risks",
    still: "m11_L11A_b13_deal-risks.png",
    out: "anim_b13_deal_risks.mp4",
    prompt:
      "Motion: family interference. Seller stays surrounded by family while a few family members give small shrug/listening gestures. Preserve the exact number of people and their positions. No extra relatives appear.",
  },
];

fs.mkdirSync(OUT, {recursive: true});

let token = null;
let sessionId = null;
let rpcId = 1;

function getToken() {
  if (!token) {
    token = execFileSync("higgsfield", ["auth", "token"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  }
  if (!token) throw new Error("Higgsfield CLI returned an empty auth token.");
  return token;
}

function parseSse(text) {
  const messages = [];
  let buf = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line) {
      if (buf.length) {
        messages.push(JSON.parse(buf.join("\n")));
        buf = [];
      }
      continue;
    }
    if (line.startsWith("data:")) buf.push(line.slice(5).trimStart());
  }
  if (buf.length) messages.push(JSON.parse(buf.join("\n")));
  return messages.at(-1);
}

async function rpc(method, params) {
  const headers = {
    accept: "application/json, text/event-stream",
    authorization: `Bearer ${getToken()}`,
    "content-type": "application/json",
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify({jsonrpc: "2.0", id: rpcId++, method, params}),
  });
  const sid = response.headers.get("mcp-session-id");
  if (sid) sessionId = sid;
  const body = await response.text();
  if (!response.ok) throw new Error(`Higgsfield MCP HTTP ${response.status}: ${body.slice(0, 500)}`);
  const parsed = (response.headers.get("content-type") || "").includes("text/event-stream")
    ? parseSse(body)
    : JSON.parse(body);
  if (parsed.error) throw new Error(`MCP error ${parsed.error.code}: ${parsed.error.message}`);
  return parsed.result;
}

function parseToolResult(result) {
  const content = result?.content;
  if (Array.isArray(content) && content[0]?.text) {
    try {
      return JSON.parse(content[0].text);
    } catch {
      return content[0].text;
    }
  }
  return result;
}

async function callTool(name, args) {
  const result = await rpc("tools/call", {name, arguments: args});
  const parsed = parseToolResult(result);
  if (typeof parsed === "string" && /out of credits|insufficient|balance/i.test(parsed)) {
    throw new Error(parsed);
  }
  if (parsed?.error) throw new Error(typeof parsed.error === "string" ? parsed.error : JSON.stringify(parsed.error));
  return parsed;
}

async function init() {
  await rpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: {name: "bmh-course-lesson11a-seedance", version: "1.0"},
  });
  const headers = {
    accept: "application/json, text/event-stream",
    authorization: `Bearer ${getToken()}`,
    "content-type": "application/json",
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  await fetch(ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify({jsonrpc: "2.0", method: "notifications/initialized"}),
  });
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function readState() {
  if (!fs.existsSync(STATE_PATH)) return {};
  return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
}

function saveState(state) {
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
}

async function uploadImage(file) {
  const upload = await callTool("media_upload", {
    method: "upload_url",
    filename: path.basename(file),
    content_type: "image/png",
  });
  let item = upload.uploads?.[0];
  if (!item && typeof upload === "string") {
    const mediaId = upload.match(/-\s+([0-9a-f-]{36}):/i)?.[1];
    const uploadUrl = upload.match(/'(https:\/\/upload\.higgsfield\.ai[^']+)'/)?.[1];
    if (mediaId && uploadUrl) item = {media_id: mediaId, upload_url: uploadUrl, content_type: "image/png"};
  }
  if (!item?.upload_url || !item?.media_id) {
    throw new Error(`Bad media_upload response: ${JSON.stringify(upload).slice(0, 500)}`);
  }
  const put = await fetch(item.upload_url, {
    method: "PUT",
    headers: {"content-type": item.content_type || "image/png"},
    body: fs.readFileSync(file),
  });
  if (!put.ok) throw new Error(`PUT failed ${put.status}: ${await put.text()}`);
  const confirmed = await callTool("media_confirm", {type: "image", media_id: item.media_id});
  const status = confirmed.results?.[0]?.status;
  const confirmedText = typeof confirmed === "string" ? confirmed : "";
  if (status !== "uploaded" && !confirmedText.includes(`${item.media_id} (uploaded)`)) {
    throw new Error(`media_confirm did not upload: ${JSON.stringify(confirmed)}`);
  }
  return {media_id: item.media_id, url: item.url};
}

async function generateBeat(beat, mediaId) {
  const prompt = `${STYLE_LOCK} ${beat.prompt} ${NEGATIVE}`;
  const generated = await callTool("generate_video", {
    params: {
      model: "seedance_2_0",
      mode: "std",
      resolution: "720p",
      duration: 15,
      aspect_ratio: "16:9",
      count: 1,
      generate_audio: false,
      declined_preset_id: DECLINED_3D_PRESET,
      medias: [
        {role: "start_image", value: mediaId},
        {role: "end_image", value: mediaId},
        {role: "image", value: STYLE_REF},
        {role: "image", value: CAST_REF},
        {role: "image", value: OBJECT_REF},
      ],
      prompt,
    },
  });
  let jobId = generated.results?.[0]?.id;
  if (!jobId && typeof generated === "string") {
    jobId = generated.match(/-\s+([0-9a-f-]{36})\b/i)?.[1];
  }
  if (!jobId) throw new Error(`Bad generate_video response: ${JSON.stringify(generated).slice(0, 500)}`);
  return {jobId, prompt};
}

function parseStatus(statusText) {
  const text = typeof statusText === "string" ? statusText : JSON.stringify(statusText);
  const completed = /completed/i.test(text);
  const failed = /failed|error/i.test(text);
  const url = text.match(/https:\/\/\S+?\.mp4/)?.[0];
  return {text, completed, failed, url};
}

async function download(url, file) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`download failed ${response.status}: ${await response.text()}`);
  const buf = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(file, buf);
}

async function main() {
  await init();
  const state = readState();
  const selected = BEATS.filter((beat) => !ONLY.size || ONLY.has(beat.id));

  for (const beat of selected) {
    const file = path.join(SCENES, beat.still);
    if (!fs.existsSync(file)) throw new Error(`Missing still: ${file}`);
    const sig = sha256(file);
    const entry = (state[beat.id] ||= {});
    if (entry.source_sha256 && entry.source_sha256 !== sig) {
      delete entry.mediaId;
      delete entry.jobId;
      delete entry.file;
      delete entry.url;
    }
    entry.still = file;
    entry.source_sha256 = sig;
    entry.model = "seedance_2_0";
    entry.duration = 15;
    entry.generate_audio = false;
    if (!entry.mediaId) {
      const media = await uploadImage(file);
      entry.mediaId = media.media_id;
      entry.mediaUrl = media.url;
      saveState(state);
      console.log("uploaded", beat.id);
    }
    if (!entry.jobId) {
      try {
        const generated = await generateBeat(beat, entry.mediaId);
        entry.jobId = generated.jobId;
        entry.prompt = generated.prompt;
        entry.submittedAt = new Date().toISOString();
        delete entry.deferredError;
        saveState(state);
        console.log("submitted", beat.id, entry.jobId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/rate_limit/i.test(message)) {
          entry.deferredError = message;
          saveState(state);
          console.log("deferred", beat.id, "rate_limit");
          continue;
        }
        throw error;
      }
    }
  }

  for (let i = 0; i < 80; i += 1) {
    const pending = selected.filter((beat) => {
      const entry = state[beat.id];
      return entry?.jobId && !(entry.file && fs.existsSync(entry.file));
    });
    if (!pending.length) break;
    for (const beat of pending) {
      const entry = state[beat.id];
      const status = parseStatus(await callTool("job_status", {jobId: entry.jobId}));
      entry.lastStatus = status.text;
      saveState(state);
      if (status.completed && status.url) {
        const file = path.join(OUT, beat.out);
        await download(status.url, file);
        entry.url = status.url;
        entry.file = file;
        entry.completedAt = new Date().toISOString();
        saveState(state);
        console.log("downloaded", beat.id);
      } else if (status.failed) {
        throw new Error(`Job failed for ${beat.id}: ${status.text}`);
      } else {
        console.log("pending", beat.id);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 30000));
  }

  // b14 reuses the same approved trust visual as b02, so avoid spending another credit.
  const b02 = path.join(OUT, "anim_b02_formal_agreement.mp4");
  const b14 = path.join(OUT, "anim_b14_trust_beats_price.mp4");
  if (fs.existsSync(b02) && !fs.existsSync(b14)) {
    fs.copyFileSync(b02, b14);
    state.b14_trust_beats_price = {
      reusedFrom: "b02_formal_agreement",
      file: b14,
      completedAt: new Date().toISOString(),
    };
    saveState(state);
    console.log("reused b02 as b14");
  }

  const done = selected.filter((beat) => state[beat.id]?.file && fs.existsSync(state[beat.id].file)).length;
  const deferred = selected.filter((beat) => state[beat.id]?.deferredError && !state[beat.id]?.jobId).length;
  console.log("11A SEEDANCE DONE", done, "/", selected.length, "deferred", deferred, "plus b02 existing and b14 reuse");
  if (done < selected.length && deferred === 0) process.exitCode = 1;
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  if (/out of credits|insufficient|balance/i.test(message)) {
    console.error("11A SEEDANCE HALT: INSUFFICIENT HIGGSFIELD CREDITS - STOP AND TELL JARRAD");
    process.exit(2);
  }
  process.exit(1);
});
