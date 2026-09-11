import { Link } from "react-router-dom";
import { useAuth } from "../components/useAuth";

export default function Home() {
  const { session } = useAuth();
  return (
    <div className="mx-auto max-w-2xl space-y-10 py-8">
      <div className="space-y-4">
        <h1 className="text-4xl sm:text-5xl">Find the meeting time that works for the most people.</h1>
        <p className="text-lg text-ink-soft">
          Propose a few dates and times, share one link, and see everyone's availability in a single grid. Participants
          don't need an account.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link to={session ? "/organizer/polls/new" : "/organizer"} className="rounded bg-ink px-5 py-2.5 font-medium text-white hover:bg-ink-soft">
          Create a poll
        </Link>
        {session && (
          <Link to="/organizer/polls" className="rounded border border-paper-line bg-paper px-5 py-2.5 font-medium hover:border-ink-mute">
            My polls
          </Link>
        )}
      </div>
      <div className="grid gap-6 text-[15px] text-ink-soft sm:grid-cols-3">
        <div>
          <p className="font-medium text-ink">For participants</p>
          <p>Open the link, enter your name, tap the times you can make, and submit. Takes under a minute.</p>
        </div>
        <div>
          <p className="font-medium text-ink">For organizers</p>
          <p>Sign in with an email link, create the poll, and get an email each time someone responds.</p>
        </div>
        <div>
          <p className="font-medium text-ink">Time zones handled</p>
          <p>Every poll has a home time zone, and participants can view times in their own.</p>
        </div>
      </div>
      {!session && (
        <p className="text-[15px] text-ink-mute">
          Received a poll link? Just open it; there is nothing to set up.
        </p>
      )}
    </div>
  );
}
