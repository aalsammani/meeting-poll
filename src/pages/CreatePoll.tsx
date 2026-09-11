import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import SlotBuilder from "../components/SlotBuilder";
import TimeZoneSelect from "../components/TimeZoneSelect";
import { Alert, Button, Card, Field, TextArea, TextInput } from "../components/ui";
import { createPoll } from "../lib/api";
import { detectTimeZone, wallClockToUtc } from "../lib/time";
import type { NewPollInput } from "../lib/types";
import { LIMITS, validateNewPoll } from "../lib/validation";

const DURATIONS = [15, 30, 45, 60, 90, 120, 180];

export default function CreatePoll() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState(60);
  const [timeZone, setTimeZone] = useState(detectTimeZone);
  const [deadlineWall, setDeadlineWall] = useState("");
  const [allowMaybe, setAllowMaybe] = useState(true);
  const [slots, setSlots] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    let deadline: string | null = null;
    const errs: Record<string, string> = {};
    if (deadlineWall) {
      try {
        deadline = wallClockToUtc(deadlineWall, timeZone);
      } catch {
        errs.deadline = "The deadline is not a valid date.";
      }
    }
    const input: NewPollInput = {
      title: title.trim(),
      description: description.trim(),
      durationMinutes: duration,
      timeZone,
      deadline,
      allowMaybe,
      slotStartsAt: slots,
    };
    const all = { ...validateNewPoll(input), ...errs };
    setErrors(all);
    if (Object.keys(all).length) return;

    setBusy(true);
    try {
      const id = await createPoll(input);
      navigate(`/organizer/polls/${id}`, { state: { justCreated: true } });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not create the poll.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link to="/organizer/polls" className="text-[15px] text-ink-mute hover:text-ink">← My polls</Link>
        <h1 className="mt-2 text-3xl">New poll</h1>
      </div>

      <form onSubmit={submit} className="space-y-6" noValidate>
        <Card className="space-y-5">
          <Field id="title" label="Meeting title" error={errors.title}>
            <TextInput id="title" maxLength={LIMITS.title} value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} placeholder="Research committee — fall planning" />
          </Field>
          <Field id="description" label="Description" optional error={errors.description} hint="Agenda, location, or a video link. Shown to participants.">
            <TextArea id="description" maxLength={LIMITS.description} value={description} onChange={(e) => setDescription(e.target.value)} error={errors.description} hasHint />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="duration" label="Duration" error={errors.durationMinutes}>
              <select id="duration" className="input" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                {DURATIONS.map((d) => (
                  <option key={d} value={d}>{d < 60 ? `${d} minutes` : `${d / 60} hour${d > 60 ? "s" : ""}`}</option>
                ))}
              </select>
            </Field>
            <Field id="tz" label="Time zone" error={errors.timeZone} hint="Proposed times are entered in this zone.">
              <TimeZoneSelect id="tz" value={timeZone} onChange={setTimeZone} error={errors.timeZone} />
            </Field>
          </div>
        </Card>

        <Card className="space-y-4">
          <h2 className="text-xl">Proposed times</h2>
          <SlotBuilder timeZone={timeZone} durationMinutes={duration} value={slots} onChange={setSlots} error={errors.slots} />
        </Card>

        <Card className="space-y-5">
          <h2 className="text-xl">Options</h2>
          <Field id="deadline" label="Response deadline" optional error={errors.deadline} hint={`In ${timeZone.replace(/_/g, " ")}. The poll stops accepting responses after this.`}>
            <TextInput id="deadline" type="datetime-local" value={deadlineWall} onChange={(e) => setDeadlineWall(e.target.value)} error={errors.deadline} hasHint />
          </Field>
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1.5 h-4 w-4" checked={allowMaybe} onChange={(e) => setAllowMaybe(e.target.checked)} />
            <span>
              <span className="font-medium">Allow “if needed” answers</span>
              <span className="block text-[15px] text-ink-mute">Participants can mark a time as workable but not preferred.</span>
            </span>
          </label>
        </Card>

        {submitError && <Alert tone="error">{submitError}</Alert>}

        <div className="flex items-center gap-4">
          <Button type="submit" busy={busy}>Create poll</Button>
          <span className="text-[15px] text-ink-mute">You'll get a link to share on the next screen.</span>
        </div>
      </form>
    </div>
  );
}
