import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CertificateLayout } from "./certificate-layout";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("<CertificateLayout />", () => {
  it("wraps long learner names instead of clipping the certificate body", () => {
    const longName = "learner.with.an.intentionally.long.unbroken.name@example.com";
    const { container } = render(
      <CertificateLayout
        backHref="/certificates"
        backLabel="Back to certificates"
        certificateType="Course certificate"
        html={`<h1>Course Completion Certificate</h1><p>${longName} completed the course.</p>`}
      />,
    );

    const certificateBody = container.querySelector(".certificate-body");
    expect(certificateBody).toHaveClass("min-w-0", "break-words", "[overflow-wrap:anywhere]");
    expect(certificateBody).toHaveTextContent(longName);
  });
});
