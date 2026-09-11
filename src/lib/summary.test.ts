import { describe, expect, it } from "vitest";
import { nextState, summarize, toCsv } from "./summary";
import type { PublicResponse, TimeSlot } from "./types";

const slots: TimeSlot[] = [
  { id: "s1", startsAt: "2026-10-05T14:00:00.000Z" },
  { id: "s2", startsAt: "2026-10-06T17:00:00.000Z" },
  { id: "s3", startsAt: "2026-10-07T18:00:00.000Z" },
];

const r = (name: string, availability: PublicResponse["availability"], updatedAt = "2026-09-01T00:00:00.000Z"): PublicResponse => ({
  id: name, name, updatedAt, availability,
});

describe("summarize", () => {
  it("counts availability per slot and computes percentages", () => {
    const s = summarize(slots, [
      r("A", { s1: "yes", s2: "yes" }),
      r("B", { s1: "yes", s3: "yes" }),
      r("C", { s2: "yes", s3: "maybe" }),
    ]);
    expect(s.responseCount).toBe(3);
    expect(s.slots.map((x) => x.yes)).toEqual([2, 2, 1]);
    expect(s.slots.map((x) => x.maybe)).toEqual([0, 0, 1]);
    expect(s.slots.map((x) => x.yesPercent)).toEqual([67, 67, 33]);
    expect(s.slots[2].totalPercent).toBe(67);
  });

  it("reports every slot in a tie as best", () => {
    const s = summarize(slots, [r("A", { s1: "yes", s2: "yes" }), r("B", { s1: "yes", s2: "yes" })]);
    expect(s.bestSlotIds).toEqual(["s1", "s2"]);
    expect(s.slots.filter((x) => x.isBest).length).toBe(2);
  });

  it("breaks yes-ties using maybe counts", () => {
    const s = summarize(slots, [r("A", { s1: "yes", s2: "yes", s3: "maybe" }), r("B", { s2: "maybe" })]);
    expect(s.bestSlotIds).toEqual(["s2"]);
  });

  it("prefers a slot with more definite yeses over one with many maybes", () => {
    const s = summarize(slots, [r("A", { s1: "yes", s2: "maybe" }), r("B", { s2: "maybe" }), r("C", { s2: "maybe" })]);
    expect(s.bestSlotIds).toEqual(["s1"]);
  });

  it("returns no best slot and 0% when there are no responses", () => {
    const s = summarize(slots, []);
    expect(s.bestSlotIds).toEqual([]);
    expect(s.responseCount).toBe(0);
    expect(s.lastResponseAt).toBeNull();
    expect(s.slots.every((x) => x.yesPercent === 0 && !x.isBest)).toBe(true);
  });

  it("returns no best slot when nobody is available for anything", () => {
    const s = summarize(slots, [r("A", {}), r("B", {})]);
    expect(s.bestSlotIds).toEqual([]);
  });

  it("ignores availability for unknown slot ids", () => {
    const s = summarize(slots, [r("A", { ghost: "yes", s1: "yes" })]);
    expect(s.slots[0].yes).toBe(1);
    expect(s.bestSlotIds).toEqual(["s1"]);
  });

  it("tracks the most recent response timestamp", () => {
    const s = summarize(slots, [
      r("A", { s1: "yes" }, "2026-09-01T10:00:00.000Z"),
      r("B", { s1: "yes" }, "2026-09-03T08:30:00.000Z"),
      r("C", { s1: "yes" }, "2026-09-02T12:00:00.000Z"),
    ]);
    expect(s.lastResponseAt).toBe("2026-09-03T08:30:00.000Z");
  });
});

describe("nextState", () => {
  it("cycles empty → yes → maybe → empty when maybe is allowed", () => {
    expect(nextState(undefined, true)).toBe("yes");
    expect(nextState("yes", true)).toBe("maybe");
    expect(nextState("maybe", true)).toBeUndefined();
  });
  it("cycles empty → yes → empty when maybe is disabled", () => {
    expect(nextState(undefined, false)).toBe("yes");
    expect(nextState("yes", false)).toBeUndefined();
  });
});

describe("toCsv", () => {
  it("escapes commas and quotes, and omits email unless requested", () => {
    const csv = toCsv(
      slots,
      [{ ...r('Smith, "Jo"', { s1: "yes", s3: "maybe" }), email: "jo@example.edu" }],
      (s) => s.id,
      false,
    );
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("Name,Last updated,s1,s2,s3");
    expect(lines[1]).toBe('"Smith, ""Jo""",2026-09-01T00:00:00.000Z,Available,,If needed');
    expect(lines[2]).toBe("Available count,,1,0,0");
    expect(csv).not.toContain("jo@example.edu");
  });

  it("includes email column when requested", () => {
    const csv = toCsv(slots, [{ ...r("A", { s1: "yes" }), email: "a@example.edu" }], (s) => s.id, true);
    expect(csv.split("\r\n")[0]).toBe("Name,Email,Last updated,s1,s2,s3");
    expect(csv).toContain("A,a@example.edu,");
  });
});
