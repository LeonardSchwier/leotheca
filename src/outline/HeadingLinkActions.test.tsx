/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/preact";
import { HeadingLinkActions } from "./HeadingLinkActions";
import { scanHeadings } from "../markdown/headings";
import { outlineAnnouncement } from "./outlineAnnouncements";

afterEach(() => {
  cleanup();
  outlineAnnouncement.value = null;
});

function setRejectingClipboard(error: unknown) {
  const writeText = vi.fn().mockRejectedValue(error);
  Object.assign(navigator, { clipboard: { writeText } });
  return writeText;
}

function setResolvingClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  return writeText;
}

describe("HeadingLinkActions: a rejected clipboard write on Copy link", () => {
  const heading = scanHeadings("## Section one\nBody.")[0];

  it("does not leave an unhandled promise rejection and still announces the failure", async () => {
    setRejectingClipboard(new Error("clipboard write denied"));
    const unhandled = vi.fn();
    window.addEventListener("unhandledrejection", unhandled);
    const { getByRole } = render(
      <HeadingLinkActions heading={heading} noteTitle="My Note" duplicate={false} canInsertLink={true} />,
    );

    await act(async () => {
      fireEvent.click(getByRole("button", { name: "Copy link to Section one" }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    window.removeEventListener("unhandledrejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    expect(outlineAnnouncement.value?.message).toBe("Couldn't copy link to Section one.");
  });

  it("leaves the button reading \"Copy link\", never a stuck \"Copied\"", async () => {
    setRejectingClipboard(new Error("clipboard write denied"));
    const { getByRole } = render(
      <HeadingLinkActions heading={heading} noteTitle="My Note" duplicate={false} canInsertLink={true} />,
    );

    await act(async () => {
      fireEvent.click(getByRole("button", { name: "Copy link to Section one" }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getByRole("button", { name: "Copy link to Section one" }).textContent).toBe("Copy link");
  });

  it("still announces success once and shows \"Copied\" when the clipboard write succeeds", async () => {
    setResolvingClipboard();
    const { getByRole } = render(
      <HeadingLinkActions heading={heading} noteTitle="My Note" duplicate={false} canInsertLink={true} />,
    );

    await act(async () => {
      fireEvent.click(getByRole("button", { name: "Copy link to Section one" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getByRole("button", { name: "Copy link to Section one" }).textContent).toBe("Copied");
    expect(outlineAnnouncement.value?.message).toBe("Copied link to Section one.");
  });
});
