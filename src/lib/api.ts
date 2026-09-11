/**
 * All network access lives here so pages stay declarative.
 *
 * Public reads   → RPC get_public_poll (anon, exposes only public fields)
 * Public writes  → Edge Function submit-response (validated, rate-limited)
 * Organizer ops  → direct table access under Row Level Security
 */
import { supabase } from "./supabase";
import type {
  AvailabilityState,
  NewPollInput,
  OrganizerResponse,
  PollOverview,
  PollStatus,
  PublicPoll,
  PublicPollBundle,
  TimeSlot,
} from "./types";

export class ApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

function friendly(message: string | undefined, fallback: string): ApiError {
  return new ApiError(message && message.length < 200 ? message : fallback);
}

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

export async function fetchPublicPoll(pollId: string): Promise<PublicPollBundle | null> {
  const { data, error } = await supabase.rpc("get_public_poll", { p_poll_id: pollId });
  if (error) throw friendly(undefined, "Could not load this poll. Check your connection and try again.");
  return (data as PublicPollBundle | null) ?? null;
}

export interface SubmitResponseInput {
  pollId: string;
  name: string;
  email: string;
  selections: Record<string, AvailabilityState>;
  editToken: string | null;
}

export interface SubmitResponseResult {
  responseId: string;
  editToken?: string;
  updated: boolean;
  notified: boolean;
}

export async function submitResponse(input: SubmitResponseInput): Promise<SubmitResponseResult> {
  const { data, error } = await supabase.functions.invoke("submit-response", {
    body: {
      pollId: input.pollId,
      name: input.name,
      email: input.email.trim() || null,
      selections: input.selections,
      editToken: input.editToken,
    },
  });
  if (error) {
    // supabase-js wraps non-2xx responses; try to surface the function's message.
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const body = (await ctx.json()) as { error?: string };
        if (body?.error) throw new ApiError(body.error, ctx.status);
      } catch (e) {
        if (e instanceof ApiError) throw e;
      }
    }
    throw new ApiError("Your response could not be saved. Please try again.");
  }
  if (data && typeof data === "object" && "error" in data) {
    throw new ApiError(String((data as { error: string }).error));
  }
  return data as SubmitResponseResult;
}

// ---------------------------------------------------------------------------
// Organizer authentication
// ---------------------------------------------------------------------------

export async function sendMagicLink(email: string, redirectTo: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
  });
  if (error) throw friendly(error.message, "Could not send the sign-in link.");
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

// ---------------------------------------------------------------------------
// Organizer: polls
// ---------------------------------------------------------------------------

interface OverviewRow {
  id: string; title: string; status: PollStatus; time_zone: string; deadline: string | null;
  created_at: string; updated_at: string; response_count: number; last_response_at: string | null; slot_count: number;
}

export async function listPolls(): Promise<PollOverview[]> {
  const { data, error } = await supabase
    .from("poll_overview")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw friendly(undefined, "Could not load your polls.");
  return (data as OverviewRow[]).map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    timeZone: r.time_zone,
    deadline: r.deadline,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    responseCount: r.response_count,
    lastResponseAt: r.last_response_at,
    slotCount: r.slot_count,
  }));
}

export async function createPoll(input: NewPollInput): Promise<string> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) throw new ApiError("Your session has expired. Sign in again to continue.", 401);

  const { data: poll, error } = await supabase
    .from("polls")
    .insert({
      organizer_id: userId,
      title: input.title,
      description: input.description || null,
      duration_minutes: input.durationMinutes,
      time_zone: input.timeZone,
      deadline: input.deadline,
      allow_maybe: input.allowMaybe,
    })
    .select("id")
    .single();
  if (error || !poll) throw friendly(error?.message, "Could not create the poll.");

  const { error: slotErr } = await supabase
    .from("time_slots")
    .insert(input.slotStartsAt.map((starts_at) => ({ poll_id: poll.id, starts_at })));
  if (slotErr) {
    // Keep the database consistent: a poll without slots is useless.
    await supabase.from("polls").delete().eq("id", poll.id);
    throw friendly(undefined, "Could not save the proposed times.");
  }
  return poll.id;
}

export interface OrganizerPollBundle {
  poll: PublicPoll & { createdAt: string };
  slots: TimeSlot[];
  responses: OrganizerResponse[];
}

export async function fetchOrganizerPoll(pollId: string): Promise<OrganizerPollBundle | null> {
  const { data: p, error } = await supabase
    .from("polls")
    .select("id, title, description, duration_minutes, time_zone, deadline, status, allow_maybe, created_at")
    .eq("id", pollId)
    .maybeSingle();
  if (error) throw friendly(undefined, "Could not load the poll.");
  if (!p) return null;

  const [{ data: slots, error: sErr }, { data: responses, error: rErr }] = await Promise.all([
    supabase.from("time_slots").select("id, starts_at").eq("poll_id", pollId).order("starts_at"),
    supabase
      .from("responses")
      .select("id, name, email, created_at, updated_at, availability(slot_id, state)")
      .eq("poll_id", pollId)
      .order("created_at"),
  ]);
  if (sErr || rErr || !slots || !responses) throw friendly(undefined, "Could not load responses.");

  return {
    poll: {
      id: p.id,
      title: p.title,
      description: p.description,
      durationMinutes: p.duration_minutes,
      timeZone: p.time_zone,
      deadline: p.deadline,
      status: p.status,
      allowMaybe: p.allow_maybe,
      createdAt: p.created_at,
    },
    slots: slots.map((s) => ({ id: s.id, startsAt: s.starts_at })),
    responses: responses.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      availability: Object.fromEntries(
        (r.availability as Array<{ slot_id: string; state: AvailabilityState }>).map((a) => [a.slot_id, a.state]),
      ),
    })),
  };
}

export async function setPollStatus(pollId: string, status: PollStatus): Promise<void> {
  const { error } = await supabase.from("polls").update({ status }).eq("id", pollId);
  if (error) throw friendly(undefined, "Could not update the poll.");
}

export async function deletePoll(pollId: string): Promise<void> {
  const { error } = await supabase.from("polls").delete().eq("id", pollId);
  if (error) throw friendly(undefined, "Could not delete the poll.");
}

export async function deleteResponse(responseId: string): Promise<void> {
  const { error } = await supabase.from("responses").delete().eq("id", responseId);
  if (error) throw friendly(undefined, "Could not remove that response.");
}

// ---------------------------------------------------------------------------
// Participant edit flow
// ---------------------------------------------------------------------------

export interface ExistingResponse {
  id: string;
  name: string;
  email: string | null;
  availability: Record<string, AvailabilityState>;
}

export async function fetchResponseByToken(pollId: string, token: string): Promise<ExistingResponse | null> {
  const { data, error } = await supabase.rpc("get_response_by_token", { p_poll_id: pollId, p_token: token });
  if (error) return null;
  return (data as ExistingResponse | null) ?? null;
}
