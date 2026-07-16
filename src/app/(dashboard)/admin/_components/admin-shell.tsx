import Link from "next/link";
import type { ReactNode } from "react";

import { Card } from "@/components/bmh-ds";

export function AdminPageHeader({
  title,
  description,
  actions,
  backHref,
  backLabel = "Back",
  eyebrow = "Admin",
}: {
  title: string;
  description?: string | null;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
  eyebrow?: string;
}) {
  return (
    <header style={{ marginBottom: 26 }}>
      {backHref ? (
        <Link
          href={backHref}
          style={{ color: "var(--action)", fontSize: 13, fontWeight: 800 }}
        >
          ← {backLabel}
        </Link>
      ) : null}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          marginTop: backHref ? 12 : 0,
        }}
      >
        <div>
          <p
            style={{
              color: "var(--text-muted)",
              fontFamily: "var(--font-body)",
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: ".1em",
              textTransform: "uppercase",
            }}
          >
            {eyebrow}
          </p>
          <h1
            style={{
              color: "var(--ink-900)",
              fontFamily: "var(--font-display)",
              fontSize: 34,
              fontWeight: 800,
              letterSpacing: "-.01em",
              lineHeight: 1.15,
              margin: "4px 0 2px",
            }}
          >
            {title}
          </h1>
          {description ? (
            <p
              style={{
                color: "var(--text-muted)",
                fontFamily: "var(--font-body)",
                fontSize: 15,
                fontWeight: 600,
              }}
            >
              {description}
            </p>
          ) : null}
        </div>
        {actions}
      </div>
    </header>
  );
}

export function AdminSectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 16,
        marginBottom: 14,
      }}
    >
      <div>
        <h2
          style={{
            color: "var(--ink-900)",
            fontFamily: "var(--font-display)",
            fontSize: 18,
            fontWeight: 700,
          }}
        >
          {title}
        </h2>
        {description ? (
          <p
            style={{
              color: "var(--text-muted)",
              fontFamily: "var(--font-body)",
              fontSize: 13,
              fontWeight: 600,
              marginTop: 2,
            }}
          >
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function AdminMetricCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: ReactNode;
  highlight?: boolean;
}) {
  return (
    <Card
      padding="md"
      style={
        highlight
          ? {
              background: "var(--warning-soft)",
              borderColor: "var(--yellow-500)",
            }
          : undefined
      }
    >
      <p
        style={{
          color: "var(--text-muted)",
          fontFamily: "var(--font-body)",
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        {label}
      </p>
      <p
        style={{
          color: "var(--ink-900)",
          fontFamily: "var(--font-display)",
          fontSize: 32,
          fontWeight: 800,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.1,
          marginTop: 4,
        }}
      >
        {value}
      </p>
    </Card>
  );
}
