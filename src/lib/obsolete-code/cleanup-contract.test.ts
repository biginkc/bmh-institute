import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("obsolete source cleanup contract", () => {
  it("does not reinstall the unused drag-and-drop packages", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(root, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const declared = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    expect(declared).not.toHaveProperty("@dnd-kit/core");
    expect(declared).not.toHaveProperty("@dnd-kit/sortable");
    expect(declared).not.toHaveProperty("@dnd-kit/utilities");
  });

  it("keeps the zero-import legacy UI primitives deleted", () => {
    const obsoletePrimitives = [
      "badge",
      "brand-lockup",
      "dialog",
      "dropdown-menu",
      "input",
      "select",
      "separator",
      "skeleton",
      "table",
    ];

    for (const primitive of obsoletePrimitives) {
      expect(
        existsSync(resolve(root, `src/components/ui/${primitive}.tsx`)),
        `${primitive}.tsx should stay deleted`,
      ).toBe(false);
    }
  });

  it("uses learner terminology for active monitoring and access modules", () => {
    expect(
      existsSync(resolve(root, "src/lib/learner-monitoring/summary.ts")),
    ).toBe(true);
    expect(
      existsSync(resolve(root, "src/lib/learner-access/status.ts")),
    ).toBe(true);
    expect(
      existsSync(resolve(root, "src/lib/pilot-monitoring/summary.ts")),
    ).toBe(false);
    expect(
      existsSync(resolve(root, "src/lib/pilot-cohort/status.ts")),
    ).toBe(false);
  });
});
