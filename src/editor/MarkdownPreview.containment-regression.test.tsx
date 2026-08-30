/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/preact";

vi.mock("../workspace/tauriBridge", () => ({
  fileSrc: vi.fn(),
}));

import { MarkdownPreview } from "./MarkdownPreview";
import { fileSrc } from "../workspace/tauriBridge";

afterEach(() => {
  cleanup();
  vi.mocked(fileSrc).mockReset();
});

describe("N-004 negative control", () => {
  it("does not schedule a native read for an attachment that escapes the workspace", () => {
    render(
      <MarkdownPreview source="![outside](../../outside.png)" notePath="/vault/notes/today.md" />,
    );
    expect(fileSrc).not.toHaveBeenCalled();
  });
});
