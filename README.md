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
