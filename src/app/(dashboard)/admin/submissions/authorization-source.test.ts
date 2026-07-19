import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(__dirname, "page.tsx"), "utf8");
const actions = readFileSync(resolve(__dirname, "actions.ts"), "utf8");

describe("admin submission authorization source", () => {
  it("authenticates the page directly and reads submissions through the actor session", () => {
    expect(page).toContain('import { requireAdmin } from "@/lib/auth/guard"');
    expect(page).toMatch(/AdminSubmissionsPage[\s\S]*await requireAdmin\(\)[\s\S]*await createClient\(\)/);
  });

  it("never creates a service-role client for submission reads, reviews, or downloads", () => {
    expect(page).not.toContain("createAdminClient");
    expect(actions).not.toContain("createAdminClient");
    expect(actions).toMatch(/createSubmissionDownloadUrl[\s\S]*await requireAdmin\(\)[\s\S]*await createClient\(\)/);
  });
});
