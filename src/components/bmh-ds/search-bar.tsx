"use client";

import { Search } from "lucide-react";
import React from "react";

export interface SearchBarProps {
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Override the leading icon. */
  icon?: React.ReactNode;
}

/** Pill-shaped search field used in the course catalog and dashboard header. */
export function SearchBar({
  placeholder = "Search lessons…",
  value,
  onChange,
  icon,
}: SearchBarProps) {
  const [focus, setFocus] = React.useState(false);

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
      }}
    >
      <span style={{ display: "inline-flex", color: "var(--ink-400)" }}>
        {icon || <Search aria-hidden="true" size={18} />}
      </span>
      <input
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
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
