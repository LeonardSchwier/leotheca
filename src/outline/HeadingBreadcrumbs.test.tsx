/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { HeadingBreadcrumbs } from "./HeadingBreadcrumbs";
import { scanHeadings } from "../markdown/headings";

afterEach(() => cleanup());

describe("HeadingBreadcrumbs", () => {
  it("shows only the note root before the first heading", () => {
    const content = "Intro text.\n\n# First heading\nBody.";
    const { getByText, queryByText } = render(
      <HeadingBreadcrumbs
        noteTitle="My Note"
        content={content}
        activeSource={{ kind: "cursor", offset: 0 }}
        onSelectRoot={vi.fn()}
        onSelectHeading={vi.fn()}
      />,
    );
    expect(getByText("My Note")).toBeTruthy();
    expect(queryByText("First heading")).toBeNull();
  });

  it('shows only the note root when activeSource is "none" (no tracking yet)', () => {
    const content = "# First heading\nBody.";
    const { getByText, queryByText } = render(
      <HeadingBreadcrumbs
        noteTitle="My Note"
        content={content}
        activeSource={{ kind: "none" }}
        onSelectRoot={vi.fn()}
        onSelectHeading={vi.fn()}
      />,
    );
    expect(getByText("My Note")).toBeTruthy();
    expect(queryByText("First heading")).toBeNull();
  });

  it("shows the full ancestor chain for the active heading", () => {
    const content = "# Product\n### Constraints\n## Delivery\n#### Android\n";
    const headings = scanHeadings(content);
    const android = headings.find((h) => h.displayText === "Android")!;
    const { getByText } = render(
      <HeadingBreadcrumbs
        noteTitle="Spec"
        content={content}
        activeSource={{ kind: "cursor", offset: android.contentFrom }}
        onSelectRoot={vi.fn()}
        onSelectHeading={vi.fn()}
      />,
    );
    expect(getByText("Spec")).toBeTruthy();
    expect(getByText("Product")).toBeTruthy();
    expect(getByText("Delivery")).toBeTruthy();
    expect(getByText("Android")).toBeTruthy();
  });

  it("marks the current heading with aria-current=location", () => {
    const content = "# Only heading\nBody.";
    const headings = scanHeadings(content);
    const { getByText } = render(
      <HeadingBreadcrumbs
        noteTitle="Note"
        content={content}
        activeSource={{ kind: "cursor", offset: headings[0].contentFrom }}
        onSelectRoot={vi.fn()}
        onSelectHeading={vi.fn()}
      />,
    );
    expect(getByText("Only heading").getAttribute("aria-current")).toBe("location");
    expect(getByText("Note").getAttribute("aria-current")).toBeNull();
  });

  it("marks the note root as current before the first heading", () => {
    const { getByText } = render(
      <HeadingBreadcrumbs
        noteTitle="Note"
        content="No headings here."
        activeSource={{ kind: "cursor", offset: 0 }}
        onSelectRoot={vi.fn()}
        onSelectHeading={vi.fn()}
      />,
    );
    expect(getByText("Note").getAttribute("aria-current")).toBe("location");
  });

  it("calls onSelectRoot when the note title is clicked", () => {
    const onSelectRoot = vi.fn();
    const { getByText } = render(
      <HeadingBreadcrumbs
        noteTitle="Note"
        content="# Heading\nBody."
        activeSource={{ kind: "cursor", offset: 0 }}
        onSelectRoot={onSelectRoot}
        onSelectHeading={vi.fn()}
      />,
    );
    fireEvent.click(getByText("Note"));
    expect(onSelectRoot).toHaveBeenCalledTimes(1);
  });

  it("calls onSelectHeading with the heading record when a segment is clicked", () => {
    const content = "# Heading one\nBody.";
    const headings = scanHeadings(content);
    const onSelectHeading = vi.fn();
    const { getByText } = render(
      <HeadingBreadcrumbs
        noteTitle="Note"
        content={content}
        activeSource={{ kind: "cursor", offset: headings[0].contentFrom }}
        onSelectRoot={vi.fn()}
        onSelectHeading={onSelectHeading}
      />,
    );
    fireEvent.click(getByText("Heading one"));
    expect(onSelectHeading).toHaveBeenCalledWith(headings[0]);
  });

  it("shows the untitled placeholder for an empty heading in the chain", () => {
    const content = "#\nBody.";
    const headings = scanHeadings(content);
    const { getByText } = render(
      <HeadingBreadcrumbs
        noteTitle="Note"
        content={content}
        activeSource={{ kind: "cursor", offset: headings[0].sourceFrom }}
        onSelectRoot={vi.fn()}
        onSelectHeading={vi.fn()}
      />,
    );
    expect(getByText("(Untitled heading)")).toBeTruthy();
  });

  it("shows the ancestor chain for a previewIndex source", () => {
    const content = "# Product\n## Delivery\n### Android\n";
    const { getByText } = render(
      <HeadingBreadcrumbs
        noteTitle="Spec"
        content={content}
        activeSource={{ kind: "previewIndex", index: 2 }}
        onSelectRoot={vi.fn()}
        onSelectHeading={vi.fn()}
      />,
    );
    expect(getByText("Product")).toBeTruthy();
    expect(getByText("Delivery")).toBeTruthy();
    expect(getByText("Android")).toBeTruthy();
  });

  it("marks the heading at previewIndex 0 as current", () => {
    const content = "# First\nBody.";
    const { getByText } = render(
      <HeadingBreadcrumbs
        noteTitle="Note"
        content={content}
        activeSource={{ kind: "previewIndex", index: 0 }}
        onSelectRoot={vi.fn()}
        onSelectHeading={vi.fn()}
      />,
    );
    expect(getByText("Note")).toBeTruthy();
    expect(getByText("First").getAttribute("aria-current")).toBe("location");
  });

  it("names the active source in the nav's accessible label for a cursor source", () => {
    const { getByRole } = render(
      <HeadingBreadcrumbs
        noteTitle="Note"
        content="# Heading\nBody."
        activeSource={{ kind: "cursor", offset: 0 }}
        onSelectRoot={vi.fn()}
        onSelectHeading={vi.fn()}
      />,
    );
    expect(getByRole("navigation", { name: "Breadcrumb (following Source)" })).toBeTruthy();
  });

  it("names the active source in the nav's accessible label for a previewIndex source", () => {
    const { getByRole } = render(
      <HeadingBreadcrumbs
        noteTitle="Note"
        content="# Heading\nBody."
        activeSource={{ kind: "previewIndex", index: 0 }}
        onSelectRoot={vi.fn()}
        onSelectHeading={vi.fn()}
      />,
    );
    expect(getByRole("navigation", { name: "Breadcrumb (following Preview)" })).toBeTruthy();
  });

  it("falls back to a plain label when no active source is tracked yet", () => {
    const { getByRole } = render(
      <HeadingBreadcrumbs
        noteTitle="Note"
        content="# Heading\nBody."
        activeSource={{ kind: "none" }}
        onSelectRoot={vi.fn()}
        onSelectHeading={vi.fn()}
      />,
    );
    expect(getByRole("navigation", { name: "Breadcrumb" })).toBeTruthy();
  });
});
