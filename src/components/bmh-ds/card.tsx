"use client";

import React from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  /** Inner padding. @default "md" */
  padding?: "none" | "sm" | "md" | "lg";
  /** Enable hover-lift + pop shadow for clickable cards. @default false */
  interactive?: boolean;
  /** Use the light blue tint surface instead of white. @default false */
  tint?: boolean;
  /** Use the bold 2.5px ink outline instead of a hairline. @default false */
  outline?: boolean;
  /** Corner radius token. @default "lg" */
  radius?: "md" | "lg" | "xl" | "2xl";
}

/**
 * Soft-rounded surface container with subtle shadow — the base for panels and tiles.
 * @startingPoint section="Core" subtitle="Soft-rounded surface card" viewport="360x200"
 */
export function Card({
  children,
  padding = "md",
  interactive = false,
  tint = false,
  outline = false,
  radius = "lg",
  onClick,
  style,
  ...rest
}: CardProps) {
  const [hover, setHover] = React.useState(false);
  const innerPadding = {
    none: "0",
    sm: "var(--space-4)",
    md: "var(--space-6)",
    lg: "var(--space-8)",
  }[padding];

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: tint ? "var(--surface-tint)" : "var(--surface-card)",
        border: outline
          ? "2.5px solid var(--ink-900)"
          : "1px solid var(--border-card)",
        borderRadius: `var(--bmh-radius-${radius})`,
        padding: innerPadding,
        boxShadow: interactive && hover ? "var(--shadow-pop)" : "var(--bmh-shadow-sm)",
        transform: interactive && hover ? "translateY(-3px)" : "none",
        cursor: interactive ? "pointer" : "default",
        transition:
          "transform var(--dur) var(--ease-spring), box-shadow var(--dur) var(--bmh-ease-out)",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
