import "@testing-library/jest-dom/vitest";

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LessonSearch } from "./lesson-search";
import { MobileNav } from "./mobile-nav";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn() }),
}));

describe("<MobileNav />", () => {
  let desktopMatches = false;
  const changeListeners = new Set<(event: MediaQueryListEvent) => void>();

  beforeEach(() => {
    desktopMatches = false;
    changeListeners.clear();
    document.body.style.overflow = "";
    vi.stubGlobal("matchMedia", vi.fn().mockImplementation((query: string) => ({
      matches: desktopMatches,
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        changeListeners.add(listener);
      },
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        changeListeners.delete(listener);
      },
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
  });

  it("exposes primary navigation through an accessible modal drawer", async () => {
    render(<MobileNav isAdmin={false} pendingSubmissionsCount={0} />);

    const trigger = screen.getByRole("button", { name: "Open primary navigation" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("navigation", { name: "Primary" })).not.toBeInTheDocument();

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog", { name: "Navigation" })).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Close primary navigation" })).toHaveFocus();
    });
  });

  it("closes with Escape and restores focus to the trigger", async () => {
    render(<MobileNav isAdmin pendingSubmissionsCount={2} />);

    const trigger = screen.getByRole("button", { name: "Open primary navigation" });
    fireEvent.click(trigger);
    expect(screen.getByRole("link", { name: /^Submissions/ })).toBeVisible();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Navigation" })).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
    await waitFor(() => {
      expect(document.documentElement).not.toHaveAttribute("data-base-ui-scroll-locked");
    });
  });

  it("keeps keyboard focus inside the open modal navigation", async () => {
    render(<MobileNav isAdmin={false} pendingSubmissionsCount={0} />);

    fireEvent.click(screen.getByRole("button", { name: "Open primary navigation" }));
    const close = screen.getByRole("button", { name: "Close primary navigation" });
    await waitFor(() => expect(close).toHaveFocus());
    expect(close.closest('[role="dialog"]')).not.toBeNull();
    expect(document.querySelectorAll('[data-base-ui-focus-guard=""]').length).toBe(2);
    expect(
      screen.getByRole("button", { name: "Open primary navigation", hidden: true })
        .closest('[data-base-ui-inert][aria-hidden="true"]'),
    ).not.toBeNull();
  });

  it("closes compact search and isolates background controls when opening", async () => {
    render(
      <main>
        <button type="button">Background action</button>
        <LessonSearch
          compact
          instanceId="mobile-test"
        />
        <MobileNav isAdmin={false} pendingSubmissionsCount={0} />
      </main>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Search lessons" }));
    expect(screen.getByRole("combobox", { name: "Search lessons" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Open primary navigation" }));

    expect(screen.queryByRole("combobox", { name: "Search lessons" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Navigation" })).toBeVisible();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Background action", hidden: true })
          .closest('[data-base-ui-inert][aria-hidden="true"]'),
      ).not.toBeNull();
    });
  });

  it("closes at the desktop breakpoint and releases scroll locking", async () => {
    render(<MobileNav isAdmin={false} pendingSubmissionsCount={0} />);
    fireEvent.click(screen.getByRole("button", { name: "Open primary navigation" }));
    expect(screen.getByRole("dialog", { name: "Navigation" })).toBeVisible();
    expect(document.documentElement).toHaveAttribute("data-base-ui-scroll-locked");

    act(() => {
      desktopMatches = true;
      for (const listener of changeListeners) {
        listener({ matches: true, media: "(min-width: 768px)" } as MediaQueryListEvent);
      }
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Navigation" })).not.toBeInTheDocument();
    });
    expect(document.documentElement).not.toHaveAttribute("data-base-ui-scroll-locked");
  });
});
