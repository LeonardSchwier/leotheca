/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { EmptyState } from "./EmptyState";

afterEach(cleanup);

describe("EmptyState", () => {
  it("labels the region from its visible title and optional description", () => {
    const { getByRole } = render(
      <EmptyState title="No bookmarks yet." description="Bookmark a note to find it here." />,
    );
    const region = getByRole("region", { name: "No bookmarks yet." });
    expect(region.getAttribute("aria-describedby")).toBeTruthy();
    expect(region.textContent).toContain("Bookmark a note to find it here.");
  });

  it("renders a decorative local icon and compact size", () => {
    const { container } = render(<EmptyState title="No tags yet." icon="tag" size="sm" />);
    expect(container.querySelector(".empty-state-sm")).toBeTruthy();
    expect(container.querySelector(".empty-state-icon svg")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });

  it("provides exactly one primary and one secondary action slot", () => {
    const primary = vi.fn();
    const secondary = vi.fn();
    const { getByRole } = render(
      <EmptyState
        title="Nothing here"
        primaryAction={<button onClick={primary}>Create note</button>}
        secondaryAction={<button onClick={secondary}>Learn more</button>}
      />,
    );
    fireEvent.click(getByRole("button", { name: "Create note" }));
    fireEvent.click(getByRole("button", { name: "Learn more" }));
    expect(primary).toHaveBeenCalledTimes(1);
    expect(secondary).toHaveBeenCalledTimes(1);
  });

  it("keeps stable labeling ids across rerenders", () => {
    const { getByRole, rerender } = render(<EmptyState title="First title" />);
    const firstId = getByRole("region", { name: "First title" }).getAttribute("aria-labelledby");
    rerender(<EmptyState title="Updated title" />);
    expect(getByRole("region", { name: "Updated title" }).getAttribute("aria-labelledby")).toBe(
      firstId,
    );
  });
});
