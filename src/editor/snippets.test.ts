import { describe, expect, it } from "vitest";
import { parseSnippets, snippetExpansion } from "./snippets";

describe("parseSnippets", () => {
  it("keeps valid tab-separated local definitions", () => {
    expect(parseSnippets("todo\t- [ ] \nquote\t> ")).toEqual([
      { trigger: "todo", replacement: "- [ ] " },
      { trigger: "quote", replacement: "> " },
    ]);
  });

  it("ignores blank, malformed, duplicate, and unsafe triggers", () => {
    expect(parseSnippets("\nmissing\ndupe\tfirst\ndupe\tsecond\nnot valid\ttext\nempty\t")).toEqual([
      { trigger: "dupe", replacement: "first" },
    ]);
  });
});

describe("snippetExpansion", () => {
  const snippets = [{ trigger: "todo", replacement: "- [ ] " }];

  it("replaces only a complete trigger immediately before the cursor", () => {
    expect(snippetExpansion("plan ;todo", snippets)).toEqual({ from: 5, replacement: "- [ ] " });
  });

  it("does not expand an unknown or partial trigger", () => {
    expect(snippetExpansion("plan ;tod", snippets)).toBeNull();
    expect(snippetExpansion("plan todo", snippets)).toBeNull();
  });
});
