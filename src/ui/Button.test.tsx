/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { Button } from "./Button";

afterEach(cleanup);

describe("Button", () => {
  it("renders its label as the accessible name", () => {
    const { getByRole } = render(<Button>Save</Button>);
    expect(getByRole("button", { name: "Save" })).toBeTruthy();
  });

  it("defaults to the secondary variant and md size", () => {
    const { getByRole } = render(<Button>Save</Button>);
    const btn = getByRole("button");
    expect(btn.className).toContain("btn-secondary");
    expect(btn.className).toContain("btn-md");
  });

  it("applies the requested variant and size classes", () => {
    const { getByRole } = render(
      <Button variant="danger" size="sm">
        Delete
      </Button>,
    );
    const btn = getByRole("button");
    expect(btn.className).toContain("btn-danger");
    expect(btn.className).toContain("btn-sm");
  });

  it("invokes onClick when clicked", () => {
    const onClick = vi.fn();
    const { getByRole } = render(<Button onClick={onClick}>Save</Button>);
    fireEvent.click(getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("is keyboard-activatable via native button semantics (type=button, not submit)", () => {
    const { getByRole } = render(<Button>Save</Button>);
    expect(getByRole("button").getAttribute("type")).toBe("button");
  });

  it("sets the native disabled property, which is what actually blocks real pointer/keyboard activation", () => {
    const { getByRole } = render(<Button disabled>Save</Button>);
    const btn = getByRole("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("is disabled and busy while loading, without hiding the label", () => {
    const { getByRole } = render(<Button loading>Save</Button>);
    const btn = getByRole("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(btn.textContent).toContain("Save");
  });

  it("forwards an explicit className alongside its own classes", () => {
    const { getByRole } = render(<Button className="my-extra">Save</Button>);
    expect(getByRole("button").className).toContain("my-extra");
    expect(getByRole("button").className).toContain("btn");
  });
});
