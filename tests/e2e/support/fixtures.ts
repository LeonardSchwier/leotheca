import { expect, test as base, type Page } from "@playwright/test";
import { bridgeMockInPage, type BridgeMockOptions, type BridgeState } from "./bridgeMock.js";
import { bridgeOptions } from "./workspace.js";

/** Handle on the running app: the page plus its mocked native bridge. */
export class App {
  constructor(
    readonly page: Page,
    private readonly problems: string[],
    readonly requests: string[],
  ) {}

  /** Everything the mocked native side has seen and stored so far. */
  bridge(): Promise<BridgeState> {
    return this.page.evaluate(() => window.__e2eBridge.snapshot());
  }

  /** Calls to one native command, in order. */
  async calls(cmd: string) {
    return (await this.bridge()).calls.filter((c) => c.cmd === cmd);
  }

  async file(path: string): Promise<string | undefined> {
    return (await this.bridge()).files[path];
  }

  note(problem: string): void {
    this.problems.push(problem);
  }
}

export const test = base.extend<{ bridge: Partial<BridgeMockOptions>; app: App }>({
  bridge: [{}, { option: true }],

  app: async ({ page, context, baseURL, bridge }, use) => {
    const problems: string[] = [];
    const requests: string[] = [];
    const origin = new URL(baseURL as string).origin;

    // The product is offline: any request that is not same-origin, a data URI
    // or a blob is a violation. Record it and refuse it so it cannot succeed.
    await context.route("**/*", (route) => {
      const url = route.request().url();
      requests.push(url);
      if (url.startsWith(origin) || url.startsWith("data:") || url.startsWith("blob:")) {
        return route.continue();
      }
      problems.push(`network request left the app: ${url}`);
      return route.abort();
    });

    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "assert") {
        problems.push(`console.${message.type()}: ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => problems.push(`uncaught: ${error.message}`));

    await page.addInitScript(bridgeMockInPage, bridgeOptions(bridge));
    // The unhandled-rejection listener must exist before the app boots.
    await page.addInitScript(() => {
      window.addEventListener("unhandledrejection", (event) => {
        console.error(`unhandled rejection: ${String(event.reason)}`);
      });
    });

    const app = new App(page, problems, requests);
    await use(app);

    const state = await page.evaluate(() => window.__e2eBridge.unhandled).catch(() => []);
    if (state.length > 0) problems.push(`unmocked native commands: ${state.join(", ")}`);
    expect(problems, "console errors, rejections, offsite requests, unmocked commands").toEqual([]);
  },
});

export { expect };
