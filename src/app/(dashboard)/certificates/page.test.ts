import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

let tableData: Record<string, unknown[]> = {};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      const chain = {
        select: () => chain,
        order: () => chain,
        then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
          Promise.resolve({ data: tableData[table] ?? [], error: null }).then(
            resolve,
          ),
      };
      return chain;
    },
  })),
}));

import CertificatesPage from "./page";
import { CertificateLayout } from "./certificate-layout";

describe("CertificatesPage", () => {
  beforeEach(() => {
    tableData = {};
  });

  it("renders an earned certificate with its title above the issue date", async () => {
    tableData.certificates = [
      {
        id: "course-cert-1",
        certificate_number: "BMH-COURSE-001",
        issued_at: "2026-07-15T12:00:00.000Z",
        course_id: "course-1",
        courses: { title: "Sales onboarding" },
      },
    ];

    const html = renderToStaticMarkup(await CertificatesPage());
    const titleIndex = html.indexOf("Sales onboarding");
    const issuedIndex = html.indexOf("Issued");

    expect(titleIndex).toBeGreaterThan(-1);
    expect(issuedIndex).toBeGreaterThan(titleIndex);
    expect(html).toContain('href="/certificates/course/course-cert-1"');
    expect(html).toContain("View and print Sales onboarding certificate");
    expect(html).toContain("Certificate BMH-COURSE-001");
  });

  it("shows a locked program tile until a program certificate is earned", async () => {
    const lockedHtml = renderToStaticMarkup(await CertificatesPage());

    expect(lockedHtml).toContain("Program certificate");
    expect(lockedHtml).toContain("Finish all courses to unlock");

    tableData.program_certificates = [
      {
        id: "program-cert-1",
        certificate_number: "BMH-PROGRAM-001",
        issued_at: "2026-07-15T12:00:00.000Z",
        program_id: "program-1",
        programs: { title: "Sales onboarding program" },
      },
    ];

    const earnedHtml = renderToStaticMarkup(await CertificatesPage());

    expect(earnedHtml).not.toContain("Finish all courses to unlock");
    expect(earnedHtml).toContain(
      'href="/certificates/program/program-cert-1"',
    );
  });
});

describe("CertificateLayout", () => {
  it("keeps the printable content and adds the official brand frame", () => {
    const html = renderToStaticMarkup(
      CertificateLayout({
        backHref: "/certificates",
        backLabel: "Back to certificates",
        certificateType: "Course certificate",
        html: "<h1>Certificate of Completion</h1><p>Issued to Sofia Ruiz</p>",
      }),
    );

    expect(html).toContain("BMH Institute");
    expect(html).toContain("Course certificate");
    expect(html).toContain("Certificate of Completion");
    expect(html).toContain("Issued to Sofia Ruiz");
    expect(html).toContain('href="/certificates"');
    expect(html).toContain("Print / Save PDF");
    expect(html).toContain("certificate-print-page");
  });
});
