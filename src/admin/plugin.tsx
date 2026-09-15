import { timingSafeEqual } from "node:crypto";
import { Elysia, redirect } from "elysia";
import { env } from "../env";
import { resend } from "../utils/resend";
import { emailRegistry } from "../emails/registry";
import type { AdminResend } from "./types";
import { rawHtmlResponse, renderPage, textResponse } from "./render";
import { SentDetailPage, SentListPage } from "./pages/sent";
import { ReceivedDetailPage, ReceivedListPage } from "./pages/received";
import { FilteredPage } from "./pages/filtered";
import {
  TemplateDetailPage,
  TemplateNotFoundPage,
  TemplatesListPage,
  renderTemplateHtml,
} from "./pages/templates";

const MIN_PASSWORD_LENGTH = 12;

function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  if (bufA.length !== bufB.length) return false;

  return timingSafeEqual(bufA, bufB);
}

function isValidBasicAuth(
  authorization: string | undefined,
  password: string,
): boolean {
  if (!authorization?.startsWith("Basic ")) return false;

  let decoded: string;
  try {
    decoded = Buffer.from(authorization.slice(6), "base64").toString("utf-8");
  } catch {
    return false;
  }

  const separator = decoded.indexOf(":");
  if (separator === -1) return false;

  const user = decoded.slice(0, separator);
  const pass = decoded.slice(separator + 1);

  return (
    timingSafeEqualStrings(user, "admin") &&
    timingSafeEqualStrings(pass, password)
  );
}

export function createAdminRoutes({
  password,
  resend: resendClient,
}: {
  password: string | undefined;
  resend: AdminResend;
}) {
  const passwordValid =
    password !== undefined && password.length >= MIN_PASSWORD_LENGTH;

  if (!passwordValid) {
    console.log(
      "[admin] BEA_ADMIN_PASSWORD unset or shorter than 12 chars — /admin routes disabled",
    );
  }

  return new Elysia({ prefix: "/admin" })
    .onBeforeHandle(({ headers }) => {
      if (!passwordValid) {
        return textResponse("Not Found", 404);
      }

      if (!isValidBasicAuth(headers.authorization, password)) {
        return textResponse("Unauthorized", 401, {
          "www-authenticate": `Basic realm="bun-email-api admin", charset="UTF-8"`,
        });
      }
    })
    .get("/", () => redirect("/admin/sent", 302))
    .get("/sent", async ({ query }) => {
      const result = await resendClient.emails.list({
        limit: 50,
        after: query.after,
      });
      return renderPage(<SentListPage result={result} />);
    })
    .get("/sent/:id", async ({ params }) => {
      const result = await resendClient.emails.get(params.id);
      return renderPage(<SentDetailPage result={result} />);
    })
    .get("/received", async ({ query }) => {
      const result = await resendClient.emails.receiving.list({
        limit: 50,
        after: query.after,
      });
      return renderPage(<ReceivedListPage result={result} />);
    })
    .get("/received/:id", async ({ params }) => {
      const result = await resendClient.emails.receiving.get(params.id);
      return renderPage(<ReceivedDetailPage result={result} />);
    })
    .get("/filtered", () => renderPage(<FilteredPage />))
    .get("/templates", () => renderPage(<TemplatesListPage />))
    .get("/templates/:id", async ({ params }) => {
      const entry = emailRegistry.find(
        (candidate) => candidate.id === params.id,
      );

      if (!entry) {
        return renderPage(<TemplateNotFoundPage id={params.id} />, {
          status: 404,
        });
      }

      const html = await renderTemplateHtml(entry);
      return renderPage(<TemplateDetailPage entry={entry} html={html} />);
    })
    .get("/templates/:id/raw", async ({ params }) => {
      const entry = emailRegistry.find(
        (candidate) => candidate.id === params.id,
      );

      if (!entry) {
        return textResponse("Not Found", 404);
      }

      const html = await renderTemplateHtml(entry);
      return rawHtmlResponse(html);
    });
}

export const adminRoutes = createAdminRoutes({
  password: env.BEA_ADMIN_PASSWORD,
  resend,
});
