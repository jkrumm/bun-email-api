# bun-email-api

TODOs: 
- [ ] setup Doppler secrets
- [ ] create a new jkrumm-noreply@gmail.com email account for sending emails
- [ ] send emails with gmail https://blog.logrocket.com/streamline-email-creation-react-email/
- [ ] validate the incoming payload
- [ ] protect the api with a token
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
