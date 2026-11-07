/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/preact";

vi.mock("../workspace/tauriBridge", () => ({
  fileSrc: vi.fn(),
}));

import { ImageViewerOverlay } from "./ImageViewerOverlay";
import { fileSrc } from "../workspace/tauriBridge";

afterEach(() => {
  cleanup();
  vi.mocked(fileSrc).mockReset();
});

describe("ImageViewerOverlay", () => {
  it("resolves a leotheca: image src to its asset URL", async () => {
    vi.mocked(fileSrc).mockResolvedValue("asset://localhost/vault/a.png");
    const { container } = render(
      <ImageViewerOverlay src="leotheca://vault/a.png" alt="a" onClose={() => {}} />,
    );
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    expect((container.querySelector("img") as HTMLImageElement).getAttribute("src")).toBe(
      "asset://localhost/vault/a.png",
    );
    // The leotheca: scheme is stripped, leaving the (absolute) path portion.
    expect(fileSrc).toHaveBeenCalledWith("//vault/a.png");
  });

  it("does not leak an unhandled promise rejection and does not hang on Loading when fileSrc rejects", async () => {
    vi.mocked(fileSrc).mockRejectedValue(new Error("file not found"));
    const unhandled = vi.fn();
    window.addEventListener("unhandledrejection", unhandled);

    const { container } = render(
      <ImageViewerOverlay src="leotheca://vault/missing.png" alt="missing" onClose={() => {}} />,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    window.removeEventListener("unhandledrejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();

    // The overlay must not hang on "Loading..." — surface an error state.
    expect(container.textContent).not.toContain("Loading...");
    expect(container.querySelector("button[aria-label=\"Close\"]")).not.toBeNull();
  });
});
