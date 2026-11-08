import { beforeEach, describe, expect, it, vi } from "vitest";

const readTextFile = vi.hoisted(() => vi.fn());
vi.mock("../workspace/tauriBridge", () => ({ readTextFile }));

import {
  MAX_CAPTURE_TEMPLATE_BYTES,
  isCaptureTemplatePathAllowed,
  loadCaptureTemplate,
  renderCaptureTemplate,
} from "./captureTemplate";

const when = new Date(2026, 10, 7, 9, 5, 30);

describe("renderCaptureTemplate", () => {
  it("substitutes every placeholder, with spaces allowed inside braces", () => {
    const out = renderCaptureTemplate(
      "# {{title}}\n{{ date }} {{time}}\n{{url}}\n\n{{content}}\n",
      { content: "  body  ", title: "T", url: "https://x.test", date: when },
    );
    expect(out).toBe("# T\n2026-11-07 09:05\nhttps://x.test\n\nbody");
  });

  it("appends the body when the template has no {{content}}", () => {
    expect(
      renderCaptureTemplate("---\ntags: [capture]\n---\n", {
        content: "hello",
        date: when,
      }),
    ).toBe("---\ntags: [capture]\n---\n\nhello");
  });

  it("uses only the body for an empty template", () => {
    expect(renderCaptureTemplate("", { content: "hello" })).toBe("hello");
  });

  it("appends an unconsumed source URL, and not a consumed one", () => {
    expect(
      renderCaptureTemplate("{{content}}", {
        content: "a",
        url: "https://u.test",
      }),
    ).toBe("a\n\nSource: <https://u.test>");
    expect(
      renderCaptureTemplate("{{content}} {{url}}", {
        content: "a",
        url: "https://u.test",
      }),
    ).toBe("a https://u.test");
  });

  it("never re-scans substituted values", () => {
    expect(
      renderCaptureTemplate("{{title}}|{{content}}", {
        content: "{{title}} {{date}}",
        title: "{{content}}",
      }),
    ).toBe("{{content}}|{{title}} {{date}}");
  });

  it("leaves unknown placeholders verbatim and tolerates missing title", () => {
    expect(
      renderCaptureTemplate("{{nope}} [{{title}}] {{content}}", {
        content: "x",
      }),
    ).toBe("{{nope}} [] x");
  });

  it("preserves CRLF templates", () => {
    expect(renderCaptureTemplate("# Log\r\n", { content: "x" })).toBe(
      "# Log\r\n\r\nx",
    );
  });

  it("handles special replacement patterns in the body literally", () => {
    expect(
      renderCaptureTemplate("{{content}}", { content: "cost $& $1 $$" }),
    ).toBe("cost $& $1 $$");
  });
});

describe("renderCaptureTemplate line breaks in shared values", () => {
  // A share sender controls the subject and URL, so a line break in either
  // must not start a new line (a new YAML key) in the template's frontmatter.
  it("keeps a multi-line title on one line", () => {
    const out = renderCaptureTemplate(
      "---\ntitle: {{title}}\n---\n{{content}}",
      {
        content: "body",
        title: "Hi\ntags: [injected]\r\nx: y",
      },
    );
    expect(out.split("\n")[1]).toBe("title: Hi tags: [injected] x: y");
    expect(out.split("\n")).toHaveLength(4);
  });

  it("keeps a multi-line url on one line", () => {
    const out = renderCaptureTemplate(
      "---\nsource: {{url}}\n---\n{{content}}",
      {
        content: "body",
        url: "https://x.test\nowner: me",
      },
    );
    expect(out.split("\n")[1]).toBe("source: https://x.test owner: me");
  });
});

describe("isCaptureTemplatePathAllowed", () => {
  it("allows direct children of the templates folder only", () => {
    expect(
      isCaptureTemplatePathAllowed("/ws", "Templates", "/ws/Templates/a.md"),
    ).toBe(true);
    expect(
      isCaptureTemplatePathAllowed("/ws/", "/Templates/", "/ws/Templates/a.md"),
    ).toBe(true);
    expect(
      isCaptureTemplatePathAllowed(
        "/ws",
        "Templates",
        "/ws/Templates/sub/a.md",
      ),
    ).toBe(false);
    expect(
      isCaptureTemplatePathAllowed("/ws", "Templates", "/ws/Other/a.md"),
    ).toBe(false);
    expect(
      isCaptureTemplatePathAllowed(
        "/ws",
        "Templates",
        "/ws/Templates/../Secret.md",
      ),
    ).toBe(false);
    expect(
      isCaptureTemplatePathAllowed("/ws", "Templates", "/etc/passwd"),
    ).toBe(false);
    expect(
      isCaptureTemplatePathAllowed("/ws", "Templates", "/ws/Templates/"),
    ).toBe(false);
    expect(
      isCaptureTemplatePathAllowed("/ws", "Templates", "/ws/Templates..x/a.md"),
    ).toBe(false);
  });
});

describe("loadCaptureTemplate", () => {
  beforeEach(() => {
    readTextFile.mockReset();
  });

  it("reads an allowed template", async () => {
    readTextFile.mockResolvedValue("T");
    await expect(
      loadCaptureTemplate("/ws", "Templates", "/ws/Templates/a.md"),
    ).resolves.toBe("T");
    expect(readTextFile).toHaveBeenCalledWith("/ws/Templates/a.md");
  });

  it("rejects an escaping path without reading", async () => {
    await expect(
      loadCaptureTemplate("/ws", "Templates", "/ws/Other.md"),
    ).rejects.toThrow(/templates folder/);
    expect(readTextFile).not.toHaveBeenCalled();
  });

  it("reports a read failure without leaking the bridge error", async () => {
    readTextFile.mockRejectedValue(new Error("EACCES /secret/path"));
    const err = await loadCaptureTemplate(
      "/ws",
      "Templates",
      "/ws/Templates/a.md",
    ).then(
      () => null,
      (e: Error) => e,
    );
    expect(err?.message).toBe("Template could not be read");
  });

  it("rejects an oversized template", async () => {
    readTextFile.mockResolvedValue("x".repeat(MAX_CAPTURE_TEMPLATE_BYTES + 1));
    await expect(
      loadCaptureTemplate("/ws", "Templates", "/ws/Templates/a.md"),
    ).rejects.toThrow(/64 KiB/);
  });
});
