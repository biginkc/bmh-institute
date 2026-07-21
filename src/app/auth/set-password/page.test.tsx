import { describe, expect, it, vi } from "vitest";

const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn((path: string): never => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect }));

import SetPasswordPage from "./page";

describe("SetPasswordPage", () => {
  it("redirects to the Hugo-only login surface", () => {
    expect(() => SetPasswordPage()).toThrow("redirect:/login");
  });
});
