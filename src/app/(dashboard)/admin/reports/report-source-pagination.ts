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
  let afterId: string | null = null;
  let expectedTotal: number | null = null;
  const maxCalls = Math.ceil(maxRows / pageSize) + 1;

  for (let call = 0; call < maxCalls; call++) {
    const limit = Math.min(pageSize, maxRows - rows.length + 1);
    let page: ReportSourcePage<T>;
    try {
      page = await queryPage({ afterId, limit });
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
      if (
        !row ||
        typeof row.id !== "string" ||
        row.id.length === 0 ||
        (afterId !== null && row.id <= afterId)
      ) {
        return { ok: false };
      }
      rows.push(row);
      afterId = row.id;
      if (rows.length > expectedTotal) return { ok: false };
    }

    if (rows.length === expectedTotal) {
      return { ok: true, rows };
    }
  }

  return { ok: false };
}
