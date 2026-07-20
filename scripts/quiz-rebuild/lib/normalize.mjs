export function normalizeForComparison(value) {
  return value
    .toLowerCase()
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenSet(value) {
  const normalized = normalizeForComparison(value);
  return new Set(normalized ? normalized.split(" ") : []);
}

export function jaccard(a, b) {
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 1;
  let intersectionSize = 0;
  for (const token of a) {
    if (b.has(token)) intersectionSize += 1;
  }
  return intersectionSize / union.size;
}
