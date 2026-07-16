"use client";

import React from "react";

export interface IconButtonProps {
  /** A Lucide (or any) icon element. */
  children: React.ReactNode;
  /** Accessible label — required for icon-only controls. */
  label: string;
  /** @default "soft" */
  variant?: "soft" | "solid" | "dark" | "outline" | "plain";
  /** @default "md" */
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

const variants = {
  soft: {
    background: "var(--action-soft)",
    hover: "var(--blue-200)",
    color: "var(--blue-600)",
    border: "transparent",
  },
  solid: {
    background: "var(--action)",
    hover: "var(--action-hover)",
    color: "#fff",
    border: "transparent",
  },
  dark: {
    background: "var(--ink-900)",
    hover: "#000",
    color: "#fff",
    border: "transparent",
  },
  outline: {
    background: "var(--paper)",
    hover: "var(--ink-050)",
    color: "var(--ink-900)",
    border: "var(--ink-900)",
  },
  plain: {
    background: "transparent",
    hover: "var(--ink-100)",
    color: "var(--ink-700)",
    border: "transparent",
  },
} as const;

/** Square icon-only button for toolbars and media controls. */
export function IconButton({
  children,
  variant = "soft",
  size = "md",
  label,
  disabled = false,
  onClick,
}: IconButtonProps) {
  const dimension = { sm: 32, md: 40, lg: 48 }[size];
  const [hover, setHover] = React.useState(false);
  const [press, setPress] = React.useState(false);
  const colors = variants[variant];

  return (
    <button
      type="button"
      aria-label={label}
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
        width: dimension,
        height: dimension,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "var(--bmh-radius-md)",
        border: `2.5px solid ${colors.border}`,
        background: hover && !disabled ? colors.hover : colors.background,
        color: colors.color,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        transform: press && !disabled ? "scale(.92)" : "none",
        transition:
          "background var(--dur) var(--bmh-ease-out), transform var(--dur-fast) var(--ease-spring)",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {children}
    </button>
  );
}
