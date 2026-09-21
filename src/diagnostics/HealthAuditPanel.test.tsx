import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/preact";
import { linkIndex } from "../linking/store";
import type { LinkIndex } from "../linking/store";
import type { WikiLinkRecord } from "../linking/wikiSyntax";
import { HealthAuditPanel } from "./HealthAuditPanel";

// Mock workspace bridges
vi.mock("../workspace/tauriBridge", () => ({
  readTextFilesBatch: vi.fn().mockResolvedValue([]),
  trashPath: vi.fn().mockResolvedValue(undefined),
  renamePath: vi.fn().mockResolvedValue(undefined),
  writeTextFile: vi.fn().mockResolvedValue(undefined),
  findAllFiles: vi.fn().mockResolvedValue([]),
}));

vi.mock("../settings/store", () => ({
  workspacePath: { value: null },
}));

vi.mock("../outline/outlineNavigation", () => ({
  requestOutlineReveal: vi.fn(),
}));

function makeIndex(overrides: Partial<LinkIndex> = {}): LinkIndex {
  return {
    backlinksByPath: new Map(),
    pathsByNoteName: new Map(),
    pathsByAlias: new Map(),
    aliasesByPath: new Map(),
    pathsByTag: new Map(),
    tagsByPath: new Map(),
    tasksByPath: new Map(),
    mtimeByPath: new Map(),
    hasFrontmatterByPath: new Set(),
    frontmatterPropertiesByPath: new Map(),
    wikiLinksByPath: new Map(),
    headingsByPath: new Map(),
    blocksByPath: new Map(),
    ...overrides,
  };
}

function makeBrokenLink(target: string): WikiLinkRecord {
  const raw = `[[${target}]]`;
  return {
    kind: "link",
    raw,
    noteTarget: target,
    sourceFrom: 0,
    sourceTo: raw.length,
    targetFrom: 2,
    targetTo: raw.length - 2,
    parseStatus: "valid",
    legacyRaw: target,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  linkIndex.value = makeIndex();
});

describe("HealthAuditPanel", () => {
  it("renders the panel with heading", () => {
    render(<HealthAuditPanel onOpenFile={vi.fn()} />);
    expect(screen.getByText("Workspace Health")).toBeTruthy();
  });

  it("renders link diagnostics for broken links", () => {
    linkIndex.value = makeIndex({
      wikiLinksByPath: new Map([
        ["note.md", [makeBrokenLink("Missing Note")]],
      ]),
    });
    render(<HealthAuditPanel onOpenFile={vi.fn()} />);
    expect(screen.getAllByText("Link issues").length).toBeGreaterThan(0);
  });

  it("renders a broken link row with target info", () => {
    linkIndex.value = makeIndex({
      wikiLinksByPath: new Map([
        ["src.md", [makeBrokenLink("Missing")]],
      ]),
    });
    const { container } = render(<HealthAuditPanel onOpenFile={vi.fn()} />);
    // The row should contain the target name and the source note title.
    expect(container.textContent).toContain("Missing");
    expect(container.textContent).toContain("src");
  });

  it("renders a healthy workspace message", () => {
    render(<HealthAuditPanel onOpenFile={vi.fn()} />);
    const { container } = render(<HealthAuditPanel onOpenFile={vi.fn()} />);
    expect(container.textContent).toContain("No issues found");
  });

  it("shows the count badge when findings exist", () => {
    linkIndex.value = makeIndex({
      wikiLinksByPath: new Map([
        ["src.md", [makeBrokenLink("A"), makeBrokenLink("B")]],
      ]),
    });
    const { container } = render(<HealthAuditPanel onOpenFile={vi.fn()} />);
    expect(container.textContent).toContain("2");
  });
});
