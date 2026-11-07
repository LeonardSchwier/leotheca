import { describe, expect, it } from "vitest";
import { inferScalar } from "./collectionTypesInference";

describe("inferScalar", () => {
  it("infers an unquoted boolean", () => {
    expect(inferScalar("true", "plain")).toEqual({ type: "boolean", value: true });
    expect(inferScalar("FALSE", "plain")).toEqual({ type: "boolean", value: false });
  });

  it("infers an unquoted finite number", () => {
    expect(inferScalar("42", "plain")).toEqual({ type: "number", value: 42 });
    expect(inferScalar("-3.5", "plain")).toEqual({ type: "number", value: -3.5 });
  });

  it("infers an unquoted ISO date", () => {
    expect(inferScalar("2026-09-02", "plain")).toEqual({ type: "date", value: "2026-09-02" });
  });

  it("rejects a calendrically invalid date shape and falls through to string", () => {
    expect(inferScalar("2026-13-40", "plain")).toEqual({ type: "string", value: "2026-13-40" });
  });

  it("infers an unquoted ISO date-time", () => {
    expect(inferScalar("2026-09-02T10:00:00Z", "plain")).toEqual({
      type: "datetime",
      value: "2026-09-02T10:00:00Z",
    });
  });

  it("falls back to string for anything else unquoted", () => {
    expect(inferScalar("just some text", "plain")).toEqual({
      type: "string",
      value: "just some text",
    });
  });

  it("keeps a quoted value a string even when it looks like a number, per spec section 7.2's \"0012\" example", () => {
    expect(inferScalar("0012", "double")).toEqual({ type: "string", value: "0012" });
    expect(inferScalar("true", "single")).toEqual({ type: "string", value: "true" });
    expect(inferScalar("2026-09-02", "double")).toEqual({ type: "string", value: "2026-09-02" });
  });

  it("follows the documented inference order: boolean before number before date", () => {
    // Not ambiguous in practice (these patterns don't overlap), but pins
    // the order down as a regression guard per spec section 7.2's
    // numbered list.
    expect(inferScalar("1", "plain")).toEqual({ type: "number", value: 1 });
  });
});
