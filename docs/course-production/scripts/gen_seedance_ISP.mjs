#!/usr/bin/env node
import {execFileSync} from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = "/Users/jarradhenry/Sites/BMH apps/BMH Institute";
const ENDPOINT = "https://mcp.higgsfield.ai/mcp";
const OUT = path.join(ROOT, "course-assets/heygen/lessonISP/seedance");
const SCENES = path.join(ROOT, "course-assets/scenes/module-isp");
const ANCHORS = path.join(SCENES, "_anchors");
const STATE_PATH = path.join(OUT, "_animations.json");
const ONLY = new Set((process.env.ISP_SEEDANCE_ONLY || "").split(",").map((v) => v.trim()).filter(Boolean));
const FORCE = new Set((process.env.ISP_SEEDANCE_FORCE || "").split(",").map((v) => v.trim()).filter(Boolean));

const STYLE_REF = "b345db3c-3cf3-44e8-b890-53b1b80f6a91";
const CAST_REF = "c86e1fa9-df75-4cbc-ba32-8479b0829538";
const OBJECT_REF = "ff847fda-ecb4-450e-b1f9-0293e9bc1edb";
const DECLINED_3D_PRESET = "5a77643c-b6cc-4efd-bdc6-ab8ff48dfa82";
const STYLE_LOCK = [
  "Use the uploaded start image as the exact visual source.",
  "Animate it literally in the locked flat BMH Institute doodle style.",
  "Preserve the exact approved composition, character identity, face, clothing, props, text, colors, and white skin.",
  "One continuous shot with solid flat fills and thick clean black outlines.",
  "Hard flat cornflower-blue #62b3f3 background.",
  "No gradients, shadows, hatching, texture, shading, realism, or perspective depth.",
  "The start and end frames must match exactly for a seamless loop.",
].join(" ");
const NEGATIVE = [
  "NEGATIVE: cuts, scene changes, zoom, pan, camera shake, crop change, text shimmer, changed text, garbled text, new text,",
  "extra people, duplicate people, identity drift, face drift, outfit drift, prop morphing, extra fingers, extra hands,",
  "3D, photorealism, lighting, shadows, gradients, hatching, texture, shading, captions, logos, watermarks, floating icons.",
].join(" ");

const BEATS = [
  {id:"b02_target_seller", still:"mISP_LISP_b02_target-seller.png", out:"anim_b02_target_seller.mp4", anchor:null,
   prompt:"LOCKED STATIC CAMERA. The distressed seller makes one tiny nervous fidget and shoulder settle, then returns to the exact start pose. The one-week wall calendar, X on FRIDAY, and 3 DAYS TO MOVE remain absolutely frozen and pixel-stable for every frame. Exactly one seller and one calendar. No camera movement."},
  {id:"b06_david_repairs", still:"mISP_LISP_b06_david-repairs.png", out:"anim_b06_david_repairs.mp4", anchor:"david.png",
   prompt:"LOCKED STATIC CAMERA. David makes one small tired posture shift and gentle breath, then returns to the exact start pose. The rental and REPAIR ESTIMATE folder remain fixed, readable, and pixel-stable. David must match the attached David anchor exactly. No new gesture or prop."},
  {id:"b09_ray_urgency", still:"mISP_LISP_b09_urgency-board.png", out:"anim_b09_ray_urgency.mp4", anchor:"ray.png",
   prompt:"LOCKED STATIC CAMERA. Ray makes one restrained worried weight shift and tiny head settle, then returns to the exact start pose. FORECLOSURE, BANKRUPTCY, and TAX SALE notices remain absolutely frozen and pixel-stable. Ray must match the attached Ray anchor exactly. Ray's skin is pure neutral white in every frame, with no cream, beige, yellow, warm tones, tint shifts, or flicker. The three notice cards remain the original design cream and must not turn white. No new notices or props."},
  {id:"b11_key_handoff", still:"mISP_LISP_b11_david-landlord-exit.png", out:"anim_b11_key_handoff.mp4", anchor:"david.png",
   prompt:"LOCKED STATIC CAMERA. The exact full approved scene remains visible in every single frame: recipient on the left, table and keys in the center, David and rental on the right. David makes only a tiny key-setting hand motion and returns to the exact start pose. Never show the attached David reference by itself. Never replace the scene with a portrait, character sheet, label, icon, music note, cloud, sparkle, or decorative mark. No object may appear or disappear. Preserve both hands and every finger cleanly."},
  {id:"b16_walk_away", still:"mISP_LISP_b16_no-repairs-simple.png", out:"anim_b16_walk_away.mp4", anchor:null,
   prompt:"LOCKED STATIC CAMERA. The relieved seller performs one clearly legible calm walking cycle away from the rough house, with natural alternating legs and arms, then returns smoothly to the exact start position and pose for a seamless loop. The house is completely fixed. Exactly one seller, no clones, no sliding feet, no camera movement."},
  {id:"b21_question", still:"mISP_LISP_bC_question.png", out:"anim_b21_question.mp4", anchor:"priya.png",
   prompt:"LOCKED STATIC CAMERA. Priya wears the full orange boom-mic headset and makes one tiny attentive listening nod while the seller holds the single phone and makes a small listening posture shift. Both return to the exact start poses. Exactly two people and one phone. Priya must match the attached anchor exactly. No text."},
];

fs.mkdirSync(OUT, {recursive:true});
let token, sessionId, rpcId = 1;
function getToken(){if(!token) token=execFileSync("higgsfield",["auth","token"],{encoding:"utf8"}).trim(); if(!token) throw new Error("empty Higgsfield token"); return token;}
function parseSse(text){const m=[];let b=[];for(const raw of text.split(/\r?\n/)){const line=raw.trimEnd();if(!line){if(b.length){m.push(JSON.parse(b.join("\n")));b=[];}continue;}if(line.startsWith("data:"))b.push(line.slice(5).trimStart());}if(b.length)m.push(JSON.parse(b.join("\n")));return m.at(-1);}
async function rpc(method,params){const headers={accept:"application/json, text/event-stream",authorization:`Bearer ${getToken()}`,"content-type":"application/json"};if(sessionId)headers["mcp-session-id"]=sessionId;const r=await fetch(ENDPOINT,{method:"POST",headers,body:JSON.stringify({jsonrpc:"2.0",id:rpcId++,method,params})});const sid=r.headers.get("mcp-session-id");if(sid)sessionId=sid;const body=await r.text();if(!r.ok)throw new Error(`MCP HTTP ${r.status}: ${body.slice(0,500)}`);const p=(r.headers.get("content-type")||"").includes("text/event-stream")?parseSse(body):JSON.parse(body);if(p.error)throw new Error(p.error.message);return p.result;}
function parseTool(r){const c=r?.content;if(Array.isArray(c)&&c[0]?.text){try{return JSON.parse(c[0].text);}catch{return c[0].text;}}return r;}
async function tool(name,args){const p=parseTool(await rpc("tools/call",{name,arguments:args}));if(typeof p==="string"&&/out of credits|insufficient|balance/i.test(p))throw new Error(p);if(p?.error)throw new Error(typeof p.error==="string"?p.error:JSON.stringify(p.error));return p;}
async function init(){await rpc("initialize",{protocolVersion:"2024-11-05",capabilities:{},clientInfo:{name:"bmh-isp-seedance",version:"1.0"}});const headers={accept:"application/json, text/event-stream",authorization:`Bearer ${getToken()}`,"content-type":"application/json"};if(sessionId)headers["mcp-session-id"]=sessionId;await fetch(ENDPOINT,{method:"POST",headers,body:JSON.stringify({jsonrpc:"2.0",method:"notifications/initialized"})});}
function sha(file){return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");}
function readState(){return fs.existsSync(STATE_PATH)?JSON.parse(fs.readFileSync(STATE_PATH,"utf8")):{};}
function save(state){fs.writeFileSync(STATE_PATH,JSON.stringify(state,null,2)+"\n");}
async function upload(file){const u=await tool("media_upload",{method:"upload_url",filename:path.basename(file),content_type:"image/png"});let item=u.uploads?.[0];if(!item&&typeof u==="string"){const media_id=u.match(/-\s+([0-9a-f-]{36}):/i)?.[1],upload_url=u.match(/'(https:\/\/upload\.higgsfield\.ai[^']+)'/)?.[1];if(media_id&&upload_url)item={media_id,upload_url,content_type:"image/png"};}if(!item?.upload_url||!item?.media_id)throw new Error("bad upload response");const put=await fetch(item.upload_url,{method:"PUT",headers:{"content-type":item.content_type||"image/png"},body:fs.readFileSync(file)});if(!put.ok)throw new Error(`upload PUT ${put.status}`);await tool("media_confirm",{type:"image",media_id:item.media_id});return item.media_id;}
async function generate(beat,entry){const medias=[{role:"start_image",value:entry.mediaId},{role:"end_image",value:entry.mediaId},{role:"image",value:STYLE_REF},{role:"image",value:CAST_REF},{role:"image",value:OBJECT_REF}];if(entry.anchorMediaId)medias.push({role:"image",value:entry.anchorMediaId});const prompt=`${STYLE_LOCK} ${beat.prompt} ${NEGATIVE}`;const base={model:"seedance_2_0",mode:"std",resolution:"720p",duration:15,aspect_ratio:"16:9",count:1,generate_audio:false,declined_preset_id:DECLINED_3D_PRESET,medias,prompt};let g=await tool("generate_video",{params:base});if(typeof g==="string"&&/retry with declined_preset_id/i.test(g)){const declined=g.match(/declined_preset_id:\s*\"([0-9a-f-]{36})\"/i)?.[1];if(declined)g=await tool("generate_video",{params:{...base,declined_preset_id:declined}});}const id=g.results?.[0]?.id||(typeof g==="string"?g.match(/-\s+([0-9a-f-]{36})\b/i)?.[1]:null);if(!id)throw new Error(`bad generate response: ${JSON.stringify(g).slice(0,1000)}`);return {id,prompt};}
function status(x){const t=typeof x==="string"?x:JSON.stringify(x);return {text:t,completed:/completed/i.test(t),failed:/failed|error/i.test(t),url:t.match(/https:\/\/\S+?\.mp4/)?.[0]};}

async function main(){await init();const state=readState();const selected=BEATS.filter(b=>!ONLY.size||ONLY.has(b.id));for(const beat of selected){const still=path.join(SCENES,beat.still);if(!fs.existsSync(still))throw new Error(`missing ${still}`);const entry=state[beat.id]||{};state[beat.id]=entry;if(FORCE.has(beat.id)){entry.attempt=Number(entry.attempt||1)+1;delete entry.jobId;delete entry.file;delete entry.url;}entry.attempt||=1;entry.still=still;entry.source_sha256=sha(still);entry.model="seedance_2_0";entry.duration=15;entry.generate_audio=false;entry.refs={style:STYLE_REF,cast:CAST_REF,object:OBJECT_REF};if(!entry.mediaId){entry.mediaId=await upload(still);console.log("uploaded",beat.id);save(state);}if(beat.anchor&&!entry.anchorMediaId){entry.anchor=path.join(ANCHORS,beat.anchor);entry.anchorMediaId=await upload(entry.anchor);console.log("anchor",beat.id);save(state);}if(!entry.jobId){try{const g=await generate(beat,entry);entry.jobId=g.id;entry.prompt=g.prompt;entry.submittedAt=new Date().toISOString();delete entry.deferredError;save(state);console.log("submitted",beat.id,g.id);}catch(error){const message=String(error);if(/rate_limit/i.test(message)){entry.deferredError=message;save(state);console.log("deferred",beat.id);continue;}throw error;}}}
for(let i=0;i<90;i++){const pending=selected.filter(b=>state[b.id]?.jobId&&!(state[b.id].file&&fs.existsSync(state[b.id].file)));if(!pending.length)break;for(const beat of pending){const s=status(await tool("job_status",{jobId:state[beat.id].jobId}));state[beat.id].lastStatus=s.text;save(state);if(s.completed&&s.url){const file=path.join(OUT,beat.out);const r=await fetch(s.url);if(!r.ok)throw new Error(`download ${r.status}`);fs.writeFileSync(file,Buffer.from(await r.arrayBuffer()));Object.assign(state[beat.id],{url:s.url,file,completedAt:new Date().toISOString()});save(state);console.log("downloaded",beat.id);}else if(s.failed)throw new Error(`failed ${beat.id}: ${s.text}`);else console.log("pending",beat.id);}await new Promise(resolve=>setTimeout(resolve,30000));}
const done=selected.filter(b=>state[b.id]?.file&&fs.existsSync(state[b.id].file)).length;console.log("ISP SEEDANCE DONE",done,"/",selected.length);if(done<selected.length)process.exitCode=1;}
main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exit(1);});
