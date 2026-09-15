import { describe, expect, test } from "bun:test";
import { MockLanguageModelV4 } from "ai/test";
import { enrichEmail } from "./enrich-email";
import { openDatabase } from "../db/client";
import { createEmailsRepo } from "../db/emails";

function mockUsage() {
  return {
    inputTokens: {
      total: undefined,
      noCache: undefined,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: { total: undefined, text: undefined, reasoning: undefined },
  };
}

function mockModelReturning(text: string) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text }],
      finishReason: { unified: "stop", raw: undefined },
      usage: mockUsage(),
      warnings: [],
    }),
  });
}

function mockModelThrowing(message: string) {
  return new MockLanguageModelV4({
    doGenerate: async () => {
      throw new Error(message);
    },
  });
}

const baseEmail = {
  direction: "outbound" as const,
  fromAddress: "guest@example.com",
  toAddresses: ["charter@example.com"],
  subject: "Charter request",
  text: "We'd like to charter for 4 guests in August.",
  html: null,
};

const validEnrichment = {
  category: "inquiry",
  priority: "high",
  actionRequired: true,
  summary: "Guest requests a charter for 4 people in August.",
  suggestedAction: "Reply with availability",
  language: "en",
  facts: [{ label: "guests", value: "4" }],
};

describe("enrichEmail", () => {
  test("returns the parsed enrichment on success", async () => {
    const model = mockModelReturning(JSON.stringify(validEnrichment));

    const outcome = await enrichEmail({ email: baseEmail, model });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.category).toBe("inquiry");
      expect(outcome.result.actionRequired).toBe(true);
      expect(outcome.result.model).toBe(model.modelId);
    }
  });

  test("persisting a successful outcome marks the enrichment done", async () => {
    const db = openDatabase(":memory:");
    const emails = createEmailsRepo(db);
    emails.upsertEmail({
      id: "email_1",
      direction: "outbound",
      fromAddress: baseEmail.fromAddress,
      toAddresses: baseEmail.toAddresses,
      subject: baseEmail.subject,
      createdAt: "2026-01-01T00:00:00.000Z",
      text: baseEmail.text,
    });

    const model = mockModelReturning(JSON.stringify(validEnrichment));
    const outcome = await enrichEmail({ email: baseEmail, model });
    if (outcome.ok) emails.saveEnrichment("email_1", outcome.result);

    const email = emails.getEmail("email_1");
    expect(email?.enrichment.status).toBe("done");
    expect(email?.enrichment.category).toBe("inquiry");
    expect(email?.enrichment.attempts).toBe(0);
  });

  test("a model failure marks the enrichment failed and increments attempts", async () => {
    const db = openDatabase(":memory:");
    const emails = createEmailsRepo(db);
    emails.upsertEmail({
      id: "email_1",
      direction: "outbound",
      fromAddress: baseEmail.fromAddress,
      toAddresses: baseEmail.toAddresses,
      subject: baseEmail.subject,
      createdAt: "2026-01-01T00:00:00.000Z",
      text: baseEmail.text,
    });

    const model = mockModelThrowing("connection refused");
    const outcome = await enrichEmail({ email: baseEmail, model });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) emails.markEnrichmentFailed("email_1", outcome.error);

    const email = emails.getEmail("email_1");
    expect(email?.enrichment.status).toBe("failed");
    expect(email?.enrichment.attempts).toBe(1);
    expect(email?.enrichment.error).toContain("connection refused");
  });

  test("returns a fail-open error when the LLM is not configured", async () => {
    const outcome = await enrichEmail({ email: baseEmail });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error).toBe("Enrichment not configured");
    }
  });
});
