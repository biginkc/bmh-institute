"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";

import {
  Badge,
  ProgressBar,
  Table,
  type BadgeProps,
  type TableColumn,
} from "@/components/bmh-ds";

type CellPresentation =
  | "badge"
  | "external-link"
  | "link"
  | "progress"
  | "stacked"
  | "text";

export type AdminDataColumn = TableColumn & {
  presentation?: CellPresentation;
  hrefKey?: string;
  secondaryKey?: string;
  toneKey?: string;
  muted?: boolean;
  tabular?: boolean;
  suffix?: string;
};

export type AdminTableRow = Record<string, unknown>;

export function AdminDataTable({
  columns,
  rows,
  empty,
  rowKey = "id",
  rowHrefKey,
  minWidth,
  testId,
}: {
  columns: AdminDataColumn[];
  rows: AdminTableRow[];
  empty?: string;
  rowKey?: string;
  rowHrefKey?: string;
  minWidth?: string;
  testId?: string;
}) {
  const router = useRouter();
  const cells = Object.fromEntries(
    columns
      .filter((column) => column.presentation || column.muted || column.tabular)
      .map((column) => [
        column.key,
        (row: AdminTableRow) => renderCell(column, row),
      ]),
  );

  return (
    <div data-testid={testId} style={{ width: "100%", overflowX: "auto" }}>
      <div style={{ minWidth }}>
        <Table
          columns={columns.map(toTableColumn)}
          rows={rows}
          rowKey={rowKey}
          empty={empty}
          cell={cells}
          onRowClick={
            rowHrefKey
              ? (row) => {
                  const href = row[rowHrefKey];
                  if (typeof href === "string") router.push(href);
                }
              : undefined
          }
        />
      </div>
    </div>
  );
}

function toTableColumn(column: AdminDataColumn): TableColumn {
  return {
    key: column.key,
    label: column.label,
    align: column.align,
    width: column.width,
  };
}

function renderCell(column: AdminDataColumn, row: AdminTableRow) {
  const value = displayValue(row[column.key], column.suffix);
  const style: CSSProperties = {
    color: column.muted ? "var(--text-muted)" : undefined,
    fontVariantNumeric: column.tabular ? "tabular-nums" : undefined,
  };

  if (column.presentation === "link") {
    const href = column.hrefKey ? row[column.hrefKey] : undefined;
    return typeof href === "string" ? (
      <Link
        href={href}
        onClick={(event) => event.stopPropagation()}
        style={{ color: "var(--action)", textDecoration: "none" }}
      >
        {value}
      </Link>
    ) : (
      <span style={style}>{value}</span>
    );
  }

  if (column.presentation === "external-link") {
    const href = column.hrefKey ? row[column.hrefKey] : undefined;
    return typeof href === "string" && href ? (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={(event) => event.stopPropagation()}
        style={{ color: "var(--action)", textDecoration: "none" }}
      >
        {value}
      </a>
    ) : (
      <span style={style}>{value}</span>
    );
  }

  if (column.presentation === "badge") {
    const toneValue = column.toneKey ? row[column.toneKey] : "neutral";
    return (
      <Badge tone={badgeTone(toneValue)} size="sm">
        {value}
      </Badge>
    );
  }

  if (column.presentation === "stacked") {
    const secondary = column.secondaryKey ? row[column.secondaryKey] : null;
    return (
      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span>{value}</span>
        {secondary ? (
          <span style={{ color: "var(--text-muted)", fontSize: "var(--fs-caption)" }}>
            {String(secondary)}
          </span>
        ) : null}
      </span>
    );
  }

  if (column.presentation === "progress") {
    const numericValue = Number(row[column.key] ?? 0);
    return (
      <div style={{ minWidth: 130 }}>
        <ProgressBar value={numericValue} showLabel size="sm" />
      </div>
    );
  }

  return <span style={style}>{value}</span>;
}

function displayValue(value: unknown, suffix?: string) {
  if (value === null || value === undefined || value === "") return "-";
  return `${String(value)}${suffix ?? ""}`;
}

function badgeTone(value: unknown): BadgeProps["tone"] {
  if (
    value === "blue" ||
    value === "yellow" ||
    value === "orange" ||
    value === "green" ||
    value === "red" ||
    value === "solid"
  ) {
    return value;
  }
  return "neutral";
}
