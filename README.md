# Overlap

Overlap is a small, self-hosted scheduling tool for finding a meeting time that works for the most people. An organizer proposes several dates and times, shares one link, and participants mark when they are available. Nobody but the organizer needs an account, and the organizer receives an email every time someone responds.

It is built for professional use (faculty committees, research groups, collaborations with external colleagues) and runs on free tiers of GitHub Pages, Supabase, and Resend.

## What it does

**Organizer**

- Signs in with a one-time email link (no password to manage or leak).
- Creates a poll: title, description, duration, time zone, proposed times, optional response deadline, optional "if needed" answers.
- Gets a shareable link (`/p/<unpredictable-id>`).
- Sees an availability matrix with counts, percentages, and the best time(s) highlighted; ties are shown as ties.
- Receives an email notification for every new or updated response, with a link to the results.
- Can close, reopen, or delete a poll, remove individual responses, and export results as CSV (the only place participant emails are exported).

**Participant**

- Opens the link, enters a name (email optional), taps the times that work, and submits.
- Sees a confirmation and a private edit link for changing the answer later (also emailed if an email was given).
- Can view times in the poll's time zone or their own.

## Architecture

```
Browser (React SPA on GitHub Pages)
   │
   ├─ read poll ──────► Supabase Postgres  RPC get_public_poll()   (anon key, no table access)
   ├─ submit answer ──► Supabase Edge Function submit-response ──► Postgres (service role)
   │                                                            └─► Resend (email organizer + participant)
   └─ organizer ──────► Supabase Auth (magic link) ──► Postgres tables under Row Level Security
```

| Concern | Choice | Why |
| --- | --- | --- |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS | Small, well understood, no server needed |
| Hosting | GitHub Pages via GitHub Actions | Free, static, source stays in the same repo |
| Database & auth | Supabase (Postgres + Auth) | Free tier, RLS, magic links, hosted |
| Privileged writes & email | Supabase Edge Function (Deno) | Holds the service-role and Resend keys, never the browser |
| Email | Resend | Simple API, free tier, good deliverability |

**Why GitHub Pages is acceptable here.** It is static, so it cannot keep secrets or run code. Overlap never needs it to: the browser only holds the Supabase URL and *anon* key, which are designed to be public and are constrained by Row Level Security. All writes by participants and all email go through an Edge Function. The one practical limitation, deep links to client-side routes returning 404, is handled by publishing the app shell as `404.html` during deployment. If you later want server-side rendering or preview deployments, Vercel, Netlify, or Cloudflare Pages will run this project unchanged.

### Security model, in short

- **Anonymous users have zero table privileges.** They can only call two `SECURITY DEFINER` functions: `get_public_poll(id)` (returns title, times, names, and availability, never emails) and `get_response_by_token(id, token)` (returns one response, only to the holder of its edit token).
- **Organizers** are Supabase Auth users. RLS restricts every table to rows where `polls.organizer_id = auth.uid()`. Organizers can read and delete responses but cannot insert or update them, so a response always originates from the participant. Column-level grants prevent the organizer's client from reading `edit_token_hash`.
- **Participant writes** go through the `submit-response` Edge Function, which validates all input, checks that the poll is open and the deadline has not passed, verifies every slot id belongs to the poll, rate-limits by a salted SHA-256 hash of the client IP (20 submissions per 10 minutes), caps responses per poll at 500, and only then writes with the service role.
- **Edit tokens** are 32 random bytes; only the SHA-256 hash is stored.
- **Secrets** (service-role key, Resend key) live only in Supabase Edge Function secrets. The repository contains `.env.example` with names only. `.gitignore` excludes `.env*`.
- **Email addresses** of participants are visible only on the organizer page and CSV export, never through the public RPC.
- Database constraints enforce lengths, valid time zones, valid states, and referential integrity with cascading deletes so deleting a poll removes all associated data.

### What is stored

See `src/pages/Privacy.tsx` (served at `/privacy`): participant name, optional email, availability, timestamps, and a 24-hour salted hash of the IP used for rate limiting. No analytics.

## Directory structure

```
.
├── .github/workflows/
│   ├── ci.yml                  # type-check + tests on PRs and main
│   ├── deploy.yml              # build + publish to GitHub Pages
│   └── deploy-functions.yml    # push migrations + Edge Function to Supabase
├── supabase/
│   ├── config.toml
│   ├── migrations/20260911000000_init.sql   # schema, constraints, RLS, RPCs
│   ├── functions/submit-response/index.ts   # validated writes + email
│   └── tests/security.test.sql              # pgTAP authorization tests
├── src/
│   ├── main.tsx, App.tsx, index.css
│   ├── lib/
│   │   ├── api.ts          # all Supabase/Edge Function calls
│   │   ├── summary.ts      # availability counting, best-time, CSV (pure)
│   │   ├── time.ts         # IANA time-zone conversion and formatting
│   │   ├── validation.ts   # client-side validation
│   │   ├── types.ts, env.ts, supabase.ts
│   │   └── *.test.ts       # Vitest unit tests
│   ├── components/         # ui primitives, layout, auth, matrix, pickers
│   └── pages/              # Home, PollPage, OrganizerLogin, OrganizerPolls,
│                           # CreatePoll, PollAdmin, Privacy, NotFound
├── index.html, vite.config.ts, tailwind.config.js, tsconfig.json
├── .env.example, .gitignore, LICENSE, README.md
```

## Prerequisites

- Node.js 20 or newer (22 recommended) and npm
- A GitHub account
- A Supabase account (free)
- A Resend account (free) and, for production email, a domain you control
- Supabase CLI: `npm install -g supabase` (or use `npx supabase`)

## Local development

```bash
git clone https://github.com/<you>/overlap.git
cd overlap
npm install
cp .env.example .env      # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev               # http://localhost:5173
npm test                  # unit tests
npm run lint              # type-check
```

You can develop against your hosted Supabase project (simplest) or run everything locally with `supabase start`, which also lets you run the pgTAP security tests with `supabase test db`.

## Supabase setup

1. Create a project at <https://supabase.com/dashboard>. Choose a strong database password and keep it; the deploy workflow needs it.
2. From **Settings → API** note the **Project URL** and the **anon public** key (public) and the **service_role** key (secret, used only for Edge Function secrets and never pasted anywhere else).
3. From **Settings → General** note the **Reference ID**.

### Database migration

```bash
supabase login                              # opens browser
supabase link --project-ref <REFERENCE_ID>  # prompts for the DB password
supabase db push                            # applies supabase/migrations/*.sql
```

This creates the tables, constraints, triggers, RLS policies, RPC functions, and the organizer overview view.

To verify the authorization tests locally: `supabase start && supabase test db`.

### Authentication (organizer)

1. **Authentication → Providers → Email**: keep Email enabled. Turn **off** "Confirm email" if you prefer a single-step magic link (the link itself proves ownership).
2. **Authentication → URL Configuration**:
   - **Site URL**: your production URL, e.g. `https://<you>.github.io/overlap` or `https://polls.yourdomain.edu`
   - **Redirect URLs**: add `https://<you>.github.io/overlap/**`, `https://polls.yourdomain.edu/**` (if using a custom domain), and `http://localhost:5173/**` for development.
3. Optional but recommended, **Authentication → Email Templates → Magic Link**: change the subject and body to something like "Your Overlap sign-in link". Supabase's default sender is fine for low volume; you can point Auth SMTP at Resend under **Authentication → SMTP Settings** for better deliverability.

Anyone who completes a magic link becomes an organizer with their *own* polls. They cannot see yours. If you want to be the only organizer, restrict sign-ups: **Authentication → Providers → Email → "Allow new users to sign up"** off *after* you have signed in once.

### Email notifications (Resend)

1. Create an API key at <https://resend.com/api-keys> (permission: Sending access).
2. Add and verify a domain at <https://resend.com/domains> (DNS records: DKIM, SPF/return-path). Until verified you can only send from `onboarding@resend.dev` to your own Resend account email, which is enough to test.
3. Set the Edge Function secrets (these never leave Supabase):

```bash
supabase secrets set \
  RESEND_API_KEY=re_xxxxxxxxx \
  NOTIFY_FROM_EMAIL="Overlap <polls@yourdomain.edu>" \
  APP_BASE_URL=https://polls.yourdomain.edu \
  RATE_LIMIT_SALT="$(openssl rand -hex 32)"
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically into Edge Functions; do not set them yourself.

Notifications go to the email address of the organizer account that created the poll. That address is never shown on the public page.

### Deploy the Edge Function

```bash
supabase functions deploy submit-response
```

`supabase/config.toml` sets `verify_jwt = false` for this function because participants have no account; authorization is enforced inside the function.

## Environment variables

| Name | Where | Public? | Purpose |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | `.env`, GitHub Actions variable | yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | `.env`, GitHub Actions variable | yes | anon key (RLS-protected) |
| `VITE_BASE_PATH` | GitHub Actions variable | yes | `/<repo>/` for project Pages sites; empty for custom domains |
| `CUSTOM_DOMAIN` | GitHub Actions variable | yes | writes `CNAME` on deploy |
| `RESEND_API_KEY` | Supabase secret | **no** | sending email |
| `NOTIFY_FROM_EMAIL` | Supabase secret | no | From address |
| `APP_BASE_URL` | Supabase secret | no | builds links in emails; also the allowed CORS origin |
| `RATE_LIMIT_SALT` | Supabase secret | **no** | salts IP hashes |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD` | GitHub Actions secrets | **no** | used only by `deploy-functions.yml` |

## GitHub repository setup and deployment

1. Create a new GitHub repository (public or private; Pages works with both on paid plans, public on free).
2. Push this project to `main`.
3. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
4. **Settings → Secrets and variables → Actions → Variables**: add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_BASE_PATH` = `/<repo-name>/` (omit or leave empty if you will use a custom domain or a `<you>.github.io` repo).
5. **Secrets** (only if you want GitHub to push migrations and functions for you; otherwise use the CLI): `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`.
6. Push to `main`. The **Deploy to GitHub Pages** workflow builds with your variables and publishes. The site is at `https://<you>.github.io/<repo>/`.

### Custom domain

1. In your DNS, add a `CNAME` record for the subdomain (e.g. `polls`) pointing to `<you>.github.io`.
2. **Settings → Pages → Custom domain**: enter `polls.yourdomain.edu`, wait for the DNS check, enable **Enforce HTTPS**.
3. Add the Actions variable `CUSTOM_DOMAIN=polls.yourdomain.edu` so each deploy writes the `CNAME` file, and set `VITE_BASE_PATH` to empty.
4. Update the Supabase **Site URL / Redirect URLs** and the `APP_BASE_URL` secret to the new domain, then redeploy the function: `supabase functions deploy submit-response`.

## Exact deployment sequence

1. **Create the GitHub repository** and note its name.
2. **Initialize locally**: unzip/clone this project, `git init`, `git remote add origin …`, `npm install`.
3. **Create the Supabase project**; record URL, anon key, service-role key, reference id, DB password.
4. **Configure the database**: `supabase login`, `supabase link`, `supabase db push`.
5. **Confirm RLS**: in the Supabase dashboard **Table Editor**, every table shows an "RLS enabled" badge. Optionally run `supabase test db` locally.
6. **Configure organizer auth**: Site URL, Redirect URLs, magic-link template (above).
7. **Configure email**: Resend API key, verify domain, `supabase secrets set …`.
8. **Add environment variables**: local `.env`; GitHub Actions variables; Supabase secrets.
9. **Test locally**: `npm test`, `npm run dev`, sign in at `/organizer`, create a poll, open the public link in a private window, respond, check the organizer email arrives.
10. **Push to GitHub**: `git add -A && git commit -m "Initial deployment" && git push -u origin main`.
11. **Deploy the frontend**: watch **Actions → Deploy to GitHub Pages**.
12. **Deploy the Edge Function**: `supabase functions deploy submit-response` (or the `Deploy Supabase` workflow).
13. **Test a real submission** on the live site from a phone and a laptop.
14. **Verify the notification email**, including the "View results" link. Check spam once; add the sender to contacts.
15. **Custom domain** (optional) as above, then re-test sign-in (redirect URL) and one submission (CORS uses `APP_BASE_URL`).

## Creating your first poll

1. Go to `/organizer`, enter your professional email, open the sign-in link.
2. **New poll**: title, duration, time zone (defaults to your browser's), proposed times (date + start time, "Add time"), optional deadline, whether to allow "if needed".
3. **Create poll**. Copy the share link and send it.
4. Watch responses arrive by email; open the results page to see the best time highlighted. Close the poll once decided.

## Costs

Everything runs on free tiers at committee scale. Things that could eventually cost money:

- **Supabase Free** pauses projects after 7 days without activity (wake it from the dashboard; sign-ins and page views count as activity). Free tier: 500 MB database, 50,000 monthly auth users, 500,000 Edge Function invocations. The **Pro** plan (US$25/month) removes pausing and adds backups.
- **Resend Free**: 3,000 emails/month, 100/day. Paid from US$20/month.
- **GitHub Pages**: free for public repositories; private repositories need GitHub Pro/Team.
- **Domain**: registration fee only.

## Testing

- `npm test` runs Vitest suites for availability counting, best-time and tie logic, CSV export, time-zone conversion (including DST boundaries and day grouping), and input validation.
- `supabase test db` runs pgTAP tests proving anonymous users cannot read tables, public reads omit emails, organizers cannot read or alter each other's polls, and organizers cannot forge responses.
- The Edge Function is exercised end to end in step 9/13 of deployment. Its validation mirrors `src/lib/validation.ts` and the database constraints.

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| Blank page after deploy, console shows "Missing environment variable" | Actions variables not set, or set as Secrets instead of Variables. |
| Sign-in link returns to the site but you are not signed in | The redirect URL isn't in **Authentication → URL Configuration → Redirect URLs**; or `VITE_BASE_PATH` doesn't match the Pages path. |
| Sign-in email never arrives | Supabase's default sender has low limits (a few per hour). Configure SMTP with Resend under Auth settings. |
| Opening `/p/<id>` directly gives GitHub's 404 page | The deploy workflow didn't copy `index.html` to `404.html`; re-run the workflow. |
| Participant submit fails with a CORS error | `APP_BASE_URL` secret doesn't match the site origin exactly (scheme, host, no trailing path). Redeploy the function after changing secrets. |
| Submission works but no email | `RESEND_API_KEY`/`NOTIFY_FROM_EMAIL` unset, or domain not verified in Resend. Check **Edge Functions → Logs**. The submission is still saved. |
| "Too many submissions from your network" | Rate limit: 20 per 10 minutes per IP. Common on shared campus NAT; raise `MAX_SUBMISSIONS_PER_IP_10MIN` in the function if needed. |
| `supabase db push` errors on `pg_timezone_names` | Unknown zone in an existing row; time zones must be valid IANA names. |
| Organizer sees no polls after switching email | Polls belong to the account that created them. Sign in with the original address. |

## License

MIT. See `LICENSE`. MIT is recommended because it is permissive, familiar to university legal offices, and lets colleagues fork the tool for their own departments.
