/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/preact";
import { VaultStatsPanel, type WorkspaceStats } from "./VaultStatsPanel";

afterEach(() => {
  cleanup();
});

const fullStats: WorkspaceStats = {
  folderCount: 3,
  noteCount: 42,
  imageCount: 5,
  averageLinesPerNote: 12.345,
  oldestNoteDate: 1700000000,
  newestNoteDate: 1750000000,
};

describe("VaultStatsPanel", () => {
  it("renders nothing when no loader is given", () => {
    const { container } = render(<VaultStatsPanel rootPath="/vault" />);
    expect(container.querySelector("section")).toBeNull();
  });

  it("shows a loading placeholder while stats are pending", () => {
    const { getByText } = render(
      <VaultStatsPanel rootPath="/vault" loadStats={() => new Promise(() => {})} />,
    );
    expect(getByText("Loading workspace statistics...")).toBeTruthy();
  });

  it("renders the loaded stats, formatted", async () => {
    const { getByText } = render(
      <VaultStatsPanel rootPath="/vault" loadStats={async () => fullStats} />,
    );
    await waitFor(() => expect(getByText("42")).toBeTruthy());
    expect(getByText("3")).toBeTruthy();
    expect(getByText("5")).toBeTruthy();
    expect(getByText("12.3")).toBeTruthy(); // toFixed(1), not the raw 12.345
  });

  it("shows a placeholder for oldest/newest note dates when there are no notes yet", async () => {
    const { getAllByText } = render(
      <VaultStatsPanel
        rootPath="/vault"
        loadStats={async () => ({
          ...fullStats,
          noteCount: 0,
          oldestNoteDate: null,
          newestNoteDate: null,
        })}
      />,
    );
    await waitFor(() => expect(getAllByText("No notes yet")).toHaveLength(2));
  });

  it("shows a platform-limitation message (not \"No notes yet\") when notes exist but dates aren't null reported, e.g. Android", async () => {
    const { getAllByText, queryByText } = render(
      <VaultStatsPanel
        rootPath="/vault"
        loadStats={async () => ({ ...fullStats, oldestNoteDate: null, newestNoteDate: null })}
      />,
    );
    await waitFor(() =>
      expect(getAllByText("Not available on this platform")).toHaveLength(2),
    );
    expect(queryByText("No notes yet")).toBeNull();
  });

  it("shows an error message if the loader rejects", async () => {
    const { getByText } = render(
      <VaultStatsPanel
        rootPath="/vault"
        loadStats={async () => {
          throw new Error("workspace unreadable");
        }}
      />,
    );
    await waitFor(() =>
      expect(getByText("Could not load workspace statistics: workspace unreadable")).toBeTruthy(),
    );
  });

  it("ignores a stale resolution for a previous rootPath that arrives after a newer one", async () => {
    let resolveFirst!: (v: WorkspaceStats) => void;
    let resolveSecond!: (v: WorkspaceStats) => void;
    const first = new Promise<WorkspaceStats>((r) => {
      resolveFirst = r;
    });
    const second = new Promise<WorkspaceStats>((r) => {
      resolveSecond = r;
    });
    const loadStats = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);

    const { getByText, rerender } = render(<VaultStatsPanel rootPath="/vault-a" loadStats={loadStats} />);
    rerender(<VaultStatsPanel rootPath="/vault-b" loadStats={loadStats} />);

    await act(async () => {
      resolveSecond({ ...fullStats, noteCount: 200 });
    });
    await act(async () => {
      resolveFirst({ ...fullStats, noteCount: 1 });
    });

    expect(getByText("200")).toBeTruthy();
  });
});
