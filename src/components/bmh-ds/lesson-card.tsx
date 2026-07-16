"use client";

import { Lock, Play } from "lucide-react";
import React from "react";

import { ProgressBar } from "./progress-bar";

export interface LessonCardProps {
  /** Lesson title. */
  title: string;
  /** Small uppercase label above the title, e.g. "Lesson 5A". */
  eyebrow?: string;
  /** Meta line under the title, e.g. "8 min · 1.2k views". */
  meta?: string;
  /** Flat thumbnail background color. @default "blue" */
  tone?: "blue" | "yellow" | "orange" | "navy";
  /** Uploaded still / preview image URL. Falls back to a placeholder panel. */
  image?: string;
  /** Duration chip, e.g. "8:24". */
  duration?: string;
  /** Completion percentage (0–100). Omit to hide the bar. */
  progress?: number | null;
  /** A Badge element rendered in the thumbnail's top-left. */
  badge?: React.ReactNode;
  /** Renders a lock overlay and disables click. @default false */
  locked?: boolean;
  /** Andrea pose to place on the color panel (when no `image`): stand | wave | present | point | thinking | hips. */
  pose?: "stand" | "wave" | "present" | "point" | "thinking" | "hips";
  /** Sprite folder relative to the page, for `pose`. @default "/brand/mascot" */
  mascotBase?: string;
  onClick?: (e: React.MouseEvent) => void;
}

type LessonCardRuntimeProps = LessonCardProps &
  Omit<React.HTMLAttributes<HTMLDivElement>, keyof LessonCardProps>;

const thumbnailTones = {
  blue: "var(--thumb-blue)",
  yellow: "var(--thumb-yellow)",
  orange: "var(--thumb-orange)",
  navy: "var(--thumb-navy)",
} as const;

/**
 * The signature BMH lesson/video thumbnail card — the format used for every
 * upload preview and lesson tile.
 * @startingPoint section="Course" subtitle="Signature lesson thumbnail card" viewport="320x320"
 */
export function LessonCard(props: LessonCardProps) {
  const {
    title,
    eyebrow,
    meta,
    tone = "blue",
    image,
    duration,
    progress = null,
    badge,
    locked = false,
    pose,
    mascotBase = "/brand/mascot",
    onClick,
    onKeyDown,
    style,
    ...rest
  } = props as LessonCardRuntimeProps;
  const [hover, setHover] = React.useState(false);
  const dark = tone === "navy";
  const showPlay = locked || hover || (!pose && !image);

  return (
    <div
      onClick={locked ? undefined : onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick && !locked ? 0 : undefined}
      aria-disabled={onClick && locked ? true : undefined}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (
          onClick &&
          !locked &&
          !event.defaultPrevented &&
          (event.key === "Enter" || event.key === " ")
        ) {
          event.preventDefault();
          event.currentTarget.click();
        }
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        background: "var(--surface-card)",
        border: "1px solid var(--border-card)",
        borderRadius: "var(--bmh-radius-lg)",
        overflow: "hidden",
        boxShadow: hover && !locked ? "var(--shadow-pop)" : "var(--bmh-shadow-sm)",
        transform: hover && !locked ? "translateY(-4px)" : "none",
        cursor: locked ? "default" : "pointer",
        opacity: locked ? 0.72 : 1,
        transition:
          "transform var(--dur) var(--ease-spring), box-shadow var(--dur) var(--bmh-ease-out)",
        ...style,
      }}
      {...rest}
    >
      <div
        style={{
          position: "relative",
          aspectRatio: "16 / 10",
          background: thumbnailTones[tone] || thumbnailTones.blue,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {image ? (
          // Uploaded lesson stills have runtime URLs and fill the fixed thumbnail shell.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : pose ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${mascotBase}/pose-${pose}.png`}
            alt=""
            style={{
              position: "absolute",
              right: "7%",
              bottom: 0,
              height: "94%",
              objectFit: "contain",
              filter: "none",
            }}
          />
        ) : (
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: 13,
              color: dark ? "rgba(255,255,255,.55)" : "rgba(14,17,22,.4)",
              letterSpacing: ".04em",
            }}
          >
            ILLUSTRATION
          </span>
        )}

        {showPlay && (
          <div
            style={{
              position: "absolute",
              width: 52,
              height: 52,
              borderRadius: "50%",
              background: locked ? "var(--ink-900)" : "rgba(14,17,22,.82)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transform: hover && !locked ? "scale(1.08)" : "scale(1)",
              transition: "transform var(--dur) var(--ease-spring)",
            }}
          >
            {locked ? (
              <Lock aria-hidden="true" size={22} color="#fff" />
            ) : (
              <Play aria-hidden="true" size={22} color="#fff" fill="#fff" />
            )}
          </div>
        )}

        {duration && (
          <span
            style={{
              position: "absolute",
              right: 10,
              bottom: 10,
              padding: "3px 8px",
              background: "rgba(14,17,22,.82)",
              color: "#fff",
              borderRadius: "var(--bmh-radius-sm)",
              fontFamily: "var(--font-body)",
              fontWeight: 800,
              fontSize: 11,
            }}
          >
            {duration}
          </span>
        )}
        {badge && <div style={{ position: "absolute", left: 10, top: 10 }}>{badge}</div>}
      </div>

      <div
        style={{
          padding: "var(--space-4)",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
        }}
      >
        {eyebrow && (
          <span
            style={{
              fontFamily: "var(--font-body)",
              fontWeight: 800,
              fontSize: "var(--fs-overline)",
              letterSpacing: ".08em",
              textTransform: "uppercase",
              color: "var(--blue-600)",
            }}
          >
            {eyebrow}
          </span>
        )}
        <h3
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: "var(--fs-title)",
            lineHeight: 1.25,
            color: "var(--ink-900)",
          }}
        >
          {title}
        </h3>
        {meta && (
          <span
            style={{
              fontFamily: "var(--font-body)",
              fontWeight: 700,
              fontSize: "var(--fs-body-sm)",
              color: "var(--text-muted)",
            }}
          >
            {meta}
          </span>
        )}
        {progress !== null && progress !== undefined && (
          <div style={{ marginTop: "4px" }}>
            <ProgressBar value={progress} size="sm" />
          </div>
        )}
      </div>
    </div>
  );
}
