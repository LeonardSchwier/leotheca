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

  it("renders a close button (aria-label \"Close\") only when an onClose prop is supplied", async () => {
    vi.mocked(fileSrc).mockResolvedValue("asset://localhost/vault/a.png");
    const { container, rerender } = render(<ImageViewer path="/vault/a.png" />);
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    expect(container.querySelector('button[aria-label="Close"]')).toBeNull();

    const onClose = vi.fn();
    rerender(<ImageViewer path="/vault/a.png" onClose={onClose} />);
    const close = container.querySelector('button[aria-label="Close"]') as HTMLButtonElement;
    expect(close).not.toBeNull();
    expect(close.textContent).toBe("×");

    expect(onClose).not.toHaveBeenCalled();
    close.click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not render a close button or fire Escape when no onClose prop is supplied", async () => {
    vi.mocked(fileSrc).mockResolvedValue("asset://localhost/vault/a.png");
    const { container } = render(<ImageViewer path="/vault/a.png" />);
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    expect(container.querySelector('button[aria-label="Close"]')).toBeNull();

    // Escape with no onClose prop: the guard must not crash and must not call
    // anything (there is no handler to call). We can only observe that it did
    // not throw; the "does not fire" half of the contract is covered by the
    // render check above (no close button exists to fire).
    expect(() => {
      act(() => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      });
    }).not.toThrow();
  });

  it("does not leak an unhandled promise rejection and shows an error state when fileSrc rejects", async () => {
    vi.mocked(fileSrc).mockRejectedValue(new Error("file not found"));
    const unhandled = vi.fn();
    window.addEventListener("unhandledrejection", unhandled);

    const { container } = render(<ImageViewer path="/vault/missing.png" />);

    // Let the rejected promise settle (and any late microtasks flush).
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    window.removeEventListener("unhandledrejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();

    // The viewer must not hang on "Loading..." — it should surface an error
    // state the user can act on (a close button when one is available).
    expect(container.textContent).not.toContain("Loading...");
  });

  it("calls onClose once per Escape press when the prop is supplied", async () => {
    vi.mocked(fileSrc).mockResolvedValue("asset://localhost/vault/a.png");
    const onClose = vi.fn();
    render(<ImageViewer path="/vault/a.png" onClose={onClose} />);
    await waitFor(() => expect(document.querySelector("img")).not.toBeNull());

    expect(onClose).not.toHaveBeenCalled();
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
