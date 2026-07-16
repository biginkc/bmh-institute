import { notFound } from "next/navigation";

import { DesignSystemSpecimen } from "./design-system-specimen";

export default function DesignSystemPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <DesignSystemSpecimen />;
}
