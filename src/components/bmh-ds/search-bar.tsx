"use client";

import { Search } from "lucide-react";
import React from "react";

export interface SearchBarProps {
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Override the leading icon. */
  icon?: React.ReactNode;
  inputProps?: Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange" | "placeholder"
  >;
}

type SearchBarRuntimeProps = SearchBarProps &
  Omit<React.HTMLAttributes<HTMLDivElement>, keyof SearchBarProps>;

/** Pill-shaped search field used in the course catalog and dashboard header. */
export function SearchBar(props: SearchBarProps) {
  const {
    placeholder = "Search lessons…",
    value,
    onChange,
    icon,
    inputProps,
    style,
    ...rest
  } = props as SearchBarRuntimeProps;
  const [focus, setFocus] = React.useState(false);
  const { onFocus, onBlur, ...inputRest } = inputProps ?? {};

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "11px 18px",
        background: "var(--paper)",
        borderRadius: "var(--radius-pill)",
        border: `2px solid ${focus ? "var(--action)" : "var(--ink-200)"}`,
        boxShadow: focus
          ? "0 0 0 4px var(--focus-ring)"
          : "var(--bmh-shadow-xs)",
        transition:
          "border-color var(--dur) var(--bmh-ease-out), box-shadow var(--dur) var(--bmh-ease-out)",
        ...style,
      }}
      {...rest}
    >
      <span style={{ display: "inline-flex", color: "var(--ink-400)" }}>
        {icon || <Search aria-hidden="true" size={18} />}
      </span>
      <input
        {...inputRest}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-label={inputProps?.["aria-label"] ?? placeholder}
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
      />
    </div>
  );
}
