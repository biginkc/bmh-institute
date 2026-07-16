"use client";

import React from "react";

import { Mascot, type MascotProps } from "./mascot";
import { OfficialLogoMark } from "./official-logo-mark";

export interface LogoProps {
  /** Render the official supplied logo SVG (shield crest + script wordmark). Set false for the legacy Andrea-sprite + Baloo lockup. @default true */
  official?: boolean;
  /** Sprite folder relative to the page. @default "/brand/mascot" */
  base?: string;
  /** Wordmark font-size, px; the head renders at 2x (matches the kit lockup: 42px head / 21px text). @default 36 */
  height?: number;
  /** Show Andrea's headset headshot in the lockup. @default true */
  mascot?: boolean;
  /** Render in a single currentColor (for dark/photo backgrounds). @default false */
  mono?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

type LogoRuntimeProps = LogoProps &
  Omit<React.HTMLAttributes<HTMLElement>, keyof LogoProps>;

type RuntimeMascotProps = MascotProps &
  Omit<React.ImgHTMLAttributes<HTMLImageElement>, keyof MascotProps>;

const RuntimeMascot = Mascot as React.ComponentType<RuntimeMascotProps>;

/**
 * The official BMH Institute logo lockup — Andrea's headset head + "BMH Institute" wordmark.
 * @startingPoint section="Brand" subtitle="BMH Institute logo lockup with Andrea" viewport="360x100"
 */
export function Logo(props: LogoProps) {
  const {
    official = true,
    base = "/brand/mascot",
    height = 36,
    mascot = true,
    mono = false,
    onClick,
    style,
    ...rest
  } = props as LogoRuntimeProps;
  const ink = mono ? "currentColor" : "var(--ink-900)";
  const blue = mono ? "currentColor" : "var(--blue-500)";
  const content = official ? (
    <OfficialLogoMark
      height={height * 1.6}
      style={{ color: mono ? "currentColor" : "var(--ink-900)", flexShrink: 0 }}
    />
  ) : (
    <>
      {mascot && (
        <RuntimeMascot
          src={`${base}/logo-head.png`}
          height={height * 2}
          alt="Andrea"
          style={{ flexShrink: 0 }}
        />
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
  const rootStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: height * 0.48,
    background: "none",
    border: "none",
    padding: 0,
    cursor: onClick ? "pointer" : "default",
    ...style,
  };

  return onClick ? (
    <button type="button" onClick={onClick} style={rootStyle} {...rest}>
      {content}
    </button>
  ) : (
    <span style={rootStyle} {...rest}>{content}</span>
  );
}
