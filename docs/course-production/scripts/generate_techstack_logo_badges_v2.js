const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const projectRoot = path.resolve(__dirname, "../../..");
const outDir = path.join(
  projectRoot,
  "course-assets/logo-callouts/techstack-v2-actual-trace",
);
const sourceDir = path.join(outDir, "sources");

const C = {
  blue: "#62b3f3",
  ink: "#101010",
  cream: "#fff3cc",
  white: "#ffffff",
  yellow: "#ffcc00",
  orange: "#ff7a00",
  sandraNavy: "#0f2b52",
  propTeal: "#128292",
  dialpadPurple: "#7c52ff",
  hubstaffBlue: "#294dff",
  muted: "#313131",
};

const tools = [
  {
    slug: "sandra",
    name: "Sandra",
    beat: "b03_sandra_center",
    cue: 6,
    time: "00:45.140",
    source: "sandra-wordmark.png",
    sourceLabel: "local Sandra/public/brand/sandra-wordmark.png",
    sourceUrl: "local",
    logoBox: [94, 168, 324, 74],
    cardFill: C.sandraNavy,
    cardStroke: C.ink,
  },
  {
    slug: "propstream",
    name: "PropStream",
    beat: "b06_propstream_data",
    cue: 12,
    time: "01:34.198",
    source: "propstream.svg",
    sourceLabel: "official PropStream SVG",
    sourceUrl:
      "https://www.propstream.com/hubfs/2025-Web-Update/PS-Stacked-MonoLight.svg",
    logoBox: [93, 104, 326, 180],
    cardFill: C.propTeal,
    cardStroke: C.ink,
  },
  {
    slug: "dealmachine",
    name: "DealMachine",
    beat: "b07_dealmachine_pipeline",
    cue: 17,
    time: "02:14.191",
    source: "dealmachine.svg",
    sourceLabel: "official DealMachine SVG",
    sourceUrl: "https://www.dealmachine.com/hubfs/Pictures/DealMachineLogo.svg",
    logoBox: [58, 166, 396, 48],
    cardFill: C.white,
    cardStroke: C.ink,
  },
  {
    slug: "deal_sniper",
    name: "Deal Sniper",
    beat: "b08_deal_sniper_speed",
    cue: 21,
    time: "02:43.631",
    source: "deal_sniper.png",
    sourceLabel: "live Deal Sniper brand PNG",
    sourceUrl: "https://www.dealsniper.ai/deal_sniper_brand.png",
    logoBox: [62, 154, 388, 104],
    cardFill: C.white,
    cardStroke: C.ink,
  },
  {
    slug: "dialpad",
    name: "Dialpad",
    beat: "b09_dialpad_calls",
    cue: 24,
    time: "03:15.944",
    source: "dialpad.svg",
    sourceLabel: "official Dialpad site SVG",
    sourceUrl: "https://www.dialpad.com/assets/images/logo/dark_dialpad.svg",
    logoBox: [94, 148, 324, 114],
    cardFill: C.white,
    cardStroke: C.ink,
  },
  {
    slug: "closer_lab",
    name: "Closer Lab",
    beat: "b11_closer_lab_practice",
    cue: 29,
    time: "03:56.095",
    inlineLogo: closerLabLockup,
    sourceLabel: "local Closer Lab BrandLockup / Mic2 mark",
    sourceUrl: "local",
    cardFill: C.white,
    cardStroke: C.ink,
  },
  {
    slug: "hubstaff",
    name: "Hubstaff",
    beat: "b13_hubstaff_time",
    cue: 36,
    time: "05:05.241",
    source: "hubstaff.svg",
    sourceLabel: "official Hubstaff site SVG",
    sourceUrl: "https://hubstaff.com/icons-cds/hubstaff-logo.svg",
    logoBox: [74, 156, 364, 78],
    cardFill: C.white,
    cardStroke: C.ink,
  },
  {
    slug: "slack",
    name: "Slack",
    beat: "b14_slack_team",
    cue: 38,
    time: "05:24.023",
    source: "slack.svg",
    sourceLabel: "official Slack media-kit SVG mark",
    sourceUrl: "https://a.slack-edge.com/38f0e7c/marketing/img/nav/logo.svg",
    logoBox: [176, 116, 160, 160],
    cardFill: C.white,
    cardStroke: C.ink,
  },
  {
    slug: "bmh_institute",
    name: "BMH Institute",
    beat: "b15_bmh_institute_training",
    cue: 40,
    time: "05:42.674",
    inlineLogo: bmhInstituteLockup,
    sourceLabel: "local BMH Institute BrandLockup / GraduationCap mark",
    sourceUrl: "local",
    cardFill: C.white,
    cardStroke: C.ink,
  },
  {
    slug: "google_docs",
    name: "Google Docs",
    beat: "b16_google_drive_docs",
    cue: 42,
    time: "06:00.176",
    source: "google_docs.png",
    sourceLabel: "official Google product icon PNG",
    sourceUrl:
      "https://www.gstatic.com/images/branding/product/2x/docs_2020q4_96dp.png",
    logoBox: [170, 100, 172, 172],
    cardFill: C.white,
    cardStroke: C.ink,
  },
  {
    slug: "google_drive",
    name: "Google Drive",
    beat: "b16_google_drive_docs",
    cue: 42,
    time: "06:00.176",
    source: "google_drive.png",
    sourceLabel: "official Google product icon PNG",
    sourceUrl:
      "https://www.gstatic.com/images/branding/product/2x/drive_2020q4_96dp.png",
    logoBox: [156, 104, 200, 200],
    cardFill: C.white,
    cardStroke: C.ink,
  },
  {
    slug: "gmail",
    name: "Gmail",
    beat: "reusable_lesson18B",
    cue: null,
    time: "Lesson 18B only",
    source: "gmail.png",
    sourceLabel: "official Google product icon PNG",
    sourceUrl:
      "https://www.gstatic.com/images/branding/product/2x/gmail_2020q4_96dp.png",
    logoBox: [156, 108, 200, 200],
    cardFill: C.white,
    cardStroke: C.ink,
  },
];

function esc(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  }[ch]));
}

function text(content, x, y, size, fill = C.ink, extra = "") {
  return `<text x="${x}" y="${y}" font-family="Arial Rounded MT Bold, Avenir Next, Arial, sans-serif" font-size="${size}" font-weight="900" fill="${fill}" letter-spacing="0" ${extra}>${esc(content)}</text>`;
}

function sourceDataUri(tool) {
  const filename = path.join(sourceDir, tool.source);
  const buffer = fs.readFileSync(filename);
  const ext = path.extname(filename).toLowerCase();
  const mime = ext === ".svg" ? "image/svg+xml" : "image/png";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function wobblyCard(fill, stroke = C.ink) {
  return `<g>
    <path d="M62 83 C113 66 399 67 451 84 C474 92 477 114 471 151 C476 213 474 291 461 322 C447 354 105 357 66 331 C44 316 42 103 62 83Z"
      fill="${fill}" stroke="${stroke}" stroke-width="12" stroke-linejoin="round"/>
    <path d="M79 100 C124 92 389 91 434 102" fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round" opacity="0.55"/>
    <path d="M81 319 C135 331 382 330 433 318" fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round" opacity="0.45"/>
  </g>`;
}

function sketchScuffs() {
  return `<g fill="none" stroke="${C.ink}" stroke-width="4" stroke-linecap="round" opacity="0.5">
    <path d="M58 72 L74 62"/>
    <path d="M452 70 L469 82"/>
    <path d="M48 333 L68 344"/>
    <path d="M448 344 L468 331"/>
  </g>`;
}

function badgeSvg(tool) {
  const logo = tool.inlineLogo
    ? tool.inlineLogo()
    : imageLogo(sourceDataUri(tool), tool.logoBox);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="${esc(tool.name)} actual-logo doodle badge">
  <rect width="512" height="512" fill="none"/>
  <defs>
    <filter id="soft-sketch" x="-8%" y="-8%" width="116%" height="116%">
      <feTurbulence type="fractalNoise" baseFrequency="0.025" numOctaves="1" seed="18" result="noise"/>
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.65" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
  </defs>
  <g filter="url(#soft-sketch)">
    ${wobblyCard(tool.cardFill, tool.cardStroke)}
    ${logo}
    ${sketchScuffs()}
  </g>
</svg>`;
}

function imageLogo(uri, [x, y, w, h]) {
  return `<image href="${uri}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>`;
}

function closerLabLockup() {
  return `<g transform="translate(58 135)">
    <rect x="0" y="0" width="78" height="78" rx="20" fill="${C.orange}" stroke="${C.ink}" stroke-width="7"/>
    <g transform="translate(20 20) scale(1.62)" fill="none" stroke="${C.white}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="m11 7.601-5.994 8.19a1 1 0 0 0 .1 1.298l.817.818a1 1 0 0 0 1.314.087L15.09 12"/>
      <path d="M16.5 21.174C15.5 20.5 14.372 20 13 20c-2.058 0-3.928 2.356-6 2-2.072-.356-2.775-3.369-1.5-4.5"/>
      <circle cx="16" cy="7" r="5"/>
    </g>
    ${text("Closer Lab", 100, 46, 54, C.ink)}
    ${text("PRACTICE GYM", 103, 75, 20, C.muted)}
  </g>`;
}

function bmhInstituteLockup() {
  return `<g transform="translate(43 135)">
    <rect x="0" y="0" width="78" height="78" rx="20" fill="${C.orange}" stroke="${C.ink}" stroke-width="7"/>
    <g transform="translate(18 20) scale(1.68)" fill="none" stroke="${C.white}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/>
      <path d="M22 10v6"/>
      <path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>
    </g>
    ${text("BMH Institute", 100, 45, 46, C.ink)}
    ${text("TRAINING PLATFORM", 103, 75, 18, C.muted)}
  </g>`;
}

function contactSheetSvg() {
  const cols = 4;
  const rows = 3;
  const cellW = 560;
  const cellH = 410;
  const width = cols * cellW;
  const height = rows * cellH;

  const cells = tools
    .map((tool, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = col * cellW;
      const y = row * cellH;
      const badgeUri = `data:image/svg+xml;base64,${Buffer.from(
        badgeSvg(tool),
      ).toString("base64")}`;
      return `<g transform="translate(${x} ${y})">
        <rect x="0" y="0" width="${cellW}" height="${cellH}" fill="${C.blue}"/>
        <image href="${badgeUri}" x="64" y="30" width="432" height="300" preserveAspectRatio="xMidYMid meet"/>
        <rect x="118" y="331" width="324" height="48" rx="22" fill="${C.white}" stroke="${C.ink}" stroke-width="5"/>
        ${text(tool.name, 280, 363, 24, C.ink, 'text-anchor="middle"')}
      </g>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Tech stack actual-logo doodle badge contact sheet">
  <rect width="${width}" height="${height}" fill="${C.blue}"/>
  ${cells}
</svg>`;
}

async function render() {
  fs.mkdirSync(outDir, { recursive: true });

  const manifest = {
    version: "techstack-v2-actual-trace",
    generatedAt: new Date().toISOString(),
    note: "Rejected v1 is preserved. These badges embed actual source logos and add only a light BMH sketch/sticker treatment around them.",
    tools: [],
  };

  for (const tool of tools) {
    const svg = badgeSvg(tool);
    const svgPath = path.join(outDir, `${tool.slug}.svg`);
    const pngPath = path.join(outDir, `${tool.slug}.png`);
    fs.writeFileSync(svgPath, svg);
    await sharp(Buffer.from(svg)).png().toFile(pngPath);
    manifest.tools.push({
      slug: tool.slug,
      name: tool.name,
      beat: tool.beat,
      cue: tool.cue,
      time: tool.time,
      source: tool.source ?? "inline-local-brand-lockup",
      sourceLabel: tool.sourceLabel,
      sourceUrl: tool.sourceUrl,
      svg: path.relative(projectRoot, svgPath),
      png: path.relative(projectRoot, pngPath),
    });
  }

  const sheet = contactSheetSvg();
  const sheetSvg = path.join(outDir, "contact-sheet.svg");
  const sheetPng = path.join(outDir, "contact-sheet.png");
  fs.writeFileSync(sheetSvg, sheet);
  await sharp(Buffer.from(sheet)).png().toFile(sheetPng);
  fs.writeFileSync(
    path.join(outDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  const metadata = await sharp(sheetPng).metadata();
  console.log(`wrote ${sheetPng}`);
  console.log(`contact sheet: ${metadata.width}x${metadata.height}`);
}

render().catch((error) => {
  console.error(error);
  process.exit(1);
});
