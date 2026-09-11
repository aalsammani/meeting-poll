import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../components/useAuth";
import { Alert, Button, Card, Field, TextInput } from "../components/ui";
import { sendMagicLink } from "../lib/api";

/**
 * Passwordless organizer sign-in. Supabase emails a one-time link; clicking
 * it returns the browser here with a session in the URL fragment, which the
 * client picks up automatically.
 */
export default function OrganizerLogin() {
  const { session, loading } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loading && session) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from.startsWith("/organizer") ? from : "/organizer/polls"} replace />;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError("Enter the email address you use for this tool.");
    setBusy(true);
    try {
      const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/organizer/polls`;
      await sendMagicLink(email.trim(), redirectTo);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the sign-in link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-3xl">Organizer sign in</h1>
        <p className="mt-2 text-ink-soft">
          Only organizers need to sign in. Participants respond to polls without an account.
        </p>
      </div>
      <Card>
        {sent ? (
          <Alert tone="success">
            A sign-in link is on its way to {email}. Open it on this device to continue. The link expires after a short
            time and can be used once.
          </Alert>
        ) : (
          <form onSubmit={submit} className="space-y-5" noValidate>
            <Field id="email" label="Email address" error={error ?? undefined} hint="You'll receive a one-time sign-in link. No password needed.">
              <TextInput id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={error ?? undefined} required />
            </Field>
            <Button type="submit" busy={busy}>Email me a sign-in link</Button>
          </form>
        )}
      </Card>
    </div>
  );
}
