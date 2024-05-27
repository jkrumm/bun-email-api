import { Elysia, t } from "elysia";
import { env } from "@yolk-oss/elysia-env";
import { bearer } from "@elysiajs/bearer";
import FppReceiverMail from "./emails/fpp/fpp-receiver-mail";
import FppSenderMail from "./emails/fpp/fpp-sender-mail";
import { sendMail } from "./utils/send-mail";

const app = new Elysia()
  .use(bearer())
  .use(
    env({
      BEA_SECRET_KEY: t.String({
        minLength: 10,
        error: "BEA_SECRET_KEY is required!",
      }),
      BEA_RECEIVER_EMAIL: t.String({
        format: "email",
        error: "BEA_RECEIVER_EMAIL is required!",
      }),
      BEA_RESEND_API_KEY: t.String({
        minLength: 1,
        error: "BEA_RESEND_API_KEY is required!",
      }),
    }),
  )
  .get("/", () => "Hello Elysia")
  .post(
    "/fpp",
    async ({ body, env, set }) => {
      await sendMail({
        to: body.email,
        subject: "Free-Planning-Poker.com - Contact Form Submission",
        template: FppSenderMail(body),
      }).catch(() => ({}));

      await sendMail({
        to: env.BEA_RECEIVER_EMAIL,
        replyTo: `${body.name} <${body.email}>`,
        subject: "Free-Planning-Poker.com - Contact Form Submission",
        template: FppReceiverMail(body),
      });

      console.log("Emails sent successfully", body);
      return { message: "Emails sent successfully" };
    },
    {
      body: t.Object({
        name: t.Nullable(t.String()),
        email: t.String({ format: "email" }),
        subject: t.Nullable(t.String()),
        message: t.Nullable(t.String()),
      }),
      beforeHandle({ env, bearer, set }) {
        if (bearer !== env.BEA_SECRET_KEY) {
          set.status = 400;
          set.headers["WWW-Authenticate"] =
            `Bearer realm='sign', error="invalid_request"`;
          return { message: "Unauthorized" };
        }
      },
    },
  )
  .listen(3010);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port} with NODE_ENV=${process.env.NODE_ENV} 🦊`,
);
