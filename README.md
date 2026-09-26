# bun-email-api

## Local Development

To install dependencies (uses the committed `bun.lock`):

```bash
bun install --frozen-lockfile
```

To run:

```bash
bun run start
```

Other scripts:

```bash
bun run dev              # watch mode
bun run email             # preview email templates (src/emails)
bun run typecheck         # tsc --noEmit
bun test                  # run tests
bun run format             # prettier --write .
bun run format:check       # prettier --check .
```

This project was created using `bun init` in bun v1.0.7. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.

## Endpoints

- `POST /fpp` — bearer `BEA_SECRET_KEY`. Body: `{ name, email, subject, message }`. Sends a contact-form confirmation to the sender and forwards it to `BEA_RECEIVER_EMAIL`.
- `POST /fpp-daily-analytics` — bearer `BEA_SECRET_KEY`. Body: `{ votes, estimations, rooms, unique_users, page_views }`. Sends a daily analytics summary to `BEA_RECEIVER_EMAIL`.
- `POST /sy-serendipity` — bearer `BEA_SECRET_KEY`. Body: `{ firstName, lastName, email, numberOfPeople, destination, duration, arrivalDate, departureDate, phone, message }` (all fields except `email` are nullable). Sends a charter-request email to `BEA_SY_SERENDIPITY_RECEIVER_EMAIL`; uses `BEA_SY_SERENDIPITY_FROM_EMAIL` as the sender when set, otherwise falls back to the default `sendMail` sender.

## Spam filter

Both `/fpp` and `/sy-serendipity` run each submission through an LLM classifier (`src/spam/classify.ts`) before sending any mail. It sorts submissions into `legit`, `spam`, or `marketing` (unsolicited SEO/link-building/web-design/lead-gen/dev-outsourcing pitches), biased towards `legit` when unsure. Submissions classified as `spam`/`marketing` with confidence ≥ `0.7` are silently dropped — no emails are sent, but the caller still gets the normal success response so bots aren't tipped off. Below that threshold, the receiver mail subject is prefixed with `[Possible spam]` instead. Every decision is recorded in SQLite (`src/db/submissions.ts`) for the admin UI and `/api/submissions` to review.

The classifier fails open: if `BEA_LLM_BASE_URL`, `BEA_LLM_API_KEY`, or `BEA_LLM_MODEL` is unset, or the LLM call fails, the submission is treated as `legit` and delivered normally.

Neither endpoint waits on the classifier synchronously: `src/spam/gate.ts` races it against an 8s decision deadline, so a slow model never times out the caller (a Netlify function or Cloudflare edge). If the deadline wins, the mail is delivered immediately and the still-running classification is recorded once it lands, with its reason prefixed `Decided after deadline:` for the admin Filtered page.

New env vars:

- `BEA_LLM_BASE_URL` — OpenAI-compatible base URL for the classifier model.
- `BEA_LLM_API_KEY` — API key for that endpoint.
- `BEA_LLM_MODEL` — model id to use. Pick a fast/cheap model — form submitters wait on this call synchronously (bounded only by a 30-minute hang guard, not a tight timeout).

### Jev shadow mode

[Jev](https://typesafe.ai) is a decision model (typed answers with calibrated probabilities, no text generation) run **in shadow mode** next to the LLM: the LLM classifier stays the only authority on drop/deliver. For every submission `src/spam/gate.ts` starts Jev (`src/spam/jev-judge.ts`, one `choice` question over `legit`/`spam`/`marketing` with the same criteria as the classifier prompt plus both site descriptions) concurrently with the classifier. Jev never delays or changes the decision and can't break the gate — it is not part of the 8s deadline race, and its verdict is written to the row once it lands (with the row if it is already in, otherwise attached afterwards). A Jev failure is stored as `jev_error`.

Stored on each `submissions` row: `llm_latency_ms` (classifier latency, for comparison) and `jev_verdict`, `jev_confidence`, `jev_probabilities` (JSON), `jev_latency_ms`, `jev_model`, `jev_error`. All are `null` when Jev is disabled. The same fields are returned by `/api/submissions`; the admin Spam filter page shows Jev's verdict next to the LLM's with an agrees/differs marker, and the Overview shows the LLM↔Jev agreement rate and median latencies (also `jevComparison` in `/api/stats`).

Inbound emails (`direction = inbound`, regardless of provider) get two Jev decisions, requested alongside the LLM enrichment in one request (fire-and-forget: the LLM result is saved without waiting for Jev, and Jev's decision is written whenever it lands): a `spam_probability` (yes/no question: unsolicited spam/phishing/cold marketing vs. anything a human wrote to the owner or transactional mail) and a `category` from the same set as the LLM enrichment, with confidence. Stored as separate `jev_*` columns on `email_enrichments` (`jev_spam_probability`, `jev_category`, `jev_category_confidence`, `jev_latency_ms`, `jev_model`, `jev_error`) and returned as `enrichment.jev` by `/api/emails` and `/api/emails/:id`; the LLM fields are untouched, and either side failing never fails the other.

Env vars (all optional):

- `BEA_JEV_API_KEY` — unset disables Jev everywhere, silently.
- `BEA_JEV_BASE_URL` — default `https://api.beatapi.io` (official TypeSafe API: `https://api.typesafe.ai`, identical request shape).
- `BEA_JEV_MODEL` — default `jev-1.13-free` (official API: `jev-latest`).

## Admin UI

`GET /admin` — a server-rendered, zero-JS dashboard behind HTTP Basic auth (user `admin`), styled with `basalt-ui` tokens (automatic light/dark via `prefers-color-scheme`). Pages: Overview (stats, 14-day activity chart, category breakdown, needs-action and recently-blocked panels), Inbox (filterable/searchable list of every stored email, keyset-paginated), an email detail page (meta, AI enrichment, HTML/text content, a "Re-run AI" action), Spam filter (every judged submission), and Templates (previews of the registered email templates). All filtering happens through GET query params; the two POST actions (`Sync now`, `Re-run AI`) are guarded by a same-origin check. Dates are formatted in German (`Europe/Berlin`).

- `BEA_ADMIN_PASSWORD` — Basic auth password, min 12 chars. Unset → every `/admin` route returns 404.
- `bun run seed:demo` (refuses to run with `NODE_ENV=production`) seeds `$BEA_DATA_DIR` with realistic fake emails and submissions for exploring the dashboard locally.

## Storage

Every email (sent and received via Resend) and every contact-form submission is persisted in a SQLite database opened with `bun:sqlite` (`src/db/`), at `${BEA_DATA_DIR}/bun-email-api.sqlite`. Migrations (`src/db/migrations.ts`) run automatically on first use, tracked via `PRAGMA user_version`.

Tables:

- `emails` — one row per email (`direction`, addresses, subject, `html`/`text`, `attachments`, `source` — our own template/route id for outbound mail, e.g. `fpp-sender` — and Resend's `last_event`).
- `email_enrichments` — one row per email, filled in by the LLM enrichment worker (see below).
- `submissions` — one row per contact-form submission judged by the spam filter (replaces the old in-memory store).
- `emails_fts` — an FTS5 index over subject/addresses/text/summary, kept in sync by the `emails`/`email_enrichments` repository code and used by `/api/emails?q=`.

New env var:

- `BEA_DATA_DIR` — directory for the SQLite file. Defaults to `./data`. In the Docker image this is `/data`, which `docker-compose` mounts as a volume.

## Sync

`src/sync/resend-sync.ts` pulls the full history of sent and received emails from Resend into SQLite: on an empty database this is a one-time backfill, and every run after that only fetches emails newer than what's already stored (it stops paging as soon as it sees a known id). A background scheduler runs it once ~5s after boot and then every 5 minutes; `POST /api/sync` (and the admin UI's "Sync now" button) triggers a run on demand (409 if one is already in progress). `sendMail()` also writes a minimal row immediately after a successful send, which the next sync fills in with `html`/`text`/`last_event`.

Sync self-heals after a partial failure: a `sync_state` table (per direction) only marks a run complete when it drained without errors, so the next run only trusts the "known id → stop" shortcut after a clean run — otherwise it pages through the full history again rather than permanently skipping older emails.

- `BEA_RESEND_ADMIN_API_KEY` — optional full-access Resend key used for sync. Without it, sync falls back to the sending-only `BEA_RESEND_API_KEY`, and Received emails additionally need inbound receiving enabled on the domain.

## Enrichment

Every email is enriched once by the LLM (`src/enrich/`): `category`, `priority`, `actionRequired`, a short `summary`, a `suggestedAction`, `language`, and up to 8 extracted `facts`. A background worker (`src/enrich/worker.ts`) claims up to 10 pending/retryable rows every 30s and enriches them sequentially; it's also kicked immediately after a sync that added new rows. Enrichment reuses the same LLM configuration as the spam classifier (`BEA_LLM_BASE_URL`/`BEA_LLM_API_KEY`/`BEA_LLM_MODEL`, see above) and fails the same way: rows stay `pending` if the LLM isn't configured, and a failed attempt is retried up to 3 times before being left `failed`.

`BEA_LLM_*` env vars are read once at process start — changing them requires a restart to take effect.

## API

`GET`/`POST /api/*` — bearer-authenticated JSON API over the stored emails and submissions. Unset `BEA_API_KEY` → every `/api/*` route 404s; a wrong/missing bearer token → `401 { "error": "unauthorized" }`.

| Method & path                 | Query params                                                                                                                                                 | Notes                                                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/emails`             | `direction`, `category` (comma-separated), `source`, `from`, `to`, `q`, `since`, `until`, `action_required`, `status`, `limit` (1-100, default 25), `cursor` | Keyset-paginated, newest first. List items omit `html`/`text` in favor of a 240-char `snippet`.                                                     |
| `GET /api/emails/:id`         | `include=html`                                                                                                                                               | Full email including `text`; `html` only when `include=html` is passed. `404` if unknown.                                                           |
| `POST /api/emails/:id/enrich` | —                                                                                                                                                            | Resets and re-runs enrichment for one email, waits for the result, and returns it.                                                                  |
| `GET /api/stats`              | `since` (default: 30 days ago)                                                                                                                               | Totals by direction, counts by category, open action-required count, a 14-day per-day chart (Europe/Berlin days), and submission counts by verdict. |
| `GET /api/submissions`        | `verdict`, `source`, `delivered`, `limit`, `cursor`                                                                                                          | Same keyset pagination as `/api/emails`.                                                                                                            |
| `POST /api/sync`              | —                                                                                                                                                            | Runs a Resend sync now; `409` if one is already running.                                                                                            |

```bash
curl -H "Authorization: Bearer $BEA_API_KEY" "https://<host>/api/emails?direction=inbound&limit=10"
```

New env var:

- `BEA_API_KEY` — bearer key for `/api/*`, min 16 chars. Unset → the whole `/api/*` prefix 404s.
