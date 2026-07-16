import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COLLISION_MAPPINGS,
  EXPECTED_TOKENS,
  FONT_CONTRACTS,
  MASCOT_FILENAMES,
  MASCOT_SHA256,
  SOURCE_TOKEN_SHA256,
} from "./foundation-contract.fixture";

const projectRoot = process.cwd();
const stylesDir = join(projectRoot, "src/styles/bmh-ds");
const mascotDir = join(projectRoot, "public/brand/mascot");

function readProjectFile(path: string) {
  return readFileSync(join(projectRoot, path), "utf8");
}

function parseDeclarations(css: string) {
  return Object.fromEntries(
    Array.from(
      css.matchAll(/(--[A-Za-z0-9-]+)\s*:\s*([^;]+);/g),
      ([, name, value]) => [name, value.trim()],
    ),
  );
}

describe("BMH Institute design-system foundation", () => {
  it("imports only the additive variable token files", () => {
    const globalsCss = readProjectFile("src/app/globals.css");
    const sandraImport = '@import "@sandra/tokens/theme.css";';
    const imports = [
      '@import "../styles/bmh-ds/colors.css";',
      '@import "../styles/bmh-ds/typography.css";',
      '@import "../styles/bmh-ds/spacing.css";',
    ];

    expect(globalsCss).toContain(sandraImport);
    for (const tokenImport of imports) {
      expect(globalsCss).toContain(tokenImport);
      expect(globalsCss.indexOf(tokenImport)).toBeGreaterThan(
        globalsCss.indexOf(sandraImport),
      );
    }
    expect(globalsCss).not.toContain("base.css");
    expect(globalsCss).not.toContain("fonts.css");
    expect(globalsCss).not.toContain("fonts.googleapis.com");
  });

  it("ports all 131 token declarations with only approved transforms", () => {
    const css = ["colors.css", "typography.css", "spacing.css"]
      .map((name) => readFileSync(join(stylesDir, name), "utf8"))
      .join("\n");
    const declarations = parseDeclarations(css);

    expect(Object.keys(EXPECTED_TOKENS)).toHaveLength(131);
    expect(declarations).toEqual(EXPECTED_TOKENS);
    expect(Object.values(SOURCE_TOKEN_SHA256)).toHaveLength(3);
    expect(Object.values(SOURCE_TOKEN_SHA256)).toSatisfy((hashes: string[]) =>
      hashes.every((hash) => /^[a-f0-9]{64}$/.test(hash)),
    );

    for (const [sourceName, mappedName] of Object.entries(
      COLLISION_MAPPINGS,
    )) {
      expect(declarations).not.toHaveProperty(sourceName);
      expect(declarations).toHaveProperty(mappedName);
      expect(css).toMatch(
        new RegExp(
          `/\\*[^*]*${sourceName}[^*]*${mappedName}[^*]*\\*/`,
        ),
      );
    }
  });

  it("contains variables only and no global element styling", () => {
    for (const name of ["colors.css", "typography.css", "spacing.css"]) {
      const css = readFileSync(join(stylesDir, name), "utf8");
      const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "").trim();

      expect(withoutComments.startsWith(":root{")).toBe(true);
      expect(withoutComments.match(/:root\s*\{/g)).toHaveLength(1);
      expect(withoutComments).not.toMatch(/(^|})\s*(body|html|h[1-6]|p|a|img|\*)/m);
      expect(withoutComments).not.toContain("@import");
    }
  });

  it("loads the two brand fonts as unused next/font variables", () => {
    const layout = readProjectFile("src/app/layout.tsx");
    const compactLayout = layout.replace(/\s/g, "");

    expect(layout).toMatch(
      /import\s*\{[^}]*Baloo_2[^}]*Nunito_Sans[^}]*\}\s*from\s*"next\/font\/google"/,
    );
    expect(compactLayout).toContain(
      `constbaloo2=${FONT_CONTRACTS.baloo2.importName}({weight:["${FONT_CONTRACTS.baloo2.weights.join('","')}"]`,
    );
    expect(compactLayout).toContain(
      `subsets:["${FONT_CONTRACTS.baloo2.subsets.join('","')}"]`,
    );
    expect(compactLayout).toContain(
      `variable:"${FONT_CONTRACTS.baloo2.variable}"`,
    );
    expect(compactLayout).toContain(
      `constnunitoSans=${FONT_CONTRACTS.nunitoSans.importName}({weight:["${FONT_CONTRACTS.nunitoSans.weights.join('","')}"]`,
    );
    expect(compactLayout).toContain(
      `variable:"${FONT_CONTRACTS.nunitoSans.variable}"`,
    );
    expect(layout).toContain("geistSans.variable");
    expect(layout).toContain("geistMono.variable");
    expect(layout).toContain("baloo2.variable");
    expect(layout).toContain("nunitoSans.variable");
    expect(layout).not.toContain("baloo2.className");
    expect(layout).not.toContain("nunitoSans.className");
    expect(layout).toContain(
      '<body className="flex min-h-full flex-col">',
    );
  });

  it("publishes the exact 14 byte-identical mascot sprites", () => {
    const filenames = readdirSync(mascotDir)
      .filter((name) => name.endsWith(".png"))
      .sort();
    const destinationHashes = Object.fromEntries(
      filenames.map((name) => [
        name,
        createHash("sha256")
          .update(readFileSync(join(mascotDir, name)))
          .digest("hex"),
      ]),
    );

    expect(filenames).toEqual(MASCOT_FILENAMES);
    expect(destinationHashes).toEqual(MASCOT_SHA256);
  });
});
