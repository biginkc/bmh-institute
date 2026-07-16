import React from "react";

export interface AvatarProps {
  /** Full name — drives initials + fallback color. */
  name?: string;
  /** Optional image URL. */
  src?: string;
  /** Pixel diameter. @default 40 */
  size?: number;
  /** Bold ink ring (brand default). @default true */
  outline?: boolean;
}

const palette = [
  ["var(--blue-400)", "var(--blue-700)"],
  ["var(--yellow-500)", "var(--yellow-600)"],
  ["var(--orange-400)", "var(--orange-600)"],
  ["var(--green-500)", "#1E7A4A"],
] as const;

function initials(name = "") {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0] || "")
      .join("")
      .toUpperCase() || "?"
  );
}

/** Round avatar with colored initials fallback. */
export function Avatar({ name = "", src, size = 40, outline = true }: AvatarProps) {
  const paletteIndex = [...name].reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  ) % palette.length;
  const [background, color] = palette[paletteIndex];

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        flexShrink: 0,
        border: outline ? "2.5px solid var(--ink-900)" : "none",
        background,
        color,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-display)",
        fontWeight: 800,
        fontSize: size * 0.4,
      }}
    >
      {src ? (
        // The source can be a user-provided URL, so dimensions are controlled by the avatar shell.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        initials(name)
      )}
    </div>
  );
}
