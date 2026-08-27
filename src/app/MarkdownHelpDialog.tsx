import { KEYBOARD_SHORTCUTS } from "./shortcuts";

interface MarkdownHelpDialogProps {
  onClose: () => void;
}

const ENTRIES: { syntax: string; result: string }[] = [
  { syntax: "# Heading 1", result: "Largest heading" },
  { syntax: "## Heading 2", result: "Smaller heading" },
  { syntax: "**bold**", result: "Bold text" },
  { syntax: "*italic*", result: "Italic text" },
  { syntax: "~~strikethrough~~", result: "Strikethrough text" },
  { syntax: "- item", result: "Bullet list" },
  { syntax: "1. item", result: "Numbered list" },
  { syntax: "- [ ] task", result: "Unchecked task" },
  { syntax: "- [x] task", result: "Checked task" },
  { syntax: "> quote", result: "Blockquote" },
  { syntax: "`code`", result: "Inline code" },
  { syntax: "```\ncode block\n```", result: "Fenced code block" },
  { syntax: "[text](url)", result: "Link" },
  { syntax: "[[Note Name]]", result: "Link to another note" },
  { syntax: "![alt](path)", result: "Image" },
  { syntax: "---", result: "Horizontal rule" },
  { syntax: "| a | b |\n|---|---|\n| 1 | 2 |", result: "Table" },
];

export function MarkdownHelpDialog({ onClose }: MarkdownHelpDialogProps) {
  return (
    <div class="modal-overlay" onClick={onClose}>
      <div class="modal markdown-help" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>Markdown formatting</h2>
          <button class="modal-close" onClick={onClose}>
            x
          </button>
        </div>
        <table class="markdown-help-table">
          <tbody>
            {ENTRIES.map((entry) => (
              <tr key={entry.syntax}>
                <td>
                  <code>{entry.syntax}</code>
                </td>
                <td class="markdown-help-result">{entry.result}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3 class="markdown-help-subheading">Keyboard shortcuts</h3>
        <table class="markdown-help-table">
          <tbody>
            {KEYBOARD_SHORTCUTS.map((shortcut) => (
              <tr key={shortcut.keys}>
                <td>
                  <code>{shortcut.keys}</code>
                </td>
                <td class="markdown-help-result">{shortcut.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
