import { describe, expect, it, vi } from "vitest";

import { loadAllReportRowsById } from "./report-source-pagination";

function sourceRows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    value: index,
  }));
}

describe("report source pagination", () => {
  it("loads more than 1,000 IDs through a ragged final page", async () => {
    const source = sourceRows(1_237);
    const queryPage = vi.fn(
      async ({ afterId, limit }: { afterId: string | null; limit: number }) => {
        const remaining = source.filter(
          (row) => afterId === null || row.id > afterId,
        );
        return {
          data: remaining.slice(0, limit),
          error: null,
          count: remaining.length,
        };
      },
    );

    const result = await loadAllReportRowsById(queryPage);

    expect(result).toEqual({ ok: true, rows: source });
    expect(queryPage).toHaveBeenCalledTimes(2);
    expect(queryPage).toHaveBeenNthCalledWith(1, {
      afterId: null,
      limit: 1_000,
    });
    expect(queryPage).toHaveBeenNthCalledWith(2, {
      afterId: source[999].id,
      limit: 1_000,
    });
  });

  it("fails closed on duplicate or out-of-order IDs", async () => {
    const ordered = sourceRows(2);
    const repeated = ordered[0];
    await expect(
      loadAllReportRowsById(
        async () => ({ data: [repeated, repeated], error: null, count: 2 }),
        { pageSize: 2, maxRows: 4 },
      ),
    ).resolves.toEqual({ ok: false });
    await expect(
      loadAllReportRowsById(
        async () => ({
          data: [ordered[1], ordered[0]],
          error: null,
          count: 2,
        }),
        { pageSize: 2, maxRows: 4 },
      ),
    ).resolves.toEqual({ ok: false });
  });

  it("fails closed on null, non-string, or empty IDs", async () => {
    for (const id of [null, 42, ""]) {
      await expect(
        loadAllReportRowsById(async () => ({
          data: [{ id }] as unknown as Array<{ id: string }>,
          error: null,
          count: 1,
        })),
      ).resolves.toEqual({ ok: false });
    }
  });

  it("fails closed when the bounded source contains too many rows", async () => {
    const source = sourceRows(5);
    await expect(
      loadAllReportRowsById(
        async ({ afterId, limit }) => {
          const remaining = source.filter(
            (row) => afterId === null || row.id > afterId,
          );
          return {
            data: remaining.slice(0, limit),
            error: null,
            count: remaining.length,
          };
        },
        { pageSize: 3, maxRows: 4 },
      ),
    ).resolves.toEqual({ ok: false });
  });

  it("fails closed when the server caps a page below the requested limit", async () => {
    const source = sourceRows(1_237);
    await expect(
      loadAllReportRowsById(async ({ afterId, limit }) => {
        const remaining = source.filter(
          (row) => afterId === null || row.id > afterId,
        );
        return {
          data: remaining.slice(0, Math.min(limit, 500)),
          error: null,
          count: remaining.length,
        };
      }),
    ).resolves.toEqual({ ok: false });
  });

  it("fails closed on query errors, throws, and oversized pages", async () => {
    await expect(
      loadAllReportRowsById(async () => ({
        data: null,
        error: { code: "500" },
        count: null,
      })),
    ).resolves.toEqual({ ok: false });
    await expect(
      loadAllReportRowsById(async () => {
        throw new Error("network unavailable");
      }),
    ).resolves.toEqual({ ok: false });
    await expect(
      loadAllReportRowsById(
        async () => ({ data: sourceRows(3), error: null, count: 3 }),
        { pageSize: 2 },
      ),
    ).resolves.toEqual({ ok: false });
  });
});
