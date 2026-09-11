import { useState } from "react";
import { addMinutes, formatTime, groupByDay, utcToWallClock, wallClockToUtc } from "../lib/time";
import { Button, Field, TextInput } from "./ui";

interface Props {
  timeZone: string;
  durationMinutes: number;
  value: string[]; // ISO UTC
  onChange: (next: string[]) => void;
  error?: string;
}

/**
 * Organizer control for proposing times. A date, a start time, and "Add"
 * produce one slot; the list below groups them by day and lets each be removed.
 * All values are converted to UTC using the poll's time zone at the moment
 * they are added, so changing the zone later does not silently shift them.
 */
export default function SlotBuilder({ timeZone, durationMinutes, value, onChange, error }: Props) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [localError, setLocalError] = useState<string | null>(null);

  function add() {
    setLocalError(null);
    if (!date) return setLocalError("Pick a date first.");
    let iso: string;
    try {
      iso = wallClockToUtc(`${date}T${time}`, timeZone);
    } catch {
      return setLocalError("That date and time could not be read.");
    }
    if (value.includes(iso)) return setLocalError("That time is already in the list.");
    onChange([...value, iso].sort());
  }

  const days = groupByDay(value.map((startsAt) => ({ startsAt })), timeZone);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field id="slot-date" label="Date">
          <TextInput id="slot-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field id="slot-time" label="Start time">
          <TextInput id="slot-time" type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Button variant="secondary" onClick={add} className="sm:mb-0">
          Add time
        </Button>
      </div>
      {(localError || error) && (
        <p className="text-[15px] text-alert" role="alert">
          {localError ?? error}
        </p>
      )}

      {days.length === 0 ? (
        <p className="rounded-lg border border-dashed border-paper-line px-4 py-6 text-center text-ink-mute">
          No times proposed yet. Add each option participants should choose from.
        </p>
      ) : (
        <ul className="space-y-3">
          {days.map((day) => (
            <li key={day.dayKey}>
              <p className="mb-1.5 font-medium">{day.label}</p>
              <ul className="flex flex-wrap gap-2">
                {day.slots.map((s) => (
                  <li key={s.startsAt} className="inline-flex items-center gap-1 rounded border border-paper-line bg-paper pl-3 pr-1 text-[15px]">
                    <span>
                      {formatTime(s.startsAt, timeZone)} – {formatTime(addMinutes(s.startsAt, durationMinutes), timeZone)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onChange(value.filter((v) => v !== s.startsAt))}
                      aria-label={`Remove ${utcToWallClock(s.startsAt, timeZone).replace("T", " ")}`}
                      className="rounded px-2 py-1 text-ink-mute hover:bg-ink/5 hover:text-ink"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
