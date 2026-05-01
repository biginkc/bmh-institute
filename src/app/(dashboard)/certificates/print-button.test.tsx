// TPAR-01: smoke spec proving the RTL harness is wired. PrintButton is the
// smallest pure-presentation Client Component in the repo (no Supabase, no
// router, just window.print()). If this passes under `npm run test:rtl`,
// jsdom + @testing-library/react + the localStorage shim + afterEach cleanup
// are all working.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PrintButton } from "./print-button";

let printSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("<PrintButton />", () => {
  it("calls window.print() when clicked", async () => {
    const user = userEvent.setup();
    render(<PrintButton />);
    await user.click(screen.getByRole("button", { name: /print \/ save pdf/i }));
    expect(printSpy).toHaveBeenCalledTimes(1);
  });
});
