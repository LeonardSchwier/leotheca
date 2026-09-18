/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/preact";
import { StatusIndicator } from "./StatusIndicator";

afterEach(cleanup);

describe("StatusIndicator", () => {
  it("keeps a neutral non-live state quiet", () => {
    const { getByText, queryByRole } = render(<StatusIndicator>Unsaved</StatusIndicator>);
    expect(getByText("Unsaved")).toBeTruthy();
    expect(queryByRole("status")).toBeNull();
    expect(queryByRole("alert")).toBeNull();
  });

  it("marks real progress busy and politely announces its visible label", () => {
    const { getByRole } = render(
      <StatusIndicator variant="progress" live="polite">
        Indexing…
      </StatusIndicator>,
    );
    const status = getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toContain("Indexing…");
    expect(status.querySelector(".spinner")).toBeTruthy();
  });

  it("uses an assertive alert only when requested", () => {
    const { getByRole } = render(
      <StatusIndicator variant="danger" live="assertive">
        Save failed
      </StatusIndicator>,
    );
    expect(getByRole("alert").getAttribute("aria-live")).toBe("assertive");
  });

  it.each(["success", "warning", "danger"] as const)(
    "pairs the %s color variant with a local icon and visible text",
    (variant) => {
      const { container, getByText } = render(
        <StatusIndicator variant={variant}>{variant}</StatusIndicator>,
      );
      expect(container.querySelector(`.status-indicator-${variant}`)).toBeTruthy();
      expect(container.querySelector("svg")).toBeTruthy();
      expect(getByText(variant)).toBeTruthy();
    },
  );

  it("can suppress the default icon and provide a concise accessible label", () => {
    const { container, getByLabelText } = render(
      <StatusIndicator icon={false} ariaLabel="Unsaved changes" size="sm">
        <span aria-hidden="true">•</span> Unsaved
      </StatusIndicator>,
    );
    expect(getByLabelText("Unsaved changes")).toBeTruthy();
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector(".status-indicator-sm")).toBeTruthy();
  });
});
