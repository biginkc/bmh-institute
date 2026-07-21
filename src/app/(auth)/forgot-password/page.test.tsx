import { describe, expect, it, vi } from "vitest";

const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn((path: string): never => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect }));

import ForgotPasswordPage from "./page";

describe("ForgotPasswordPage", () => {
  it("redirects to the Hugo-only login surface", () => {
    expect(() => ForgotPasswordPage()).toThrow("redirect:/login");
  });
});
