import { describe, expect, it } from "vitest";
import { cleanText, validateNewPoll, validateParticipant } from "./validation";
import type { NewPollInput } from "./types";

const base: NewPollInput = {
  title: "Committee meeting",
  description: "",
  durationMinutes: 60,
  timeZone: "America/New_York",
  deadline: null,
  allowMaybe: true,
  slotStartsAt: ["2026-10-05T14:00:00.000Z", "2026-10-06T14:00:00.000Z"],
};

describe("validateNewPoll", () => {
  it("accepts a well-formed poll", () => {
    expect(validateNewPoll(base)).toEqual({});
  });
  it("requires a title, slots, and a sane duration", () => {
    const e = validateNewPoll({ ...base, title: "   ", slotStartsAt: [], durationMinutes: 0 });
    expect(e.title).toBeDefined();
    expect(e.slots).toBeDefined();
    expect(e.durationMinutes).toBeDefined();
  });
  it("rejects duplicate slots and invalid zones", () => {
    const e = validateNewPoll({ ...base, slotStartsAt: [base.slotStartsAt[0], base.slotStartsAt[0]], timeZone: "Nowhere/Land" });
    expect(e.slots).toMatch(/identical/);
    expect(e.timeZone).toBeDefined();
  });
});

describe("validateParticipant", () => {
  it("requires a name and validates optional email", () => {
    expect(validateParticipant("", "")).toHaveProperty("name");
    expect(validateParticipant("Ada", "")).toEqual({});
    expect(validateParticipant("Ada", "ada@example.edu")).toEqual({});
    expect(validateParticipant("Ada", "not-an-email")).toHaveProperty("email");
  });
});

describe("cleanText", () => {
  it("strips control characters, collapses whitespace, and truncates", () => {
    expect(cleanText("  Ada\u0000  Love\nlace  ", 80)).toBe("Ada Love lace");
    expect(cleanText("x".repeat(100), 10)).toHaveLength(10);
  });
});
