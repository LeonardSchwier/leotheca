/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/preact";
import { Spinner } from "./Spinner";

afterEach(cleanup);

describe("Spinner", () => {
  it("is decorative when explanatory text is supplied by its parent", () => {
    const { container, queryByRole } = render(<Spinner />);
    expect(queryByRole("status")).toBeNull();
    expect(container.querySelector(".spinner")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("becomes a named polite status when used standalone", () => {
    const { getByRole } = render(<Spinner label="Loading notes" />);
    expect(getByRole("status", { name: "Loading notes" })).toBeTruthy();
  });

  it("applies the requested size and class to the local spinning icon", () => {
    const { container } = render(<Spinner size={24} className="custom-spinner" />);
    expect(container.querySelector(".spinner")?.className).toContain("custom-spinner");
    expect(container.querySelector("svg")?.getAttribute("width")).toBe("24");
    expect(container.querySelector("svg")?.classList.contains("icon-spin")).toBe(true);
  });
});
