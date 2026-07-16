"use client";

import { Check, Lock } from "lucide-react";
import React from "react";

import { ProgressBar } from "./progress-bar";

export interface ChapterItemProps {
  /** Number shown in the status circle when not done/locked. */
  index: number | string;
  title: string;
  /** Meta line shown when there's no in-progress bar, e.g. "8 min". */
  meta?: string;
  /** @default "todo" */
  status?: "todo" | "done" | "locked";
  /** In-progress percentage (0–100); shows the yellow bar when > 0. */
  progress?: number;
  /** Highlighted current row. @default false */
  active?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

type ChapterItemRuntimeProps = ChapterItemProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof ChapterItemProps>;

/** A row in the course "Chapters" list, with status marker + progress. */
export function ChapterItem(props: ChapterItemProps) {
  const {
    index,
    title,
    meta,
    status = "todo",
    progress = 0,
    active = false,
    onClick,
    style,
    ...rest
  } = props as ChapterItemRuntimeProps;
  const [hover, setHover] = React.useState(false);
  const locked = status === "locked";
  const done = status === "done";
  const mark = {
    background: done
      ? "var(--success)"
      : active
        ? "var(--action)"
        : locked
          ? "var(--ink-100)"
          : "var(--paper)",
    color: done || active ? "#fff" : "var(--ink-500)",
    border: done || active ? "none" : "2px solid var(--ink-300)",
  };

  return (
    <button
      type="button"
      onClick={locked ? undefined : onClick}
      disabled={locked}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "13px",
        width: "100%",
        textAlign: "left",
        padding: "13px 15px",
        border: "none",
        borderRadius: "var(--bmh-radius-md)",
        background: active
          ? "var(--surface-tint)"
          : hover && !locked
            ? "var(--ink-050)"
            : "transparent",
        boxShadow: active ? "inset 3px 0 0 var(--action)" : "none",
        cursor: locked ? "not-allowed" : "pointer",
        opacity: locked ? 0.6 : 1,
        transition: "background var(--dur) var(--bmh-ease-out)",
        ...style,
      }}
      {...rest}
    >
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-display)",
          fontWeight: 800,
          fontSize: 13,
          ...mark,
        }}
      >
        {done ? (
          <Check aria-hidden="true" size={16} />
        ) : locked ? (
          <Lock aria-hidden="true" size={13} />
        ) : (
          index
        )}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: "block",
            fontFamily: "var(--font-body)",
            fontWeight: 800,
            fontSize: "var(--fs-body)",
            color: "var(--ink-900)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {title}
        </span>
        {progress > 0 && !done ? (
          <span style={{ display: "block", marginTop: 6 }}>
            <ProgressBar value={progress} size="sm" />
          </span>
        ) : (
          meta && (
            <span
              style={{
                display: "block",
                marginTop: 2,
                fontFamily: "var(--font-body)",
                fontWeight: 700,
                fontSize: "var(--fs-caption)",
                color: "var(--text-muted)",
              }}
            >
              {meta}
            </span>
          )
        )}
      </span>
    </button>
  );
}
