/**
 * F05-FR-27: Tests for CaptureSheet accessibility features
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";

// Voice capture tests drive a fake engine; the real controller would touch
// MediaRecorder/native bridges that do not exist in jsdom.
const fakeEngine = vi.hoisted(() => ({
  created: 0,
  available: true,
  resultCb: null as null | ((r: { text: string; isFinal: boolean }) => void),
  stateCb: null as null | ((s: string) => void),
}));
vi.mock("../speech/speechController", () => ({
  SpeechController: class {
    constructor() {
      fakeEngine.created++;
    }
    onResult(cb: (r: { text: string; isFinal: boolean }) => void) {
      fakeEngine.resultCb = cb;
      return () => {};
    }
    onError() {
      return () => {};
    }
    onStateChange(cb: (s: string) => void) {
      fakeEngine.stateCb = cb;
      return () => {};
    }
    isSpeechRecognitionAvailable() {
      return Promise.resolve(fakeEngine.available);
    }
    async start() {
      fakeEngine.stateCb?.("recording");
    }
    async stop() {
      fakeEngine.stateCb?.("idle");
    }
  },
}));

// Template capture tests drive a fake workspace; every other bridge function
// keeps its real implementation (the no-op/jsdom behavior earlier tests use).
const fakeFs = vi.hoisted(() => ({
  files: new Map<string, string>(),
  dirs: new Map<string, string[]>(),
  writes: [] as Array<{ path: string; text: string }>,
  created: [] as Array<{ root: string; rel: string; text: string }>,
  active: false,
  listDelay: null as null | Promise<void>,
}));
vi.mock("../workspace/tauriBridge", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../workspace/tauriBridge")>();
  return {
    ...actual,
    listDir: async (root: string, path: string) => {
      if (!fakeFs.active) return actual.listDir(root, path);
      if (fakeFs.listDelay) await fakeFs.listDelay;
      const names = fakeFs.dirs.get(path);
      if (!names) throw new Error("no such dir");
      return names.map((name) => ({
        name,
        path: `${path}/${name}`,
        isDir: false,
      }));
    },
    readTextFile: async (path: string) => {
      if (!fakeFs.active) return actual.readTextFile(path);
      const text = fakeFs.files.get(path);
      if (text === undefined) throw new Error("ENOENT");
      return text;
    },
    writeTextFile: async (path: string, text: string) => {
      if (!fakeFs.active) return actual.writeTextFile(path, text);
      fakeFs.writes.push({ path, text });
    },
    createWorkspaceTextFileNew: async (
      root: string,
      rel: string,
      text: string,
    ) => {
      if (!fakeFs.active)
        return actual.createWorkspaceTextFileNew(root, rel, text);
      fakeFs.created.push({ root, rel, text });
    },
  };
});

// CaptureSheet.tsx imports workspacePath from settings/store.ts, which reads
// window.matchMedia at module load time; same jsdom + dynamic-import setup
// as settings/store.test.ts, see its own comment.
window.matchMedia = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
})) as unknown as typeof window.matchMedia;

const {
  CaptureSheet,
  captureSheetOpen,
  captureContent,
  captureTitle,
  captureSourceUrl,
  captureDestinationMode,
  captureOpenAfterCapture,
  closeCaptureSheet,
  announceCaptureMessage,
  captureAnnouncement,
  captureTargetKind,
  captureTargetPath,
  captureNoteList,
  captureTemplatePath,
  captureTemplateList,
} = await import("./CaptureSheet");
const { workspaceSettings, workspacePath } = await import("../settings/store");
const { act } = await import("@testing-library/preact");

describe("CaptureSheet Accessibility (F05-FR-27)", () => {
  beforeEach(() => {
    // Reset state
    captureSheetOpen.value = false;
    captureContent.value = "";
    captureTitle.value = "";
    captureSourceUrl.value = "";
    captureDestinationMode.value = "new";
    captureOpenAfterCapture.value = true;
    captureAnnouncement.value = "";
  });

  afterEach(() => {
    closeCaptureSheet();
    vi.clearAllMocks();
  });

  it("should have announcement signal", () => {
    expect(captureAnnouncement).toBeDefined();
    expect(captureAnnouncement.value).toBe("");
  });

  it("should announce messages without throwing", () => {
    expect(() => announceCaptureMessage("Test announcement")).not.toThrow();
  });

  it("should clear announcement when closing sheet", () => {
    captureAnnouncement.value = "Test announcement";
    expect(captureAnnouncement.value).toBe("Test announcement");

    closeCaptureSheet();
    expect(captureAnnouncement.value).toBe("");
  });

  it("should open and close capture sheet", () => {
    expect(captureSheetOpen.value).toBe(false);

    captureSheetOpen.value = true;
    expect(captureSheetOpen.value).toBe(true);

    closeCaptureSheet();
    expect(captureSheetOpen.value).toBe(false);
  });

  it("should clear all state when closing sheet", () => {
    captureSheetOpen.value = true;
    captureContent.value = "test content";
    captureTitle.value = "test title";
    captureSourceUrl.value = "https://example.com";
    captureDestinationMode.value = "append";
    captureOpenAfterCapture.value = false;

    closeCaptureSheet();

    expect(captureContent.value).toBe("");
    expect(captureTitle.value).toBe("");
    expect(captureSourceUrl.value).toBe("");
    expect(captureDestinationMode.value).toBe("new");
    expect(captureOpenAfterCapture.value).toBe(true);
  });

  it("should handle all destination modes", () => {
    const modes = ["append", "new", "date"] as const;
    modes.forEach((mode) => {
      captureDestinationMode.value = mode;
      expect(captureDestinationMode.value).toBe(mode);
    });
  });

  it("should export all required signals and functions", () => {
    // Export check for F05-FR-27 accessibility
    expect(CaptureSheet).toBeDefined();
    expect(captureSheetOpen).toBeDefined();
    expect(captureContent).toBeDefined();
    expect(captureTitle).toBeDefined();
    expect(captureSourceUrl).toBeDefined();
    expect(captureDestinationMode).toBeDefined();
    expect(captureOpenAfterCapture).toBeDefined();
    expect(closeCaptureSheet).toBeDefined();
    expect(announceCaptureMessage).toBeDefined();
    expect(captureAnnouncement).toBeDefined();
  });
});

// UX-01 spec sections 20/24.5: CaptureSheet now renders inside the shared
// Sheet primitive rather than a bespoke modal, so it inherits Sheet's
// modal semantics (title labeling, Escape/backdrop dismissal, initial
// focus, scroll lock, focus restoration) instead of reimplementing them.
describe("CaptureSheet Sheet-primitive integration", () => {
  beforeEach(() => {
    captureSheetOpen.value = false;
    captureContent.value = "";
    captureTitle.value = "";
    captureSourceUrl.value = "";
    captureDestinationMode.value = "new";
    captureOpenAfterCapture.value = true;
    captureAnnouncement.value = "";
  });

  afterEach(() => {
    cleanup();
    closeCaptureSheet();
    document.body.style.overflow = "";
  });

  it("renders nothing when closed", () => {
    const { container } = render(<CaptureSheet />);
    expect(container.firstChild).toBeNull();
  });

  it("renders as a labeled Sheet dialog once open, with focus on the capture textarea", () => {
    captureSheetOpen.value = true;
    const { getByRole } = render(<CaptureSheet />);
    const sheet = getByRole("dialog", { name: "Quick Capture" });
    expect(sheet.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(
      sheet.querySelector("#capture-content"),
    );
  });

  it("closes on Escape, the shared Sheet primitive's own dismissal path", () => {
    captureSheetOpen.value = true;
    render(<CaptureSheet />);
    expect(captureSheetOpen.value).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(captureSheetOpen.value).toBe(false);
  });

  it("closes when the Cancel action is pressed", () => {
    captureSheetOpen.value = true;
    const { getByText } = render(<CaptureSheet />);
    fireEvent.click(getByText("Cancel"));
    expect(captureSheetOpen.value).toBe(false);
  });

  it("restores focus to the opener once dismissed", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    captureSheetOpen.value = true;
    render(<CaptureSheet />);
    expect(document.activeElement).not.toBe(opener);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});

// ── Quick Capture target picker (rm-dd5994dcac66ebf8) ──────────────────────
describe("CaptureSheet target picker", () => {
  beforeEach(() => {
    captureSheetOpen.value = false;
    captureContent.value = "";
    captureTitle.value = "";
    captureSourceUrl.value = "";
    captureDestinationMode.value = "new";
    captureOpenAfterCapture.value = true;
    captureAnnouncement.value = "";
    captureTargetKind.value = "inbox";
    captureTargetPath.value = "";
  });

  afterEach(() => {
    cleanup();
    closeCaptureSheet();
    captureTargetKind.value = "inbox";
    captureTargetPath.value = "";
    document.body.style.overflow = "";
  });

  it("exports the target-selection signals", () => {
    expect(captureTargetKind).toBeDefined();
    expect(captureTargetPath).toBeDefined();
  });

  it("renders a 'Capture into' select when open", () => {
    captureSheetOpen.value = true;
    const { getByRole } = render(<CaptureSheet />);
    const select = getByRole("combobox", {
      name: /capture into/i,
    }) as HTMLSelectElement;
    expect(select).toBeDefined();
    // Default target is the inbox
    expect(select.value).toBe("inbox");
  });

  it("shows a 'Pick a specific note…' option", () => {
    captureSheetOpen.value = true;
    const { getAllByRole } = render(<CaptureSheet />);
    const options = getAllByRole("option");
    const values = options.map((o) => o.getAttribute("value"));
    expect(values).toContain("specific");
  });

  it("shows a 'Specific note' input when 'specific' is selected", () => {
    captureSheetOpen.value = true;
    captureTargetKind.value = "specific";
    const { queryByLabelText, queryByRole } = render(<CaptureSheet />);
    // The sub-picker renders a <select> labelled "Note" (id: capture-target-note)
    const input =
      queryByLabelText(/^note/i) ?? queryByRole("combobox", { name: /^note/i });
    expect(input).not.toBeNull();
  });

  it("does NOT show the specific-note input for other target kinds", () => {
    captureSheetOpen.value = true;
    captureTargetKind.value = "inbox";
    const { queryByRole } = render(<CaptureSheet />);
    // Only the main target select should be present, no note sub-picker
    const selects = queryByRole("combobox", { name: /^note/i });
    expect(selects).toBeNull();
  });

  it("resets captureTargetKind and captureTargetPath on close", () => {
    captureSheetOpen.value = true;
    captureTargetKind.value = "specific";
    captureTargetPath.value = "/some/path.md";
    closeCaptureSheet();
    expect(captureTargetKind.value).toBe("inbox");
    expect(captureTargetPath.value).toBe("");
  });

  it("updates the target select when the user changes it", () => {
    captureSheetOpen.value = true;
    const { getByRole } = render(<CaptureSheet />);
    const select = getByRole("combobox", { name: /capture into/i });
    fireEvent.change(select, { target: { value: "daily" } });
    expect(captureTargetKind.value).toBe("daily");
  });

  it("updates captureTargetPath when the user selects a specific note", () => {
    captureSheetOpen.value = true;
    captureTargetKind.value = "specific";
    captureNoteList.value = [
      { label: "Notes.md", path: "/workspace/Notes.md" },
      { label: "Ideas.md", path: "/workspace/Ideas.md" },
    ];
    const { getByRole } = render(<CaptureSheet />);
    const select = getByRole("combobox", {
      name: /^note/i,
    }) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "/workspace/Notes.md" } });
    expect(captureTargetPath.value).toBe("/workspace/Notes.md");
  });

  it("renders the target select inside the capture sheet dialog", () => {
    captureSheetOpen.value = true;
    const { getByRole } = render(<CaptureSheet />);
    const dialog = getByRole("dialog", { name: "Quick Capture" });
    const select = dialog.querySelector("select");
    expect(select).not.toBeNull();
  });
});
// ── Quick Capture voice input (rm-f6a0135fc66d7dcd) ───────────────────────
describe("CaptureSheet voice input", () => {
  const original = workspaceSettings.value;
  beforeEach(() => {
    fakeEngine.created = 0;
    fakeEngine.available = true;
    captureSheetOpen.value = true;
    captureContent.value = "typed";
  });
  afterEach(() => {
    cleanup();
    closeCaptureSheet();
    workspaceSettings.value = original;
  });

  it("shows no microphone control and never creates an engine while speech-to-text is off", async () => {
    workspaceSettings.value = { ...original, speechToTextEnabled: false };
    const { queryByText } = render(<CaptureSheet />);
    await act(async () => {});
    expect(queryByText("Speak")).toBeNull();
    expect(fakeEngine.created).toBe(0);
  });

  it("hides the control when the engine is unavailable", async () => {
    workspaceSettings.value = { ...original, speechToTextEnabled: true };
    fakeEngine.available = false;
    const { queryByText } = render(<CaptureSheet />);
    await act(async () => {});
    expect(queryByText("Speak")).toBeNull();
  });

  it("appends a transcript to typed text and blocks Capture while recording", async () => {
    workspaceSettings.value = { ...original, speechToTextEnabled: true };
    const { findByText, getByLabelText } = render(<CaptureSheet />);
    fireEvent.click(await findByText("Speak"));
    await act(async () => {});
    const capture = (await findByText(
      "Stop and transcribe",
    )) as HTMLButtonElement;
    expect((getByLabelText("Capture note") as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.click(capture);
    await act(async () => {
      fakeEngine.resultCb?.({ text: "spoken words", isFinal: true });
    });
    expect(captureContent.value).toBe("typed\nspoken words");
  });

  it("drops a transcript that arrives after the sheet was closed", async () => {
    workspaceSettings.value = { ...original, speechToTextEnabled: true };
    const { findByText } = render(<CaptureSheet />);
    fireEvent.click(await findByText("Speak"));
    await act(async () => {});
    await act(async () => closeCaptureSheet());
    captureContent.value = "";
    await act(async () => {
      fakeEngine.resultCb?.({ text: "late", isFinal: true });
    });
    expect(captureContent.value).toBe("");
  });
});

describe("CaptureSheet optional template", () => {
  const original = workspaceSettings.value;
  const settle = () =>
    act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

  function setup(templatesEnabled = true) {
    fakeFs.active = true;
    fakeFs.files.clear();
    fakeFs.dirs.clear();
    fakeFs.writes.length = 0;
    fakeFs.created.length = 0;
    fakeFs.listDelay = null;
    fakeFs.dirs.set("/ws/Templates", ["Meeting.md", "Plain.md", "notes.txt"]);
    fakeFs.files.set(
      "/ws/Templates/Meeting.md",
      "## Meeting {{date}}\n\n{{content}}\n",
    );
    fakeFs.files.set("/ws/Templates/Plain.md", "tags: capture");
    fakeFs.files.set("/ws/Inbox.md", "# Inbox\n\nold");
    workspacePath.value = "/ws";
    workspaceSettings.value = {
      ...original,
      templatesEnabled,
      templatesFolder: "Templates",
      captureInboxNote: "Inbox.md",
    };
    captureTemplatePath.value = "";
    captureContent.value = "typed body";
    captureSheetOpen.value = true;
  }

  afterEach(() => {
    cleanup();
    closeCaptureSheet();
    captureTemplatePath.value = "";
    fakeFs.active = false;
    workspaceSettings.value = original;
    workspacePath.value = null;
  });

  it("shows no Template select when Templates is disabled", async () => {
    setup(false);
    const { container } = render(<CaptureSheet />);
    await settle();
    expect(container.querySelector("#capture-template")).toBeNull();
  });

  it("shows no Template select when the templates folder is empty or missing", async () => {
    setup();
    fakeFs.dirs.clear();
    const { container } = render(<CaptureSheet />);
    await settle();
    expect(container.querySelector("#capture-template")).toBeNull();
  });

  it("offers None first (the default) and only .md templates", async () => {
    setup();
    const { container } = render(<CaptureSheet />);
    await settle();
    const select = container.querySelector(
      "#capture-template",
    ) as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
      "None (plain capture)",
      "Meeting",
      "Plain",
    ]);
  });

  it("captures plain, exactly as before, when None is chosen", async () => {
    setup();
    const { getByLabelText } = render(<CaptureSheet />);
    await settle();
    fireEvent.click(getByLabelText("Capture note"));
    await settle();
    expect(fakeFs.writes).toHaveLength(1);
    expect(fakeFs.writes[0].path).toBe("/ws/Inbox.md");
    expect(fakeFs.writes[0].text).toMatch(
      /^# Inbox\n\nold\n\n### \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\n\ntyped body$/,
    );
  });

  it("appends the rendered template, without the built-in header, when one is chosen", async () => {
    setup();
    const { container, getByLabelText } = render(<CaptureSheet />);
    await settle();
    fireEvent.change(
      container.querySelector("#capture-template") as HTMLSelectElement,
      {
        target: { value: "/ws/Templates/Meeting.md" },
      },
    );
    fireEvent.click(getByLabelText("Capture note"));
    await settle();
    expect(fakeFs.writes).toHaveLength(1);
    expect(fakeFs.writes[0].text).toMatch(
      /^# Inbox\n\nold\n\n## Meeting \d{4}-\d{2}-\d{2}\n\ntyped body$/,
    );
    expect(captureSheetOpen.value).toBe(false);
  });

  it("creates the daily note from the rendered template", async () => {
    setup();
    fakeFs.dirs.set("Daily", []);
    captureTargetKind.value = "daily";
    workspaceSettings.value = {
      ...workspaceSettings.value,
      captureDatePattern: "Daily/{{date:YYYY-MM-DD}}.md",
    };
    const { container, getByLabelText } = render(<CaptureSheet />);
    await settle();
    fireEvent.change(
      container.querySelector("#capture-template") as HTMLSelectElement,
      {
        target: { value: "/ws/Templates/Plain.md" },
      },
    );
    fireEvent.click(getByLabelText("Capture note"));
    await settle();
    expect(fakeFs.created).toHaveLength(1);
    expect(fakeFs.created[0].text).toBe("tags: capture\n\ntyped body");
    expect(fakeFs.created[0].rel).toMatch(/^Daily\/\d{4}-\d{2}-\d{2}\.md$/);
  });

  it("aborts with a visible error, writing nothing and keeping the text, when the template cannot be read", async () => {
    setup();
    const { container, getByLabelText, getByRole } = render(<CaptureSheet />);
    await settle();
    fakeFs.files.delete("/ws/Templates/Meeting.md");
    fireEvent.change(
      container.querySelector("#capture-template") as HTMLSelectElement,
      {
        target: { value: "/ws/Templates/Meeting.md" },
      },
    );
    fireEvent.click(getByLabelText("Capture note"));
    await settle();
    expect(fakeFs.writes).toHaveLength(0);
    expect(fakeFs.created).toHaveLength(0);
    expect(getByRole("alert").textContent).toMatch(
      /Template could not be read.*None/,
    );
    expect(captureSheetOpen.value).toBe(true);
    expect(captureContent.value).toBe("typed body");
  });

  it("drops a remembered template that no longer exists in the folder", async () => {
    setup();
    captureTemplatePath.value = "/ws/Templates/Gone.md";
    render(<CaptureSheet />);
    await settle();
    expect(captureTemplatePath.value).toBe("");
  });

  it("keeps a still-valid choice across close and reopen", async () => {
    setup();
    captureTemplatePath.value = "/ws/Templates/Plain.md";
    render(<CaptureSheet />);
    await settle();
    expect(captureTemplatePath.value).toBe("/ws/Templates/Plain.md");
    act(() => closeCaptureSheet());
    expect(captureTemplatePath.value).toBe("/ws/Templates/Plain.md");
    expect(captureTemplateList.value).toEqual([]);
  });

  it("ignores a template listing that resolves after the sheet was closed", async () => {
    setup();
    let release!: () => void;
    fakeFs.listDelay = new Promise<void>((r) => {
      release = r;
    });
    const { unmount } = render(<CaptureSheet />);
    act(() => closeCaptureSheet());
    unmount();
    release();
    await settle();
    expect(captureTemplateList.value).toEqual([]);
  });
});
