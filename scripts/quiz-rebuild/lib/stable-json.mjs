export function stableStringify(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}
