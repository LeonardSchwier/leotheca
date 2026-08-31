/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/preact";

vi.mock("../workspace/tauriBridge", () => ({
  fileSrc: vi.fn(),
}));

vi.mock("../settings/store", async () => {
  const { signal } = await import("@preact/signals");
  return { workspacePath: signal<string | null>(null) };
});

import { MarkdownPreview } from "./MarkdownPreview";
import { workspacePath } from "../settings/store";
import { fileSrc } from "../workspace/tauriBridge";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function imageSource(prefix: string, count: number): string {
  return Array.from({ length: count }, (_, index) => `![${prefix}-${index}](${prefix}-${index}.png)`).join(
    "\n",
  );
}

beforeEach(() => {
  workspacePath.value = "/vault";
});

afterEach(() => {
  cleanup();
  workspacePath.value = null;
  vi.mocked(fileSrc).mockReset();
});

describe("MarkdownPreview attachment read concurrency", () => {
  it("never runs more than six attachment reads at once and still resolves every current image", async () => {
    const pending: Array<{ path: string; gate: Deferred<string> }> = [];
    let active = 0;
    let maxActive = 0;

    vi.mocked(fileSrc).mockImplementation((path) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      const gate = deferred<string>();
      pending.push({ path, gate });
      return gate.promise.finally(() => {
        active -= 1;
      });
    });

    const { container } = render(
      <MarkdownPreview source={imageSource("cat", 12)} notePath="/vault/notes/today.md" />,
    );

    await waitFor(() => expect(fileSrc).toHaveBeenCalledTimes(6));
    expect(maxActive).toBeLessThanOrEqual(6);

    for (const { path, gate } of pending.slice(0, 6)) {
      gate.resolve(`asset://localhost${path}`);
    }

    await waitFor(() => expect(fileSrc).toHaveBeenCalledTimes(12));
    for (const { path, gate } of pending.slice(6)) {
      gate.resolve(`asset://localhost${path}`);
    }

    await waitFor(() => {
      const images = Array.from(container.querySelectorAll("img"));
      expect(images).toHaveLength(12);
      expect(images.every((image) => image.getAttribute("src")?.startsWith("asset://localhost/"))).toBe(
        true,
      );
    });
    expect(maxActive).toBeLessThanOrEqual(6);
  });

  it("abandons queued attachment reads when a rerender makes the old preview obsolete", async () => {
    const oldGates: Deferred<string>[] = [];

    vi.mocked(fileSrc).mockImplementation((path) => {
      if (path.endsWith("/new.png")) {
        return Promise.resolve("asset://localhost/vault/notes/new.png");
      }
      const gate = deferred<string>();
      oldGates.push(gate);
      return gate.promise;
    });

    const view = render(
      <MarkdownPreview source={imageSource("old", 10)} notePath="/vault/notes/today.md" />,
    );

    await waitFor(() => expect(fileSrc).toHaveBeenCalledTimes(6));
    view.rerender(<MarkdownPreview source="![new](new.png)" notePath="/vault/notes/today.md" />);

    await waitFor(() => expect(fileSrc).toHaveBeenCalledWith("/vault/notes/new.png"));

    for (const gate of oldGates) {
      gate.resolve("asset://localhost/vault/notes/old.png");
    }
    await Promise.resolve();
    await Promise.resolve();

    const oldCalls = vi
      .mocked(fileSrc)
      .mock.calls.map(([path]) => path)
      .filter((path) => path.includes("/old-"));
    expect(oldCalls).toHaveLength(6);
  });

  it("keeps one failed attachment local and continues resolving the rest of the current queue", async () => {
    vi.mocked(fileSrc).mockImplementation((path) => {
      if (path.endsWith("/cat-0.png")) return Promise.reject(new Error("unreadable"));
      return Promise.resolve(`asset://localhost${path}`);
    });

    const { container } = render(
      <MarkdownPreview source={imageSource("cat", 8)} notePath="/vault/notes/today.md" />,
    );

    await waitFor(() => expect(fileSrc).toHaveBeenCalledTimes(8));
    await waitFor(() => {
      const resolved = Array.from(container.querySelectorAll("img")).filter((image) =>
        image.getAttribute("src")?.startsWith("asset://localhost/"),
      );
      expect(resolved).toHaveLength(7);
    });
  });
});
