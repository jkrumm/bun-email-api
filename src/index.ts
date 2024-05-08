import { Elysia, t } from "elysia";
import { env } from "@yolk-oss/elysia-env";
import { bearer } from "@elysiajs/bearer";
import { render } from "@react-email/render";
import FppReceiverMail from "./emails/fpp/fpp-receiver-mail";
import FppSenderMail from "./emails/fpp/fpp-sender-mail";
import nodemailer from "nodemailer";
import Mail from "nodemailer/lib/mailer";
import { wrappedBulkSendMail, wrappedSendMail } from "./utils/send-mail";

const app = new Elysia()
  .use(bearer())
  .use(
    env({
      BEA_SECRET_KEY: t.String({
        minLength: 10,
        error: "BEA_SECRET_KEY is required for a service!",
      }),
      BEA_GMAIL_EMAIL: t.String({
        format: "email",
        error: "BEA_GMAIL_EMAIL is required for a service!",
      }),
      BEA_RECEIVER_EMAIL: t.String({
        format: "email",
        error: "BEA_RECEIVER_EMAIL is required for a service!",
      }),
      BEA_GMAIL_APP_PASSWORD: t.String({
        minLength: 1,
        error: "BEA_GMAIL_APP_PASSWORD is required for a service!",
      }),
    }),
  )
  .get("/", () => "Hello Elysia")
  .post(
    "/fpp",
    async ({ body, env, set }) => {
      const senderHtml = render(FppSenderMail(body));

      const senderMailOptions: Mail.Options = {
        from: `Free-Planning-Poker.com <${process.env.GMAIL_USER}>`,
        sender: `Free-Planning-Poker.com <${process.env.GMAIL_USER}>`,
        to: body.email,
        subject: "Free-Planning-Poker.com - Contact Form Submission",
        html: senderHtml,
      };

      const receiverHtml = render(FppReceiverMail(body));

      const receiverMailOptions: Mail.Options = {
        from: `Free-Planning-Poker.com <${body.email}>`,
        sender: `Free-Planning-Poker.com <${body.email}>`,
        replyTo: `Free-Planning-Poker.com <${body.email}>`,
        to: env.BEA_RECEIVER_EMAIL,
        subject: "Free-Planning-Poker.com - Contact Form Submission",
        html: receiverHtml,
      };

      await wrappedBulkSendMail([senderMailOptions, receiverMailOptions]).catch(
        (e) => {
          console.error(e);
          set.status = 500;
          return { message: "Error: Could not send emails" };
        },
      );

      console.log("Emails sent successfully");
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
