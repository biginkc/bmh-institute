import React from "react";

export interface SpeechBubbleProps {
  children: React.ReactNode;
  /** @default "white" */
  tone?: "white" | "blue" | "yellow" | "tint";
  /** Tail position. @default "bottom-left" */
  tail?: "bottom-left" | "bottom-right" | "left";
  /** @default "md" */
  size?: "sm" | "md" | "lg";
}

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

function tailStyles(
  tail: NonNullable<SpeechBubbleProps["tail"]>,
  background: string,
  border: string,
): { outline: React.CSSProperties; fill: React.CSSProperties } {
  if (tail === "left") {
    return {
      outline: {
        position: "absolute",
        width: 0,
        height: 0,
        top: 20,
        left: -16,
        borderTop: "11px solid transparent",
        borderBottom: "11px solid transparent",
        borderRight: `16px solid ${border}`,
      },
      fill: {
        position: "absolute",
        width: 0,
        height: 0,
        top: 24,
        left: -11,
        borderTop: "8px solid transparent",
        borderBottom: "8px solid transparent",
        borderRight: `12px solid ${background}`,
      },
    };
  }

  const outlineSide = tail === "bottom-right" ? { right: 24 } : { left: 24 };
  const fillSide = tail === "bottom-right" ? { right: 27 } : { left: 27 };

  return {
    outline: {
      position: "absolute",
      width: 0,
      height: 0,
      ...outlineSide,
      top: "100%",
      borderLeft: "11px solid transparent",
      borderRight: "11px solid transparent",
      borderTop: `16px solid ${border}`,
    },
    fill: {
      position: "absolute",
      width: 0,
      height: 0,
      ...fillSide,
      top: "calc(100% - 3px)",
      borderLeft: "8px solid transparent",
      borderRight: "8px solid transparent",
      borderTop: `12px solid ${background}`,
    },
  };
}

/**
 * The signature outlined speech bubble motif — friendly one-liners and coach tips.
 * @startingPoint section="Core" subtitle="Outlined speech-bubble motif" viewport="360x140"
 */
export function SpeechBubble({
  children,
  tone = "white",
  tail = "bottom-left",
  size = "md",
}: SpeechBubbleProps) {
  const colors = tones[tone];
  const padding =
    size === "sm" ? "10px 14px" : size === "lg" ? "18px 24px" : "14px 18px";
  const fontSize =
    size === "sm"
      ? "var(--fs-body-sm)"
      : size === "lg"
        ? "var(--fs-title)"
        : "var(--fs-body)";
  const triangle = tailStyles(tail, colors.background, colors.border);

  return (
    <div
      style={{
        position: "relative",
        display: "inline-block",
        maxWidth: 340,
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
      }}
    >
      {children}
      <span aria-hidden="true" style={triangle.outline} />
      <span aria-hidden="true" style={triangle.fill} />
    </div>
  );
}
