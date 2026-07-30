import { describe, expect, it } from "vitest";

import {
  MAX_CONTENT_BLOCK_BYTES,
  parseFlashcardText,
  validateAuthoredContent,
} from "./validate";

describe("authored content validation", () => {
  it("requires absolute HTTPS URLs and exact media provider hosts", () => {
    expect(validateAuthoredContent("external_link", { url: "/relative" }).ok).toBe(false);
    expect(validateAuthoredContent("external_link", { url: "http://example.com/a" }).ok).toBe(false);
    expect(validateAuthoredContent("embed", { iframe_src: "https://evil.example/embed" }).ok).toBe(false);
    expect(validateAuthoredContent("embed", { iframe_src: "https://www.loom.com/embed/abc" }).ok).toBe(true);
    expect(validateAuthoredContent("video", { source: "youtube", url: "https://youtube.com/watch?v=abc" }).ok).toBe(true);
    expect(validateAuthoredContent("video", { source: "youtube", url: "https://youtube.com.evil.example/watch?v=abc" }).ok).toBe(false);
  });

  it("rejects forged runtime URLs and unsafe storage paths", () => {
    expect(validateAuthoredContent("image", { signed_url: "https://evil.example/x" }).ok).toBe(false);
    expect(validateAuthoredContent("image", { file_path: "https://evil.example/x" }).ok).toBe(false);
    expect(validateAuthoredContent("image", { file_path: "courses/a/../secret" }).ok).toBe(false);
    expect(validateAuthoredContent("image", { file_path: "courses/a/image.webp" }).ok).toBe(true);
  });

  it("parses flashcards with line-specific errors and enforces bounds", () => {
    expect(parseFlashcardText("Term | Definition\n\nNext | Answer")).toEqual({
      ok: true,
      cards: [
        { front: "Term", back: "Definition" },
        { front: "Next", back: "Answer" },
      ],
    });
    expect(parseFlashcardText("missing separator")).toMatchObject({
      ok: false,
      errors: ["Line 1: expected `front | back` with exactly one separator."],
    });
    expect(parseFlashcardText(" | answer")).toMatchObject({
      ok: false,
      errors: ["Line 1: front is required."],
    });
    expect(validateAuthoredContent("flashcard", { cards: [] }).errors).toContain(
      "Flashcards must contain between 1 and 100 cards.",
    );
    expect(validateAuthoredContent("flashcard", {
      cards: [{ front: "a", back: "b".repeat(2001) }],
    }).errors).toContain("Flashcard 1 back must be at most 2000 characters.");
  });

  it("caps the serialized authored block at 100KB", () => {
    const result = validateAuthoredContent("text", { html: "x".repeat(MAX_CONTENT_BLOCK_BYTES) });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Content block payload must be at most 100KB.");
  });
});
