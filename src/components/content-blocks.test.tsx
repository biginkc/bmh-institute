import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ContentBlockRenderer } from "./content-blocks";

function renderEmbed(iframeSrc: string) {
  return render(
    <ContentBlockRenderer
      block={{
        id: "block-1",
        block_type: "embed",
        content: {
          iframe_src: iframeSrc,
          aspect_ratio: "16:9",
        },
        sort_order: 0,
        is_required_for_completion: false,
      }}
    />,
  );
}

describe("EmbedBlock sandbox attribute (HARDEN-05)", () => {
  it("renders the iframe with the locked sandbox flag set", () => {
    const { container } = renderEmbed("https://www.loom.com/embed/abc");

    const iframe = container.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("sandbox")).toBe(
      "allow-scripts allow-same-origin allow-forms allow-presentation",
    );
  });

  it("renders the placeholder when iframe_src is empty", () => {
    const { container, getByText } = renderEmbed("");

    expect(container.querySelector("iframe")).toBeNull();
    expect(getByText("Embed URL not set.")).toBeTruthy();
  });

  it("renders the placeholder when iframe_src is the default sentinel", () => {
    const { container, getByText } = renderEmbed("https://");

    expect(container.querySelector("iframe")).toBeNull();
    expect(getByText("Embed URL not set.")).toBeTruthy();
  });

  it("preserves the existing allow attribute alongside sandbox", () => {
    const { container } = renderEmbed("https://www.loom.com/embed/abc");

    const iframe = container.querySelector("iframe");
    expect(iframe?.getAttribute("allow")).toContain("accelerometer");
    expect(iframe?.getAttribute("allow")).toContain("clipboard-write");
    expect(iframe?.getAttribute("allow")).toContain("picture-in-picture");
  });
});
