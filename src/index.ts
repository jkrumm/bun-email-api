import { Elysia, t } from "elysia";
import { env } from "@yolk-oss/elysia-env";
import { helmet } from "elysia-helmet";
import { bearer } from "@elysiajs/bearer";

const app = new Elysia()
  .use(bearer())
  .use(helmet())
  .use(
    env({
      BEA_SECRET_KEY: t.String({
        minLength: 10,
        error: "BEA_SECRET_KEY is required for a service!",
      }),
      BEA_GMAIL_APP_NAME: t.String({
        minLength: 1,
        error: "BEA_GMAIL_APP_NAME is required for a service!",
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
    ({ bearer }) => {
      return bearer;
    },
    {
      beforeHandle({ bearer, set }) {
        if (!bearer) {
          set.status = 400;
          set.headers["WWW-Authenticate"] =
            `Bearer realm='sign', error="invalid_request"`;

          return "Unauthorized";
        }
      },
    },
  )
  .listen(3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
);
