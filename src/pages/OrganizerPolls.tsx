import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../components/useAuth";
import { Alert, Button, Loading } from "../components/ui";
import { listPolls, signOut } from "../lib/api";
import { formatDateTime } from "../lib/time";
import type { PollOverview } from "../lib/types";

export default function OrganizerPolls() {
  const { session } = useAuth();
  const [polls, setPolls] = useState<PollOverview[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listPolls().then(setPolls).catch((e) => setError(e instanceof Error ? e.message : "Could not load your polls."));
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">My polls</h1>
          <p className="mt-1 text-[15px] text-ink-mute">Signed in as {session?.user.email}</p>
        </div>
        <div className="flex gap-3">
          <Button variant="quiet" onClick={() => void signOut()}>Sign out</Button>
          <Link to="/organizer/polls/new" className="rounded bg-ink px-4 py-2 font-medium text-white hover:bg-ink-soft">
            New poll
          </Link>
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {!polls && !error && <Loading label="Loading polls" />}

      {polls && polls.length === 0 && (
        <div className="rounded-lg border border-dashed border-paper-line px-6 py-12 text-center">
          <p className="text-ink-soft">You haven't created a poll yet.</p>
          <Link to="/organizer/polls/new" className="mt-3 inline-block text-ink underline underline-offset-4">
            Create your first poll
          </Link>
        </div>
      )}

      {polls && polls.length > 0 && (
        <ul className="divide-y divide-paper-line rounded-lg border border-paper-line bg-paper">
          {polls.map((p) => (
            <li key={p.id}>
              <Link to={`/organizer/polls/${p.id}`} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-5 py-4 hover:bg-paper-tint">
                <span className="font-medium">{p.title}</span>
                <span className="text-[15px] text-ink-mute">
                  {p.status === "closed" && <span className="mr-3 text-alert">Closed</span>}
                  {p.responseCount} {p.responseCount === 1 ? "response" : "responses"}
                  {p.lastResponseAt && <> · latest {formatDateTime(p.lastResponseAt, p.timeZone)}</>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
