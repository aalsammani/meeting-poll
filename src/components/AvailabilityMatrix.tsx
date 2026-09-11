import { summarize } from "../lib/summary";
import { formatDay, formatDateTime, formatTime } from "../lib/time";
import type { PublicResponse, TimeSlot } from "../lib/types";
import { Button } from "./ui";

interface Props {
  slots: TimeSlot[];
  responses: PublicResponse[];
  viewZone: string;
  /** Organizer-only: remove a response. */
  onRemove?: (response: PublicResponse) => void;
}

/**
 * Results grid: one column per proposed time, one row per participant, with
 * counts and the best time(s) marked. Horizontal scrolling keeps it usable on
 * phones; the name column stays pinned.
 */
export default function AvailabilityMatrix({ slots, responses, viewZone, onRemove }: Props) {
  const summary = summarize(slots, responses);
  const tie = summary.bestSlotIds.length > 1;

  if (slots.length === 0) return null;

  return (
    <div className="space-y-4">
      {summary.responseCount > 0 && (
        <p className="text-[15px] text-ink-mute">
          {summary.responseCount} {summary.responseCount === 1 ? "response" : "responses"}
          {summary.lastResponseAt && <> · latest {formatDateTime(summary.lastResponseAt, viewZone)}</>}
          {summary.bestSlotIds.length > 0 && (
            <>
              {" · "}
              {tie ? `${summary.bestSlotIds.length} times tied for best` : "best time marked"}
            </>
          )}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-paper-line bg-paper">
        <table className="w-full border-collapse text-[15px]">
          <caption className="sr-only">Availability by participant and proposed time</caption>
          <thead>
            <tr className="border-b border-paper-line">
              <th scope="col" className="sticky left-0 z-10 bg-paper px-4 py-3 text-left font-medium text-ink-mute">
                Participant
              </th>
              {slots.map((slot) => {
                const s = summary.slots.find((x) => x.slotId === slot.id)!;
                return (
                  <th
                    key={slot.id}
                    scope="col"
                    className={`min-w-[112px] px-3 py-3 text-center align-bottom font-medium ${s.isBest ? "bg-avail-soft text-avail-strong" : "text-ink"}`}
                  >
                    {s.isBest && <div className="mb-1 text-[12px] font-semibold">{tie ? "Tied best" : "Best"}</div>}
                    <div>{formatDay(slot.startsAt, viewZone)}</div>
                    <div className="font-normal">{formatTime(slot.startsAt, viewZone)}</div>
                  </th>
                );
              })}
              {onRemove && <th scope="col" className="px-3 py-3"><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {responses.length === 0 && (
              <tr>
                <td colSpan={slots.length + 1 + (onRemove ? 1 : 0)} className="px-4 py-8 text-center text-ink-mute">
                  No responses yet.
                </td>
              </tr>
            )}
            {responses.map((r) => (
              <tr key={r.id} className="border-b border-paper-line last:border-b-0">
                <th scope="row" className="sticky left-0 z-10 max-w-[180px] truncate bg-paper px-4 py-2.5 text-left font-normal">
                  {r.name}
                </th>
                {slots.map((slot) => {
                  const state = r.availability[slot.id];
                  const best = summary.bestSlotIds.includes(slot.id);
                  return (
                    <td key={slot.id} className={`px-3 py-2.5 text-center ${best ? "bg-avail-soft/60" : ""}`}>
                      {state === "yes" ? (
                        <span className="inline-block rounded bg-avail px-2 py-0.5 text-[13px] font-medium text-white">
                          <span aria-hidden="true">✓</span>
                          <span className="sr-only">Available</span>
                        </span>
                      ) : state === "maybe" ? (
                        <span className="inline-block rounded bg-maybe-soft px-2 py-0.5 text-[13px] font-medium text-maybe">
                          <span aria-hidden="true">?</span>
                          <span className="sr-only">If needed</span>
                        </span>
                      ) : (
                        <span className="text-ink-mute">
                          <span aria-hidden="true">–</span>
                          <span className="sr-only">Not available</span>
                        </span>
                      )}
                    </td>
                  );
                })}
                {onRemove && (
                  <td className="px-3 py-2.5 text-right">
                    <Button variant="quiet" className="!px-2 !py-1 text-[14px]" onClick={() => onRemove(r)}>
                      Remove
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-paper-line">
              <th scope="row" className="sticky left-0 z-10 bg-paper px-4 py-3 text-left font-medium">
                Available
              </th>
              {summary.slots.map((s) => (
                <td key={s.slotId} className={`px-3 py-3 text-center ${s.isBest ? "bg-avail-soft font-semibold text-avail-strong" : ""}`}>
                  <div>{s.yes}{s.maybe > 0 && <span className="font-normal text-ink-mute"> +{s.maybe}</span>}</div>
                  <div className="text-[13px] font-normal text-ink-mute">{s.yesPercent}%</div>
                </td>
              ))}
              {onRemove && <td />}
            </tr>
          </tfoot>
        </table>
      </div>
      {summary.slots.some((s) => s.maybe > 0) && (
        <p className="text-[14px] text-ink-mute">Counts show available, then +if-needed. Percentages are of definite availability.</p>
      )}
    </div>
  );
}
