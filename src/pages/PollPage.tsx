import { useEffect, useState, type FormEvent } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import AvailabilityMatrix from "../components/AvailabilityMatrix";
import PollMeta from "../components/PollMeta";
import SlotPicker from "../components/SlotPicker";
import TimeZoneNotice from "../components/TimeZoneNotice";
import { Alert, Button, Card, Field, Loading, TextInput } from "../components/ui";
import { fetchPublicPoll, fetchResponseByToken, submitResponse, type SubmitResponseResult } from "../lib/api";
import { detectTimeZone, isPast } from "../lib/time";
import type { AvailabilityState, PublicPollBundle } from "../lib/types";
import { LIMITS, validateParticipant } from "../lib/validation";

const UUID_RE = /^[0-9a-f-]{36}$/i;
const EMAIL_HINT = "Only used to send you a link for editing your response.";

export default function PollPage() {
  const { pollId = "" } = useParams();
  const [params] = useSearchParams();
  const editToken = params.get("edit");

  const [bundle, setBundle] = useState<PublicPollBundle | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewZone, setViewZone] = useState<string>("UTC");
  const localZone = detectTimeZone();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [selections, setSelections] = useState<Record<string, AvailabilityState>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SubmitResponseResult | null>(null);
  const [editState, setEditState] = useState<"none" | "loaded" | "invalid">("none");

  async function load() {
    if (!UUID_RE.test(pollId)) {
      setBundle(null);
      return;
    }
    try {
      const b = await fetchPublicPoll(pollId);
      setBundle(b);
      if (b) setViewZone(b.poll.timeZone);
      if (b && editToken) {
        const existing = await fetchResponseByToken(pollId, editToken);
        if (existing) {
          setName(existing.name);
          setEmail(existing.email ?? "");
          setSelections(existing.availability);
          setEditState("loaded");
        } else {
          setEditState("invalid");
        }
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load this poll.");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollId, editToken]);

  if (loadError) return <Alert tone="error">{loadError}</Alert>;
  if (bundle === undefined) return <Loading label="Loading poll" />;
  if (bundle === null) {
    return (
      <div className="mx-auto max-w-xl space-y-3">
        <h1 className="text-3xl">Poll not found</h1>
        <p className="text-ink-soft">It may have been deleted, or the link may be incomplete.</p>
      </div>
    );
  }

  const { poll, slots, responses } = bundle;
  const closed = poll.status === "closed" || isPast(poll.deadline);
  const canEdit = editState === "loaded";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const errors = validateParticipant(name, email);
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setBusy(true);
    try {
      const r = await submitResponse({
        pollId,
        name: name.trim(),
        email,
        selections,
        editToken: canEdit ? editToken : null,
      });
      setResult(r);
      await load();
      window.scrollTo({ top: 0 });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Your response could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  const editUrl = result?.editToken
    ? `${window.location.origin}${window.location.pathname}?edit=${result.editToken}`
    : canEdit
      ? window.location.href
      : null;

  return (
    <div className="space-y-10">
      <PollMeta poll={poll} viewZone={viewZone} />
      <TimeZoneNotice pollZone={poll.timeZone} localZone={localZone} viewZone={viewZone} onChange={setViewZone} />

      {result ? (
        <Card className="space-y-4">
          <Alert tone="success">
            {result.updated ? "Your availability has been updated." : "Thanks, your availability has been recorded."}
            {" "}The organizer has been notified.
          </Alert>
          {editUrl && (
            <div className="space-y-2 text-[15px]">
              <p className="font-medium">Need to change your answer later?</p>
              <p className="text-ink-soft">
                Use this private link. Anyone with it can edit your response, so keep it to yourself.
                {email.trim() && " A copy has been emailed to you."}
              </p>
              <p className="break-all rounded border border-paper-line bg-paper-tint px-3 py-2 font-mono text-[14px]">{editUrl}</p>
              <CopyButton text={editUrl} />
            </div>
          )}
          <Button variant="secondary" onClick={() => setResult(null)}>Edit my response again</Button>
        </Card>
      ) : closed ? (
        <Alert tone="info">This poll is no longer accepting responses. The results so far are shown below.</Alert>
      ) : (
        <Card>
          <form onSubmit={onSubmit} className="space-y-8" noValidate>
            {editState === "invalid" && (
              <Alert tone="error">
                That edit link is not valid for this poll. You can still submit a new response below.
              </Alert>
            )}
            {canEdit && <Alert tone="info">You're editing your earlier response. Submit to save the changes.</Alert>}

            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="name" label="Your name" error={fieldErrors.name}>
                <TextInput id="name" autoComplete="name" maxLength={LIMITS.name} value={name} onChange={(e) => setName(e.target.value)} error={fieldErrors.name} required />
              </Field>
              <Field id="email" label="Email" optional hint={EMAIL_HINT} error={fieldErrors.email}>
                <TextInput id="email" type="email" autoComplete="email" maxLength={LIMITS.email} value={email} onChange={(e) => setEmail(e.target.value)} error={fieldErrors.email} hasHint />
              </Field>
            </div>

            <SlotPicker
              slots={slots}
              durationMinutes={poll.durationMinutes}
              viewZone={viewZone}
              allowMaybe={poll.allowMaybe}
              value={selections}
              onChange={setSelections}
            />

            {submitError && <Alert tone="error">{submitError}</Alert>}

            <div className="flex flex-wrap items-center gap-4">
              <Button type="submit" busy={busy}>{canEdit ? "Save changes" : "Submit availability"}</Button>
              <span className="text-[15px] text-ink-mute">
                {Object.keys(selections).length === 0
                  ? "No times selected — submitting means none of these work for you."
                  : `${Object.keys(selections).length} of ${slots.length} times selected`}
              </span>
            </div>
          </form>
        </Card>
      )}

      <section className="space-y-4">
        <h2 className="text-2xl">Responses so far</h2>
        <AvailabilityMatrix slots={slots} responses={responses} viewZone={viewZone} />
      </section>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      className="text-[15px]"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          /* clipboard unavailable; the link is visible for manual copy */
        }
      }}
    >
      {copied ? "Copied" : "Copy link"}
    </Button>
  );
}
