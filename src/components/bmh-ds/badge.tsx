import React from "react";

export interface BadgeProps {
  children: React.ReactNode;
  /** @default "blue" */
  tone?: "blue" | "yellow" | "orange" | "green" | "red" | "neutral" | "solid";
  /** @default "md" */
  size?: "sm" | "md";
  /** Show a leading status dot. */
  dot?: boolean;
  /** Optional leading icon element. */
  icon?: React.ReactNode;
}

const tones = {
  blue: { background: "var(--action-soft)", color: "var(--blue-700)" },
  yellow: { background: "var(--yellow-100)", color: "var(--yellow-600)" },
  orange: { background: "var(--orange-100)", color: "var(--orange-600)" },
  green: { background: "var(--success-soft)", color: "var(--green-500)" },
  red: { background: "var(--danger-soft)", color: "var(--red-500)" },
  neutral: { background: "var(--ink-100)", color: "var(--ink-700)" },
  solid: { background: "var(--ink-900)", color: "var(--paper)" },
} as const;

/** Rounded status/label pill — durations, "New", "In progress", counts. */
export function Badge({
  children,
  tone = "blue",
  size = "md",
  dot = false,
  icon,
}: BadgeProps) {
  const colors = tones[tone];
  const padding = size === "sm" ? "3px 8px" : "5px 11px";
  const fontSize = size === "sm" ? "11px" : "var(--fs-body-sm)";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        padding,
        borderRadius: "var(--radius-pill)",
        background: colors.background,
        color: colors.color,
        fontFamily: "var(--font-body)",
        fontWeight: "var(--fw-extrabold)",
        fontSize,
        lineHeight: 1,
        letterSpacing: ".01em",
        whiteSpace: "nowrap",
      }}
    >
      {dot && (
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: colors.color,
          }}
        />
      )}
      {icon && <span style={{ display: "inline-flex" }}>{icon}</span>}
      {children}
    </span>
  );
}
