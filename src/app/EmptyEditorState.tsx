import { useMemo } from "preact/hooks";
import { pickRandomQuote } from "./inspirationQuotes";

// Picked once per mount, not once per module load, so a fresh quote shows
// each time the editor area actually becomes empty, not just once per app
// session.
export function EmptyEditorState() {
  const quote = useMemo(() => pickRandomQuote(), []);
  return (
    <div class="empty-hint editor-empty">
      <p class="editor-empty-quote">&ldquo;{quote.text}&rdquo;</p>
      <p class="editor-empty-author">{quote.author}</p>
    </div>
  );
}
