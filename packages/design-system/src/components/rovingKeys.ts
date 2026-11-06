/**
 * The arrow key movement shared by Tabs and SegmentedControl, both of which
 * use roving tabindex: one tab stop for the group, arrows inside it.
 * Returns the next index, or null when the key is not a movement key.
 */
export function nextRovingIndex(
  key: string,
  current: number,
  enabled: readonly boolean[],
): number | null {
  const count = enabled.length;
  const firstEnabled = enabled.indexOf(true);
  if (firstEnabled < 0) return null;
  if (key === "Home") return firstEnabled;
  if (key === "End") return enabled.lastIndexOf(true);

  let step: number;
  if (key === "ArrowRight" || key === "ArrowDown") step = 1;
  else if (key === "ArrowLeft" || key === "ArrowUp") step = -1;
  else return null;

  for (let i = 1; i <= count; i += 1) {
    const candidate = (current + step * i + count * i) % count;
    if (enabled[candidate]) return candidate;
  }
  return null;
}
