# bun-email-api

TODOs:

- [x] setup Doppler secrets
- [x] create a new jkrumm.noreply@gmail.com email account for sending emails
- [x] send emails with gmail https://blog.logrocket.com/streamline-email-creation-react-email/
- [x] validate the incoming payload
- [x] protect the api with a token
- [ ] containerize the app https://bun.sh/guides/ecosystem/docker (don't forget to include all email templates)

Nice to have:

- [ ] provide a health check endpoint including gmail connection
- [ ] validate the email address https://rapidapi.com/Top-Rated/api/e-mail-check-invalid-or-disposable-domain
- [ ] add a simple rate limiter using the ip address and only allow 1 request every 30 seconds

## Local Development

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run start
```

This project was created using `bun init` in bun v1.0.7. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.

## Endpoints

- `POST /fpp` — bearer `BEA_SECRET_KEY`. Body: `{ name, email, subject, message }`. Sends a contact-form confirmation to the sender and forwards it to `BEA_RECEIVER_EMAIL`.
- `POST /fpp-daily-analytics` — bearer `BEA_SECRET_KEY`. Body: `{ votes, estimations, rooms, unique_users, page_views }`. Sends a daily analytics summary to `BEA_RECEIVER_EMAIL`.
- `POST /sy-serendipity` — bearer `BEA_SECRET_KEY`. Body: `{ firstName, lastName, email, numberOfPeople, destination, duration, arrivalDate, departureDate, phone, message }` (all fields except `email` are nullable). Sends a charter-request email to `BEA_SY_SERENDIPITY_RECEIVER_EMAIL`; uses `BEA_SY_SERENDIPITY_FROM_EMAIL` as the sender when set, otherwise falls back to the default `sendMail` sender.
