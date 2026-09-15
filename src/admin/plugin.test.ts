import { describe, expect, test } from "bun:test";
import { createAdminRoutes } from "./plugin";
import { openDatabase } from "../db/client";
import { createEmailsRepo } from "../db/emails";
import { createSubmissionsRepo } from "../db/submissions";
import { emailRegistry } from "../emails/registry";
import type { EnrichEmailOutcome } from "../enrich/enrich-email";

const PASSWORD = "local-admin-pass-123";
const FIXED_NOW = new Date("2026-09-15T08:30:00.000Z");

function basicAuth(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}

function sameOriginHeaders(extra: Record<string, string> = {}) {
  return {
    authorization: basicAuth("admin", PASSWORD),
    "sec-fetch-site": "same-origin",
    ...extra,
  };
}

function testApp(overrides: { password?: string | undefined } = {}) {
  const db = openDatabase(":memory:");
  const emails = createEmailsRepo(db);
  const submissions = createSubmissionsRepo(db);

  let enrichOutcome: EnrichEmailOutcome = {
    ok: true,
    result: {
      category: "inquiry",
      priority: "normal",
      actionRequired: false,
      summary: "Re-enriched summary",
      suggestedAction: null,
      language: "en",
      facts: [],
      model: "test-model",
    },
  };

  const app = createAdminRoutes({
    password: "password" in overrides ? overrides.password : PASSWORD,
    emails,
    submissions,
    runSync: async () => ({
      outbound: { new: 1, updated: 0 },
      inbound: { new: 2, updated: 0 },
      errors: [],
    }),
    enrich: async () => enrichOutcome,
    now: () => FIXED_NOW,
  });

  return {
    app,
    emails,
    submissions,
    setEnrichOutcome: (outcome: EnrichEmailOutcome) => {
      enrichOutcome = outcome;
    },
  };
}

describe("admin plugin auth", () => {
  test("password unset -> /admin is 404", async () => {
    const { app } = testApp({ password: undefined });

    const response = await app.handle(new Request("http://localhost/admin"));

    expect(response.status).toBe(404);
  });

  test("password shorter than 12 chars -> /admin is 404", async () => {
    const { app } = testApp({ password: "short" });

    const response = await app.handle(new Request("http://localhost/admin"));

    expect(response.status).toBe(404);
  });

  test("no auth header -> 401 with WWW-Authenticate", async () => {
    const { app } = testApp();

    const response = await app.handle(new Request("http://localhost/admin"));

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Basic");
  });

  test("wrong password -> 401", async () => {
    const { app } = testApp();

    const response = await app.handle(
      new Request("http://localhost/admin", {
        headers: { authorization: basicAuth("admin", "wrong-password") },
      }),
    );

    expect(response.status).toBe(401);
  });
});

describe("admin overview", () => {
  test("renders stat numbers", async () => {
    const { app, emails } = testApp();
    emails.upsertEmail({
      id: "in_1",
      direction: "inbound",
      fromAddress: "guest@example.com",
      toAddresses: ["charter@example.com"],
      subject: "Charter enquiry",
      createdAt: FIXED_NOW.toISOString(),
    });

    const response = await app.handle(
      new Request("http://localhost/admin", {
        headers: { authorization: basicAuth("admin", PASSWORD) },
      }),
    );

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Received · 30d");
    expect(html).toContain(">1<");
  });
});

describe("admin emails list", () => {
  test("filters pass through to the repo and render matches", async () => {
    const { app, emails } = testApp();
    emails.upsertEmail({
      id: "in_yacht",
      direction: "inbound",
      fromAddress: "guest@example.com",
      toAddresses: ["charter@example.com"],
      subject: "Yacht charter request",
      createdAt: FIXED_NOW.toISOString(),
    });
    emails.upsertEmail({
      id: "out_confirm",
      direction: "outbound",
      fromAddress: "no-reply@example.com",
      toAddresses: ["guest@example.com"],
      subject: "Thanks for reaching out",
      createdAt: FIXED_NOW.toISOString(),
    });

    const response = await app.handle(
      new Request("http://localhost/admin/emails?direction=inbound&q=yacht", {
        headers: { authorization: basicAuth("admin", PASSWORD) },
      }),
    );

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Yacht charter request");
    expect(html).not.toContain("Thanks for reaching out");
  });

  test("renders German list dates", async () => {
    const { app, emails } = testApp();
    emails.upsertEmail({
      id: "in_1",
      direction: "inbound",
      fromAddress: "guest@example.com",
      toAddresses: ["charter@example.com"],
      subject: "Charter enquiry",
      createdAt: FIXED_NOW.toISOString(),
    });

    const response = await app.handle(
      new Request("http://localhost/admin/emails", {
        headers: { authorization: basicAuth("admin", PASSWORD) },
      }),
    );

    const html = await response.text();
    expect(html).toContain("Heute, ");
  });
});

describe("admin email detail", () => {
  test("404 for unknown id", async () => {
    const { app } = testApp();

    const response = await app.handle(
      new Request("http://localhost/admin/emails/does-not-exist", {
        headers: { authorization: basicAuth("admin", PASSWORD) },
      }),
    );

    expect(response.status).toBe(404);
  });

  test("renders summary/facts and a sandboxed iframe", async () => {
    const { app, emails } = testApp();
    emails.upsertEmail({
      id: "in_1",
      direction: "inbound",
      fromAddress: "guest@example.com",
      toAddresses: ["charter@example.com"],
      subject: "Charter enquiry",
      createdAt: FIXED_NOW.toISOString(),
      html: "<p>Hello</p>",
    });
    emails.saveEnrichment("in_1", {
      category: "inquiry",
      priority: "high",
      actionRequired: true,
      summary: "Guest wants a week in August.",
      suggestedAction: "Reply with availability",
      language: "en",
      facts: [{ label: "Guests", value: "6" }],
      model: "test-model",
    });

    const response = await app.handle(
      new Request("http://localhost/admin/emails/in_1", {
        headers: { authorization: basicAuth("admin", PASSWORD) },
      }),
    );

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Guest wants a week in August.");
    expect(html).toContain("Guests");
    expect(html).toContain("<iframe");
    expect(html).toContain("sandbox");
  });
});

describe("admin submissions", () => {
  test("HTML-escapes submission values", async () => {
    const { app, submissions } = testApp();
    submissions.recordSubmission({
      source: "fpp",
      verdict: "spam",
      confidence: 0.9,
      reason: "looks like spam",
      model: "test-model",
      delivered: false,
      submission: { message: "<script>alert(1)</script>" },
    });

    const response = await app.handle(
      new Request("http://localhost/admin/submissions", {
        headers: { authorization: basicAuth("admin", PASSWORD) },
      }),
    );

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
  });
});

describe("admin redirects", () => {
  test("/admin/sent -> /admin/emails?direction=outbound", async () => {
    const { app } = testApp();

    const response = await app.handle(
      new Request("http://localhost/admin/sent", {
        headers: { authorization: basicAuth("admin", PASSWORD) },
        redirect: "manual",
      }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/admin/emails?direction=outbound",
    );
  });

  test("/admin/received -> /admin/emails?direction=inbound", async () => {
    const { app } = testApp();

    const response = await app.handle(
      new Request("http://localhost/admin/received", {
        headers: { authorization: basicAuth("admin", PASSWORD) },
        redirect: "manual",
      }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/admin/emails?direction=inbound",
    );
  });

  test("/admin/filtered -> /admin/submissions", async () => {
    const { app } = testApp();

    const response = await app.handle(
      new Request("http://localhost/admin/filtered", {
        headers: { authorization: basicAuth("admin", PASSWORD) },
        redirect: "manual",
      }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/admin/submissions");
  });
});

describe("admin templates", () => {
  test("lists every registry name", async () => {
    const { app } = testApp();

    const response = await app.handle(
      new Request("http://localhost/admin/templates", {
        headers: { authorization: basicAuth("admin", PASSWORD) },
      }),
    );

    expect(response.status).toBe(200);
    const html = await response.text();
    for (const entry of emailRegistry) {
      expect(html).toContain(entry.name);
    }
  });

  test("/admin/templates/fpp-sender renders a sandboxed iframe", async () => {
    const { app } = testApp();

    const response = await app.handle(
      new Request("http://localhost/admin/templates/fpp-sender", {
        headers: { authorization: basicAuth("admin", PASSWORD) },
      }),
    );

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("<iframe");
    expect(html).toContain("sandbox");
  });
});

describe("admin CSRF", () => {
  test("POST without same-origin signal -> 403", async () => {
    const { app } = testApp();

    const response = await app.handle(
      new Request("http://localhost/admin/sync", {
        method: "POST",
        headers: { authorization: basicAuth("admin", PASSWORD) },
      }),
    );

    expect(response.status).toBe(403);
  });

  test("POST with Sec-Fetch-Site: same-origin -> 303", async () => {
    const { app } = testApp();

    const response = await app.handle(
      new Request("http://localhost/admin/sync", {
        method: "POST",
        headers: sameOriginHeaders(),
        redirect: "manual",
      }),
    );

    expect(response.status).toBe(303);
  });
});

describe("admin assets", () => {
  test("app.css contains tokens and a dark-mode media query", async () => {
    const { app } = testApp();

    const response = await app.handle(
      new Request("http://localhost/admin/assets/app.css", {
        headers: { authorization: basicAuth("admin", PASSWORD) },
      }),
    );

    expect(response.status).toBe(200);
    const css = await response.text();
    expect(css).toContain("--vx-surface-bg");
    expect(css).toContain("prefers-color-scheme: dark");
  });
});

describe("security headers", () => {
  test("are present on an admin page response", async () => {
    const { app } = testApp();

    const response = await app.handle(
      new Request("http://localhost/admin/templates", {
        headers: { authorization: basicAuth("admin", PASSWORD) },
      }),
    );

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-security-policy")).toContain(
      "default-src 'none'",
    );
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
  });
});
