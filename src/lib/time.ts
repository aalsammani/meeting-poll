/**
 * Time-zone utilities.
 *
 * Rules that keep behavior unambiguous:
 *   - All stored instants are ISO 8601 UTC strings.
 *   - A "wall-clock" value (what a person types into a date/time input) only
 *     has meaning together with an IANA time zone, so conversion helpers
 *     always take the zone explicitly.
 */
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

const WALL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** Detect the browser's IANA zone, falling back to UTC. */
export function detectTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** True if the zone is recognised by the runtime. */
export function isValidTimeZone(zone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** All zones the runtime knows about, with a few common ones first. */
export function listTimeZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
  const zones = intl.supportedValuesOf?.("timeZone") ?? [];
  const common = ["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London"];
  return Array.from(new Set([...common, ...zones]));
}

/**
 * Convert a wall-clock string "YYYY-MM-DDTHH:mm" in `zone` to a UTC ISO string.
 * Throws on malformed input.
 */
export function wallClockToUtc(wall: string, zone: string): string {
  if (!WALL_RE.test(wall)) throw new Error(`Invalid date/time: ${wall}`);
  const date = fromZonedTime(wall, zone);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date/time: ${wall}`);
  return date.toISOString();
}

/** Inverse of wallClockToUtc, for populating inputs. */
export function utcToWallClock(iso: string, zone: string): string {
  return formatInTimeZone(new Date(iso), zone, "yyyy-MM-dd'T'HH:mm");
}

export function formatDay(iso: string, zone: string): string {
  return formatInTimeZone(new Date(iso), zone, "EEE, MMM d");
}

export function formatDayLong(iso: string, zone: string): string {
  return formatInTimeZone(new Date(iso), zone, "EEEE, MMMM d, yyyy");
}

export function formatTime(iso: string, zone: string): string {
  return formatInTimeZone(new Date(iso), zone, "h:mm a");
}

export function formatDateTime(iso: string, zone: string): string {
  return formatInTimeZone(new Date(iso), zone, "EEE, MMM d, yyyy 'at' h:mm a");
}

export function formatDateTimeWithZone(iso: string, zone: string): string {
  return formatInTimeZone(new Date(iso), zone, "EEE, MMM d, yyyy 'at' h:mm a zzz");
}

/** Short zone label such as "EDT" for the given instant. */
export function zoneAbbreviation(iso: string, zone: string): string {
  return formatInTimeZone(new Date(iso), zone, "zzz");
}

export function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

/** Group slots by calendar day in the given zone, in chronological order. */
export function groupByDay<T extends { startsAt: string }>(
  slots: T[],
  zone: string,
): Array<{ dayKey: string; label: string; slots: T[] }> {
  const groups = new Map<string, { dayKey: string; label: string; slots: T[] }>();
  for (const s of [...slots].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
    const dayKey = formatInTimeZone(new Date(s.startsAt), zone, "yyyy-MM-dd");
    if (!groups.has(dayKey)) groups.set(dayKey, { dayKey, label: formatDayLong(s.startsAt, zone), slots: [] });
    groups.get(dayKey)!.slots.push(s);
  }
  return [...groups.values()];
}

export function isPast(iso: string | null): boolean {
  return !!iso && new Date(iso).getTime() < Date.now();
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
