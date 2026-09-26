import { describe, expect, test } from "bun:test";
import { createApiRoutes } from "./plugin";
import { openDatabase } from "../db/client";
import { createEmailsRepo } from "../db/emails";
import { createImapStateRepo } from "../db/imap-state";
import { createSubmissionsRepo } from "../db/submissions";

const API_KEY = "local-api-key-1234567";

// A default parameter would also fire for an *explicit* `undefined`, which
// is exactly the case the "key unset" test needs to express — so this takes
// a plain positional argument instead of a defaulted options object.
function testApp(apiKey: string | undefined) {
  const db = openDatabase(":memory:");
  const emails = createEmailsRepo(db);
  const submissions = createSubmissionsRepo(db);

  const app = createApiRoutes({
    apiKey,
    emails,
    submissions,
    imapState: createImapStateRepo(db),
    runSync: async () => ({
      outbound: { new: 0, updated: 0 },
      inbound: { new: 0 },
      errors: [],
    }),
  });

  return { app, emails, submissions };
}

function testAppWithDb(apiKey: string | undefined) {
  const db = openDatabase(":memory:");
  const app = createApiRoutes({
    apiKey,
    emails: createEmailsRepo(db),
    submissions: createSubmissionsRepo(db),
    imapState: createImapStateRepo(db),
    runSync: async () => ({
      outbound: { new: 0, updated: 0 },
      inbound: { new: 0 },
      errors: [],
    }),
  });
  return { app, db };
}

function authHeaders(key = API_KEY) {
  return { authorization: `Bearer ${key}` };
}

describe("API auth", () => {
  test("BEA_API_KEY unset -> every /api route 404s", async () => {
    const { app } = testApp(undefined);

    const response = await app.handle(
      new Request("http://localhost/api/stats"),
    );

    expect(response.status).toBe(404);
  });

  test("wrong key -> 401", async () => {
    const { app } = testApp(API_KEY);

    const response = await app.handle(
      new Request("http://localhost/api/stats", {
        headers: authHeaders("wrong-key-0123456789"),
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  test("missing bearer -> 401", async () => {
    const { app } = testApp(API_KEY);

    const response = await app.handle(
      new Request("http://localhost/api/stats"),
    );

    expect(response.status).toBe(401);
  });
});

describe("GET /api/emails", () => {
  test("filters return the expected ids", async () => {
    const { app, emails } = testApp(API_KEY);
    emails.upsertEmail({
      id: "in_1",
      direction: "inbound",
      fromAddress: "guest@example.com",
      toAddresses: ["charter@example.com"],
      subject: "Charter request",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    emails.upsertEmail({
      id: "out_1",
      direction: "outbound",
      fromAddress: "no-reply@example.com",
      toAddresses: ["guest@example.com"],
      subject: "Confirmation",
      createdAt: "2026-01-02T00:00:00.000Z",
    });

    const response = await app.handle(
      new Request("http://localhost/api/emails?direction=inbound", {
        headers: authHeaders(),
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { id: string }[] };
    expect(body.data.map((e) => e.id)).toEqual(["in_1"]);
  });

  test("provider and mailbox filters narrow the list and are returned", async () => {
    const { app, emails } = testApp(API_KEY);
    const base = {
      direction: "inbound" as const,
      fromAddress: "guest@example.com",
      toAddresses: ["hello@example.com"],
      subject: "Hi",
    };
    emails.upsertEmail({
      ...base,
      id: "resend_1",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    emails.upsertEmail({
      ...base,
      id: "imap_inbox",
      provider: "imap",
      mailbox: "INBOX",
      messageId: "<a@x>",
      createdAt: "2026-01-02T00:00:00.000Z",
    });
    emails.upsertEmail({
      ...base,
      id: "imap_spam",
      provider: "imap",
      mailbox: "Spam",
      createdAt: "2026-01-03T00:00:00.000Z",
    });

    const get = async (query: string) => {
      const response = await app.handle(
        new Request(`http://localhost/api/emails?${query}`, {
          headers: authHeaders(),
        }),
      );
      expect(response.status).toBe(200);
      return (await response.json()) as {
        data: { id: string; provider: string; mailbox: string | null }[];
      };
    };

    expect((await get("provider=resend")).data.map((e) => e.id)).toEqual([
      "resend_1",
    ]);
    const imap = await get("provider=imap");
    expect(imap.data.map((e) => e.id)).toEqual(["imap_spam", "imap_inbox"]);
    expect(imap.data[1]).toMatchObject({ provider: "imap", mailbox: "INBOX" });
    expect(
      (await get("provider=imap&mailbox=Spam")).data.map((e) => e.id),
    ).toEqual(["imap_spam"]);

    const invalid = await app.handle(
      new Request("http://localhost/api/emails?provider=smtp", {
        headers: authHeaders(),
      }),
    );
    expect(invalid.status).toBe(422);
  });

  test("no filters returns every direction and enrichment status", async () => {
    const { app, emails } = testApp(API_KEY);
    emails.upsertEmail({
      id: "in_1",
      direction: "inbound",
      fromAddress: "guest@example.com",
      toAddresses: ["charter@example.com"],
      subject: "Charter request",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    emails.upsertEmail({
      id: "out_1",
      direction: "outbound",
      fromAddress: "no-reply@example.com",
      toAddresses: ["guest@example.com"],
      subject: "Confirmation",
      createdAt: "2026-01-02T00:00:00.000Z",
    });
    emails.saveEnrichment("out_1", {
      category: "notification",
      priority: "low",
      actionRequired: false,
      summary: "Confirmation.",
      suggestedAction: null,
      language: "en",
      facts: [],
      model: "test",
    });

    const response = await app.handle(
      new Request("http://localhost/api/emails", { headers: authHeaders() }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { id: string }[] };
    expect(body.data.map((e) => e.id)).toEqual(["out_1", "in_1"]);
  });

  test("category accepts a comma-separated list", async () => {
    const { app } = testApp(API_KEY);

    const response = await app.handle(
      new Request("http://localhost/api/emails?category=spam,inquiry", {
        headers: authHeaders(),
      }),
    );

    expect(response.status).toBe(200);
  });
});

describe("GET /api/emails/:id", () => {
  test("404 for an unknown id", async () => {
    const { app } = testApp(API_KEY);

    const response = await app.handle(
      new Request("http://localhost/api/emails/missing", {
        headers: authHeaders(),
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });

  test("excludes html by default and includes it with ?include=html", async () => {
    const { app, emails } = testApp(API_KEY);
    emails.upsertEmail({
      id: "email_1",
      direction: "outbound",
      fromAddress: "no-reply@example.com",
      toAddresses: ["guest@example.com"],
      subject: "Confirmation",
      createdAt: "2026-01-01T00:00:00.000Z",
      html: "<p>hi</p>",
      text: "hi",
    });

    const withoutHtml = await app.handle(
      new Request("http://localhost/api/emails/email_1", {
        headers: authHeaders(),
      }),
    );
    const withoutHtmlBody = (await withoutHtml.json()) as Record<
      string,
      unknown
    >;
    expect(withoutHtmlBody.html).toBeUndefined();
    expect(withoutHtmlBody.text).toBe("hi");

    const withHtml = await app.handle(
      new Request("http://localhost/api/emails/email_1?include=html", {
        headers: authHeaders(),
      }),
    );
    const withHtmlBody = (await withHtml.json()) as Record<string, unknown>;
    expect(withHtmlBody.html).toBe("<p>hi</p>");
  });
});

describe("POST /api/emails/:id/enrich", () => {
  test("409 when another worker holds the claim", async () => {
    const { app, emails } = testApp(API_KEY);
    emails.upsertEmail({
      id: "email_1",
      direction: "outbound",
      fromAddress: "no-reply@example.com",
      toAddresses: ["guest@example.com"],
      subject: "Confirmation",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(emails.claimEnrichment("email_1")).toBe(true);

    const response = await app.handle(
      new Request("http://localhost/api/emails/email_1/enrich", {
        method: "POST",
        headers: authHeaders(),
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "enrichment_in_progress",
    });
  });
});

describe("Jev shadow fields", () => {
  const jev = {
    verdict: "marketing" as const,
    confidence: 0.9,
    probabilities: { legit: 0.05, spam: 0.05, marketing: 0.9 },
    latencyMs: 800,
    model: "jev-test",
    error: null,
  };

  test("GET /api/submissions and /api/stats expose Jev verdicts, agreement and latencies", async () => {
    const { app, submissions } = testApp(API_KEY);
    const base = {
      source: "fpp" as const,
      confidence: 0.9,
      reason: "r",
      model: "m",
      delivered: true,
      submission: {},
    };
    submissions.recordSubmission({
      ...base,
      verdict: "marketing",
      llmLatencyMs: 2000,
      jev,
    });
    submissions.recordSubmission({
      ...base,
      verdict: "legit",
      llmLatencyMs: 4000,
      jev,
    });
    submissions.recordSubmission({ ...base, verdict: "legit" });

    const list = (await (
      await app.handle(
        new Request("http://localhost/api/submissions", {
          headers: authHeaders(),
        }),
      )
    ).json()) as {
      data: {
        jev: { verdict: string; latencyMs: number } | null;
        llmLatencyMs: number | null;
      }[];
    };
    const withJev = list.data.filter((row) => row.jev);
    expect(withJev).toHaveLength(2);
    expect(withJev[0]!.jev).toMatchObject({
      verdict: "marketing",
      latencyMs: 800,
    });
    expect(withJev[0]!.llmLatencyMs).not.toBeNull();

    const stats = (await (
      await app.handle(
        new Request("http://localhost/api/stats", { headers: authHeaders() }),
      )
    ).json()) as { jevComparison: unknown };
    expect(stats.jevComparison).toEqual({
      compared: 2,
      agreed: 1,
      agreementRate: 0.5,
      llmMedianLatencyMs: 3000,
      jevMedianLatencyMs: 800,
    });
  });

  test("GET /api/emails/:id exposes Jev's spam probability and category", async () => {
    const { app, emails } = testApp(API_KEY);
    emails.upsertEmail({
      id: "in_1",
      direction: "inbound",
      fromAddress: "x@example.com",
      toAddresses: ["me@example.com"],
      subject: "Hi",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    emails.saveJevEnrichment("in_1", {
      spamProbability: 0.96,
      category: "marketing",
      categoryConfidence: 0.9,
      latencyMs: 700,
      model: "jev-test",
      error: null,
    });

    const body = (await (
      await app.handle(
        new Request("http://localhost/api/emails/in_1", {
          headers: authHeaders(),
        }),
      )
    ).json()) as { enrichment: { jev: unknown } };

    expect(body.enrichment.jev).toEqual({
      spamProbability: 0.96,
      category: "marketing",
      categoryConfidence: 0.9,
      latencyMs: 700,
      model: "jev-test",
      error: null,
    });
  });
});

describe("GET /api/stats IMAP health", () => {
  test("exposes per-mailbox ingest health", async () => {
    const { app, db } = testAppWithDb(API_KEY);
    createImapStateRepo(db).recordError("INBOX", "connect: ECONNREFUSED");

    const response = await app.handle(
      new Request("http://localhost/api/stats", { headers: authHeaders() }),
    );

    const body = (await response.json()) as {
      imap: { mailbox: string; lastError: string | null }[];
    };
    expect(body.imap).toMatchObject([
      { mailbox: "INBOX", lastError: "connect: ECONNREFUSED" },
    ]);
  });
});
