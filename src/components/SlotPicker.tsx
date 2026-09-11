import { nextState } from "../lib/summary";
import { addMinutes, formatTime, groupByDay } from "../lib/time";
import type { AvailabilityState, TimeSlot } from "../lib/types";

interface Props {
  slots: TimeSlot[];
  durationMinutes: number;
  viewZone: string;
  allowMaybe: boolean;
  value: Record<string, AvailabilityState>;
  onChange: (next: Record<string, AvailabilityState>) => void;
  disabled?: boolean;
}

/**
 * The participant's selection surface. Each proposed time is a large toggle
 * grouped by day. One tap = available; a second tap = "if needed" (when the
 * organizer allows it); a third clears. State is announced via aria-pressed
 * and visible text, never color alone.
 */
export default function SlotPicker({ slots, durationMinutes, viewZone, allowMaybe, value, onChange, disabled }: Props) {
  const days = groupByDay(slots, viewZone);

  function toggle(slotId: string) {
    const next = { ...value };
    const s = nextState(value[slotId], allowMaybe);
    if (s) next[slotId] = s;
    else delete next[slotId];
    onChange(next);
  }

  return (
    <div className="space-y-6">
      <p className="text-[15px] text-ink-mute">
        Tap every time you can attend.{allowMaybe && " Tap again to mark a time as “if needed”."}
      </p>
      {days.map((day) => (
        <fieldset key={day.dayKey} className="space-y-2">
          <legend className="mb-2 font-semibold">{day.label}</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {day.slots.map((slot) => {
              const state = value[slot.id];
              const label = `${formatTime(slot.startsAt, viewZone)} – ${formatTime(addMinutes(slot.startsAt, durationMinutes), viewZone)}`;
              const cls =
                state === "yes"
                  ? "border-avail bg-avail text-white"
                  : state === "maybe"
                    ? "border-maybe bg-maybe-soft text-maybe"
                    : "border-paper-line bg-paper text-ink hover:border-ink-mute";
              return (
                <button
                  key={slot.id}
                  type="button"
                  disabled={disabled}
                  aria-pressed={state !== undefined}
                  onClick={() => toggle(slot.id)}
                  className={`flex min-h-[64px] flex-col items-start justify-center rounded-lg border-2 px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${cls}`}
                >
                  <span className="font-medium leading-tight">{label}</span>
                  <span className="text-[13px] leading-tight opacity-90">
                    {state === "yes" ? "Available" : state === "maybe" ? "If needed" : "Not selected"}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
