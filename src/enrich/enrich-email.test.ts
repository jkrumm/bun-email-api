import { describe, expect, test } from "bun:test";
import { MockLanguageModelV4 } from "ai/test";
import { enrichEmail } from "./enrich-email";
import { openDatabase } from "../db/client";
import { createEmailsRepo } from "../db/emails";
import { reEnrichEmail } from "./re-enrich";

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

describe("Jev queueing on re-enrich", () => {
  const inbound = {
    id: "email_1",
    ...baseEmail,
    direction: "inbound" as const,
  };

  function seededEmails(direction: "inbound" | "outbound" = "inbound") {
    const emails = createEmailsRepo(openDatabase(":memory:"));
    emails.upsertEmail({
      id: "email_1",
      direction,
      fromAddress: baseEmail.fromAddress,
      toAddresses: baseEmail.toAddresses,
      subject: baseEmail.subject,
      createdAt: "2026-01-01T00:00:00.000Z",
      text: baseEmail.text,
    });
    return emails;
  }

  const llmOk = () =>
    Promise.resolve({
      ok: true as const,
      result: { ...validEnrichment, model: "m" },
    });

  test("re-queues an inbound email's Jev decision, clearing the previous one, and kicks the worker", async () => {
    const emails = seededEmails();
    emails.completeJev({
      ...emails.claimNextJev()!,
      result: {
        spamProbability: 0.96,
        category: "marketing",
        categoryConfidence: 0.9,
        latencyMs: 15,
        model: "jev-test",
      },
    });
    let kicks = 0;

    const result = await reEnrichEmail({
      emails,
      id: "email_1",
      enrich: llmOk,
      kickJev: () => kicks++,
    });

    expect(result.status).toBe("ok");
    expect(kicks).toBe(1);
    const { enrichment } = emails.getEmail("email_1")!;
    expect(enrichment.status).toBe("done");
    expect(enrichment.jev).toMatchObject({
      status: "pending",
      attempts: 0,
      category: null,
      model: null,
    });
  });

  test("an LLM failure leaves Jev queued: the two are independent", async () => {
    const emails = seededEmails();

    await reEnrichEmail({
      emails,
      id: "email_1",
      enrich: () =>
        enrichEmail({
          email: inbound,
          model: mockModelThrowing("connection refused"),
        }),
      kickJev: () => {},
    });

    const { enrichment } = emails.getEmail("email_1")!;
    expect(enrichment.status).toBe("failed");
    expect(enrichment.jev?.status).toBe("pending");
  });

  test("outbound mail is never queued for Jev", async () => {
    const emails = seededEmails("outbound");

    await reEnrichEmail({
      emails,
      id: "email_1",
      enrich: llmOk,
      kickJev: () => {},
    });

    expect(emails.getEmail("email_1")!.enrichment.jev).toBeNull();
    expect(emails.claimNextJev()).toBeNull();
  });
});

describe("enrichEmail robustness", () => {
  test("a malformed body yields an ok:false outcome instead of throwing", async () => {
    const outcome = await enrichEmail({
      email: { ...baseEmail, text: null, html: 5 as unknown as string },
      model: mockModelReturning(JSON.stringify(validEnrichment)),
    });
    expect(outcome.ok).toBe(false);
  });
});
