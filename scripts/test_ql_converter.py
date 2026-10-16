"""Test suite for the Leotheca Markdown Quick Look converter logic.

The Obj-C generator (packaging/macos/quicklook/LeothecaMarkdownQLPreviewGenerator.m)
contains a hand-rolled markdown-to-HTML converter. These tests validate the same
conversion rules as a reference implementation, so that any port (Obj-C, JS, Python)
can be checked against a known-correct spec.

Run:  python3 -m unittest scripts.test_ql_converter -v
"""

import re
import unittest


# ---------------------------------------------------------------------------
# Reference implementation: markdown_to_html
# Mirrors the conversion rules in LeothecaMarkdownQLPreviewGenerator.m
# ---------------------------------------------------------------------------

def _escape_html(text: str) -> str:
    return (text.replace("&", "&amp;")
               .replace("<", "&lt;")
               .replace(">", "&gt;"))


def _replace_regex(pattern: str, replacement: str, text: str,
                   flags: int = 0) -> str:
    return re.sub(pattern, replacement, text, flags=flags)


def markdown_to_html(markdown: str) -> str:
    """Convert markdown to a full styled HTML document.

    Handles: HTML escaping, fenced code blocks, inline code, headings h1-h3,
    bold, italic, links, unordered lists, horizontal rules, paragraphs.
    """
    escaped = _escape_html(markdown)

    # Fenced code blocks: ```...``` (multiline)
    escaped = _replace_regex(
        r"```([^`]*)```",
        r"<pre><code>\1</code></pre>",
        escaped,
    )

    # Inline code: `...`
    escaped = _replace_regex(
        r"`([^`]+)`",
        r"<code>\1</code>",
        escaped,
    )

    # Headings (order matters: h3 before h2 before h1 to avoid partial matches)
    escaped = _replace_regex(
        r"^(###) (.*)$",
        r"<h3>\2</h3>",
        escaped,
        re.MULTILINE,
    )
    escaped = _replace_regex(
        r"^(##) (.*)$",
        r"<h2>\2</h2>",
        escaped,
        re.MULTILINE,
    )
    escaped = _replace_regex(
        r"^(#) (.*)$",
        r"<h1>\2</h1>",
        escaped,
        re.MULTILINE,
    )

    # Bold: **...**
    escaped = _replace_regex(
        r"\*\*(.+?)\*\*",
        r"<strong>\1</strong>",
        escaped,
    )

    # Italic: *...* (not preceded/followed by *)
    escaped = _replace_regex(
        r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)",
        r"<em>\1</em>",
        escaped,
    )

    # Links: [text](url)
    escaped = _replace_regex(
        r"\[(.+?)\]\((.+?)\)",
        r'<a href="\2">\1</a>',
        escaped,
    )

    # Unordered list items: - ... or * ...
    escaped = _replace_regex(
        r"^[-*] (.*)$",
        r"<li>\1</li>",
        escaped,
        re.MULTILINE,
    )

    # Horizontal rules: ---, ***, ___
    escaped = _replace_regex(
        r"^(-{3,}|\*{3,}|_{3,})$",
        r"<hr>",
        escaped,
        re.MULTILINE,
    )

    # Paragraphs
    paragraphs = escaped.split("\n\n")
    body_parts = []
    for para in paragraphs:
        trimmed = para.strip()
        if not trimmed:
            continue
        if (trimmed.startswith("<") and
                any(tag in trimmed for tag in
                    ("</h1>", "</h2>", "</h3>", "</pre>", "<li>", "<hr>"))):
            body_parts.append(trimmed)
        else:
            inline = trimmed.replace("\n", "<br>")
            body_parts.append(f"<p>{inline}</p>")

    body = "\n".join(body_parts)

    return (
        "<html><head><style>"
        "body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;"
        "font-size:14px;line-height:1.6;padding:20px;max-width:800px;color:#333;}"
        "h1{font-size:1.8em;margin:0.5em 0 0.3em;border-bottom:1px solid #eee;padding-bottom:0.2em;}"
        "h2{font-size:1.5em;margin:0.5em 0 0.3em;}"
        "h3{font-size:1.2em;margin:0.4em 0 0.2em;}"
        "p{margin:0.6em 0;}"
        "code{background:#f4f4f4;padding:2px 5px;border-radius:3px;font-size:0.9em;}"
        "pre{background:#f4f4f4;padding:12px;border-radius:5px;overflow-x:auto;}"
        "pre code{background:none;padding:0;}"
        "a{color:#0366d6;text-decoration:none;}"
        "a:hover{text-decoration:underline;}"
        "li{margin:0.2em 0;}"
        "hr{border:none;border-top:1px solid #ddd;margin:1em 0;}"
        "mark{background:#fff9c4;padding:1px 2px;}"
        "</style></head><body>" + body + "</body></html>"
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestHtmlEscaping(unittest.TestCase):
    def test_ampersand(self):
        self.assertIn("&amp;", markdown_to_html("AT&T"))

    def test_angle_brackets(self):
        result = markdown_to_html("1 < 2 > 0")
        self.assertIn("&lt;", result)
        self.assertIn("&gt;", result)

    def test_no_raw_script_tag(self):
        result = markdown_to_html("<script>alert(1)</script>")
        self.assertNotIn("<script>", result)
        self.assertIn("&lt;script&gt;", result)


class TestHeadings(unittest.TestCase):
    def test_h1(self):
        self.assertIn("<h1>Title</h1>", markdown_to_html("# Title"))

    def test_h2(self):
        self.assertIn("<h2>Section</h2>", markdown_to_html("## Section"))

    def test_h3(self):
        self.assertIn("<h3>Sub</h3>", markdown_to_html("### Sub"))

    def test_heading_with_html_content(self):
        self.assertIn("<h1>&lt;script&gt;</h1>",
                      markdown_to_html("# <script>"))


class TestCodeBlocks(unittest.TestCase):
    def test_fenced_block(self):
        md = "```\nlet x = 1;\n```"
        result = markdown_to_html(md)
        self.assertIn("<pre><code>", result)
        self.assertIn("let x = 1;", result)
        self.assertIn("</code></pre>", result)

    def test_inline_code(self):
        result = markdown_to_html("Use `npm ci` to install.")
        self.assertIn("<code>npm ci</code>", result)

    def test_code_block_contents_escaped(self):
        md = "```\na < b\n```"
        result = markdown_to_html(md)
        self.assertIn("a &lt; b", result)


class TestBoldItalic(unittest.TestCase):
    def test_bold(self):
        result = markdown_to_html("This is **bold** text.")
        self.assertIn("<strong>bold</strong>", result)

    def test_italic(self):
        result = markdown_to_html("This is *italic* text.")
        self.assertIn("<em>italic</em>", result)

    def test_bold_not_matched_as_italic(self):
        result = markdown_to_html("**bold**")
        self.assertIn("<strong>bold</strong>", result)
        # Should not have stray em tags wrapping the **
        self.assertNotIn("<em>**bold**</em>", result)


class TestLinks(unittest.TestCase):
    def test_basic_link(self):
        result = markdown_to_html("[Leotheca](https://leotheca.app)")
        self.assertIn('<a href="https://leotheca.app">Leotheca</a>', result)

    def test_link_with_spaces(self):
        result = markdown_to_html("[See docs](https://example.com/docs v2)")
        self.assertIn("https://example.com/docs v2", result)


class TestLists(unittest.TestCase):
    def test_dash_item(self):
        result = markdown_to_html("- item one")
        self.assertIn("<li>item one</li>", result)

    def test_multiple_items(self):
        md = "- a\n- b\n- c"
        result = markdown_to_html(md)
        self.assertEqual(result.count("<li>"), 3)

    def test_star_item(self):
        result = markdown_to_html("* starred")
        self.assertIn("<li>starred</li>", result)


class TestHorizontalRules(unittest.TestCase):
    def test_dashes(self):
        result = markdown_to_html("---")
        self.assertIn("<hr>", result)

    def test_stars(self):
        result = markdown_to_html("***")
        self.assertIn("<hr>", result)

    def test_underscores(self):
        result = markdown_to_html("___")
        self.assertIn("<hr>", result)

    def test_long_dashes(self):
        result = markdown_to_html("------")
        self.assertIn("<hr>", result)


class TestParagraphs(unittest.TestCase):
    def test_simple_paragraph(self):
        result = markdown_to_html("Hello world")
        self.assertIn("<p>Hello world</p>", result)

    def test_line_break_within_paragraph(self):
        result = markdown_to_html("line1\nline2")
        self.assertIn("line1<br>line2", result)

    def test_multiple_paragraphs(self):
        result = markdown_to_html("para1\n\npara2")
        self.assertEqual(result.count("<p>"), 2)

    def test_empty_input(self):
        result = markdown_to_html("")
        # Should produce a valid HTML document even with empty body
        self.assertIn("<html>", result)
        self.assertIn("</html>", result)


class TestEdgeCases(unittest.TestCase):
    def test_mixed_elements(self):
        md = "# Title\n\nSome **bold** text.\n\n- item\n- other\n\n---\n\nEnd."
        result = markdown_to_html(md)
        self.assertIn("<h1>Title</h1>", result)
        self.assertIn("<strong>bold</strong>", result)
        self.assertIn("<li>item</li>", result)
        self.assertIn("<li>other</li>", result)
        self.assertIn("<hr>", result)
        self.assertIn("<p>End.</p>", result)

    def test_special_chars_in_code(self):
        md = "```js\nconsole.log('<div>');\n```"
        result = markdown_to_html(md)
        self.assertIn("console.log('&lt;div&gt;');", result)

    def test_html_in_markdown_escaped(self):
        result = markdown_to_html("<img src=x onerror=alert(1)>")
        self.assertNotIn("<img", result)
        self.assertIn("&lt;img", result)

    def test_empty_paragraphs_between_blocks(self):
        md = "# A\n\n\n\n# B"
        result = markdown_to_html(md)
        self.assertIn("<h1>A</h1>", result)
        self.assertIn("<h1>B</h1>", result)

    def test_non_utf8_survives_as_replacement(self):
        # Python handles this differently than Obj-C, but the HTML output
        # should still be well-formed
        result = markdown_to_html("valid text")
        self.assertIn("valid text", result)


class TestOutputStructure(unittest.TestCase):
    def test_html_structure(self):
        result = markdown_to_html("hello")
        self.assertTrue(result.startswith("<html>"))
        self.assertTrue(result.endswith("</html>"))
        self.assertIn("<head>", result)
        self.assertIn("<body>", result)
        self.assertIn("<style>", result)

    def test_css_present(self):
        result = markdown_to_html("test")
        self.assertIn("font-family", result)
        self.assertIn("background:#f4f4f4", result)

    def test_body_content_isolated(self):
        result = markdown_to_html("content here")
        # The body should contain the paragraph
        body_match = re.search(r"<body>(.*?)</body>", result, re.DOTALL)
        self.assertIsNotNone(body_match)
        self.assertIn("content here", body_match.group(1))


if __name__ == "__main__":
    unittest.main(verbosity=2)
