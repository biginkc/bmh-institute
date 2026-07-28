import { createHash } from "node:crypto";

// PostgreSQL jsonb text orders object keys by UTF-8 byte length, then by
// byte value, and inserts a space after separators. Several checksum pins
// in this codebase are computed against a jsonb value's live `::text` cast
// (e.g. the oral-check pilot migration's
// `encode(sha256(convert_to(v_mutations::text, 'UTF8')), 'hex')`), so
// reproducing that exact serialization here lets a TypeScript-side test
// independently recompute -- and bind itself to -- the same checksum the
// SQL side is pinned to, rather than trusting a hand-copied literal.
export function postgresJsonbText(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(postgresJsonbText).join(", ")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) =>
        left.length - right.length || Buffer.compare(Buffer.from(left), Buffer.from(right))
      );
    return `{${entries.map(([key, item]) =>
      `${JSON.stringify(key)}: ${postgresJsonbText(item)}`
    ).join(", ")}}`;
  }
  throw new Error("postgresJsonbText: payload contains a non-JSON value.");
}

export function postgresJsonbSha256(value: unknown): string {
  return createHash("sha256").update(postgresJsonbText(value)).digest("hex");
}
