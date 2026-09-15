import { describe, expect, test } from "bun:test";
import { createAdminRoutes } from "./plugin";
import type { AdminResend } from "./types";
import { emailRegistry } from "../emails/registry";
import { submissionsRepo } from "../db";

const PASSWORD = "local-admin-pass-123";
const now = new Date().toISOString();

function basicAuth(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}

function baseFakeResend(): AdminResend {
  return {
    emails: {
      list: async () => ({
        data: { object: "list", has_more: false, data: [] },
        error: null,
        headers: null,
      }),
      get: async () => ({
        data: null,
        error: {
          message: "not implemented",
          statusCode: 500,
          name: "internal_server_error",
        },
        headers: null,
      }),
      receiving: {
        list: async () => ({
          data: { object: "list", has_more: false, data: [] },
          error: null,
        }),
        get: async () => ({
          data: null,
          error: {
            message: "not implemented",
            statusCode: 500,
            name: "internal_server_error",
          },
          headers: null,
        }),
      },
    },
  };
}

describe("admin plugin", () => {
  test("password unset -> /admin/templates is 404", async () => {
    const app = createAdminRoutes({
      password: undefined,
      resend: baseFakeResend(),
    });

    const response = await app.handle(
      new Request("http://localhost/admin/templates"),
    );

    expect(response.status).toBe(404);
  });

  test("password shorter than 12 chars -> /admin/templates is 404", async () => {
    const app = createAdminRoutes({
      password: "short",
      resend: baseFakeResend(),
    });

    const response = await app.handle(
      new Request("http://localhost/admin/templates"),
    );

    expect(response.status).toBe(404);
  });

  test("no auth header -> 401 with WWW-Authenticate", async () => {
    const app = createAdminRoutes({
      password: PASSWORD,
      resend: baseFakeResend(),
    });

    const response = await app.handle(
      new Request("http://localhost/admin/templates"),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Basic");
  });

  test("wrong password -> 401 with WWW-Authenticate", async () => {
    const app = createAdminRoutes({
      password: PASSWORD,
      resend: baseFakeResend(),
    });

    const response = await app.handle(
      new Request("http://localhost/admin/templates", {
        headers: { authorization: basicAuth("admin", "wrong-password") },
      }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Basic");
  });

  test("correct auth -> /admin/templates lists every registry name", async () => {
    const app = createAdminRoutes({
      password: PASSWORD,
      resend: baseFakeResend(),
    });

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
    const app = createAdminRoutes({
      password: PASSWORD,
      resend: baseFakeResend(),
    });

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

  test("/admin/sent renders a subject from list data", async () => {
    const fakeResend = baseFakeResend();
    fakeResend.emails.list = async () => ({
      data: {
        object: "list",
        has_more: false,
        data: [
          {
            id: "email_123",
            from: "no-reply@example.com",
            to: ["someone@example.com"],
            subject: "Hello from admin test",
            created_at: now,
            last_event: "delivered",
            bcc: null,
            cc: null,
            reply_to: null,
            scheduled_at: null,
            message_id: "msg_123",
          },
        ],
      },
      error: null,
      headers: null,
    });

    const app = createAdminRoutes({ password: PASSWORD, resend: fakeResend });

    const response = await app.handle(
      new Request("http://localhost/admin/sent", {
        headers: { authorization: basicAuth("admin", PASSWORD) },
      }),
    );

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Hello from admin test");
  });

  test("/admin/sent renders the Resend error message", async () => {
    const fakeResend = baseFakeResend();
    fakeResend.emails.list = async () => ({
      data: null,
      error: {
        message: "Rate limit exceeded",
        statusCode: 429,
        name: "rate_limit_exceeded",
      },
      headers: null,
    });

    const app = createAdminRoutes({ password: PASSWORD, resend: fakeResend });

    const response = await app.handle(
      new Request("http://localhost/admin/sent", {
        headers: { authorization: basicAuth("admin", PASSWORD) },
      }),
    );

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Rate limit exceeded");
  });

  test("/admin/filtered HTML-escapes submission values", async () => {
    submissionsRepo.recordSubmission({
      source: "fpp",
      verdict: "spam",
      confidence: 0.9,
      reason: "looks like spam",
      model: "test-model",
      delivered: false,
      submission: { message: "<script>alert(1)</script>" },
    });

    const app = createAdminRoutes({
      password: PASSWORD,
      resend: baseFakeResend(),
    });

    const response = await app.handle(
      new Request("http://localhost/admin/filtered", {
        headers: { authorization: basicAuth("admin", PASSWORD) },
      }),
    );

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  test("security headers are present on an admin response", async () => {
    const app = createAdminRoutes({
      password: PASSWORD,
      resend: baseFakeResend(),
    });

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
