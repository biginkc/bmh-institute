import React from "react";

export interface MascotProps {
  /** Full-body pose. One of: stand | wave | present | point | thinking | hips. */
  pose?: "stand" | "wave" | "present" | "point" | "thinking" | "hips";
  /** Headshot expression (overrides pose). One of: neutral | smile | laugh | curious | thinking | worried | content. */
  emotion?: "neutral" | "smile" | "laugh" | "curious" | "thinking" | "worried" | "content";
  /** Explicit image URL (overrides pose/emotion). */
  src?: string;
  /** Folder the sprites live in, relative to the page. @default "assets/mascot" */
  base?: string;
  /** Rendered height in px. @default 230 pose / 88 emotion */
  height?: number;
  width?: number | string;
  alt?: string;
  /** Mirror horizontally. @default false */
  flip?: boolean;
}

/**
 * Andrea — the BMH Institute mascot & narrator (transparent PNG sprites).
 * @startingPoint section="Brand" subtitle="Andrea the mascot — poses & expressions" viewport="360x320"
 */
export function Mascot({
  pose,
  emotion,
  src,
  base = "/brand/mascot",
  height,
  width,
  alt = "Andrea",
  flip = false,
}: MascotProps) {
  const url =
    src ||
    (emotion
      ? `${base}/face-${emotion}.png`
      : `${base}/pose-${pose || "stand"}.png`);
  const renderedHeight = height || (emotion ? 88 : 230);

  return (
    // The selected runtime sprite path is determined by the public component API.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      style={{
        height: renderedHeight,
        width: width || "auto",
        display: "block",
        transform: flip ? "scaleX(-1)" : "none",
        userSelect: "none",
        WebkitUserDrag: "none",
      } as React.CSSProperties & { WebkitUserDrag: string }}
    />
  );
}
