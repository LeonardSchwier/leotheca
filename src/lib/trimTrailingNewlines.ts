/**
 * Remove every `\n` or `\r\n` at the end of `text`, in linear time.
 *
 * `text.replace(/(\r?\n)+$/, "")` looks equivalent but backtracks: on a long run
 * of newlines followed by any other character it takes quadratic time (about
 * 8 seconds for 60,000 newlines), which froze the capture sheet on a pasted
 * note.
 */
export function trimTrailingNewlines(text: string): string {
  let end = text.length;
  while (end > 0) {
    const last = text.charCodeAt(end - 1);
    if (last === 10) {
      end -= end > 1 && text.charCodeAt(end - 2) === 13 ? 2 : 1;
    } else {
      break;
    }
  }
  return end === text.length ? text : text.slice(0, end);
}
