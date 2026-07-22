import React from "react";

import { Mascot, type MascotProps } from "./mascot";
import { SpeechBubble } from "./speech-bubble";

export interface CoachProps {
  /** The line Andrea says. */
  message?: React.ReactNode;
  children?: React.ReactNode;
  /** Full-body pose to use. */
  pose?: "stand" | "wave" | "present" | "point" | "thinking" | "hips";
  /** Headshot expression to use (default when no pose given). */
  emotion?: "neutral" | "smile" | "laugh" | "curious" | "thinking" | "worried" | "content";
  /** Sprite folder relative to the page. @default "/brand/mascot" */
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

type CoachRuntimeProps = CoachProps &
  Omit<React.HTMLAttributes<HTMLDivElement>, keyof CoachProps>;

type RuntimeMascotProps = MascotProps &
  Omit<React.ImgHTMLAttributes<HTMLImageElement>, keyof MascotProps>;

const RuntimeMascot = Mascot as React.ComponentType<RuntimeMascotProps>;

/**
 * Andrea + speech bubble — the signature narrator unit for hero moments,
 * coach tips, empty states, and celebrations.
 * @startingPoint section="Brand" subtitle="Andrea narrating with a speech bubble" viewport="520x260"
 */
export function Coach(props: CoachProps) {
  const {
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
    style,
    ...rest
  } = props as CoachRuntimeProps;
  const mascot = (
    <RuntimeMascot
      pose={pose}
      emotion={emotion}
      base={base}
      height={height || (pose ? 210 : 96)}
      style={{ flexShrink: 0 }}
    />
  );
  const bubble = (
    <SpeechBubble
      tone={tone}
      size={size}
      tail={side === "left" ? "left" : "bottom-right"}
      style={{ flex: "0 1 340px", minWidth: 0 }}
    >
      {message || children}
    </SpeechBubble>
  );

  return (
    <div
      data-coach
      style={{
        display: "flex",
        flexDirection: side === "left" ? "row" : "row-reverse",
        alignItems: align,
        gap: 28,
        maxWidth: "100%",
        minWidth: 0,
        ...style,
      }}
      {...rest}
    >
      {mascot}
      {bubble}
    </div>
  );
}
