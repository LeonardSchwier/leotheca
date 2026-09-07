/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/preact";
import { signal } from "@preact/signals";
import type { WorkspaceTransitionRecoveryInfo } from "./store";
import type { WorkspaceTransitionState } from "../workspace/workspaceTransition";

// A plain mutable object, not a real Preact signal: the banner only ever
// writes workspaceTransitions.state (on dismiss), it never reads it
// reactively in render, so a `.value` holder is all this mock needs.
// vi.hoisted's callback runs before any of this file's own imports are
// initialized, so it cannot call the real signal() constructor.
const { transitionState } = vi.hoisted(() => ({
  transitionState: { value: { status: "idle" } as WorkspaceTransitionState },
}));

vi.mock("./store", () => ({
  workspaceTransitionRecovery: signal<WorkspaceTransitionRecoveryInfo | null>(null),
}));
vi.mock("../workspace/workspaceTransition", () => ({
  workspaceTransitions: { state: transitionState },
}));

import { WorkspaceTransitionBanner } from "./WorkspaceTransitionBanner";
import { workspaceTransitionRecovery } from "./store";

function makeRecovery(overrides: Partial<WorkspaceTransitionRecoveryInfo> = {}): WorkspaceTransitionRecoveryInfo {
  return {
    targetProfileId: "b",
    targetProfileName: "Work",
    kind: "workspace_missing",
    message: "Could not open that workspace: gone.",
    actions: [
      { id: "retry", label: "Retry" },
      { id: "relink", label: "Relink folder" },
      { id: "open-another", label: "Open another workspace" },
      { id: "forget", label: "Forget this workspace" },
    ],
    retry: vi.fn(async () => {}),
    discard: vi.fn(async () => {}),
    relink: vi.fn(async () => {}),
    openAnother: vi.fn(async () => {}),
    forget: vi.fn(async () => {}),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  workspaceTransitionRecovery.value = null;
  transitionState.value = { status: "idle" };
});

describe("WorkspaceTransitionBanner", () => {
  it("renders nothing when there is no recovery to show", () => {
    const { container } = render(<WorkspaceTransitionBanner />);
    expect(container.textContent).toBe("");
  });

  it("shows the target profile name and message, and exactly the buttons actions lists", () => {
    workspaceTransitionRecovery.value = makeRecovery();

    const { getByText, queryByText } = render(<WorkspaceTransitionBanner />);

    expect(getByText(/Couldn't switch to "Work"/)).toBeTruthy();
    expect(getByText(/gone\./)).toBeTruthy();
    expect(getByText("Retry")).toBeTruthy();
    expect(getByText("Relink folder")).toBeTruthy();
    expect(getByText("Open another workspace")).toBeTruthy();
    expect(getByText("Forget this workspace")).toBeTruthy();
    // permission_missing's own "Grant access again" label must not appear
    // for a workspace_missing recovery.
    expect(queryByText("Grant access again")).toBeNull();
  });

  it("calls retry and shows busy state while it is in flight", async () => {
    let resolveRetry!: () => void;
    const retry = vi.fn(() => new Promise<void>((resolve) => { resolveRetry = resolve; }));
    workspaceTransitionRecovery.value = makeRecovery({ retry });

    const { getByText } = render(<WorkspaceTransitionBanner />);
    fireEvent.click(getByText("Retry"));

    expect(retry).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(getByText("Working…")).toBeTruthy());

    resolveRetry();
    await waitFor(() => expect(getByText("Retry")).toBeTruthy());
  });

  it("calls the matching closure for relink, open-another, and forget", () => {
    const recovery = makeRecovery();
    workspaceTransitionRecovery.value = recovery;

    const { getByText } = render(<WorkspaceTransitionBanner />);
    fireEvent.click(getByText("Relink folder"));
    fireEvent.click(getByText("Open another workspace"));
    fireEvent.click(getByText("Forget this workspace"));

    expect(recovery.relink).toHaveBeenCalledTimes(1);
    expect(recovery.openAnother).toHaveBeenCalledTimes(1);
    expect(recovery.forget).toHaveBeenCalledTimes(1);
  });

  it("labels the same relink closure as 'Grant access again' for permission_missing", () => {
    const recovery = makeRecovery({
      kind: "permission_missing",
      actions: [
        { id: "grant-access", label: "Grant access again" },
        { id: "open-another", label: "Open another workspace" },
        { id: "forget", label: "Forget this workspace" },
      ],
    });
    workspaceTransitionRecovery.value = recovery;

    const { getByText, queryByText } = render(<WorkspaceTransitionBanner />);
    expect(queryByText("Relink folder")).toBeNull();
    fireEvent.click(getByText("Grant access again"));

    expect(recovery.relink).toHaveBeenCalledTimes(1);
  });

  it("gates discard behind window.confirm and does nothing if declined", () => {
    const recovery = makeRecovery({
      kind: "save_failed",
      actions: [
        { id: "retry", label: "Retry" },
        { id: "discard", label: "Switch without saving" },
      ],
    });
    workspaceTransitionRecovery.value = recovery;
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    const { getByText } = render(<WorkspaceTransitionBanner />);
    fireEvent.click(getByText("Switch without saving"));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(recovery.discard).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("calls discard once window.confirm is accepted", () => {
    const recovery = makeRecovery({
      kind: "save_failed",
      actions: [
        { id: "retry", label: "Retry" },
        { id: "discard", label: "Switch without saving" },
      ],
    });
    workspaceTransitionRecovery.value = recovery;
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    const { getByText } = render(<WorkspaceTransitionBanner />);
    fireEvent.click(getByText("Switch without saving"));

    expect(recovery.discard).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });

  it("dismisses by resetting workspaceTransitions.state to idle, without calling any recovery action", () => {
    const recovery = makeRecovery();
    workspaceTransitionRecovery.value = recovery;
    transitionState.value = { status: "error", targetProfileId: "b", phase: "access", message: "gone" };

    const { getByLabelText } = render(<WorkspaceTransitionBanner />);
    fireEvent.click(getByLabelText("Dismiss"));

    expect(transitionState.value).toEqual({ status: "idle" });
    expect(recovery.retry).not.toHaveBeenCalled();
  });
});
