import React from "react";

export interface SpeechBubbleProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  /** @default "white" */
  tone?: "white" | "blue" | "yellow" | "tint";
  /** Tail position. @default "bottom-left" */
  tail?: "bottom-left" | "bottom-right" | "left" | "right";
  /** @default "md" */
  size?: "sm" | "md" | "lg";
}

type SpeechBubbleRuntimeProps = SpeechBubbleProps &
  Omit<React.HTMLAttributes<HTMLDivElement>, keyof SpeechBubbleProps>;

const tones = {
  white: { background: "var(--paper)", color: "var(--ink-900)", border: "var(--ink-900)" },
  blue: { background: "var(--action)", color: "#fff", border: "var(--ink-900)" },
  yellow: {
    background: "var(--yellow-500)",
    color: "var(--ink-900)",
    border: "var(--ink-900)",
  },
  tint: {
    background: "var(--blue-100)",
    color: "var(--ink-900)",
    border: "var(--blue-200)",
  },
} as const;

function tailGeometry(tail: NonNullable<SpeechBubbleProps["tail"]>) {
  if (tail === "left" || tail === "right") {
    return {
      style: {
        width: 22,
        height: 32,
        top: "50%",
        transform: "translateY(-50%)",
        ...(tail === "left" ? { left: -18 } : { right: -18 }),
      },
      viewBox: "0 0 22 32",
      fillPath:
        tail === "left" ? "M 21 1 L 1 16 L 21 31 Z" : "M 1 1 L 21 16 L 1 31 Z",
      strokePath:
        tail === "left" ? "M 18 1 L 1 16 L 18 31" : "M 4 1 L 21 16 L 4 31",
    };
  }
  return {
    style: {
      width: 32,
      height: 22,
      top: "calc(100% - 4px)",
      ...(tail === "bottom-right" ? { right: 24 } : { left: 24 }),
    },
    viewBox: "0 0 32 22",
    fillPath: "M 1 1 L 16 21 L 31 1 Z",
    strokePath: "M 1 4 L 16 21 L 31 4",
  };
}

/**
 * The signature outlined speech bubble motif — friendly one-liners and coach tips.
 * @startingPoint section="Core" subtitle="Outlined speech-bubble motif" viewport="360x140"
 */
export function SpeechBubble(props: SpeechBubbleProps) {
  const {
    children,
    tone = "white",
    tail = "bottom-left",
    size = "md",
    style,
    ...rest
  } = props as SpeechBubbleRuntimeProps;
  const colors = tones[tone] || tones.white;
  const padding =
    size === "sm" ? "10px 14px" : size === "lg" ? "18px 24px" : "14px 18px";
  const fontSize =
    size === "sm"
      ? "var(--fs-body-sm)"
      : size === "lg"
        ? "var(--fs-title)"
        : "var(--fs-body)";
  const geometry = tailGeometry(tail);

  return (
    <div
      data-speech-bubble
      style={{
        position: "relative",
        display: "inline-block",
        maxWidth: "100%",
        minWidth: 0,
        ...style,
      }}
      {...rest}
    >
      <svg
        data-speech-bubble-tail={tail}
        aria-hidden="true"
        viewBox={geometry.viewBox}
        style={{
          position: "absolute",
          zIndex: 2,
          overflow: "visible",
          ...geometry.style,
        }}
      >
        <path
          data-speech-bubble-tail-fill
          d={geometry.fillPath}
          fill={colors.background}
          stroke="none"
        />
        <path
          data-speech-bubble-tail-stroke
          d={geometry.strokePath}
          fill="none"
          stroke={colors.border}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      </svg>
      <div
        data-speech-bubble-body
        style={{
          position: "relative",
          zIndex: 1,
          boxSizing: "border-box",
          maxWidth: 340,
          minWidth: 0,
          background: colors.background,
          color: colors.color,
          border: `2.5px solid ${colors.border}`,
          borderRadius: "var(--bmh-radius-xl)",
          padding,
          fontFamily: "var(--font-display)",
          fontWeight: 600,
          fontSize,
          lineHeight: 1.3,
          boxShadow: "var(--bmh-shadow-sm)",
          overflowWrap: "anywhere",
        }}
      >
        {children}
      </div>
    </div>
  );
}
