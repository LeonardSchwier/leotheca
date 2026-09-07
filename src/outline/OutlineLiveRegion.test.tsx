/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/preact";
import { OutlineLiveRegion } from "./OutlineLiveRegion";
import { announceOutline, outlineAnnouncement } from "./outlineAnnouncements";

afterEach(() => {
  cleanup();
  outlineAnnouncement.value = null;
});

describe("OutlineLiveRegion", () => {
  it("renders an empty polite status region with no announcement yet", () => {
    const { getByRole } = render(<OutlineLiveRegion />);
    const region = getByRole("status");
    expect(region.textContent).toBe("");
  });

  it("shows the latest announced message", () => {
    const { getByRole } = render(<OutlineLiveRegion />);
    act(() => announceOutline("Navigated to Section one, line 3."));
    expect(getByRole("status").textContent).toBe("Navigated to Section one, line 3.");
  });

  it("replaces an older message with a newer one", () => {
    const { getByRole } = render(<OutlineLiveRegion />);
    act(() => announceOutline("3 headings match."));
    act(() => announceOutline("No headings match."));
    expect(getByRole("status").textContent).toBe("No headings match.");
  });
});
