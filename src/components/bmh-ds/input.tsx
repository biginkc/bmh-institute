"use client";

import React from "react";

// @ts-expect-error The source contract intentionally narrows the native numeric `size` prop.
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Field label rendered above the control. */
  label?: string;
  /** Helper text below the field. */
  hint?: string;
  /** Error message — turns the border red and overrides hint. */
  error?: string;
  /** Leading icon element. */
  icon?: React.ReactNode;
  /** @default "md" */
  size?: "sm" | "md";
}

/** Soft-rounded text input with brand focus ring, optional label/hint/icon. */
export function Input({
  label,
  hint,
  error,
  icon,
  size = "md",
  type = "text",
  style,
  id,
  onFocus,
  onBlur,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  ...rest
}: InputProps) {
  const [focus, setFocus] = React.useState(false);
  const generatedId = React.useId();
  const inputId = id || generatedId;
  const messageId = `${inputId}-message`;
  const padding = size === "sm" ? "9px 12px" : "13px 15px";
  const border = error
    ? "var(--danger)"
    : focus
      ? "var(--action)"
      : "var(--ink-300)";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        fontFamily: "var(--font-body)",
      }}
    >
      {label && (
        <label
          htmlFor={inputId}
          style={{
            fontSize: "var(--fs-body-sm)",
            fontWeight: "var(--fw-bold)",
            color: "var(--ink-800)",
          }}
        >
          {label}
        </label>
      )}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding,
          background: "var(--paper)",
          border: `2px solid ${border}`,
          borderRadius: "var(--bmh-radius-md)",
          boxShadow: focus ? "0 0 0 4px var(--focus-ring)" : "none",
          transition:
            "border-color var(--dur) var(--bmh-ease-out), box-shadow var(--dur) var(--bmh-ease-out)",
          ...style,
        }}
      >
        {icon && <span style={{ display: "inline-flex", color: "var(--ink-400)" }}>{icon}</span>}
        <input
          id={inputId}
          type={type}
          aria-describedby={
            hint || error
              ? [ariaDescribedBy, messageId].filter(Boolean).join(" ")
              : ariaDescribedBy
          }
          aria-invalid={error ? true : ariaInvalid}
          onFocus={(event) => {
            setFocus(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocus(false);
            onBlur?.(event);
          }}
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            background: "transparent",
            fontFamily: "var(--font-body)",
            fontSize: "var(--fs-body)",
            fontWeight: 600,
            color: "var(--ink-900)",
            minWidth: 0,
          }}
          {...rest}
        />
      </div>
      {(hint || error) && (
        <span
          id={messageId}
          style={{
            fontSize: "var(--fs-caption)",
            fontWeight: 700,
            color: error ? "var(--danger)" : "var(--text-muted)",
          }}
        >
          {error || hint}
        </span>
      )}
    </div>
  );
}
