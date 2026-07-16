"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/bmh-ds/button";

export function PrintButton() {
  return (
    <Button
      variant="secondary"
      size="sm"
      iconLeft={<Printer aria-hidden="true" size={16} />}
      onClick={() => window.print()}
    >
      Print / Save PDF
    </Button>
  );
}
