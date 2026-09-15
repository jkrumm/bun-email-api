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

Both `/fpp` and `/sy-serendipity` run each submission through an LLM classifier (`src/spam/classify.ts`) before sending any mail. It sorts submissions into `legit`, `spam`, or `marketing` (unsolicited SEO/link-building/web-design/lead-gen/dev-outsourcing pitches), biased towards `legit` when unsure. Submissions classified as `spam`/`marketing` with confidence ≥ `0.7` are silently dropped — no emails are sent, but the caller still gets the normal success response so bots aren't tipped off. Below that threshold, the receiver mail subject is prefixed with `[Possible spam]` instead. Every decision is recorded in-memory (`src/spam/store.ts`) for the admin UI to review.

The classifier fails open: if `BEA_LLM_BASE_URL`, `BEA_LLM_API_KEY`, or `BEA_LLM_MODEL` is unset, or the LLM call fails, the submission is treated as `legit` and delivered normally.

Neither endpoint waits on the classifier synchronously: `src/spam/gate.ts` races it against an 8s decision deadline, so a slow model never times out the caller (a Netlify function or Cloudflare edge). If the deadline wins, the mail is delivered immediately and the still-running classification is recorded once it lands, with its reason prefixed `Decided after deadline:` for the admin Filtered page.

New env vars:

- `BEA_LLM_BASE_URL` — OpenAI-compatible base URL for the classifier model.
- `BEA_LLM_API_KEY` — API key for that endpoint.
- `BEA_LLM_MODEL` — model id to use. Pick a fast/cheap model — form submitters wait on this call synchronously (bounded only by a 30-minute hang guard, not a tight timeout).

## Admin UI

`GET /admin` — server-rendered, zero-JS pages behind HTTP Basic auth (user `admin`): template previews, emails sent and received via Resend, and the spam filter's recent verdicts (in-memory, last 200, reset on deploy).

- `BEA_ADMIN_PASSWORD` — Basic auth password, min 12 chars. Unset → every `/admin` route returns 404.
- `BEA_RESEND_ADMIN_API_KEY` — optional full-access Resend key for the Sent/Received tabs. Without it the admin falls back to `BEA_RESEND_API_KEY`, and a sending-only key shows Resend's `restricted_api_key` error there. Received emails additionally need inbound receiving enabled on the domain.
