import { formatDateTimeWithZone, formatDuration, isPast } from "../lib/time";
import type { PublicPoll } from "../lib/types";

/** Title block shown on both the public page and the organizer view. */
export default function PollMeta({ poll, viewZone }: { poll: PublicPoll; viewZone: string }) {
  const deadlinePassed = isPast(poll.deadline);
  return (
    <header className="space-y-3">
      <h1 className="text-3xl sm:text-4xl">{poll.title}</h1>
      {poll.description && <p className="whitespace-pre-line text-ink-soft">{poll.description}</p>}
      <dl className="flex flex-wrap gap-x-8 gap-y-1 text-[15px]">
        <div className="flex gap-2">
          <dt className="text-ink-mute">Duration</dt>
          <dd>{formatDuration(poll.durationMinutes)}</dd>
        </div>
        {poll.deadline && (
          <div className="flex gap-2">
            <dt className="text-ink-mute">{deadlinePassed ? "Responses closed" : "Respond by"}</dt>
            <dd className={deadlinePassed ? "text-alert" : undefined}>{formatDateTimeWithZone(poll.deadline, viewZone)}</dd>
          </div>
        )}
        {poll.status === "closed" && (
          <div className="flex gap-2">
            <dt className="sr-only">Status</dt>
            <dd className="text-alert">This poll is closed</dd>
          </div>
        )}
      </dl>
    </header>
  );
}
