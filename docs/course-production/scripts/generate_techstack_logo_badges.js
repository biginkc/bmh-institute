const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const projectRoot = path.resolve(__dirname, "../../..");
const outDir = path.join(projectRoot, "course-assets/logo-callouts/techstack-v1");

const C = {
  blue: "#62b3f3",
  ink: "#101010",
  cream: "#fff3cc",
  white: "#ffffff",
  yellow: "#ffcc00",
  orange: "#ff7a00",
  red: "#e84b3c",
  green: "#34a853",
  brightGreen: "#2eb67d",
  teal: "#36c5f0",
  googleBlue: "#4285f4",
  googleYellow: "#fbbc04",
  googleRed: "#ea4335",
  googleGreen: "#34a853",
  slackPink: "#e01e5a",
  slackBlue: "#36c5f0",
  slackGreen: "#2eb67d",
  slackYellow: "#ecb22e",
  purple: "#5b45d9",
  hubBlue: "#1d9bd7",
  propBlue: "#157ac4",
  propGreen: "#63b54b",
  sandraNavy: "#0f2b52",
};

const sources = {
  sandra: "local: Sandra/public/brand/sandra-wordmark.png",
  propstream: "https://www.propstream.com/brand-asset-library",
  dealmachine: "https://www.dealmachine.com/",
  deal_sniper: "https://www.dealsniper.ai/",
  dialpad: "https://brand.dialpad.com/",
  closer_lab: "local: Closer Lab uses Mic2/CL app-shell mark",
  hubstaff: "https://hubstaff.com/press",
  slack: "https://slack.com/media-kit",
  bmh_institute: "local: BMH Institute app BrandLockup graduation-cap mark",
  google_docs: "https://knowledge.workspace.google.com/admin/getting-started/brand-your-internal-communications-with-google-workspace",
  google_drive: "https://developers.google.com/workspace/drive/api/guides/branding",
  gmail: "https://knowledge.workspace.google.com/admin/getting-started/brand-your-internal-communications-with-google-workspace",
};

const tools = [
  { slug: "sandra", name: "Sandra", beat: "b03_sandra_center", cue: 6, time: "00:45.140", body: sandra },
  { slug: "propstream", name: "PropStream", beat: "b06_propstream_data", cue: 12, time: "01:34.198", body: propstream },
  { slug: "dealmachine", name: "DealMachine", beat: "b07_dealmachine_pipeline", cue: 17, time: "02:14.191", body: dealmachine },
  { slug: "deal_sniper", name: "Deal Sniper", beat: "b08_deal_sniper_speed", cue: 21, time: "02:43.631", body: dealSniper },
  { slug: "dialpad", name: "Dialpad", beat: "b09_dialpad_calls", cue: 24, time: "03:15.944", body: dialpad },
  { slug: "closer_lab", name: "Closer Lab", beat: "b11_closer_lab_practice", cue: 29, time: "03:56.095", body: closerLab },
  { slug: "hubstaff", name: "Hubstaff", beat: "b13_hubstaff_time", cue: 36, time: "05:05.241", body: hubstaff },
  { slug: "slack", name: "Slack", beat: "b14_slack_team", cue: 38, time: "05:24.023", body: slack },
  { slug: "bmh_institute", name: "BMH Institute", beat: "b15_bmh_institute_training", cue: 40, time: "05:42.674", body: bmhInstitute },
  { slug: "google_docs", name: "Google Docs", beat: "b16_google_drive_docs", cue: 42, time: "06:00.176", body: googleDocs },
  { slug: "google_drive", name: "Google Drive", beat: "b16_google_drive_docs", cue: 42, time: "06:00.176", body: googleDrive },
  { slug: "gmail", name: "Gmail", beat: "reusable_lesson18B", cue: null, time: "Lesson 18B only", body: gmail },
];

function esc(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&apos;",
  }[ch]));
}

function text(content, x, y, size, fill = C.ink, extra = "") {
  return `<text x="${x}" y="${y}" font-family="Arial Rounded MT Bold, Comic Sans MS, Chalkboard SE, sans-serif" font-size="${size}" font-weight="900" fill="${fill}" letter-spacing="0" ${extra}>${esc(content)}</text>`;
}

function pill(x, y, w, h, fill = C.white, stroke = C.ink, sw = 10) {
  const r = Math.min(h / 2, 30);
  return `<path d="M${x + r} ${y - 2} C${x + w * 0.36} ${y - 8} ${x + w * 0.68} ${y + 5} ${x + w - r} ${y}
    C${x + w + 12} ${y + 2} ${x + w + 8} ${y + h - 4} ${x + w - r} ${y + h + 3}
    C${x + w * 0.63} ${y + h + 8} ${x + w * 0.35} ${y + h - 2} ${x + r} ${y + h + 2}
    C${x - 12} ${y + h - 3} ${x - 6} ${y + 5} ${x + r} ${y - 2}Z" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
}

function stickerBack() {
  return `<path d="M66 62 C145 46 365 45 442 64 C470 74 476 113 470 169 C477 250 474 343 457 423 C447 466 112 469 67 436 C44 418 43 95 66 62Z"
    fill="${C.cream}" stroke="${C.ink}" stroke-width="12" stroke-linejoin="round"/>`;
}

function svgWrap(title, body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="${esc(title)} hand-drawn logo badge">
  <rect width="512" height="512" fill="none"/>
  ${body}
</svg>`;
}

function badgeBody(tool) {
  return `<g>
    ${stickerBack()}
    ${tool.body()}
  </g>`;
}

function sandra() {
  return `<g transform="rotate(-2 256 256)">
    <path d="M94 153 L330 153 L300 207 L190 207 L181 231 L351 231 L328 290 L139 290 L173 108 L392 108 L374 153Z" fill="${C.sandraNavy}" stroke="${C.ink}" stroke-width="8" stroke-linejoin="round"/>
    <path d="M119 332 C178 321 273 320 397 330 L382 373 C276 368 185 367 105 375Z" fill="${C.sandraNavy}" stroke="${C.ink}" stroke-width="8" stroke-linejoin="round"/>
    ${text("SANDRA", 121, 433, 46, C.ink)}
  </g>`;
}

function propstream() {
  return `<g transform="rotate(1.5 256 256)">
    <path d="M190 92 C143 102 115 142 120 191 C125 242 177 264 211 294 C228 310 233 334 233 334 C233 334 288 284 310 243 C336 193 320 127 267 102 C245 92 216 89 190 92Z" fill="${C.propGreen}" stroke="${C.ink}" stroke-width="10" stroke-linejoin="round"/>
    <circle cx="216" cy="181" r="47" fill="${C.white}" stroke="${C.ink}" stroke-width="9"/>
    <path d="M118 333 C188 307 295 303 399 330" fill="none" stroke="${C.propBlue}" stroke-width="13" stroke-linecap="round"/>
    <path d="M134 361 C210 338 294 337 385 357" fill="none" stroke="${C.propGreen}" stroke-width="12" stroke-linecap="round"/>
    ${text("Prop", 93, 424, 50, C.propBlue)}
    ${text("Stream", 205, 424, 50, C.propGreen)}
  </g>`;
}

function dealmachine() {
  return `<g transform="rotate(-1.5 256 256)">
    <circle cx="165" cy="175" r="67" fill="${C.orange}" stroke="${C.ink}" stroke-width="10"/>
    <path d="M126 176 L165 137 L203 176 L203 219 L139 219 L139 176Z" fill="${C.white}" stroke="${C.ink}" stroke-width="8" stroke-linejoin="round"/>
    <path d="M255 112 C329 112 388 171 388 245 C388 319 329 378 255 378 C220 378 187 364 163 342" fill="none" stroke="${C.ink}" stroke-width="17" stroke-linecap="round"/>
    <path d="M342 244 L391 244 M364 218 L391 244 L363 270" fill="none" stroke="${C.orange}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
    ${text("Deal", 89, 421, 52, C.ink)}
    ${text("Machine", 194, 421, 44, C.ink)}
  </g>`;
}

function dealSniper() {
  return `<g transform="rotate(1 256 256)">
    <circle cx="254" cy="194" r="106" fill="${C.white}" stroke="${C.ink}" stroke-width="11"/>
    <circle cx="254" cy="194" r="66" fill="${C.yellow}" stroke="${C.ink}" stroke-width="9"/>
    <circle cx="254" cy="194" r="28" fill="${C.orange}" stroke="${C.ink}" stroke-width="9"/>
    <path d="M254 74 L254 130 M254 258 L254 316 M134 194 L191 194 M317 194 L376 194" stroke="${C.ink}" stroke-width="10" stroke-linecap="round"/>
    <path d="M112 351 C154 323 365 324 408 354" fill="none" stroke="${C.orange}" stroke-width="15" stroke-linecap="round"/>
    ${text("Deal", 99, 421, 50, C.ink)}
    ${text("Sniper", 201, 421, 50, C.ink)}
  </g>`;
}

function dialpad() {
  return `<g transform="rotate(-1 256 256)">
    <path d="M145 105 C222 82 337 98 382 176 C420 243 387 336 306 369 C241 396 166 371 129 315 C95 265 96 154 145 105Z" fill="${C.purple}" stroke="${C.ink}" stroke-width="11" stroke-linejoin="round"/>
    ${[0, 1, 2].map((r) => [0, 1, 2].map((c) => `<circle cx="${190 + c * 48}" cy="${179 + r * 48}" r="14" fill="${C.white}" stroke="${C.ink}" stroke-width="6"/>`).join("")).join("")}
    <path d="M187 334 C228 353 289 353 330 327" fill="none" stroke="${C.white}" stroke-width="12" stroke-linecap="round"/>
    ${text("dialpad", 132, 418, 58, C.ink)}
  </g>`;
}

function closerLab() {
  return `<g transform="rotate(1.2 256 256)">
    <circle cx="178" cy="193" r="72" fill="${C.orange}" stroke="${C.ink}" stroke-width="10"/>
    <path d="M178 142 C157 143 145 158 146 181 L146 202 C146 228 162 243 180 242 C202 241 211 225 211 202 L211 181 C212 158 199 142 178 142Z" fill="${C.white}" stroke="${C.ink}" stroke-width="8"/>
    <path d="M132 205 C133 258 224 258 225 205 M178 260 L178 298 M145 299 L212 299" fill="none" stroke="${C.ink}" stroke-width="9" stroke-linecap="round"/>
    <path d="M267 136 C318 119 377 139 397 189 C418 243 386 294 334 306 C302 314 270 304 247 283" fill="${C.white}" stroke="${C.ink}" stroke-width="10" stroke-linejoin="round"/>
    <path d="M284 186 L370 186 M286 222 L348 222 M287 258 L327 258" stroke="${C.ink}" stroke-width="9" stroke-linecap="round"/>
    ${text("Closer", 92, 412, 50, C.ink)}
    ${text("Lab", 275, 412, 50, C.orange)}
  </g>`;
}

function hubstaff() {
  return `<g transform="rotate(-1 256 256)">
    <path d="M128 111 C170 91 239 96 275 132 C313 170 313 232 277 271 C247 303 192 314 152 291 L152 365 L113 365 L113 125Z" fill="${C.hubBlue}" stroke="${C.ink}" stroke-width="10" stroke-linejoin="round"/>
    <path d="M155 154 L155 250 C181 274 234 267 255 237 C279 202 261 152 221 141 C194 133 171 140 155 154Z" fill="${C.white}" stroke="${C.ink}" stroke-width="9" stroke-linejoin="round"/>
    <circle cx="335" cy="273" r="61" fill="${C.brightGreen}" stroke="${C.ink}" stroke-width="10"/>
    <path d="M335 233 L335 277 L364 294" stroke="${C.white}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>
    ${text("hubstaff", 103, 422, 52, C.ink)}
  </g>`;
}

function slack() {
  return `<g transform="rotate(1.5 256 256)">
    <rect x="142" y="119" width="54" height="147" rx="27" fill="${C.slackBlue}" stroke="${C.ink}" stroke-width="7"/>
    <rect x="316" y="246" width="54" height="147" rx="27" fill="${C.slackGreen}" stroke="${C.ink}" stroke-width="7"/>
    <rect x="244" y="122" width="147" height="54" rx="27" fill="${C.slackGreen}" stroke="${C.ink}" stroke-width="7"/>
    <rect x="119" y="316" width="147" height="54" rx="27" fill="${C.slackBlue}" stroke="${C.ink}" stroke-width="7"/>
    <rect x="316" y="119" width="54" height="147" rx="27" fill="${C.slackPink}" stroke="${C.ink}" stroke-width="7"/>
    <rect x="142" y="246" width="54" height="147" rx="27" fill="${C.slackYellow}" stroke="${C.ink}" stroke-width="7"/>
    <rect x="119" y="142" width="147" height="54" rx="27" fill="${C.slackYellow}" stroke="${C.ink}" stroke-width="7"/>
    <rect x="244" y="316" width="147" height="54" rx="27" fill="${C.slackPink}" stroke="${C.ink}" stroke-width="7"/>
    ${text("Slack", 178, 442, 62, C.ink)}
  </g>`;
}

function bmhInstitute() {
  return `<g transform="rotate(-1 256 256)">
    <path d="M104 169 L256 103 L408 169 L256 236Z" fill="${C.yellow}" stroke="${C.ink}" stroke-width="10" stroke-linejoin="round"/>
    <path d="M159 220 L159 289 C197 332 319 333 355 288 L355 220 L256 265Z" fill="${C.white}" stroke="${C.ink}" stroke-width="10" stroke-linejoin="round"/>
    <path d="M408 169 L408 254" stroke="${C.ink}" stroke-width="9" stroke-linecap="round"/>
    <circle cx="408" cy="271" r="14" fill="${C.orange}" stroke="${C.ink}" stroke-width="7"/>
    <path d="M126 356 C174 336 338 335 386 354" fill="none" stroke="${C.orange}" stroke-width="14" stroke-linecap="round"/>
    ${text("BMH", 118, 420, 56, C.ink)}
    ${text("Institute", 236, 420, 38, C.ink)}
  </g>`;
}

function googleDocs() {
  return `<g transform="rotate(1 256 256)">
    <path d="M148 93 L302 93 L381 171 L381 389 L148 389Z" fill="${C.googleBlue}" stroke="${C.ink}" stroke-width="11" stroke-linejoin="round"/>
    <path d="M302 94 L302 172 L381 172Z" fill="${C.white}" stroke="${C.ink}" stroke-width="8" stroke-linejoin="round"/>
    <path d="M190 217 L337 217 M190 255 L337 255 M190 293 L317 293 M190 331 L289 331" stroke="${C.white}" stroke-width="14" stroke-linecap="round"/>
    ${text("Google Docs", 105, 422, 42, C.ink)}
  </g>`;
}

function googleDrive() {
  return `<g transform="rotate(-1.5 256 256)">
    <path d="M244 104 L302 105 L406 286 L350 286Z" fill="${C.googleGreen}" stroke="${C.ink}" stroke-width="9" stroke-linejoin="round"/>
    <path d="M244 104 L138 286 L197 286 L302 105Z" fill="${C.googleYellow}" stroke="${C.ink}" stroke-width="9" stroke-linejoin="round"/>
    <path d="M138 286 L197 286 L244 369 L187 369Z" fill="${C.googleBlue}" stroke="${C.ink}" stroke-width="9" stroke-linejoin="round"/>
    <path d="M406 286 L350 286 L302 369 L244 369 L197 286 L350 286Z" fill="${C.white}" stroke="${C.ink}" stroke-width="9" stroke-linejoin="round"/>
    <path d="M244 369 L302 369 L350 286 L292 286Z" fill="${C.googleRed}" stroke="${C.ink}" stroke-width="8" stroke-linejoin="round"/>
    ${text("Google Drive", 96, 422, 42, C.ink)}
  </g>`;
}

function gmail() {
  return `<g transform="rotate(1.3 256 256)">
    <path d="M116 147 C125 130 385 132 397 148 L397 353 C390 370 123 369 116 352Z" fill="${C.white}" stroke="${C.ink}" stroke-width="11" stroke-linejoin="round"/>
    <path d="M124 154 L256 266 L390 154" fill="none" stroke="${C.googleRed}" stroke-width="25" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M126 352 L126 181 L205 248" fill="none" stroke="${C.googleBlue}" stroke-width="21" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M386 352 L386 181 L307 248" fill="none" stroke="${C.googleGreen}" stroke-width="21" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M205 248 L256 291 L307 248" fill="none" stroke="${C.googleYellow}" stroke-width="21" stroke-linecap="round" stroke-linejoin="round"/>
    ${text("Gmail", 185, 421, 58, C.ink)}
  </g>`;
}

function writeManifest() {
  const manifest = {
    generatedAt: new Date().toISOString(),
    status: "AWAITING_JARRAD_APPROVAL",
    style: "Hand-drawn BMH doodle overlay badges: thick wobbly black outlines, flat fills, no gradients, no shadows, no pasted official vector art.",
    overlayRules: {
      placement: "safe top-corner by default",
      durationSeconds: 5,
      repeats: "one appearance at first meaningful mention only",
      generatedStills: "do not bake these into AI stills or fake app screens",
    },
    sourceNotes: sources,
    tools: tools.map((tool) => ({
      slug: tool.slug,
      name: tool.name,
      source: sources[tool.slug],
      techStackBeat: tool.beat,
      cue: tool.cue,
      firstMeaningfulMention: tool.time,
      svg: `${tool.slug}.svg`,
      png: `${tool.slug}.png`,
    })),
  };
  fs.writeFileSync(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

function contactSheetSvg() {
  const cellW = 450;
  const cellH = 365;
  const marginX = 60;
  const marginY = 98;
  const cols = 4;
  const rows = 3;
  const width = marginX * 2 + cols * cellW;
  const height = marginY + rows * cellH + 70;
  const cells = tools.map((tool, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = marginX + col * cellW;
    const y = marginY + row * cellH;
    return `<g transform="translate(${x}, ${y})">
      <path d="M24 16 C121 5 321 8 414 18 C437 24 441 320 418 335 C328 354 117 350 27 334 C7 322 4 33 24 16Z" fill="${C.white}" stroke="${C.ink}" stroke-width="6" stroke-linejoin="round"/>
      ${text(tool.name, 42, 48, tool.name.length > 12 ? 25 : 28, C.ink)}
      <g transform="translate(55 43) scale(0.64)">${badgeBody(tool)}</g>
    </g>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${C.blue}"/>
  ${text("Tech Stack hand-drawn software logo badges - v1 approval sheet", 60, 56, 34, C.ink)}
  ${text("Overlay assets only: top-corner callouts, one first-mention hold, not baked into generated stills", 60, 86, 20, C.ink)}
  ${cells}
</svg>`;
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  for (const tool of tools) {
    const body = badgeBody(tool);
    const svg = svgWrap(tool.name, body);
    const svgPath = path.join(outDir, `${tool.slug}.svg`);
    const pngPath = path.join(outDir, `${tool.slug}.png`);
    fs.writeFileSync(svgPath, svg);
    await sharp(Buffer.from(svg)).png().toFile(pngPath);
  }

  const sheetSvg = contactSheetSvg();
  fs.writeFileSync(path.join(outDir, "contact-sheet.svg"), sheetSvg);
  await sharp(Buffer.from(sheetSvg)).png().toFile(path.join(outDir, "contact-sheet.png"));
  writeManifest();
  console.log(`Wrote ${tools.length} badge SVG/PNG pairs and contact sheet to ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
