const GLYPHS = Object.freeze({
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  a: ["00000", "01110", "00001", "01111", "10001", "10011", "01101"],
  b: ["10000", "10000", "10110", "11001", "10001", "10001", "11110"],
  c: ["00000", "01110", "10001", "10000", "10000", "10001", "01110"],
  d: ["00001", "00001", "01101", "10011", "10001", "10001", "01111"],
  e: ["00000", "01110", "10001", "11111", "10000", "10001", "01110"],
  f: ["00110", "01001", "01000", "11100", "01000", "01000", "01000"],
  g: ["00000", "01111", "10001", "10001", "01111", "00001", "01110"],
  h: ["10000", "10000", "10110", "11001", "10001", "10001", "10001"],
  i: ["00100", "00000", "01100", "00100", "00100", "00100", "01110"],
  j: ["00010", "00000", "00110", "00010", "00010", "10010", "01100"],
  k: ["10000", "10001", "10010", "11100", "10010", "10001", "10001"],
  l: ["01100", "00100", "00100", "00100", "00100", "00100", "01110"],
  m: ["00000", "11010", "10101", "10101", "10101", "10101", "10101"],
  n: ["00000", "10110", "11001", "10001", "10001", "10001", "10001"],
  o: ["00000", "01110", "10001", "10001", "10001", "10001", "01110"],
  p: ["00000", "11110", "10001", "10001", "11110", "10000", "10000"],
  q: ["00000", "01101", "10011", "10001", "01111", "00001", "00001"],
  r: ["00000", "10110", "11001", "10000", "10000", "10000", "10000"],
  s: ["00000", "01111", "10000", "01110", "00001", "00001", "11110"],
  t: ["01000", "01000", "11100", "01000", "01000", "01001", "00110"],
  u: ["00000", "10001", "10001", "10001", "10001", "10011", "01101"],
  v: ["00000", "10001", "10001", "10001", "10001", "01010", "00100"],
  w: ["00000", "10001", "10001", "10101", "10101", "10101", "01010"],
  x: ["00000", "10001", "01010", "00100", "01010", "10001", "10001"],
  y: ["00000", "10001", "10001", "01111", "00001", "10001", "01110"],
  z: ["00000", "11111", "00010", "00100", "01000", "10000", "11111"],
});

export const FINAL_REVIEW_PENDING_CAPTION = "current ledger bytes - review pending";

export function compareArtworkAssetKeys(left, right) {
  if (!/^[a-z0-9-]+$/.test(left) || !/^[a-z0-9-]+$/.test(right)) {
    throw new Error("Deterministic artwork asset keys must use lowercase ASCII letters, digits, and hyphens");
  }
  return left < right ? -1 : left > right ? 1 : 0;
}

function bitmapPath(text, { x, y, scale }) {
  const commands = [];
  for (const [characterIndex, character] of [...text].entries()) {
    const glyph = GLYPHS[character];
    if (!glyph) throw new Error(`Unsupported deterministic artwork label character: ${character}`);
    for (const [rowIndex, row] of glyph.entries()) {
      let runStart = -1;
      for (let column = 0; column <= row.length; column += 1) {
        const filled = row[column] === "1";
        if (filled && runStart === -1) runStart = column;
        if (!filled && runStart !== -1) {
          const left = x + (characterIndex * 6 + runStart) * scale;
          const top = y + rowIndex * scale;
          const width = (column - runStart) * scale;
          commands.push(`M${left} ${top}h${width}v${scale}h-${width}z`);
          runStart = -1;
        }
      }
    }
  }
  return commands.join("");
}

export function deterministicArtworkLabelSvg(assetKey, { width = 320, height = 44 } = {}) {
  if (!/^[a-z0-9-]+$/.test(assetKey)) throw new Error(`Unsupported deterministic artwork asset key: ${assetKey}`);
  if (assetKey.length > 50) throw new Error(`Deterministic artwork asset key is too long: ${assetKey}`);
  if (!Number.isInteger(width) || width < 320 || !Number.isInteger(height) || height < 44) {
    throw new Error("Deterministic artwork label canvas must be at least 320x44");
  }
  const assetLines = [assetKey.slice(0, 25), assetKey.slice(25)].filter(Boolean);
  const assetPaths = assetLines
    .map((line, index) => bitmapPath(line, { x: 10, y: 2 + index * 16, scale: 2 }))
    .join("");
  const captionPath = bitmapPath(FINAL_REVIEW_PENDING_CAPTION, { x: 10, y: 35, scale: 1 });
  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="100%" height="100%" fill="#ffffff"/>` +
      `<path fill="#111111" d="${assetPaths}"/>` +
      `<path fill="#555555" d="${captionPath}"/>` +
      `</svg>`,
  );
}
