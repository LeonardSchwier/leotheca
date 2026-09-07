/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/preact";

vi.mock("../workspace/tauriBridge", () => ({
  fileSrc: vi.fn(),
}));

import { ImageViewer } from "./ImageViewer";
import { fileSrc } from "../workspace/tauriBridge";

afterEach(() => {
  cleanup();
  vi.mocked(fileSrc).mockReset();
});

describe("ImageViewer", () => {
  it("renders no <img> while the async src is still resolving", async () => {
    let resolve!: (v: string) => void;
    vi.mocked(fileSrc).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const { container } = render(<ImageViewer path="/vault/a.png" />);
    expect(container.querySelector("img")).toBeNull();

    await act(async () => {
      resolve("asset://localhost/a.png");
    });
    expect(container.querySelector("img")).not.toBeNull();
  });

  it("renders the resolved src with the path as alt text once it resolves", async () => {
    vi.mocked(fileSrc).mockResolvedValue("asset://localhost/vault/a.png");
    const { container } = render(<ImageViewer path="/vault/a.png" />);

    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    const img = container.querySelector("img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("asset://localhost/vault/a.png");
    expect(img.alt).toBe("/vault/a.png");
  });

  it("re-resolves the src when the path prop changes", async () => {
    vi.mocked(fileSrc).mockImplementation(async (path: string) => `asset://${path}`);
    const { container, rerender } = render(<ImageViewer path="/vault/a.png" />);
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    expect((container.querySelector("img") as HTMLImageElement).getAttribute("src")).toBe(
      "asset:///vault/a.png",
    );

    rerender(<ImageViewer path="/vault/b.png" />);
    await waitFor(() =>
      expect((container.querySelector("img") as HTMLImageElement).getAttribute("src")).toBe(
        "asset:///vault/b.png",
      ),
    );
    expect(fileSrc).toHaveBeenCalledWith("/vault/b.png");
  });

  it("ignores a stale resolution for a previous path that arrives after a newer one", async () => {
    let resolveFirst!: (v: string) => void;
    let resolveSecond!: (v: string) => void;
    const first = new Promise<string>((r) => {
      resolveFirst = r;
    });
    const second = new Promise<string>((r) => {
      resolveSecond = r;
    });
    vi.mocked(fileSrc).mockReturnValueOnce(first).mockReturnValueOnce(second);

    const { container, rerender } = render(<ImageViewer path="/vault/a.png" />);
    rerender(<ImageViewer path="/vault/b.png" />);

    // The newer request (for b.png) resolves first, then the stale one (for
    // a.png, superseded before it ever resolved) arrives late. Without the
    // effect's cancellation guard, the stale resolution would clobber the
    // already-correct display with the wrong image.
    await act(async () => {
      resolveSecond("asset://b.png");
    });
    await act(async () => {
      resolveFirst("asset://a.png");
    });

    const img = container.querySelector("img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("asset://b.png");
  });
});
