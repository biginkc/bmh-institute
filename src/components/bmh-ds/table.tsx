"use client";

import React, { useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any -- Public API copied verbatim from the source declaration. */
export interface TableColumn {
  /** Row property key (also used for the `cell` render map). */
  key: string;
  /** Column header label. */
  label: string;
  /** @default "left" */
  align?: "left" | "right" | "center";
  /** Optional fixed width (CSS value). */
  width?: string;
}

export interface TableProps {
  columns: TableColumn[];
  rows: Array<Record<string, any>>;
  /** Per-column render overrides: { [key]: (row) => ReactNode }. */
  cell?: Record<string, (row: any) => React.ReactNode>;
  /** Property used as the React key. @default "id" */
  rowKey?: string;
  /** Empty-state text. */
  empty?: React.ReactNode;
  onRowClick?: (row: any) => void;
}

type TableRuntimeProps = TableProps &
  Omit<React.HTMLAttributes<HTMLDivElement>, keyof TableProps>;

interface RowActionButtonProps {
  label: string;
  onActivate: () => void;
}

function RowActionButton({ label, onActivate }: RowActionButtonProps) {
  const [focused, setFocused] = useState(false);

  return (
    <button
      type="button"
      aria-label={label}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onClick={(event) => {
        event.stopPropagation();
        onActivate();
      }}
      style={
        focused
          ? {
              width: "auto",
              height: "auto",
              padding: "2px 8px",
              marginRight: 8,
              border: "2px solid var(--action)",
              borderRadius: "var(--bmh-radius-sm)",
              background: "var(--paper)",
              color: "var(--action)",
              font: "800 var(--fs-caption)/1.4 var(--font-body)",
              outline: "2px solid var(--action)",
              outlineOffset: 2,
            }
          : {
              position: "absolute",
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: "hidden",
              clip: "rect(0, 0, 0, 0)",
              whiteSpace: "nowrap",
              border: 0,
            }
      }
    >
      Open
    </button>
  );
}

/** Lightweight data table for admin lists and reports. */
export function Table(props: TableProps) {
  const {
    columns = [],
    rows = [],
    cell = {},
    rowKey = "id",
    empty = "Nothing here yet.",
    onRowClick,
    style,
    ...rest
  } = props as TableRuntimeProps;
  return (
    <div style={{ width: "100%", overflowX: "auto", ...style }} {...rest}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontFamily: "var(--font-body)",
        }}
      >
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                style={{
                  textAlign: column.align || "left",
                  padding: "10px 14px",
                  font: "800 11px var(--font-body)",
                  letterSpacing: ".06em",
                  textTransform: "uppercase",
                  color: "var(--text-muted)",
                  borderBottom: "1px solid var(--border-hairline)",
                  whiteSpace: "nowrap",
                  width: column.width,
                }}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                style={{
                  padding: "20px 14px",
                  color: "var(--text-muted)",
                  fontSize: "var(--fs-body-sm)",
                  fontWeight: 600,
                }}
              >
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => (
              <tr
                key={row[rowKey] ?? rowIndex}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                style={{
                  cursor: onRowClick ? "pointer" : "default",
                  transition: "background var(--dur) var(--bmh-ease-out)",
                }}
                onMouseEnter={(event) => {
                  if (onRowClick) event.currentTarget.style.background = "var(--ink-050)";
                }}
                onMouseLeave={(event) => {
                  if (onRowClick) event.currentTarget.style.background = "transparent";
                }}
              >
                {columns.map((column, columnIndex) => (
                  <td
                    key={column.key}
                    style={{
                      textAlign: column.align || "left",
                      padding: "13px 14px",
                      borderBottom:
                        rowIndex === rows.length - 1
                          ? "none"
                          : "1px solid var(--border-hairline)",
                      font: `${columnIndex === 0 ? 800 : 600} var(--fs-body-sm)/1.4 var(--font-body)`,
                      color: columnIndex === 0 ? "var(--ink-900)" : "var(--text-body)",
                    }}
                  >
                    {columnIndex === 0 && onRowClick ? (
                      <RowActionButton
                        label={`Open ${String(row[column.key] ?? `row ${rowIndex + 1}`)}`}
                        onActivate={() => onRowClick(row)}
                      />
                    ) : null}
                    {cell[column.key] ? cell[column.key](row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
