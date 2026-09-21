import { describe, expect, it } from "vitest";
import type { LinkIndex } from "../linking/store";
import {
  computeWorkspaceHealthAudit,
  groupHealthAuditFindings,
} from "./healthAudit";

/**
 * Builds a minimal `LinkIndex` fixture for workspace-level health audit
 * tests. Unlike `diagnostics.test.ts`'s `buildFixtureIndex` (which runs
 * the real scanners over note content), this helper lets us control the
 * exact map contents directly, which is what we need to test the
 * orphaned/empty heuristics independently of the scanner behaviour.
 *
 * The `linkIndex` signal is not assigned here: `computeWorkspaceHealthAudit`
 * is a pure function over its `index` argument and does not call
 * `resolveWikiLinkTarget`, so no signal assignment is needed.
 */
function makeIndex(
  notePaths: string[],
  opts: {
    backlinksByPath?: Map<string, string[]>;
    wikiLinksByPath?: Map<string, unknown[]>;
    headingsByPath?: Map<string, unknown[]>;
    tasksByPath?: Map<string, unknown[]>;
  } = {},
): LinkIndex {
  const pathsByNoteName = new Map<string, string[]>();
  for (const p of notePaths) {
    const name = (p.split("/").pop() ?? p).replace(/\.md$/i, "").toLocaleLowerCase();
    const existing = pathsByNoteName.get(name) ?? [];
    existing.push(p);
    pathsByNoteName.set(name, existing);
  }
  const backlinksByPath = opts.backlinksByPath ?? new Map<string, string[]>();
  for (const p of notePaths) {
    if (!backlinksByPath.has(p)) backlinksByPath.set(p, []);
  }

  return {
    backlinksByPath,
    pathsByNoteName,
    pathsByAlias: new Map(),
    aliasesByPath: new Map(),
    pathsByTag: new Map(),
    tagsByPath: new Map(),
    tasksByPath: opts.tasksByPath ?? new Map(),
    wikiLinksByPath: opts.wikiLinksByPath ?? new Map(),
    headingsByPath: opts.headingsByPath ?? new Map(),
    noteCount: notePaths.length,
  };
}

describe("computeWorkspaceHealthAudit", () => {
  it("returns an empty array for an empty workspace", () => {
    expect(computeWorkspaceHealthAudit(makeIndex([]))).toEqual([]);
  });

  it("flags a single isolated note as orphaned and appears-empty", () => {
    // One note, no links in or out, no headings, no tasks.
    const index = makeIndex(["/vault/Solo.md"]);
    const findings = computeWorkspaceHealthAudit(index);
    const orphans = findings.filter((f) => f.kind === "orphaned");
    const empties = findings.filter((f) => f.kind === "empty");
    expect(orphans).toHaveLength(1);
    expect(orphans[0].notePath).toBe("/vault/Solo.md");
    expect(empties).toHaveLength(1);
    expect(empties[0].notePath).toBe("/vault/Solo.md");
  });

  it("does not flag a note that has incoming backlinks", () => {
    const index = makeIndex(["/vault/A.md", "/vault/B.md"], {
      // A links to B, so B has an incoming backlink.
      backlinksByPath: new Map([
        ["/vault/A.md", []],
        ["/vault/B.md", ["/vault/A.md"]],
      ]),
      wikiLinksByPath: new Map([
        ["/vault/A.md", [{} as never]], // A has one outgoing wikilink
      ]),
    });
    const findings = computeWorkspaceHealthAudit(index);
    const bOrphans = findings.filter(
      (f) => f.kind === "orphaned" && f.notePath === "/vault/B.md",
    );
    expect(bOrphans).toHaveLength(0);
  });

  it("does not flag a note that has outgoing wikilinks", () => {
    const index = makeIndex(["/vault/A.md", "/vault/B.md"], {
      wikiLinksByPath: new Map([
        ["/vault/A.md", [{} as never]], // A links out → not orphaned
      ]),
    });
    const findings = computeWorkspaceHealthAudit(index);
    const aOrphans = findings.filter(
      (f) => f.kind === "orphaned" && f.notePath === "/vault/A.md",
    );
    expect(aOrphans).toHaveLength(0);
  });

  it("does not flag a note that has headings (not appears-empty)", () => {
    const index = makeIndex(["/vault/A.md", "/vault/B.md"], {
      headingsByPath: new Map([
        ["/vault/A.md", [{} as never]], // A has headings → not empty
      ]),
    });
    const findings = computeWorkspaceHealthAudit(index);
    const aEmpties = findings.filter(
      (f) => f.kind === "empty" && f.notePath === "/vault/A.md",
    );
    expect(aEmpties).toHaveLength(0);
  });

  it("does not flag a note that has tasks (not appears-empty)", () => {
    const index = makeIndex(["/vault/A.md", "/vault/B.md"], {
      tasksByPath: new Map([
        ["/vault/A.md", [{} as never]], // A has tasks → not empty
      ]),
    });
    const findings = computeWorkspaceHealthAudit(index);
    const aEmpties = findings.filter(
      (f) => f.kind === "empty" && f.notePath === "/vault/A.md",
    );
    expect(aEmpties).toHaveLength(0);
  });

  it("flags both notes when both are isolated", () => {
    const index = makeIndex(["/vault/A.md", "/vault/B.md"]);
    const findings = computeWorkspaceHealthAudit(index);
    const orphans = findings.filter((f) => f.kind === "orphaned");
    expect(orphans).toHaveLength(2);
    expect(orphans.map((f) => f.notePath)).toEqual(["/vault/A.md", "/vault/B.md"]);
  });

  it("sorts findings by note path", () => {
    const index = makeIndex(["/vault/Zeta.md", "/vault/Alpha.md"]);
    const findings = computeWorkspaceHealthAudit(index);
    const orphans = findings.filter((f) => f.kind === "orphaned");
    expect(orphans.map((f) => f.notePath)).toEqual([
      "/vault/Alpha.md",
      "/vault/Zeta.md",
    ]);
  });

  it("handles a mixed workspace: linked + isolated notes", () => {
    // A ↔ B are linked; C is isolated.
    const index = makeIndex(
      ["/vault/A.md", "/vault/B.md", "/vault/C.md"],
      {
        backlinksByPath: new Map([
          ["/vault/A.md", ["/vault/B.md"]],
          ["/vault/B.md", ["/vault/A.md"]],
          ["/vault/C.md", []],
        ]),
        wikiLinksByPath: new Map([
          ["/vault/A.md", [{} as never]],
          ["/vault/B.md", [{} as never]],
        ]),
        headingsByPath: new Map([
          ["/vault/A.md", [{} as never]],
          ["/vault/B.md", [{} as never]],
        ]),
      },
    );
    const findings = computeWorkspaceHealthAudit(index);
    // C is the only orphaned + empty note.
    const cFindings = findings.filter((f) => f.notePath === "/vault/C.md");
    expect(cFindings).toHaveLength(2); // orphaned + empty
    const aFindings = findings.filter((f) => f.notePath === "/vault/A.md");
    expect(aFindings).toHaveLength(0);
  });

  it("returns an empty array when noteCount is 0 even if pathsByNoteName is non-empty (defensive)", () => {
    const index = makeIndex(["/vault/A.md"]);
    index.noteCount = 0; // simulate inconsistency
    expect(computeWorkspaceHealthAudit(index)).toEqual([]);
  });
});

describe("groupHealthAuditFindings", () => {
  it("returns an empty array when there are no findings", () => {
    expect(groupHealthAuditFindings([])).toEqual([]);
  });

  it("groups findings by kind with correct counts and sorted note paths", () => {
    const findings = [
      { id: "orphan:/vault/C.md", kind: "orphaned" as const, notePath: "/vault/C.md" },
      { id: "orphan:/vault/A.md", kind: "orphaned" as const, notePath: "/vault/A.md" },
      { id: "empty:/vault/B.md", kind: "empty" as const, notePath: "/vault/B.md" },
    ];
    const groups = groupHealthAuditFindings(findings);
    expect(groups).toHaveLength(2);
    expect(groups[0].kind).toBe("orphaned");
    expect(groups[0].label).toBe("Orphaned notes");
    expect(groups[0].count).toBe(2);
    expect(groups[0].notePaths).toEqual(["/vault/A.md", "/vault/C.md"]);
    expect(groups[1].kind).toBe("empty");
    expect(groups[1].label).toBe("Appears empty");
    expect(groups[1].count).toBe(1);
  });

  it("omits a kind group when it has zero findings", () => {
    const findings = [
      { id: "orphan:/vault/A.md", kind: "orphaned" as const, notePath: "/vault/A.md" },
    ];
    const groups = groupHealthAuditFindings(findings);
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe("orphaned");
  });
});
