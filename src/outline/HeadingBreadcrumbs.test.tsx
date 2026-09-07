/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/preact";
import { HeadingBreadcrumbs } from "./HeadingBreadcrumbs";
import { scanHeadings } from "../markdown/headings";
import { outlineInsertRequest } from "./outlineNavigation";

afterEach(() => {
  cleanup();
  outlineInsertRequest.value = null;
});

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

describe("HeadingBreadcrumbs: copy and insert heading-link actions (F06 Phase 3)", () => {
  function setClipboard() {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    return writeText;
  }

  it("shows no link actions before the first heading (nothing to link to yet)", () => {
    const { queryByRole } = render(
      <HeadingBreadcrumbs
        noteTitle="My Note"
        content="No headings here."
        activeSource={{ kind: "cursor", offset: 0 }}
        onSelectRoot={vi.fn()}
        onSelectHeading={vi.fn()}
      />,
    );
    expect(queryByRole("button", { name: /Copy link/ })).toBeNull();
    expect(queryByRole("button", { name: /Insert link/ })).toBeNull();
  });

  it("copies the note-qualified F04 link text for the active heading", async () => {
    const writeText = setClipboard();
    const content = "## Section one\nBody.";
    const headings = scanHeadings(content);
    const { getByRole } = render(
      <HeadingBreadcrumbs
        noteTitle="My Note"
        content={content}
        activeSource={{ kind: "cursor", offset: headings[0].contentFrom }}
        onSelectRoot={vi.fn()}
        onSelectHeading={vi.fn()}
      />,
    );
    await act(async () => {
      fireEvent.click(getByRole("button", { name: "Copy link to Section one" }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith("[[My Note#Section one]]");
  });

  it("requests inserting the same-note F04 link text for the active heading", () => {
    const content = "## Section one\nBody.";
    const headings = scanHeadings(content);
    const { getByRole } = render(
      <HeadingBreadcrumbs
        noteTitle="My Note"
        content={content}
        activeSource={{ kind: "cursor", offset: headings[0].contentFrom }}
        onSelectRoot={vi.fn()}
        onSelectHeading={vi.fn()}
      />,
    );
    fireEvent.click(getByRole("button", { name: "Insert link to Section one at the cursor" }));
    expect(outlineInsertRequest.value?.text).toBe("[[#Section one]]");
  });

  it("acts on the deepest active heading, not an ancestor, when the chain has more than one entry", () => {
    const content = "# Product\n## Delivery\n### Android\n";
    const headings = scanHeadings(content);
    const android = headings.find((h) => h.displayText === "Android")!;
    const { getByRole } = render(
      <HeadingBreadcrumbs
        noteTitle="Spec"
        content={content}
        activeSource={{ kind: "cursor", offset: android.contentFrom }}
        onSelectRoot={vi.fn()}
        onSelectHeading={vi.fn()}
      />,
    );
    fireEvent.click(getByRole("button", { name: "Insert link to Android at the cursor" }));
    expect(outlineInsertRequest.value?.text).toBe("[[#Android]]");
  });

  it("disables both actions when the active heading's text is duplicated in the note", () => {
    const content = "# Overview\n## Overview\n";
    const headings = scanHeadings(content);
    const second = headings[1];
    const { getAllByLabelText } = render(
      <HeadingBreadcrumbs
        noteTitle="My Note"
        content={content}
        activeSource={{ kind: "cursor", offset: second.contentFrom }}
        onSelectRoot={vi.fn()}
        onSelectHeading={vi.fn()}
      />,
    );
    const disabledButtons = getAllByLabelText(
      "This heading's text repeats elsewhere in the note, so a link to it would be ambiguous.",
    );
    expect(disabledButtons).toHaveLength(2);
    for (const button of disabledButtons) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("disables Insert link but not Copy link when canInsertLink is false", () => {
    setClipboard();
    const content = "## Section one\nBody.";
    const headings = scanHeadings(content);
    const { getByRole } = render(
      <HeadingBreadcrumbs
        noteTitle="My Note"
        content={content}
        activeSource={{ kind: "cursor", offset: headings[0].contentFrom }}
        onSelectRoot={vi.fn()}
        onSelectHeading={vi.fn()}
        canInsertLink={false}
      />,
    );
    expect(
      (getByRole("button", { name: "Copy link to Section one" }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(
      (getByRole("button", { name: /Insert link to Section one/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
