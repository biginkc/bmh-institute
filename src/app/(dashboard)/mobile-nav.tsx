"use client";

import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import { CLOSE_LESSON_SEARCH_EVENT } from "./dashboard-events";
import { SidebarNav } from "./sidebar-nav";

const DESKTOP_MEDIA_QUERY = "(min-width: 768px)";

export function MobileNav({
  isAdmin,
  pendingSubmissionsCount,
}: {
  isAdmin: boolean;
  pendingSubmissionsCount: number;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || typeof window.matchMedia !== "function") return;
    const desktop = window.matchMedia(DESKTOP_MEDIA_QUERY);
    const closeOnDesktop = (event?: MediaQueryListEvent) => {
      if (event?.matches ?? desktop.matches) setOpen(false);
    };
    closeOnDesktop();
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, [open]);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) window.dispatchEvent(new Event(CLOSE_LESSON_SEARCH_EVENT));
    setOpen(nextOpen);
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <div className="shrink-0 md:hidden">
        <SheetTrigger
          render={
            <button
              type="button"
              aria-label="Open primary navigation"
              className="flex size-10 items-center justify-center rounded-full border-2 border-[var(--ink-200)] bg-[var(--paper)] text-[var(--ink-700)] shadow-[var(--bmh-shadow-xs)] hover:border-[var(--action)] hover:text-[var(--action)] focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            />
          }
        >
          <Menu className="size-5" aria-hidden="true" />
        </SheetTrigger>
      </div>

      <SheetContent
        id="mobile-primary-navigation"
        side="left"
        showCloseButton={false}
        overlayClassName="z-[70] bg-black/35"
        className="z-[70] w-[min(88vw,20rem)] gap-0 border-[var(--border-hairline)] bg-[var(--paper)] p-0 text-[var(--ink-900)] shadow-[var(--bmh-shadow-lg)]"
      >
        <div className="flex h-[76px] shrink-0 items-center justify-between border-b border-[var(--border-hairline)] px-5">
          <SheetTitle className="font-[family-name:var(--font-body)] text-base font-extrabold text-[var(--ink-900)]">
            Navigation
          </SheetTitle>
          <SheetClose
            render={
              <button
                type="button"
                aria-label="Close primary navigation"
                className="flex size-10 items-center justify-center rounded-full text-[var(--ink-700)] hover:bg-[var(--ink-050)] hover:text-[var(--ink-900)] focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
              />
            }
          >
            <X className="size-5" aria-hidden="true" />
          </SheetClose>
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto py-3"
          onClick={(event) => {
            if (event.target instanceof Element && event.target.closest("a")) {
              setOpen(false);
            }
          }}
        >
          <SidebarNav
            isAdmin={isAdmin}
            pendingSubmissionsCount={pendingSubmissionsCount}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
