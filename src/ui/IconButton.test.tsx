/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { IconButton } from "./IconButton";

afterEach(cleanup);

describe("IconButton", () => {
  it("uses the label prop as both accessible name and pointer tooltip", () => {
    const { getByRole } = render(
      <IconButton icon="bookmark" label="Bookmark this note" />,
    );
    const btn = getByRole("button", { name: "Bookmark this note" });
    expect(btn.getAttribute("title")).toBe("Bookmark this note");
  });

  it("defaults to the sm size", () => {
    const { getByRole } = render(
      <IconButton icon="bookmark" label="Bookmark" />,
    );
    expect(getByRole("button").className).toContain("icon-btn-sm");
  });

  it("applies the md size when requested", () => {
    const { getByRole } = render(
      <IconButton icon="bookmark" label="Bookmark" size="md" />,
    );
    expect(getByRole("button").className).toContain("icon-btn-md");
  });

  it("is not pressed/active by default, with an explicit aria-pressed=false", () => {
    const { getByRole } = render(
      <IconButton icon="bookmark" label="Bookmark" />,
    );
    expect(getByRole("button").getAttribute("aria-pressed")).toBe("false");
  });

  it("reflects an active/pressed state visually and via aria-pressed", () => {
    const { getByRole } = render(
      <IconButton icon="panelRight" label="Inspector" active />,
    );
    const btn = getByRole("button");
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(btn.className).toContain("icon-btn-active");
  });

  it("invokes onClick when clicked", () => {
    const onClick = vi.fn();
    const { getByRole } = render(
      <IconButton icon="bookmark" label="Bookmark" onClick={onClick} />,
    );
    fireEvent.click(getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("sets the native disabled property, which is what actually blocks real pointer/keyboard activation", () => {
    const { getByRole } = render(
      <IconButton icon="bookmark" label="Bookmark" disabled />,
    );
    const btn = getByRole("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("disables the button and swaps to a spinner while loading, keeping the accessible name", () => {
    const { getByRole, container } = render(
      <IconButton icon="bookmark" label="Bookmark" loading />,
    );
    const btn = getByRole("button", { name: "Bookmark" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(container.querySelector(".icon-spin")).toBeTruthy();
  });
});
