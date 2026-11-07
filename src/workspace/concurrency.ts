/** Runs `task` for each item with at most `limit` in flight at once, rather
 * than firing every call at once like Promise.all(items.map(...)) does. On
 * Android, each file read is a real Storage Access Framework round-trip
 * through a single native bridge queue; dispatching thousands of them all
 * at once buries a user-initiated request (e.g. opening a note) at the
 * back of that queue behind all of them, which is what made the app feel
 * unresponsive right after opening a large workspace (see the link index's
 * own history of this exact problem in linking/store.ts). A shallower
 * queue lets a new request interleave much sooner instead of waiting for
 * the entire vault to finish. Shared here because more than one full-vault
 * walk (the link index, workspace statistics) needs the same treatment. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await task(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
