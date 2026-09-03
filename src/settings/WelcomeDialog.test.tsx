/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { signal } from "@preact/signals";

vi.mock("./store", () => ({
  addWorkspaceFromPicker: vi.fn(),
  workspaceSelectionError: signal<string | null>(null),
}));

import { WelcomeDialog } from "./WelcomeDialog";
import { addWorkspaceFromPicker, workspaceSelectionError } from "./store";

afterEach(() => {
  cleanup();
  vi.mocked(addWorkspaceFromPicker).mockReset();
  workspaceSelectionError.value = null;
});

describe("WelcomeDialog", () => {
  it("adds a workspace from the picker when Choose Folder is clicked", async () => {
    vi.mocked(addWorkspaceFromPicker).mockResolvedValue(undefined);
    const { getByText } = render(<WelcomeDialog />);

    await fireEvent.click(getByText("Choose Folder"));
    await Promise.resolve();

    expect(addWorkspaceFromPicker).toHaveBeenCalledTimes(1);
  });

  it("stays open and swallows a rejection so the user can retry", async () => {
    vi.mocked(addWorkspaceFromPicker).mockRejectedValue(new Error("boom"));
    const { getByText } = render(<WelcomeDialog />);

    await fireEvent.click(getByText("Choose Folder"));
    await Promise.resolve();

    expect(getByText("Choose Folder")).toBeTruthy();
  });
});
