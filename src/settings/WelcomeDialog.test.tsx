/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";

// store.ts calls window.matchMedia at module load (system-theme detection),
// which jsdom doesn't implement; mock it out rather than stub matchMedia,
// since all this test needs from it is a spy on setWorkspacePath.
vi.mock("./store", () => ({
  setWorkspacePath: vi.fn(),
}));
vi.mock("../workspace/tauriBridge", () => ({
  pickWorkspaceFolder: vi.fn(),
}));

import { WelcomeDialog } from "./WelcomeDialog";
import { setWorkspacePath } from "./store";
import { pickWorkspaceFolder } from "../workspace/tauriBridge";

afterEach(() => {
  cleanup();
  vi.mocked(setWorkspacePath).mockReset();
  vi.mocked(pickWorkspaceFolder).mockReset();
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
