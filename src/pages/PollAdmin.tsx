import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import AvailabilityMatrix from "../components/AvailabilityMatrix";
import PollMeta from "../components/PollMeta";
import TimeZoneNotice from "../components/TimeZoneNotice";
import { Alert, Button, Card, Loading } from "../components/ui";
import { deletePoll, deleteResponse, fetchOrganizerPoll, setPollStatus, type OrganizerPollBundle } from "../lib/api";
import { summarize, toCsv } from "../lib/summary";
import { detectTimeZone, formatDateTime, formatDateTimeWithZone, formatDay, formatTime } from "../lib/time";
import type { PublicResponse } from "../lib/types";

export default function PollAdmin() {
  const { pollId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const justCreated = Boolean((location.state as { justCreated?: boolean } | null)?.justCreated);

  const [bundle, setBundle] = useState<OrganizerPollBundle | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [viewZone, setViewZone] = useState("UTC");
  const localZone = detectTimeZone();

  async function load() {
    try {
      const b = await fetchOrganizerPoll(pollId);
      setBundle(b);
      if (b) setViewZone(b.poll.timeZone);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the poll.");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollId]);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (bundle === undefined) return <Loading label="Loading poll" />;
  if (bundle === null) {
    return (
      <div className="space-y-3">
        <h1 className="text-3xl">Poll not found</h1>
        <p className="text-ink-soft">It may have been deleted, or it belongs to a different organizer account.</p>
        <Link to="/organizer/polls" className="inline-block underline underline-offset-4">Back to my polls</Link>
      </div>
    );
  }

  const { poll, slots, responses } = bundle;
  const shareUrl = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/p/${poll.id}`;
  const summary = summarize(slots, responses);
  const best = slots.filter((s) => summary.bestSlotIds.includes(s.id));

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* link is visible for manual copy */
    }
  }

  function exportCsv() {
    const csv = toCsv(
      slots,
      responses,
      (s) => `${formatDay(s.startsAt, poll.timeZone)} ${formatTime(s.startsAt, poll.timeZone)} (${poll.timeZone})`,
      true,
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${poll.title.replace(/[^\w-]+/g, "_").slice(0, 60) || "poll"}-responses.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function onRemove(r: PublicResponse) {
    if (!window.confirm(`Remove ${r.name}'s response? This cannot be undone.`)) return;
    void run(`remove-${r.id}`, async () => {
      await deleteResponse(r.id);
      await load();
    });
  }

  return (
    <div className="space-y-10">
      <div>
        <Link to="/organizer/polls" className="text-[15px] text-ink-mute hover:text-ink">← My polls</Link>
      </div>

      {justCreated && <Alert tone="success">Poll created. Share the link below with participants.</Alert>}

      <PollMeta poll={poll} viewZone={viewZone} />

      <Card className="space-y-3">
        <p className="font-medium">Share this link with participants</p>
        <p className="break-all rounded border border-paper-line bg-paper-tint px-3 py-2 font-mono text-[14px]">{shareUrl}</p>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={copyLink}>{copied ? "Copied" : "Copy link"}</Button>
          <a href={shareUrl} target="_blank" rel="noreferrer" className="inline-flex items-center rounded border border-paper-line bg-paper px-4 py-2 font-medium hover:border-ink-mute">
            Open public page
          </a>
        </div>
      </Card>

      <section className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-2xl">Results</h2>
          <TimeZoneNotice pollZone={poll.timeZone} localZone={localZone} viewZone={viewZone} onChange={setViewZone} />
        </div>

        {best.length > 0 && (
          <Alert tone="success">
            <span className="font-medium">{best.length > 1 ? "Best times (tied):" : "Best time:"}</span>{" "}
            {best.map((s) => formatDateTimeWithZone(s.startsAt, viewZone)).join(" · ")}
            {" — "}
            {summary.slots.find((s) => s.slotId === best[0].id)!.yes} of {summary.responseCount} available
          </Alert>
        )}

        <AvailabilityMatrix slots={slots} responses={responses} viewZone={viewZone} onRemove={onRemove} />

        {responses.some((r) => r.email) && (
          <details className="text-[15px]">
            <summary className="cursor-pointer text-ink-soft">Participant emails (visible only to you)</summary>
            <ul className="mt-2 space-y-1 pl-4">
              {responses.filter((r) => r.email).map((r) => (
                <li key={r.id}>
                  {r.name} — <a className="underline underline-offset-4" href={`mailto:${r.email}`}>{r.email}</a>
                  <span className="text-ink-mute"> · responded {formatDateTime(r.updatedAt, viewZone)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <Card className="space-y-4">
        <h2 className="text-xl">Manage</h2>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={exportCsv} disabled={responses.length === 0}>Export CSV</Button>
          {poll.status === "open" ? (
            <Button variant="secondary" busy={busy === "status"} onClick={() => run("status", async () => { await setPollStatus(poll.id, "closed"); await load(); })}>
              Close poll
            </Button>
          ) : (
            <Button variant="secondary" busy={busy === "status"} onClick={() => run("status", async () => { await setPollStatus(poll.id, "open"); await load(); })}>
              Reopen poll
            </Button>
          )}
          <Button
            variant="danger"
            busy={busy === "delete"}
            onClick={() => {
              if (!window.confirm("Delete this poll and every response? This cannot be undone.")) return;
              void run("delete", async () => {
                await deletePoll(poll.id);
                navigate("/organizer/polls", { replace: true });
              });
            }}
          >
            Delete poll
          </Button>
        </div>
        <p className="text-[15px] text-ink-mute">
          Closing keeps results visible but stops new responses. Deleting removes the poll, all responses, and all
          participant emails permanently.
        </p>
      </Card>
    </div>
  );
}
