import type { NoteTemplate } from "./fileTreeStore";

interface TemplatePickerProps {
  templates: NoteTemplate[];
  templatesFolder: string;
  onSelect: (template: NoteTemplate) => void;
  onCancel: () => void;
}

/** Lets the user pick which template to start a new note from. Reuses the
 * command palette's own list styling (.command-palette-list) rather than
 * introducing a second near-identical list style, since the two look and
 * behave the same way: a plain scrollable list of clickable rows. */
export function TemplatePicker({ templates, templatesFolder, onSelect, onCancel }: TemplatePickerProps) {
  return (
    <div class="modal-overlay" onClick={onCancel}>
      <div class="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New note from template</h2>
        {templates.length === 0 ? (
          <p class="empty-hint">
            No templates found. Add a Markdown file to the "{templatesFolder}" folder (in the workspace
            root) to use it as a template.
          </p>
        ) : (
          <ul class="command-palette-list">
            {templates.map((template) => (
              <li key={template.path}>
                <button onClick={() => onSelect(template)}>{template.name}</button>
              </li>
            ))}
          </ul>
        )}
        <div class="name-prompt-actions">
          <button onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
