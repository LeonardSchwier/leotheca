/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/preact";
import { Icon, type IconName } from "./icons";

const ALL_NAMES: IconName[] = [
  "close",
  "chevronDown",
  "chevronRight",
  "menu",
  "search",
  "plus",
  "moreHorizontal",
  "check",
  "folder",
  "fileText",
  "bookmark",
  "tag",
  "graph",
  "settings",
  "command",
  "helpCircle",
  "warningTriangle",
  "alertCircle",
  "spinner",
  "panelRight",
  "columns",
  "code",
  "eye",
];

describe("Icon", () => {
  it("renders every registered icon without throwing, each with at least one shape", () => {
    for (const name of ALL_NAMES) {
      const { container, unmount } = render(<Icon name={name} />);
      const svg = container.querySelector("svg");
      expect(svg).toBeTruthy();
      expect(svg?.children.length).toBeGreaterThan(0);
      unmount();
    }
  });

  it("is decorative (aria-hidden, no img role) when no label is given, since the surrounding control already has one", () => {
    const { container } = render(<Icon name="close" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("role")).toBeNull();
  });

  it("exposes an accessible name via role=img + aria-label when used as the sole labeled element", () => {
    const { container } = render(<Icon name="alertCircle" label="Error" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("role")).toBe("img");
    expect(svg?.getAttribute("aria-label")).toBe("Error");
    expect(svg?.hasAttribute("aria-hidden")).toBe(false);
  });

  it("defaults to the spec's 20px size and honors an explicit size", () => {
    const { container: def } = render(<Icon name="search" />);
    expect(def.querySelector("svg")?.getAttribute("width")).toBe("20");

    const { container: sized } = render(<Icon name="search" size={16} />);
    expect(sized.querySelector("svg")?.getAttribute("width")).toBe("16");
    expect(sized.querySelector("svg")?.getAttribute("height")).toBe("16");
  });

  it("applies the icon-spin class only when spin is requested", () => {
    const { container: plain } = render(<Icon name="spinner" />);
    expect(plain.querySelector("svg")?.getAttribute("class")).not.toContain("icon-spin");

    const { container: spinning } = render(<Icon name="spinner" spin />);
    expect(spinning.querySelector("svg")?.getAttribute("class")).toContain("icon-spin");
  });

  it("never sets a hardcoded stroke color, so it inherits currentColor from its container", () => {
    const { container } = render(<Icon name="check" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("stroke")).toBe("currentColor");
    expect(svg?.getAttribute("fill")).toBe("none");
  });
});
