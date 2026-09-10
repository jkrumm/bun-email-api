import { Elysia, t } from "elysia";
import { env } from "@yolk-oss/elysia-env";
import { bearer } from "@elysiajs/bearer";
import FppReceiverMail from "./emails/fpp/fpp-receiver-mail";
import FppSenderMail from "./emails/fpp/fpp-sender-mail";
import { sendMail } from "./utils/send-mail";
import FppDailyAnalytics from "./emails/fpp/fpp-daily-analytics";
import SySerendipityRequestMail from "./emails/sy-serendipity/request-receiver-mail";

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
      BEA_SY_SERENDIPITY_RECEIVER_EMAIL: t.String({
        format: "email",
        error: "BEA_SY_SERENDIPITY_RECEIVER_EMAIL is required!",
      }),
      BEA_SY_SERENDIPITY_FROM_EMAIL: t.Optional(t.String()),
    }),
  )
  .get("/", () => "Hello Elysia")
  .get("/health", () => ({ ok: true }))
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

      console.log("FPP contact emails sent successfully", body);
      return { message: "FPP contact emails sent successfully" };
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
  .post(
    "/fpp-daily-analytics",
    async ({ body, env, set }) => {
      await sendMail({
        to: env.BEA_RECEIVER_EMAIL,
        subject: "Free-Planning-Poker.com - Daily Analytics",
        template: FppDailyAnalytics(body),
      });

      console.log("Daily analytic emails sent successfully", body);
      return { message: "Daily analytic emails sent successfully" };
    },
    {
      body: t.Object({
        votes: t.Number(),
        estimations: t.Number(),
        rooms: t.Number(),
        unique_users: t.Number(),
        page_views: t.Number(),
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
  .post(
    "/sy-serendipity",
    async ({ body, env, set }) => {
      const replyToName = [body.firstName, body.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();

      await sendMail({
        to: env.BEA_SY_SERENDIPITY_RECEIVER_EMAIL,
        from: env.BEA_SY_SERENDIPITY_FROM_EMAIL,
        replyTo: replyToName ? `${replyToName} <${body.email}>` : body.email,
        subject: "SY Serendipity I - Charter Request",
        template: SySerendipityRequestMail(body),
      });

      console.log("SY Serendipity request email sent successfully", body);
      return { message: "SY Serendipity request email sent successfully" };
    },
    {
      body: t.Object({
        firstName: t.Nullable(t.String({ maxLength: 200 })),
        lastName: t.Nullable(t.String({ maxLength: 200 })),
        email: t.String({ format: "email" }),
        numberOfPeople: t.Nullable(t.String({ maxLength: 200 })),
        destination: t.Nullable(t.String({ maxLength: 200 })),
        duration: t.Nullable(t.String({ maxLength: 200 })),
        arrivalDate: t.Nullable(t.String({ maxLength: 200 })),
        departureDate: t.Nullable(t.String({ maxLength: 200 })),
        phone: t.Nullable(t.String({ maxLength: 200 })),
        message: t.Nullable(t.String({ maxLength: 2000 })),
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
