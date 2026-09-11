/**
 * Pure availability arithmetic. No dates, no I/O — easy to test and reuse
 * on both the public results view and the organizer dashboard.
 */
import type { AvailabilityState, PublicResponse, TimeSlot } from "./types";

export interface SlotSummary {
  slotId: string;
  yes: number;
  maybe: number;
  /** yes + maybe */
  total: number;
  /** percentage of responses that are "yes", 0–100, rounded */
  yesPercent: number;
  /** percentage of responses that are "yes" or "maybe" */
  totalPercent: number;
  isBest: boolean;
}

export interface PollSummary {
  responseCount: number;
  lastResponseAt: string | null;
  slots: SlotSummary[];
  /** Slot ids sharing the highest score; empty if nobody is available anywhere. */
  bestSlotIds: string[];
}

/**
 * Ranking rule: most "yes" wins. Ties are broken by most "maybe".
 * Slots that are still tied are all reported as best (the UI shows a tie).
 */
export function summarize(slots: TimeSlot[], responses: PublicResponse[]): PollSummary {
  const n = responses.length;
  const counts = new Map<string, { yes: number; maybe: number }>();
  for (const s of slots) counts.set(s.id, { yes: 0, maybe: 0 });

  for (const r of responses) {
    for (const [slotId, state] of Object.entries(r.availability)) {
      const c = counts.get(slotId);
      if (!c) continue; // ignore stale slot ids defensively
      if (state === "yes") c.yes += 1;
      else if (state === "maybe") c.maybe += 1;
    }
  }

  let bestYes = -1;
  let bestMaybe = -1;
  for (const c of counts.values()) {
    if (c.yes > bestYes || (c.yes === bestYes && c.maybe > bestMaybe)) {
      bestYes = c.yes;
      bestMaybe = c.maybe;
    }
  }
  const hasAnyAvailability = bestYes > 0 || bestMaybe > 0;

  const bestSlotIds = hasAnyAvailability
    ? slots
        .filter((s) => {
          const c = counts.get(s.id)!;
          return c.yes === bestYes && c.maybe === bestMaybe;
        })
        .map((s) => s.id)
    : [];

  const pct = (x: number) => (n === 0 ? 0 : Math.round((x / n) * 100));

  return {
    responseCount: n,
    lastResponseAt: responses.reduce<string | null>(
      (latest, r) => (latest === null || r.updatedAt > latest ? r.updatedAt : latest),
      null,
    ),
    slots: slots.map((s) => {
      const c = counts.get(s.id)!;
      return {
        slotId: s.id,
        yes: c.yes,
        maybe: c.maybe,
        total: c.yes + c.maybe,
        yesPercent: pct(c.yes),
        totalPercent: pct(c.yes + c.maybe),
        isBest: bestSlotIds.includes(s.id),
      };
    }),
    bestSlotIds,
  };
}

/** Cycle a cell through the allowed states when a participant taps it. */
export function nextState(
  current: AvailabilityState | undefined,
  allowMaybe: boolean,
): AvailabilityState | undefined {
  if (current === undefined) return "yes";
  if (current === "yes") return allowMaybe ? "maybe" : undefined;
  return undefined;
}

/** Build a CSV string of the availability matrix. */
export function toCsv(
  slots: TimeSlot[],
  responses: Array<PublicResponse & { email?: string | null }>,
  slotLabel: (slot: TimeSlot) => string,
  includeEmail: boolean,
): string {
  const esc = (v: string | null | undefined) => {
    const s = v ?? "";
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["Name", ...(includeEmail ? ["Email"] : []), "Last updated", ...slots.map(slotLabel)];
  const rows = responses.map((r) => [
    r.name,
    ...(includeEmail ? [r.email ?? ""] : []),
    r.updatedAt,
    ...slots.map((s) => {
      const st = r.availability[s.id];
      return st === "yes" ? "Available" : st === "maybe" ? "If needed" : "";
    }),
  ]);
  const summary = summarize(slots, responses);
  const pad = includeEmail ? ["", ""] : [""];
  const totals = ["Available count", ...pad, ...summary.slots.map((s) => String(s.yes))];
  const maybes = ["If-needed count", ...pad, ...summary.slots.map((s) => String(s.maybe))];
  return [header, ...rows, totals, maybes].map((row) => row.map(esc).join(",")).join("\r\n") + "\r\n";
}
