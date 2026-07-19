export type ReportSourcePage<T> = {
  data: T[] | null;
  error: unknown;
  count: number | null;
};

export type ReportSourceResult<T> =
  | { ok: true; rows: T[] }
  | { ok: false };

type PageRequest = {
  afterId: string | null;
  limit: number;
};

export type ReportCursorValue = string | number;

type CursorPageRequest<TCursor extends readonly ReportCursorValue[]> = {
  after: TCursor | null;
  limit: number;
};

const DEFAULT_PAGE_SIZE = 1_000;
const DEFAULT_MAX_ROWS = 20_000;

/**
 * Read a report source completely through the hosted Data API row ceiling.
 *
 * Callers must request an exact count, order by the immutable, unique `id`
 * column, and apply `gt(id, afterId)` when a cursor is present. The count and
 * ordering checks make a server-capped, truncated, duplicated, shifted, or
 * malformed source fail closed instead of producing a plausible but
 * incomplete report.
 */
export async function loadAllReportRowsById<T extends { id: string }>(
  queryPage: (
    request: PageRequest,
  ) => PromiseLike<ReportSourcePage<T>>,
  options: { pageSize?: number; maxRows?: number } = {},
): Promise<ReportSourceResult<T>> {
  return loadAllReportRowsByCursor<T, readonly [string]>(
    ({ after, limit }) =>
      queryPage({ afterId: after === null ? null : after[0], limit }),
    (row) => {
      if (typeof row?.id !== "string" || row.id.length === 0) {
        throw new TypeError("Report source ID must be a non-empty string.");
      }
      return [row.id] as const;
    },
    options,
  );
}

/**
 * Cursor-paginate a source whose stable unique key spans multiple columns.
 * The callback must apply the cursor filter to the database query before
 * requesting an exact count, so every page reports the number of rows still
 * available from that cursor. Invalid, repeated, shifted, or server-capped
 * pages fail closed.
 */
export async function loadAllReportRowsByCursor<
  T,
  TCursor extends readonly ReportCursorValue[],
>(
  queryPage: (
    request: CursorPageRequest<TCursor>,
  ) => PromiseLike<ReportSourcePage<T>>,
  cursorFor: (row: T) => TCursor,
  options: { pageSize?: number; maxRows?: number } = {},
): Promise<ReportSourceResult<T>> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS;
  if (
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > DEFAULT_PAGE_SIZE ||
    !Number.isSafeInteger(maxRows) ||
    maxRows < 1
  ) {
    return { ok: false };
  }

  const rows: T[] = [];
  let after: TCursor | null = null;
  let expectedTotal: number | null = null;
  const maxCalls = Math.ceil(maxRows / pageSize) + 1;

  for (let call = 0; call < maxCalls; call++) {
    const limit = Math.min(pageSize, maxRows - rows.length + 1);
    let page: ReportSourcePage<T>;
    try {
      page = await queryPage({ after, limit });
    } catch {
      return { ok: false };
    }

    if (
      page.error ||
      !Array.isArray(page.data) ||
      !Number.isSafeInteger(page.count) ||
      page.count === null ||
      page.count < 0
    ) {
      return { ok: false };
    }

    if (expectedTotal === null) {
      expectedTotal = page.count;
      if (expectedTotal > maxRows) return { ok: false };
    }

    const remaining = expectedTotal - rows.length;
    if (
      remaining < 0 ||
      page.count !== remaining ||
      page.data.length !== Math.min(limit, remaining)
    ) {
      return { ok: false };
    }

    for (const row of page.data) {
      let cursor: TCursor;
      try {
        cursor = cursorFor(row);
      } catch {
        return { ok: false };
      }
      const comparison = after === null ? 1 : compareCursor(cursor, after);
      if (!isValidCursor(cursor) || !Number.isFinite(comparison) || comparison <= 0) {
        return { ok: false };
      }
      rows.push(row);
      after = cursor;
      if (rows.length > expectedTotal) return { ok: false };
    }

    if (rows.length === expectedTotal) {
      return { ok: true, rows };
    }
  }

  return { ok: false };
}

function isValidCursor(
  cursor: readonly ReportCursorValue[],
): cursor is readonly ReportCursorValue[] {
  return (
    Array.isArray(cursor) &&
    cursor.length > 0 &&
    cursor.every(
      (value) =>
        (typeof value === "string" && value.length > 0) ||
        (typeof value === "number" && Number.isFinite(value)),
    )
  );
}

function compareCursor(
  left: readonly ReportCursorValue[],
  right: readonly ReportCursorValue[],
): number {
  if (left.length !== right.length) return Number.NaN;
  for (let index = 0; index < left.length; index++) {
    const leftValue = left[index];
    const rightValue = right[index];
    if (typeof leftValue !== typeof rightValue) return Number.NaN;
    if (leftValue < rightValue) return -1;
    if (leftValue > rightValue) return 1;
  }
  return 0;
}
