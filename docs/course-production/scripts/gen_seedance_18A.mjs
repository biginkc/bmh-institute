#!/usr/bin/env node

import {execFileSync} from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const BMH_ROOT = process.env.BMH_INSTITUTE_ROOT || decodeURIComponent(new URL("../../..", import.meta.url).pathname);

const ROOT = `${BMH_ROOT}`;
const ENDPOINT = "https://mcp.higgsfield.ai/mcp";
const OUT = path.join(ROOT, "course-assets/heygen/lesson18A/seedance");
const SCENES = path.join(ROOT, "course-assets/scenes/module-18-lesson18A");
const STATE_PATH = path.join(OUT, "_animations.json");
const ONLY = new Set(
  (process.env.LESSON18A_SEEDANCE_ONLY || "")
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
  "Preserve the exact approved still composition, character identities, outfits, faces, flat white skin, blank UI shapes, props, and colors.",
  "One single continuous shot for the entire duration; no cuts, no scene changes, no reference-sheet flashes.",
  "Cornflower-blue #62b3f3 background, thick slightly wobbly black outlines, flat yellow/orange/cream/white/black palette.",
  "No gradients, no shadows, no texture, no photorealism, no perspective depth, no skin-tone shading.",
  "All UI panes, cards, rows, labels, app names, numbers, and tool names remain blank because Remotion renders every word later.",
].join(" ");

const SKIN_LOCK = [
  "HARD CHARACTER COLOR LOCK:",
  "Every visible face, hand, arm, ear, and neck must remain flat pure white #FFFFFF.",
  "Do not use tan, peach, beige, pink, yellow, brown, or naturalistic ethnicity skin colors anywhere on skin.",
  "Preserve the flat doodle faces with tiny dot eyes, simple black facial marks, and the same hair/headset shapes.",
].join(" ");

const NEGATIVE = [
  "NEGATIVE:",
  "photorealism, 3D render, cinematic lighting, shadows, gradients, texture, skin-tone shading, tan skin, peach skin, beige skin, pink skin, yellow skin, brown skin,",
  "text, captions, numbers, logos, watermarks, extra people, duplicate characters, clone characters,",
  "readable words, pseudo-words, letter shapes, random icons, hearts, sparkles, thought bubbles, speech bubbles, motion marks,",
  "reference sheets, style board flashes, new props, floating UI, cuts, scene changes, sudden zooms, heavy camera movement,",
  "prop morphing, text morphing, blank card writing, face drift, nose drift, hand drift, warped hands, extra fingers, outfit drift.",
].join(" ");

const BEATS = [
  {
    id: "b02_command_center_priorities",
    still: "m18_L18A_b02_command-center.png",
    out: "anim_b02_command_center_priorities.mp4",
    prompt:
      "Motion: morning command center setup. Priya stays seated at the workstation with tiny typing and listening posture. Blank stage cards on the right make one restrained priority highlight pulse from top to lower lanes. Keep the monitor, phone, laptop, desk, chair, headset, and all blank UI cards stable. No text appears.",
  },
  {
    id: "b03_research_prep",
    still: "m18_L18A_b03_research-prep.png",
    out: "anim_b03_research_prep.mp4",
    prompt:
      "Motion: calm research prep. Priya leans slightly toward the laptop, one hand makes a tiny trackpad or keyboard movement, and a few blank lead cards gently lift or settle in sequence. Keep the property/map panel, folders, coins, house icon, desk, and character identity fixed. No readable writing appears.",
  },
  {
    id: "b04_first_call_block",
    still: "m18_L18A_b04_first-call-block.png",
    out: "anim_b04_first_call_block.mp4",
    prompt:
      "Motion: active first calling block. Priya makes subtle headset/listening movement, one small note-taking motion, and a restrained phone-call idle. Blank queue cards and message bubbles hold their positions with only a tiny pulse. Phone, laptop, paper, schedule strip, and hands stay coherent. No text appears.",
  },
  {
    id: "b05_break_reset",
    still: "m18_L18A_b05_break-reset.png",
    out: "anim_b05_break_reset.mp4",
    prompt:
      "Motion: quiet reset break. Priya gently stretches the crossed arm and lifts the water bottle hand slightly, then settles. The empty desk and devices remain still in the background. No comedy, no exaggerated yoga pose, no extra objects, no ambient marks.",
  },
  {
    id: "b07_admin_block",
    still: "m18_L18A_b07_admin-block.png",
    out: "anim_b07_admin_block.mp4",
    prompt:
      "Motion: admin cleanup. Priya types and checks the clipboard with tiny professional movements while blank email, CRM, checklist, and note cards organize with a subtle settle. Keep all cards blank, preserve the desk layout, phone, monitor, paper stack, pencil cup, and character identity.",
  },
  {
    id: "b09_pipeline_review",
    still: "m18_L18A_b09_pipeline-review.png",
    out: "anim_b09_pipeline_review.mp4",
    prompt:
      "Motion: end-of-day pipeline review. Priya points lightly at the board, and blank stage columns/cards highlight in a restrained left-to-right review pass. The calendar, clock, phone, tray, clipboard, and board geometry stay fixed. Do not create or alter any text.",
  },
  {
    id: "b12_energy_management",
    still: "m18_L18A_b12_energy-management.png",
    out: "anim_b12_energy_management.mp4",
    prompt:
      "Motion: energy management before dialing. Priya makes a gentle smile/listening nod with the headset, one small hand movement near the laptop, and a tiny water bottle or checklist settle. Keep the monitor, phone, shoes, walk card, desk, and all blank cards stable. No new icons or words.",
  },
  {
    id: "b13_one_call_humans",
    still: "m18_L18A_b13_one-call-humans.png",
    out: "anim_b13_one_call_humans.mp4",
    prompt:
      "Motion: warm split-screen phone conversation. Priya listens with a tiny headset nod on the left while the seller on the right makes a small phone-talking gesture. Preserve the vertical split line, both seated positions, phones, desk, chair, seller couch, outfits, faces, hands, and hairstyle. No extra fingers, no extra people, no new objects, no sentimental symbols.",
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
    clientInfo: {name: "bmh-course-lesson18a-seedance", version: "1.0"},
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
  const prompt = `${STYLE_LOCK} ${SKIN_LOCK} ${beat.prompt} ${NEGATIVE}`;
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
      let status;
      try {
        status = parseStatus(await callTool("job_status", {jobId: entry.jobId}));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/Higgsfield MCP HTTP 5\d\d|Gateway time-out|rate_limit/i.test(message)) {
          entry.lastStatus = `transient status poll error: ${message.slice(0, 220)}`;
          saveState(state);
          console.log("pending", beat.id, "transient_status_error");
          continue;
        }
        throw error;
      }
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

  const done = selected.filter((beat) => state[beat.id]?.file && fs.existsSync(state[beat.id].file)).length;
  const deferred = selected.filter((beat) => state[beat.id]?.deferredError && !state[beat.id]?.jobId).length;
  console.log("18A SEEDANCE DONE", done, "/", selected.length, "deferred", deferred);
  if (done < selected.length && deferred === 0) process.exitCode = 1;
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  if (/out of credits|insufficient|balance/i.test(message)) {
    console.error("18A SEEDANCE HALT: INSUFFICIENT HIGGSFIELD CREDITS - STOP AND TELL JARRAD");
    process.exit(2);
  }
  process.exit(1);
});
