/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { scanHeadings } from "../markdown/headings";
import {
  copyHeadingLink,
  headingLinkDisabledReason,
  headingLinkText,
  insertHeadingLink,
} from "./headingLinkOperations";
import { outlineInsertRequest } from "./outlineNavigation";

afterEach(() => {
  outlineInsertRequest.value = null;
});

function heading(content: string) {
  return scanHeadings(content)[0];
}

describe("headingLinkText", () => {
  it("builds the note-qualified form when a note title is given", () => {
    expect(headingLinkText(heading("## Milestones\n"), "Project Plan")).toBe(
      "[[Project Plan#Milestones]]",
    );
  });

  it("builds the same-note form when no note title is given", () => {
    expect(headingLinkText(heading("## Milestones\n"))).toBe("[[#Milestones]]");
  });

  it("escapes special characters in both the note title and the heading text", () => {
    expect(headingLinkText(heading("## A # B | C\n"), "Note #1")).toBe(
      "[[Note \\#1#A \\# B \\| C]]",
    );
  });

  it("uses the heading's already-collapsed displayText, not its raw source markup", () => {
    expect(headingLinkText(heading("##    Extra   Spaces   \n"), "Note")).toBe(
      "[[Note#Extra Spaces]]",
    );
  });
});

describe("copyHeadingLink", () => {
  it("writes the note-qualified link text to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    await copyHeadingLink(heading("## Milestones\n"), "Project Plan");
    expect(writeText).toHaveBeenCalledWith("[[Project Plan#Milestones]]");
  });
});

describe("insertHeadingLink", () => {
  it("raises an outline insert request carrying the same-note link text", () => {
    insertHeadingLink(heading("## Milestones\n"));
    expect(outlineInsertRequest.value?.text).toBe("[[#Milestones]]");
  });

  it("re-raises a request (a new requestId) even for the exact same heading text", () => {
    insertHeadingLink(heading("## Milestones\n"));
    const firstId = outlineInsertRequest.value?.requestId;
    insertHeadingLink(heading("## Milestones\n"));
    expect(outlineInsertRequest.value?.requestId).not.toBe(firstId);
  });
});

describe("headingLinkDisabledReason", () => {
  it("returns undefined for a normal, unique heading", () => {
    expect(headingLinkDisabledReason(heading("## Milestones\n"), false)).toBeUndefined();
  });

  it("returns a reason for an untitled (empty) heading", () => {
    expect(headingLinkDisabledReason(heading("##\nBody"), false)).toBe(
      "This heading has no text to link to.",
    );
  });

  it("returns a reason for a duplicate heading, even with real text", () => {
    expect(headingLinkDisabledReason(heading("## Milestones\n"), true)).toBe(
      "This heading's text repeats elsewhere in the note, so a link to it would be ambiguous.",
    );
  });

  it("prefers the empty-text reason when a heading is somehow both empty and flagged duplicate", () => {
    expect(headingLinkDisabledReason(heading("##\nBody"), true)).toBe(
      "This heading has no text to link to.",
    );
  });
});
