import React from "react";

import { Mascot } from "./mascot";
import { SpeechBubble } from "./speech-bubble";

export interface CoachProps {
  /** The line Andrea says. */
  message?: React.ReactNode;
  children?: React.ReactNode;
  /** Full-body pose to use. */
  pose?: "stand" | "wave" | "present" | "point" | "thinking" | "hips";
  /** Headshot expression to use (default when no pose given). */
  emotion?: "neutral" | "smile" | "laugh" | "curious" | "thinking" | "worried" | "content";
  /** Sprite folder relative to the page. @default "assets/mascot" */
  base?: string;
  /** Speech-bubble tone. @default "white" */
  tone?: "white" | "blue" | "yellow" | "tint";
  /** Bubble size. @default "md" */
  size?: "sm" | "md" | "lg";
  /** Mascot height in px. */
  height?: number;
  /** Which side Andrea stands on. @default "left" */
  side?: "left" | "right";
  /** Cross-axis alignment of mascot + bubble. @default "center" */
  align?: "center" | "flex-start" | "flex-end";
}

/**
 * Andrea + speech bubble — the signature narrator unit for hero moments,
 * coach tips, empty states, and celebrations.
 * @startingPoint section="Brand" subtitle="Andrea narrating with a speech bubble" viewport="520x260"
 */
export function Coach({
  message,
  children,
  pose,
  emotion = pose ? undefined : "smile",
  base = "/brand/mascot",
  tone = "white",
  size = "md",
  height,
  side = "left",
  align = "center",
}: CoachProps) {
  const mascot = (
    <span style={{ flexShrink: 0 }}>
      <Mascot
        pose={pose}
        emotion={emotion}
        base={base}
        height={height || (pose ? 210 : 96)}
      />
    </span>
  );
  const bubble = (
    <SpeechBubble
      tone={tone}
      size={size}
      tail={side === "left" ? "left" : "bottom-right"}
    >
      {message || children}
    </SpeechBubble>
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: side === "left" ? "row" : "row-reverse",
        alignItems: align,
        gap: 18,
      }}
    >
      {mascot}
      {bubble}
    </div>
  );
}
