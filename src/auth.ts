import { timingSafeEqual } from "node:crypto";
import { bearer } from "@elysiajs/bearer";
import { Elysia } from "elysia";
import { env } from "./env";

function isValidBearer(token: string | undefined): boolean {
  if (!token) return false;

  const provided = Buffer.from(token);
  const expected = Buffer.from(env.BEA_SECRET_KEY);

  if (provided.length !== expected.length) return false;

  return timingSafeEqual(provided, expected);
}

/**
 * Registers the bearer plugin and rejects unauthenticated requests on the
 * given Elysia instance. Call before adding routes so the guard applies to
 * every route added afterwards on that instance.
 */
export function withBearerAuth(app: Elysia) {
  return app.use(bearer()).onBeforeHandle(({ bearer: token, set }) => {
    if (!isValidBearer(token)) {
      set.status = 400;
      set.headers["WWW-Authenticate"] =
        `Bearer realm='sign', error="invalid_request"`;
      return { message: "Unauthorized" };
    }
  });
}
