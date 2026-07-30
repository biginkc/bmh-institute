#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = "/Users/jarradhenry/Sites/BMH apps/BMH Institute";
const ENDPOINT = "https://mcp.higgsfield.ai/mcp";
const VARIANT = process.env.LESSON18B_SEEDANCE_VARIANT || "v1";
const OUT = path.join(
  ROOT,
  VARIANT === "v2-white-skin"
    ? "course-assets/heygen/lesson18B/seedance-v2-white-skin"
    : "course-assets/heygen/lesson18B/seedance",
);
const SCENES = path.join(ROOT, "course-assets/scenes/module-18-lesson18B");
const STATE_PATH = path.join(OUT, "_animations.json");
const ONLY = new Set(
  (process.env.LESSON18B_SEEDANCE_ONLY || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const REMOTION_ONLY_BEATS = new Set(["b02_county_channels"]);
const WHITE_SKIN_LOCK = process.env.LESSON18B_WHITE_SKIN === "1";
const STYLE_REF = "b345db3c-3cf3-44e8-b890-53b1b80f6a91";
const CAST_REF = "c86e1fa9-df75-4cbc-ba32-8479b0829538";
const DECLINED_3D_PRESET = "5a77643c-b6cc-4efd-bdc6-ab8ff48dfa82";

const STYLE_LOCK = [
  "Use the uploaded start image as the exact visual source.",
  "Animate it literally as a flat hand-drawn BMH Institute course illustration, not 3D.",
  "Preserve the exact approved still composition, character identities, blank UI shapes, and colors.",
  "One single continuous shot for the entire duration; no cuts, no scene changes, no reference-sheet flashes.",
  "Cornflower-blue #62b3f3 background, thick slightly wobbly black outlines, flat yellow/orange/cream/white/black palette.",
  "No gradients, no shadows, no texture, no photorealism, no perspective depth.",
  "All UI panes, message cards, checklists, labels, county names, tool names, and summary cards remain blank because Remotion renders every word later.",
].join(" ");

const SKIN_LOCK = [
  "HARD CHARACTER COLOR LOCK:",
  "Every visible human or avatar face, hand, arm, ear, and neck must be flat pure white #FFFFFF.",
  "Do not use tan, peach, beige, pink, yellow, brown, or naturalistic ethnicity skin colors anywhere on skin.",
  "Keep hair, headset, clothes, cards, and cream UI panels separate from skin; only skin is pure white.",
  "Preserve the flat doodle faces with tiny dot eyes and simple black facial marks.",
].join(" ");

const NEGATIVE = [
  "NEGATIVE:",
  "photorealism, 3D render, cinematic lighting, shadows, gradients, texture, skin-tone shading, tan skin, peach skin, beige skin, pink skin, yellow skin, brown skin,",
  "text, captions, numbers, logos, watermarks, extra people, duplicate characters, clone characters,",
  "readable words, pseudo-words, letter shapes, the word Team, the word Win,",
  "reference sheets, style board flashes, new props, floating speech bubbles, floating icons, cuts, scene changes,",
  "sudden zooms, heavy camera movement, prop morphing, face drift, nose drift, unreadable generated writing.",
].join(" ");

const BEATS = [
  {
    id: "b02_county_channels",
    still: "m18_L18B_b02_county-channels.png",
    prompt:
      "Motion: deprecated for Seedance. b02 is a deterministic map plate and should be animated in Remotion with code-driven county-section highlight pulses.",
  },
  {
    id: "b03_approval_flow",
    still: "m18_L18B_b03_approval-flow.png",
    prompt:
      "Motion: a blank draft card moves gently through the review path from channel pane to manager review to send-tool tiles. The manager gives one small approving/checking gesture. Keep all panes and cards blank.",
  },
  {
    id: "b04_quality_check",
    still: "m18_L18B_b04_quality-check.png",
    prompt:
      "Motion: simple quality review between two people only. The headset representative on the left gives a tiny attentive nod. The manager on the right holds the blank clipboard steady and lifts the single magnifying glass slightly as the review cue. Keep the plain blue background empty. No background board, no message draft card, no checklist panel, no approval badge, no arrows, no UI cards, no envelopes, no desk, no table, no screen, no new props, no generated words.",
  },
  {
    id: "b05_handoff_thread",
    still: "m18_L18B_b05_handoff-thread.png",
    prompt:
      "Motion: contained handoff thread focus. A blank summary card gently lifts/highlights, two unlabeled blank tag chips pulse slightly, and the adjacent blank notes panel settles. The tag chips must stay completely blank: no letters, no labels, no pseudo-writing, no word Team. No generated words anywhere.",
  },
  {
    id: "b07_dual_handoff",
    still: "m18_L18B_b07_dual-handoff.png",
    prompt:
      "Motion: split workflow bridge. The blank CRM packet side subtly checks complete, the blank notification side pulses once, and the bridge line carries one small handoff token. Keep both app panes blank.",
  },
  {
    id: "b08_response_loop",
    still: "m18_L18B_b08_response-loop.png",
    prompt:
      "Motion: incoming seller response card lands softly, then one blank card moves into a triage lane. Envelope and phone symbols can gently bounce once. All lane labels stay blank.",
  },
  {
    id: "b09_daily_standup",
    still: "m18_L18B_b09_daily-standup.png",
    prompt:
      "Motion: five blank standup line slots highlight one by one with restrained team-review energy. Avatars stay stable; no text is generated in the line slots.",
  },
  {
    id: "b10_ask_manager",
    still: "m18_L18B_b10_ask-manager.png",
    prompt:
      "Motion: escalation card holds in the county-channel pane while the manager indicator gives one calm response pulse. The side work queue continues with tiny blank-card movement. No generated words.",
  },
  {
    id: "b12_wins_momentum",
    still: "m18_L18B_b12_wins-momentum.png",
    prompt:
      "Motion: restrained team celebration. A completely blank celebration card lifts slightly, the team gives a small contained reaction, and the momentum meter rises gently. Every card and board area must stay blank: no letters, no labels, no pseudo-writing, no word Win. No confetti, no text, no new objects.",
  },
];

fs.mkdirSync(OUT, { recursive: true });

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
    body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params }),
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
  const result = await rpc("tools/call", { name, arguments: args });
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
    clientInfo: { name: "bmh-course-lesson18b", version: "1.0" },
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
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
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
    if (mediaId && uploadUrl) {
      item = { media_id: mediaId, upload_url: uploadUrl, content_type: "image/png" };
    }
  }
  if (!item?.upload_url || !item?.media_id) {
    throw new Error(`Bad media_upload response: ${JSON.stringify(upload).slice(0, 500)}`);
  }
  const put = await fetch(item.upload_url, {
    method: "PUT",
    headers: { "content-type": item.content_type || "image/png" },
    body: fs.readFileSync(file),
  });
  if (!put.ok) throw new Error(`PUT failed ${put.status}: ${await put.text()}`);
  const confirmed = await callTool("media_confirm", { type: "image", media_id: item.media_id });
  const status = confirmed.results?.[0]?.status;
  const confirmedText = typeof confirmed === "string" ? confirmed : "";
  if (status !== "uploaded" && !confirmedText.includes(`${item.media_id} (uploaded)`)) {
    throw new Error(`media_confirm did not upload: ${JSON.stringify(confirmed)}`);
  }
  return { media_id: item.media_id, url: item.url };
}

async function generateBeat(beat, mediaId) {
  const prompt = `${STYLE_LOCK} ${WHITE_SKIN_LOCK ? `${SKIN_LOCK} ` : ""}${beat.prompt} ${NEGATIVE}`;
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
        { role: "start_image", value: mediaId },
        { role: "end_image", value: mediaId },
        { role: "image", value: STYLE_REF },
        { role: "image", value: CAST_REF },
      ],
      prompt,
    },
  });
  let jobId = generated.results?.[0]?.id;
  if (!jobId && typeof generated === "string") {
    jobId = generated.match(/-\s+([0-9a-f-]{36})\b/i)?.[1];
  }
  if (!jobId) throw new Error(`Bad generate_video response: ${JSON.stringify(generated).slice(0, 500)}`);
  return { jobId, prompt };
}

function parseStatus(statusText) {
  const text = typeof statusText === "string" ? statusText : JSON.stringify(statusText);
  const completed = /completed/i.test(text);
  const failed = /failed|error/i.test(text);
  const url = text.match(/https:\/\/\S+?\.mp4/)?.[0];
  return { text, completed, failed, url };
}

async function download(url, file) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`download failed ${response.status}: ${await response.text()}`);
  const buf = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(file, buf);
}

async function pollAndDownload(state, beat) {
  const entry = state[beat.id];
  if (!entry?.jobId) return;
  if (entry.file && fs.existsSync(entry.file)) return;
  for (let i = 0; i < 60; i += 1) {
    const status = parseStatus(await callTool("job_status", { jobId: entry.jobId }));
    entry.lastStatus = status.text;
    saveState(state);
    if (status.completed && status.url) {
      const file = path.join(OUT, `${beat.id}.mp4`);
      await download(status.url, file);
      entry.url = status.url;
      entry.file = file;
      entry.completedAt = new Date().toISOString();
      saveState(state);
      console.log("downloaded", beat.id);
      return;
    }
    if (status.failed) throw new Error(`Job failed for ${beat.id}: ${status.text}`);
    console.log("pending", beat.id);
    await new Promise((resolve) => setTimeout(resolve, 30000));
  }
  throw new Error(`Timed out waiting for ${beat.id}`);
}

async function pollAllAndDownload(state) {
  for (let i = 0; i < 60; i += 1) {
    const pending = BEATS.filter((beat) => {
      const entry = state[beat.id];
      return entry?.jobId && !(entry.file && fs.existsSync(entry.file));
    });
    if (!pending.length) return;
    for (const beat of pending) {
      const entry = state[beat.id];
      const status = parseStatus(await callTool("job_status", { jobId: entry.jobId }));
      entry.lastStatus = status.text;
      saveState(state);
      if (status.completed && status.url) {
        const file = path.join(OUT, `${beat.id}.mp4`);
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
}

async function main() {
  await init();
  const state = readState();
  for (const beat of BEATS) {
    if (!ONLY.size && REMOTION_ONLY_BEATS.has(beat.id)) continue;
    if (ONLY.size && !ONLY.has(beat.id)) continue;
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
    entry.variant = VARIANT;
    entry.white_skin_lock = WHITE_SKIN_LOCK;
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
  await pollAllAndDownload(state);
  const selected = BEATS.filter((beat) => {
    if (!ONLY.size && REMOTION_ONLY_BEATS.has(beat.id)) return false;
    return !ONLY.size || ONLY.has(beat.id);
  });
  const done = selected.filter((beat) => state[beat.id]?.file).length;
  console.log("18B SEEDANCE DONE", done, "/", selected.length, VARIANT);
  if (done < selected.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  if (/out of credits|insufficient|balance/i.test(message)) {
    console.error("18B SEEDANCE HALT: INSUFFICIENT HIGGSFIELD CREDITS - STOP AND TELL JARRAD");
    process.exit(2);
  }
  process.exit(1);
});
