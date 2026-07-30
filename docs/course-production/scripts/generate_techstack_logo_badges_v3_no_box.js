const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const projectRoot = path.resolve(__dirname, "../../..");
const sourceDir = path.join(
  projectRoot,
  "course-assets/logo-callouts/techstack-v2-actual-trace/sources",
);
const outDir = path.join(
  projectRoot,
  "course-assets/logo-callouts/techstack-v3-actual-no-box",
);

const C = {
  blue: "#62b3f3",
  ink: "#101010",
  white: "#ffffff",
  orange: "#ff7a00",
  muted: "#313131",
};

const tools = [
  {
    slug: "sandra",
    name: "Sandra",
    source: "sandra-wordmark.png",
    sourceLabel: "local Sandra/public/brand/sandra-wordmark.png",
    sourceUrl: "local",
    logoBox: [66, 184, 380, 88],
    shadow: true,
  },
  {
    slug: "propstream",
    name: "PropStream",
    source: "propstream.svg",
    sourceLabel: "official PropStream SVG",
    sourceUrl:
      "https://www.propstream.com/hubfs/2025-Web-Update/PS-Stacked-MonoLight.svg",
    logoBox: [74, 104, 364, 202],
    shadow: true,
  },
  {
    slug: "dealmachine",
    name: "DealMachine",
    source: "dealmachine.svg",
    sourceLabel: "official DealMachine SVG",
    sourceUrl: "https://www.dealmachine.com/hubfs/Pictures/DealMachineLogo.svg",
    logoBox: [36, 205, 440, 56],
    shadow: true,
    shadowOpacity: 0.58,
  },
  {
    slug: "deal_sniper",
    name: "Deal Sniper",
    source: "deal_sniper.png",
    sourceLabel: "live Deal Sniper brand PNG",
    sourceUrl: "https://www.dealsniper.ai/deal_sniper_brand.png",
    logoBox: [36, 178, 440, 118],
    shadow: true,
    shadowOpacity: 0.36,
  },
  {
    slug: "dialpad",
    name: "Dialpad",
    source: "dialpad.svg",
    sourceLabel: "official Dialpad site SVG",
    sourceUrl: "https://www.dialpad.com/assets/images/logo/dark_dialpad.svg",
    logoBox: [82, 174, 348, 122],
    shadow: true,
  },
  {
    slug: "closer_lab",
    name: "Closer Lab",
    inlineLogo: closerLabLockup,
    sourceLabel: "local Closer Lab BrandLockup / Mic2 mark",
    sourceUrl: "local",
  },
  {
    slug: "hubstaff",
    name: "Hubstaff",
    source: "hubstaff.svg",
    sourceLabel: "official Hubstaff site SVG",
    sourceUrl: "https://hubstaff.com/icons-cds/hubstaff-logo.svg",
    logoBox: [64, 177, 384, 82],
    shadow: true,
  },
  {
    slug: "slack",
    name: "Slack",
    source: "slack.svg",
    sourceLabel: "official Slack media-kit SVG mark",
    sourceUrl: "https://a.slack-edge.com/38f0e7c/marketing/img/nav/logo.svg",
    logoBox: [176, 136, 160, 160],
    shadow: false,
  },
  {
    slug: "bmh_institute",
    name: "BMH Institute",
    inlineLogo: bmhInstituteLockup,
    sourceLabel: "local BMH Institute BrandLockup / GraduationCap mark",
    sourceUrl: "local",
  },
  {
    slug: "google_docs",
    name: "Google Docs",
    source: "google_docs.png",
    sourceLabel: "official Google product icon PNG",
    sourceUrl:
      "https://www.gstatic.com/images/branding/product/2x/docs_2020q4_96dp.png",
    logoBox: [170, 128, 172, 172],
    shadow: true,
  },
  {
    slug: "google_drive",
    name: "Google Drive",
    source: "google_drive.png",
    sourceLabel: "official Google product icon PNG",
    sourceUrl:
      "https://www.gstatic.com/images/branding/product/2x/drive_2020q4_96dp.png",
    logoBox: [156, 122, 200, 200],
    shadow: true,
  },
  {
    slug: "gmail",
    name: "Gmail",
    source: "gmail.png",
    sourceLabel: "official Google product icon PNG",
    sourceUrl:
      "https://www.gstatic.com/images/branding/product/2x/gmail_2020q4_96dp.png",
    logoBox: [156, 124, 200, 200],
    shadow: true,
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

function imageLogo(tool) {
  const [x, y, w, h] = tool.logoBox;
  const uri = sourceDataUri(tool);
  const shadowOpacity = tool.shadowOpacity ?? 0.25;
  const shadow = tool.shadow
    ? `<image href="${uri}" x="${x + 5}" y="${y + 5}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet" opacity="${shadowOpacity}" filter="url(#black-shadow)"/>`
    : "";
  return `${shadow}<image href="${uri}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>`;
}

function sketchAccents() {
  return `<g fill="none" stroke="${C.ink}" stroke-width="4" stroke-linecap="round" opacity="0.5">
    <path d="M118 362 C181 375 331 374 394 362"/>
    <path d="M139 384 C196 393 315 392 373 383"/>
  </g>`;
}

function badgeSvg(tool) {
  const logo = tool.inlineLogo ? tool.inlineLogo() : imageLogo(tool);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="${esc(tool.name)} no-box logo callout">
  <rect width="512" height="512" fill="none"/>
  <defs>
    <filter id="soft-sketch" x="-8%" y="-8%" width="116%" height="116%">
      <feTurbulence type="fractalNoise" baseFrequency="0.024" numOctaves="1" seed="18" result="noise"/>
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.45" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <filter id="black-shadow" color-interpolation-filters="sRGB">
      <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"/>
    </filter>
  </defs>
  <g filter="url(#soft-sketch)">
    ${logo}
    ${sketchAccents()}
  </g>
</svg>`;
}

function closerLabLockup() {
  return `<g transform="translate(56 177)">
    <rect x="0" y="-12" width="78" height="78" rx="20" fill="${C.orange}" stroke="${C.ink}" stroke-width="7"/>
    <g transform="translate(20 8) scale(1.62)" fill="none" stroke="${C.white}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="m11 7.601-5.994 8.19a1 1 0 0 0 .1 1.298l.817.818a1 1 0 0 0 1.314.087L15.09 12"/>
      <path d="M16.5 21.174C15.5 20.5 14.372 20 13 20c-2.058 0-3.928 2.356-6 2-2.072-.356-2.775-3.369-1.5-4.5"/>
      <circle cx="16" cy="7" r="5"/>
    </g>
    ${text("Closer Lab", 100, 36, 54, C.ink)}
    ${text("PRACTICE GYM", 103, 65, 20, C.muted)}
  </g>`;
}

function bmhInstituteLockup() {
  return `<g transform="translate(38 177)">
    <rect x="0" y="-12" width="78" height="78" rx="20" fill="${C.orange}" stroke="${C.ink}" stroke-width="7"/>
    <g transform="translate(18 8) scale(1.68)" fill="none" stroke="${C.white}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/>
      <path d="M22 10v6"/>
      <path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>
    </g>
    ${text("BMH Institute", 100, 35, 46, C.ink)}
    ${text("TRAINING PLATFORM", 103, 65, 18, C.muted)}
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
        <image href="${badgeUri}" x="64" y="8" width="432" height="332" preserveAspectRatio="xMidYMid meet"/>
        ${text(tool.name, 280, 372, 27, C.ink, 'text-anchor="middle"')}
      </g>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Tech stack no-box logo contact sheet">
  <rect width="${width}" height="${height}" fill="${C.blue}"/>
  ${cells}
</svg>`;
}

async function render() {
  fs.mkdirSync(outDir, { recursive: true });
  const manifest = {
    version: "techstack-v3-actual-no-box",
    generatedAt: new Date().toISOString(),
    note: "No white cards or boxed logo backgrounds. Individual assets are transparent logo callouts with subtle sketch accents only.",
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
