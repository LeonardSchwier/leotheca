/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../workspace/tauriBridge", () => ({ fileSrc: vi.fn(), readTextFile: vi.fn() }));
vi.mock("../settings/store", async () => {
  const { signal } = await import("@preact/signals");
  return { workspacePath: signal<string | null>(null) };
});

import { MarkdownPreview } from "./MarkdownPreview";

afterEach(() => cleanup());

describe("MarkdownPreview heading block IDs", () => {
  it("hides an ATX marker and anchors the rendered heading", () => {
    const { container } = render(<MarkdownPreview source="## Architecture ^arch" notePath="/vault/note.md" />);
    const heading = container.querySelector("h2");
    expect(heading?.textContent).toBe("Architecture");
    expect(heading?.id).toBe("lt-block-arch");
    expect(heading?.getAttribute("data-lt-block-id")).toBe("arch");
  });
  it("keeps setext rendering intact while hiding and anchoring its marker", () => {
    const { container } = render(<MarkdownPreview source={"Architecture ^arch\n============\nBody"} notePath="/vault/note.md" />);
    const heading = container.querySelector("h1");
    expect(heading?.textContent).toBe("Architecture");
    expect(heading?.id).toBe("lt-block-arch");
  });
});
