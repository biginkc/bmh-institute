import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const globalsCss = readFileSync(join(process.cwd(), "src/app/globals.css"), {
  encoding: "utf8",
});
const packageJson = JSON.parse(
  readFileSync(join(process.cwd(), "package.json"), {
    encoding: "utf8",
  }),
) as {
  dependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

describe("BMH shared design tokens", () => {
  it("depends on the shared Sandra Design System token package", () => {
    expect(packageJson.dependencies?.["@sandra/tokens"]).toBe(
      "github:biginkc/sandra-design-system#main",
    );
  });

  it("uses webpack for local dev so linked design-system CSS resolves", () => {
    expect(packageJson.scripts?.dev).toBe("next dev --webpack -p 3100");
  });

  it("imports shared tokens instead of owning a local token fork", () => {
    expect(globalsCss).toContain('@import "@sandra/tokens/theme.css";');
    expect(globalsCss).not.toMatch(/^:root\s*{/m);
    expect(globalsCss).not.toContain("--background: #fdfcfb;");
  });

  it("exposes shared status and alert utilities for cross-app UI reuse", () => {
    const tokensPackageJsonPath = require.resolve("@sandra/tokens/package.json");
    const tokensPackageJson = JSON.parse(
      readFileSync(tokensPackageJsonPath, { encoding: "utf8" }),
    ) as { exports?: Record<string, string> };
    const themeCssExport = tokensPackageJson.exports?.["./theme.css"];
    expect(themeCssExport).toBeDefined();

    const sharedTokensCss = readFileSync(
      join(dirname(tokensPackageJsonPath), themeCssExport as string),
      { encoding: "utf8" },
    );

    expect(sharedTokensCss).toContain(
      "--color-status-hot-bg: var(--status-hot-bg);",
    );
    expect(globalsCss).toContain(
      '@import "@sandra/tokens/theme.css";',
    );
    expect(sharedTokensCss).toContain(
      "--color-alert-healthy: var(--alert-healthy);",
    );
  });
});
