/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { signal } from "@preact/signals";

vi.mock("./store", () => ({
  setWorkspacePath: vi.fn(),
  workspaceSelectionError: signal<string | null>(null),
}));
vi.mock("../workspace/tauriBridge", () => ({
  pickWorkspaceFolder: vi.fn(),
}));

import { WelcomeDialog } from "./WelcomeDialog";
import { setWorkspacePath, workspaceSelectionError } from "./store";
import { pickWorkspaceFolder } from "../workspace/tauriBridge";

afterEach(() => {
  cleanup();
  vi.mocked(setWorkspacePath).mockReset();
  vi.mocked(pickWorkspaceFolder).mockReset();
  workspaceSelectionError.value = null;
});

describe("WelcomeDialog", () => {
  it("opens the workspace at the chosen folder's path and token", async () => {
    vi.mocked(pickWorkspaceFolder).mockResolvedValue({ path: "/home/user/vault", token: "tok-1" });
    const { getByText } = render(<WelcomeDialog />);

    await fireEvent.click(getByText("Choose Folder"));
    await Promise.resolve();

    expect(setWorkspacePath).toHaveBeenCalledWith("/home/user/vault", "tok-1");
  });

  it("does nothing when the folder picker is cancelled", async () => {
    vi.mocked(pickWorkspaceFolder).mockResolvedValue(null);
    const { getByText } = render(<WelcomeDialog />);

    await fireEvent.click(getByText("Choose Folder"));
    await Promise.resolve();

    expect(setWorkspacePath).not.toHaveBeenCalled();
  });
});
