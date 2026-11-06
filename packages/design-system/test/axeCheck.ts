import axe from "axe-core";
import { expect } from "vitest";

/** Fails with the rule ids and targets, which is what a reader needs to fix it.
 * Color contrast is off here because jsdom does no layout or style cascade; the
 * token contrast test covers it instead. */
export async function expectNoAxeViolations(root: Element): Promise<void> {
  const results = await axe.run(root, {
    rules: { "color-contrast": { enabled: false } },
  });
  const summary = results.violations.map(
    (violation) =>
      `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`,
  );
  expect(summary).toEqual([]);
}
