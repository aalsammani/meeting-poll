import { describe, expect, it } from "vitest";
import {
  addMinutes, formatDateTime, formatDuration, groupByDay, isValidTimeZone, utcToWallClock, wallClockToUtc,
} from "./time";

describe("wallClockToUtc", () => {
  it("converts New York wall time to UTC during daylight time", () => {
    expect(wallClockToUtc("2026-07-01T10:00", "America/New_York")).toBe("2026-07-01T14:00:00.000Z");
  });
  it("converts New York wall time to UTC during standard time", () => {
    expect(wallClockToUtc("2026-01-15T10:00", "America/New_York")).toBe("2026-01-15T15:00:00.000Z");
  });
  it("handles zones east of UTC and date rollover", () => {
    expect(wallClockToUtc("2026-03-10T02:30", "Asia/Tokyo")).toBe("2026-03-09T17:30:00.000Z");
  });
  it("is the inverse of utcToWallClock", () => {
    const zone = "Europe/London";
    const wall = "2026-10-25T01:30"; // day of the BST→GMT change
    expect(utcToWallClock(wallClockToUtc(wall, zone), zone)).toBe(wall);
  });
  it("rejects malformed input", () => {
    expect(() => wallClockToUtc("2026-13-01T10:00", "UTC")).toThrow();
    expect(() => wallClockToUtc("not a date", "UTC")).toThrow();
  });
});

describe("formatting", () => {
  it("formats an instant in a specific zone", () => {
    expect(formatDateTime("2026-10-05T14:00:00.000Z", "America/New_York")).toBe("Mon, Oct 5, 2026 at 10:00 AM");
    expect(formatDateTime("2026-10-05T14:00:00.000Z", "Europe/Berlin")).toBe("Mon, Oct 5, 2026 at 4:00 PM");
  });
  it("formats durations", () => {
    expect(formatDuration(30)).toBe("30 min");
    expect(formatDuration(60)).toBe("1 h");
    expect(formatDuration(90)).toBe("1 h 30 min");
  });
  it("adds minutes", () => {
    expect(addMinutes("2026-10-05T14:00:00.000Z", 45)).toBe("2026-10-05T14:45:00.000Z");
  });
});

describe("groupByDay", () => {
  it("groups by the viewer's calendar day, not UTC", () => {
    // 03:00Z on Oct 6 is still Oct 5 in Los Angeles.
    const slots = [
      { id: "a", startsAt: "2026-10-06T03:00:00.000Z" },
      { id: "b", startsAt: "2026-10-05T16:00:00.000Z" },
      { id: "c", startsAt: "2026-10-06T16:00:00.000Z" },
    ];
    const la = groupByDay(slots, "America/Los_Angeles");
    expect(la.map((g) => g.dayKey)).toEqual(["2026-10-05", "2026-10-06"]);
    expect(la[0].slots.map((s) => s.id)).toEqual(["b", "a"]);
    const utc = groupByDay(slots, "UTC");
    expect(utc.map((g) => g.dayKey)).toEqual(["2026-10-05", "2026-10-06"]);
    expect(utc[1].slots.map((s) => s.id)).toEqual(["a", "c"]);
  });
});

describe("isValidTimeZone", () => {
  it("accepts IANA zones and rejects garbage", () => {
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus_Mons")).toBe(false);
  });
});
