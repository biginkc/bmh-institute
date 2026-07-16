"use client";

import React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode;
  /** Visual style. @default "primary" */
  variant?: "primary" | "secondary" | "ghost" | "dark" | "warm";
  /** @default "md" */
  size?: "sm" | "md" | "lg";
  /** Full-width button. @default false */
  block?: boolean;
  /** Icon element placed before the label. */
  iconLeft?: React.ReactNode;
  /** Icon element placed after the label. */
  iconRight?: React.ReactNode;
  disabled?: boolean;
}

const sizes = {
  sm: {
    padding: "8px 14px",
    font: "var(--fs-body-sm)",
    radius: "var(--bmh-radius-sm)",
    gap: "6px",
  },
  md: {
    padding: "11px 20px",
    font: "var(--fs-body)",
    radius: "var(--bmh-radius-md)",
    gap: "8px",
  },
  lg: {
    padding: "15px 28px",
    font: "var(--fs-title)",
    radius: "var(--bmh-radius-lg)",
    gap: "10px",
  },
} as const;

const variants = {
  primary: {
    background: "var(--action)",
    color: "var(--text-on-brand)",
    border: "2.5px solid transparent",
    shadow: "var(--bmh-shadow-sm)",
    hover: "var(--action-hover)",
  },
  secondary: {
    background: "var(--paper)",
    color: "var(--ink-900)",
    border: "2.5px solid var(--ink-900)",
    shadow: "none",
    hover: "var(--ink-050)",
  },
  ghost: {
    background: "transparent",
    color: "var(--action)",
    border: "2.5px solid transparent",
    shadow: "none",
    hover: "var(--action-soft)",
  },
  dark: {
    background: "var(--ink-900)",
    color: "var(--paper)",
    border: "2.5px solid var(--ink-900)",
    shadow: "var(--bmh-shadow-sm)",
    hover: "#000",
  },
  warm: {
    background: "var(--orange-500)",
    color: "var(--paper)",
    border: "2.5px solid transparent",
    shadow: "var(--bmh-shadow-sm)",
    hover: "var(--orange-600)",
  },
} as const;

/**
 * The BMH Institute action button — bold Nunito label, soft-rounded, gentle
 * press-bounce. `primary` = action blue, `dark` = the near-black CTA, `warm` = orange.
 * @startingPoint section="Core" subtitle="Bold, soft-rounded action button" viewport="360x120"
 */
export function Button({
  children,
  variant = "primary",
  size = "md",
  block = false,
  iconLeft,
  iconRight,
  disabled = false,
  type = "button",
  onClick,
  style,
  ...rest
}: ButtonProps) {
  const [hover, setHover] = React.useState(false);
  const [press, setPress] = React.useState(false);
  const dimensions = sizes[size];
  const colors = variants[variant];

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setPress(false);
      }}
      onMouseDown={() => setPress(true)}
      onMouseUp={() => setPress(false)}
      style={{
        display: block ? "flex" : "inline-flex",
        width: block ? "100%" : "auto",
        alignItems: "center",
        justifyContent: "center",
        gap: dimensions.gap,
        fontFamily: "var(--font-body)",
        fontWeight: "var(--fw-extrabold)",
        fontSize: dimensions.font,
        lineHeight: 1,
        letterSpacing: ".005em",
        padding: dimensions.padding,
        borderRadius: dimensions.radius,
        border: colors.border,
        background: hover && !disabled ? colors.hover : colors.background,
        color: colors.color,
        boxShadow: press ? "none" : colors.shadow,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        transform: press && !disabled ? "translateY(1px) scale(.98)" : "none",
        transition:
          "background var(--dur) var(--bmh-ease-out), transform var(--dur-fast) var(--ease-spring), box-shadow var(--dur) var(--bmh-ease-out)",
        WebkitTapHighlightColor: "transparent",
        ...style,
      }}
      {...rest}
    >
      {iconLeft && (
        <span style={{ display: "inline-flex", marginLeft: "-2px" }}>{iconLeft}</span>
      )}
      {children}
      {iconRight && (
        <span style={{ display: "inline-flex", marginRight: "-2px" }}>{iconRight}</span>
      )}
    </button>
  );
}
