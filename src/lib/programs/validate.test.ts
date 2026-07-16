import { describe, expect, it } from "vitest";

import { parseProgramInput } from "./validate";

function fd(values: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}

describe("parseProgramInput", () => {
  it("returns the parsed program when fields are valid", () => {
    const result = parseProgramInput(
      fd({
        title: " Appointment Setter Onboarding ",
        description: "Core program",
        course_order_mode: "sequential",
        is_published: "on",
        thumbnail_path: "courses/training/program.webp",
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toBe("Appointment Setter Onboarding");
    expect(result.value.description).toBe("Core program");
    expect(result.value.course_order_mode).toBe("sequential");
    expect(result.value.is_published).toBe(true);
    expect(result.value.thumbnail_path).toBe("courses/training/program.webp");
  });

  it("defaults course_order_mode to free when missing", () => {
    const result = parseProgramInput(fd({ title: "Program" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.course_order_mode).toBe("free");
    expect(result.value.is_published).toBe(false);
    expect(result.value.description).toBeNull();
    expect(result.value.thumbnail_path).toBeNull();
  });

  it("rejects absolute or traversal thumbnail paths", () => {
    for (const thumbnail_path of ["https://example.com/a.webp", "../a.webp", "/a.webp"]) {
      const result = parseProgramInput(fd({ title: "Program", thumbnail_path }));
      expect(result.ok).toBe(false);
    }
  });

  it("rejects empty or whitespace-only title", () => {
    const missing = parseProgramInput(fd({}));
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.errors.title).toBeDefined();

    const whitespace = parseProgramInput(fd({ title: "   " }));
    expect(whitespace.ok).toBe(false);
  });

  it("rejects titles longer than 200 chars", () => {
    const long = "a".repeat(201);
    const result = parseProgramInput(fd({ title: long }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.title).toContain("200");
  });

  it("rejects invalid course_order_mode", () => {
    const result = parseProgramInput(
      fd({ title: "P", course_order_mode: "random" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.course_order_mode).toBeDefined();
  });

  it("treats description as null when empty", () => {
    const result = parseProgramInput(fd({ title: "P", description: "  " }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.description).toBeNull();
  });
});
