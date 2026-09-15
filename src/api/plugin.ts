import { Elysia, t } from "elysia";
import { timingSafeEqualStrings } from "../auth";
import { env } from "../env";
import { enrichEmail } from "../enrich/enrich-email";
import { emailsRepo, submissionsRepo } from "../db";
import { runSyncNow } from "../sync/resend-sync";
import type {
  EmailDirection,
  EmailsRepo,
  EnrichmentStatus,
} from "../db/emails";
import type {
  SubmissionsRepo,
  SubmissionSource,
  Verdict,
} from "../db/submissions";
import type { SyncSummary } from "../sync/resend-sync";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60_000;

function defaultSince(): string {
  return new Date(Date.now() - THIRTY_DAYS_MS).toISOString();
}

const emailsListQuery = t.Object({
  direction: t.Optional(t.UnionEnum(["inbound", "outbound"])),
  category: t.Optional(t.ArrayString()),
  source: t.Optional(t.String()),
  from: t.Optional(t.String()),
  to: t.Optional(t.String()),
  q: t.Optional(t.String()),
  since: t.Optional(t.String()),
  until: t.Optional(t.String()),
  action_required: t.Optional(t.BooleanString()),
  status: t.Optional(t.UnionEnum(["pending", "done", "failed"])),
  limit: t.Optional(t.Numeric()),
  cursor: t.Optional(t.String()),
});

const emailByIdQuery = t.Object({
  include: t.Optional(t.String()),
});

const statsQuery = t.Object({
  since: t.Optional(t.String()),
});

const submissionsListQuery = t.Object({
  verdict: t.Optional(t.UnionEnum(["legit", "spam", "marketing"])),
  source: t.Optional(t.UnionEnum(["fpp", "sy-serendipity"])),
  delivered: t.Optional(t.BooleanString()),
  limit: t.Optional(t.Numeric()),
  cursor: t.Optional(t.String()),
});

export function createApiRoutes({
  apiKey,
  emails,
  submissions,
  runSync,
}: {
  apiKey: string | undefined;
  emails: EmailsRepo;
  submissions: SubmissionsRepo;
  runSync: () => Promise<SyncSummary | { busy: true }>;
}) {
  const configured = apiKey !== undefined;

  return new Elysia({ prefix: "/api" })
    .onBeforeHandle(({ headers, set }) => {
      if (!configured) {
        set.status = 404;
        return { error: "not_found" };
      }

      const authorization = headers.authorization;
      const token = authorization?.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length)
        : undefined;

      if (!token || !timingSafeEqualStrings(token, apiKey)) {
        set.status = 401;
        set.headers["WWW-Authenticate"] =
          `Bearer realm='api', error="invalid_token"`;
        return { error: "unauthorized" };
      }
    })
    .get(
      "/emails",
      ({ query }) =>
        emails.listEmails({
          direction: query.direction as EmailDirection | undefined,
          category: query.category,
          source: query.source,
          from: query.from,
          to: query.to,
          q: query.q,
          since: query.since,
          until: query.until,
          actionRequired: query.action_required,
          status: query.status as EnrichmentStatus | undefined,
          limit: query.limit,
          cursor: query.cursor,
        }),
      { query: emailsListQuery },
    )
    .get(
      "/emails/:id",
      ({ params, query, set }) => {
        const email = emails.getEmail(params.id);
        if (!email) {
          set.status = 404;
          return { error: "not_found" };
        }

        if (query.include === "html") return email;

        const { html: _html, ...withoutHtml } = email;
        return withoutHtml;
      },
      { params: t.Object({ id: t.String() }), query: emailByIdQuery },
    )
    .post(
      "/emails/:id/enrich",
      async ({ params, set }) => {
        const existing = emails.getEmail(params.id);
        if (!existing) {
          set.status = 404;
          return { error: "not_found" };
        }

        emails.resetEnrichment(params.id);
        const outcome = await enrichEmail({ email: existing });

        if (outcome.ok) {
          emails.saveEnrichment(params.id, outcome.result);
        } else {
          emails.markEnrichmentFailed(params.id, outcome.error);
        }

        return emails.getEmail(params.id)!.enrichment;
      },
      { params: t.Object({ id: t.String() }) },
    )
    .get(
      "/stats",
      ({ query }) =>
        emails.emailStats({ since: query.since ?? defaultSince() }),
      { query: statsQuery },
    )
    .get(
      "/submissions",
      ({ query }) =>
        submissions.listSubmissions({
          verdict: query.verdict as Verdict | undefined,
          source: query.source as SubmissionSource | undefined,
          delivered: query.delivered,
          limit: query.limit,
          cursor: query.cursor,
        }),
      { query: submissionsListQuery },
    )
    .post("/sync", async ({ set }) => {
      const result = await runSync();
      if ("busy" in result) {
        set.status = 409;
        return { error: "sync_in_progress" };
      }
      return result;
    });
}

export const apiRoutes = createApiRoutes({
  apiKey: env.BEA_API_KEY,
  emails: emailsRepo,
  submissions: submissionsRepo,
  runSync: runSyncNow,
});
