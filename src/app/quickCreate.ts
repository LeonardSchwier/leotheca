/** What a quick-create command makes: a new note, canvas or drawing. */
export type QuickCreateKind = "note" | "canvas" | "drawing";

export interface QuickCreated {
  path: string;
  name: string;
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Runs a quick-create command (Ctrl+N, the palette's New note, New canvas
 * and New drawing, the `new-note` automation command): create the file, then
 * open it. Both steps can fail for ordinary reasons (a read-only folder, a
 * full disk, a directory removed by another tool, a file that disappears
 * between create and open), and a caller that wrote `void create().then(open)`
 * got an unhandled rejection and a screen that showed nothing. This always
 * resolves: `true` when the file was created and opened, otherwise it tells
 * the user through `report` and resolves `false`.
 *
 * A failed open is worded differently from a failed create on purpose: the
 * file exists by then, and "couldn't create" would invite a duplicate. A
 * `report` that throws is swallowed, because an alert that fails must not
 * bring the rejection back. */
export async function createAndOpen(
  kind: QuickCreateKind,
  create: () => Promise<QuickCreated>,
  open: (path: string, name: string) => unknown,
  report: (message: string) => void,
): Promise<boolean> {
  const tell = (message: string): void => {
    try {
      report(message);
    } catch {
      // Nothing left to tell the user with; do not turn this into a rejection.
    }
  };

  let created: QuickCreated;
  try {
    created = await create();
  } catch (error) {
    tell(`Couldn't create the new ${kind}: ${reason(error)}`);
    return false;
  }

  try {
    await open(created.path, created.name);
  } catch (error) {
    tell(`Created "${created.name}" but couldn't open it: ${reason(error)}`);
    return false;
  }
  return true;
}
