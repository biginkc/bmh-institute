import Link from "next/link";

import { Badge } from "@/components/bmh-ds/badge";
import { Card } from "@/components/bmh-ds/card";
import { OfficialLogoMark } from "@/components/bmh-ds/official-logo-mark";

import { PrintButton } from "./print-button";
import "./certificate.css";

export function CertificateLayout({
  backHref,
  backLabel,
  certificateType,
  html,
}: {
  backHref: string;
  backLabel: string;
  certificateType: "Course certificate";
  html: string;
}) {
  return (
    <main className="certificate-print-page mx-auto w-full max-w-[900px] flex-1 px-5 py-8 md:px-7 md:py-10">
      <div className="mb-5 flex items-center justify-between gap-4 print:hidden">
        <Link
          href={backHref}
          className="rounded-md font-[family-name:var(--font-body)] text-sm font-extrabold text-[var(--text-muted)] transition-colors hover:text-[var(--action)] focus-visible:ring-4 focus-visible:ring-[var(--focus-ring)] focus-visible:outline-none"
        >
          ← {backLabel}
        </Link>
        <PrintButton />
      </div>
      <Card
        outline
        padding="none"
        radius="xl"
        className="certificate-frame overflow-hidden"
      >
        <div className="flex items-center justify-between gap-5 bg-[var(--surface-hero)] px-6 py-5 md:px-9 md:py-6">
          <OfficialLogoMark
            height={36}
            className="max-w-[58%] text-[var(--ink-900)]"
          />
          <Badge tone="solid" size="sm">
            {certificateType}
          </Badge>
        </div>
        <div className="relative overflow-hidden px-6 py-10 md:px-11 md:py-12">
          <span
            aria-hidden="true"
            className="absolute -top-16 -right-16 size-44 rounded-full bg-[var(--yellow-100)]"
          />
          <span
            aria-hidden="true"
            className="absolute -bottom-20 -left-14 size-40 rounded-full bg-[var(--orange-100)]"
          />
          <div
            className="certificate-body relative z-10 min-w-0 break-words [overflow-wrap:anywhere]"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </Card>
    </main>
  );
}
