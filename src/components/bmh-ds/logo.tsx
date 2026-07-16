"use client";

import React from "react";

import { Mascot } from "./mascot";

export interface LogoProps {
  /** Sprite folder relative to the page. @default "assets/mascot" */
  base?: string;
  /** Wordmark font-size / lockup height driver, px. @default 36 */
  height?: number;
  /** Show Andrea's headset headshot in the lockup. @default true */
  mascot?: boolean;
  /** Render in a single currentColor (for dark/photo backgrounds). @default false */
  mono?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

/**
 * The official BMH Institute logo lockup — Andrea's headset head + "BMH Institute" wordmark.
 * @startingPoint section="Brand" subtitle="BMH Institute logo lockup with Andrea" viewport="360x100"
 */
export function Logo({
  base = "/brand/mascot",
  height = 36,
  mascot = true,
  mono = false,
  onClick,
}: LogoProps) {
  const ink = mono ? "currentColor" : "var(--ink-900)";
  const blue = mono ? "currentColor" : "var(--blue-500)";
  const content = (
    <>
      {mascot && (
        <span style={{ flexShrink: 0 }}>
          <Mascot
            src={`${base}/logo-head.png`}
            height={height * 1.34}
            alt="Andrea"
          />
        </span>
      )}
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 800,
          fontSize: height,
          lineHeight: 1,
          letterSpacing: "-.01em",
          color: ink,
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ color: blue }}>BMH</span> Institute
      </span>
    </>
  );
  const style: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: height * 0.32,
    background: "none",
    border: "none",
    padding: 0,
    cursor: onClick ? "pointer" : "default",
  };

  return onClick ? (
    <button type="button" onClick={onClick} style={style}>
      {content}
    </button>
  ) : (
    <span style={style}>{content}</span>
  );
}
