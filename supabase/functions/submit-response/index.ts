// Supabase Edge Function: submit-response
//
// The only write path for participants. It runs with the service role key
// (available to Edge Functions as an environment secret, never to browsers).
//
// Responsibilities
//   1. Validate and sanitize the payload.
//   2. Rate-limit by salted IP hash.
//   3. Create or update the participant's response and availability.
//   4. Email the organizer (and the participant, if they gave an email).
//
// Request  (POST, JSON)
//   { pollId, name, email?, selections: { [slotId]: "yes" | "maybe" }, editToken? }
// Response (JSON)
//   { responseId, editToken?, updated, notified }

import { createClient } from "npm:@supabase/supabase-js@2";

type Selection = "yes" | "maybe";

interface Payload {
  pollId: string;
  name: string;
  email?: string | null;
  selections: Record<string, Selection>;
  editToken?: string | null;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const NOTIFY_FROM_EMAIL = Deno.env.get("NOTIFY_FROM_EMAIL") ?? "";
const APP_BASE_URL = (Deno.env.get("APP_BASE_URL") ?? "").replace(/\/$/, "");
const RATE_LIMIT_SALT = Deno.env.get("RATE_LIMIT_SALT") ?? "";

// Limits
const MAX_SUBMISSIONS_PER_IP_10MIN = 20;
const MAX_RESPONSES_PER_POLL = 500;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowed = new Set([APP_BASE_URL, "http://localhost:5173", "http://127.0.0.1:5173"].filter(Boolean));
  // If APP_BASE_URL is unset (first deploy), fall back to reflecting the origin.
  const allowOrigin = allowed.size === 0 || allowed.has(origin) ? origin || "*" : APP_BASE_URL;
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0] : req.headers.get("cf-connecting-ip") ?? "unknown").trim();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/** Collapse whitespace and strip control characters. */
function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function formatInZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZone, timeZoneName: "short",
  }).format(new Date(iso));
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function parsePayload(raw: unknown, allowMaybe: boolean): Payload {
  if (!raw || typeof raw !== "object") throw new HttpError(400, "Request body must be a JSON object.");
  const r = raw as Record<string, unknown>;

  const pollId = typeof r.pollId === "string" ? r.pollId.trim() : "";
  if (!UUID_RE.test(pollId)) throw new HttpError(400, "Invalid poll id.");

  const name = cleanText(r.name, 80);
  if (name.length < 1) throw new HttpError(400, "Please enter your name.");

  let email: string | null = null;
  if (r.email !== undefined && r.email !== null && r.email !== "") {
    email = cleanText(r.email, 254).toLowerCase();
    if (!EMAIL_RE.test(email)) throw new HttpError(400, "That email address doesn't look right.");
  }

  const selections: Record<string, Selection> = {};
  if (!r.selections || typeof r.selections !== "object" || Array.isArray(r.selections)) {
    throw new HttpError(400, "Selections are missing.");
  }
  for (const [slotId, state] of Object.entries(r.selections as Record<string, unknown>)) {
    if (!UUID_RE.test(slotId)) throw new HttpError(400, "Invalid time slot id.");
    if (state === "yes" || (state === "maybe" && allowMaybe)) selections[slotId] = state;
    else if (state === "maybe") throw new HttpError(400, "This poll does not accept 'if needed' answers.");
    else if (state !== null && state !== undefined && state !== "no") throw new HttpError(400, "Invalid availability value.");
  }

  let editToken: string | null = null;
  if (typeof r.editToken === "string" && r.editToken.length > 0) {
    if (!/^[A-Za-z0-9_-]{40,50}$/.test(r.editToken)) throw new HttpError(400, "Invalid edit link.");
    editToken = r.editToken;
  }

  return { pollId, name, email, selections, editToken };
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

async function enforceRateLimit(ipHash: string, pollId: string): Promise<void> {
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count, error } = await admin
    .from("submission_log")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", since);
  if (error) throw new HttpError(500, "Could not check rate limit.");
  if ((count ?? 0) >= MAX_SUBMISSIONS_PER_IP_10MIN) {
    throw new HttpError(429, "Too many submissions from your network. Please wait a few minutes and try again.");
  }
  await admin.from("submission_log").insert({ ip_hash: ipHash, poll_id: pollId });
  // Opportunistic cleanup (1 in 20 requests) keeps the table small.
  if (Math.random() < 0.05) {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await admin.from("submission_log").delete().lt("created_at", cutoff);
  }
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

async function sendEmail(to: string, subject: string, html: string, text: string): Promise<boolean> {
  if (!RESEND_API_KEY || !NOTIFY_FROM_EMAIL) {
    console.warn("Email not configured (RESEND_API_KEY / NOTIFY_FROM_EMAIL missing).");
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: NOTIFY_FROM_EMAIL, to: [to], subject, html, text }),
  });
  if (!res.ok) {
    console.error("Resend error", res.status, await res.text());
    return false;
  }
  return true;
}

function organizerEmail(opts: {
  title: string; name: string; updated: boolean; when: string; times: string[]; dashboardUrl: string;
}): { subject: string; html: string; text: string } {
  const verb = opts.updated ? "updated their availability" : "responded";
  const subject = `${opts.name} ${verb}: ${opts.title}`;
  const list = opts.times.length ? opts.times : ["(no times selected)"];
  const text = [
    `${opts.name} ${verb} to "${opts.title}".`, "",
    `Submitted: ${opts.when}`, "", "Available:", ...list.map((t) => `  - ${t}`), "",
    `View results: ${opts.dashboardUrl}`,
  ].join("\n");
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1C2333;max-width:560px">
      <p style="font-size:16px"><strong>${escapeHtml(opts.name)}</strong> ${verb} to
        <strong>${escapeHtml(opts.title)}</strong>.</p>
      <p style="color:#6B7488;margin:0 0 16px">Submitted ${escapeHtml(opts.when)}</p>
      <p style="margin:0 0 4px">Available:</p>
      <ul style="margin:0 0 20px;padding-left:20px">${list.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>
      <p><a href="${escapeHtml(opts.dashboardUrl)}" style="background:#1C2333;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block">View results</a></p>
    </div>`;
  return { subject, html, text };
}

function participantEmail(opts: { title: string; editUrl: string; times: string[] }) {
  const list = opts.times.length ? opts.times : ["(no times selected)"];
  const subject = `Your availability for: ${opts.title}`;
  const text = [
    `Thanks for responding to "${opts.title}".`, "", "You said you're available:", ...list.map((t) => `  - ${t}`), "",
    "To change your answer later, use this private link:", opts.editUrl, "",
    "Keep this link to yourself; anyone with it can edit your response.",
  ].join("\n");
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1C2333;max-width:560px">
      <p style="font-size:16px">Thanks for responding to <strong>${escapeHtml(opts.title)}</strong>.</p>
      <p style="margin:0 0 4px">You said you're available:</p>
      <ul style="margin:0 0 20px;padding-left:20px">${list.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>
      <p>To change your answer later, use this private link:<br>
        <a href="${escapeHtml(opts.editUrl)}">${escapeHtml(opts.editUrl)}</a></p>
      <p style="color:#6B7488">Keep this link to yourself; anyone with it can edit your response.</p>
    </div>`;
  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { error: "Method not allowed." });

  try {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      throw new HttpError(400, "Request body must be valid JSON.");
    }

    const pollId = typeof (raw as Record<string, unknown>)?.pollId === "string"
      ? String((raw as Record<string, unknown>).pollId) : "";
    if (!UUID_RE.test(pollId)) throw new HttpError(400, "Invalid poll id.");

    // Load poll and slots.
    const { data: poll, error: pollErr } = await admin
      .from("polls")
      .select("id, organizer_id, title, time_zone, status, deadline, allow_maybe")
      .eq("id", pollId)
      .maybeSingle();
    if (pollErr) throw new HttpError(500, "Could not load the poll.");
    if (!poll) throw new HttpError(404, "This poll no longer exists.");
    if (poll.status !== "open") throw new HttpError(409, "This poll is closed and no longer accepting responses.");
    if (poll.deadline && new Date(poll.deadline).getTime() < Date.now()) {
      throw new HttpError(409, "The response deadline for this poll has passed.");
    }

    const payload = parsePayload(raw, poll.allow_maybe);

    const { data: slots, error: slotsErr } = await admin
      .from("time_slots").select("id, starts_at").eq("poll_id", pollId).order("starts_at");
    if (slotsErr || !slots) throw new HttpError(500, "Could not load time slots.");
    const slotById = new Map(slots.map((s) => [s.id, s.starts_at as string]));
    for (const slotId of Object.keys(payload.selections)) {
      if (!slotById.has(slotId)) throw new HttpError(400, "One of the selected times does not belong to this poll.");
    }

    // Rate limit.
    const ipHash = await sha256Hex(`${RATE_LIMIT_SALT}:${clientIp(req)}`);
    await enforceRateLimit(ipHash, pollId);

    // Create or update the response.
    let responseId: string;
    let newToken: string | null = null;
    let updated = false;

    if (payload.editToken) {
      const tokenHash = await sha256Hex(payload.editToken);
      const { data: existing } = await admin
        .from("responses").select("id").eq("poll_id", pollId).eq("edit_token_hash", tokenHash).maybeSingle();
      if (!existing) throw new HttpError(403, "This edit link is not valid for this poll.");
      responseId = existing.id;
      updated = true;
      const { error } = await admin
        .from("responses").update({ name: payload.name, email: payload.email }).eq("id", responseId);
      if (error) throw new HttpError(500, "Could not update your response.");
      await admin.from("availability").delete().eq("response_id", responseId);
    } else {
      const { count } = await admin
        .from("responses").select("id", { count: "exact", head: true }).eq("poll_id", pollId);
      if ((count ?? 0) >= MAX_RESPONSES_PER_POLL) throw new HttpError(409, "This poll has reached its response limit.");
      newToken = randomToken();
      const { data: inserted, error } = await admin
        .from("responses")
        .insert({ poll_id: pollId, name: payload.name, email: payload.email, edit_token_hash: await sha256Hex(newToken) })
        .select("id").single();
      if (error || !inserted) throw new HttpError(500, "Could not save your response.");
      responseId = inserted.id;
    }

    const rows = Object.entries(payload.selections).map(([slot_id, state]) => ({ response_id: responseId, slot_id, state }));
    if (rows.length) {
      const { error } = await admin.from("availability").insert(rows);
      if (error) throw new HttpError(500, "Could not save your availability.");
    }

    // Notifications. Failures here must not fail the submission.
    let notified = false;
    try {
      const times = Object.entries(payload.selections)
        .map(([slotId, state]) => ({ at: slotById.get(slotId)!, state }))
        .sort((a, b) => a.at.localeCompare(b.at))
        .map(({ at, state }) => `${formatInZone(at, poll.time_zone)}${state === "maybe" ? " (if needed)" : ""}`);

      const { data: user } = await admin.auth.admin.getUserById(poll.organizer_id);
      const organizerAddress = user?.user?.email;
      if (organizerAddress && APP_BASE_URL) {
        const mail = organizerEmail({
          title: poll.title, name: payload.name, updated,
          when: formatInZone(new Date().toISOString(), poll.time_zone), times,
          dashboardUrl: `${APP_BASE_URL}/organizer/polls/${pollId}`,
        });
        notified = await sendEmail(organizerAddress, mail.subject, mail.html, mail.text);
      }

      if (payload.email && APP_BASE_URL) {
        const token = newToken ?? payload.editToken!;
        const mail = participantEmail({
          title: poll.title, times, editUrl: `${APP_BASE_URL}/p/${pollId}?edit=${token}`,
        });
        await sendEmail(payload.email, mail.subject, mail.html, mail.text);
      }
    } catch (e) {
      console.error("Notification failed", e);
    }

    return json(req, 200, { responseId, editToken: newToken ?? undefined, updated, notified });
  } catch (e) {
    if (e instanceof HttpError) return json(req, e.status, { error: e.message });
    console.error(e);
    return json(req, 500, { error: "Something went wrong. Please try again." });
  }
});
