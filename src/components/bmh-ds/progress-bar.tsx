import React from "react";

export interface ProgressBarProps {
  /** Current value. @default 0 */
  value?: number;
  /** @default 100 */
  max?: number;
  /** Track height. @default "md" */
  size?: "sm" | "md" | "lg";
  /** Fill color. @default "yellow" */
  tone?: "yellow" | "blue" | "green" | "orange";
  /** Show a trailing percentage label. @default false */
  showLabel?: boolean;
}

/** The signature golden-yellow lesson progress bar. */
export function ProgressBar({
  value = 0,
  max = 100,
  size = "md",
  tone = "yellow",
  showLabel = false,
}: ProgressBarProps) {
  const rawPercentage = max > 0 ? (value / max) * 100 : 0;
  const percentage = Math.max(0, Math.min(100, rawPercentage));
  const height = { sm: 5, md: 8, lg: 12 }[size];
  const fill = {
    yellow: "var(--progress-fill)",
    blue: "var(--action)",
    green: "var(--success)",
    orange: "var(--orange-500)",
  }[tone];

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <div
        style={{
          flex: 1,
          height,
          background: "var(--progress-track)",
          borderRadius: "var(--radius-pill)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${percentage}%`,
            height: "100%",
            background: fill,
            borderRadius: "var(--radius-pill)",
            transition: "width var(--dur-slow) var(--bmh-ease-out)",
          }}
        />
      </div>
      {showLabel && (
        <span
          style={{
            fontFamily: "var(--font-body)",
            fontWeight: "var(--fw-extrabold)",
            fontSize: "var(--fs-caption)",
            color: "var(--text-muted)",
            minWidth: 34,
            textAlign: "right",
          }}
        >
          {Math.round(percentage)}%
        </span>
      )}
    </div>
  );
}
