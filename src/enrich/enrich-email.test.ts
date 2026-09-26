import { describe, expect, test } from "bun:test";
import { MockLanguageModelV4 } from "ai/test";
import { enrichEmail } from "./enrich-email";
import { openDatabase } from "../db/client";
import { createEmailsRepo, type JevEnrichment } from "../db/emails";
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

describe("Jev shadow enrichment", () => {
  const inbound = {
    id: "email_1",
    ...baseEmail,
    direction: "inbound" as const,
  };
  const jevResult: JevEnrichment = {
    spamProbability: 0.96,
    category: "marketing",
    categoryConfidence: 0.9,
    latencyMs: 15,
    model: "jev-test",
    error: null,
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

  test("stores Jev's decisions next to the untouched LLM fields", async () => {
    const emails = seededEmails();
    await reEnrichEmail({
      emails,
      id: "email_1",
      enrich: llmOk,
      judgeJev: () => Promise.resolve(jevResult),
    });
    await Bun.sleep(5);

    const { enrichment } = emails.getEmail("email_1")!;
    expect(enrichment.status).toBe("done");
    expect(enrichment.category).toBe("inquiry");
    expect(enrichment.jev).toEqual(jevResult);
  });

  test("a never-resolving Jev does not hold back the LLM result", async () => {
    const emails = seededEmails();
    const result = await reEnrichEmail({
      emails,
      id: "email_1",
      enrich: llmOk,
      judgeJev: () => new Promise<JevEnrichment>(() => {}),
    });

    expect(result.status).toBe("ok");
    const { enrichment } = emails.getEmail("email_1")!;
    expect(enrichment.status).toBe("done");
    expect(enrichment.jev).toBeNull();
  });

  test("a Jev error result does not fail the LLM enrichment", async () => {
    const emails = seededEmails();
    await reEnrichEmail({
      emails,
      id: "email_1",
      enrich: llmOk,
      judgeJev: () =>
        Promise.resolve({
          ...jevResult,
          spamProbability: null,
          category: null,
          categoryConfidence: null,
          error: "Jev request failed: 529",
        }),
    });
    await Bun.sleep(5);

    const { enrichment } = emails.getEmail("email_1")!;
    expect(enrichment.status).toBe("done");
    expect(enrichment.jev?.error).toBe("Jev request failed: 529");
  });

  test("a rejecting Jev judge or a failing Jev write never fails the run", async () => {
    const emails = seededEmails();
    emails.saveJevEnrichment = () => {
      throw new Error("db locked");
    };

    const result = await reEnrichEmail({
      emails,
      id: "email_1",
      enrich: llmOk,
      judgeJev: () => Promise.resolve(jevResult),
    });
    await Bun.sleep(5);

    expect(result.status).toBe("ok");
    expect(emails.getEmail("email_1")!.enrichment.status).toBe("done");

    const emails2 = seededEmails();
    const result2 = await reEnrichEmail({
      emails: emails2,
      id: "email_1",
      enrich: llmOk,
      judgeJev: () => Promise.reject(new Error("boom")),
    });
    expect(result2.status).toBe("ok");
  });

  test("an LLM failure still keeps Jev's decisions", async () => {
    const emails = seededEmails();
    await reEnrichEmail({
      emails,
      id: "email_1",
      enrich: () =>
        enrichEmail({
          email: inbound,
          model: mockModelThrowing("connection refused"),
        }),
      judgeJev: () => Promise.resolve(jevResult),
    });
    await Bun.sleep(5);

    const { enrichment } = emails.getEmail("email_1")!;
    expect(enrichment.status).toBe("failed");
    expect(enrichment.jev?.category).toBe("marketing");
  });

  test("never invokes Jev for outbound mail", async () => {
    const emails = seededEmails("outbound");
    let calls = 0;
    await reEnrichEmail({
      emails,
      id: "email_1",
      enrich: llmOk,
      judgeJev: () => {
        calls++;
        return Promise.resolve(jevResult);
      },
    });

    expect(calls).toBe(0);
    expect(emails.getEmail("email_1")!.enrichment.jev).toBeNull();
  });

  test("Jev disabled leaves the enrichment's jev view null", async () => {
    const emails = seededEmails();
    await reEnrichEmail({
      emails,
      id: "email_1",
      enrich: llmOk,
      judgeJev: () => null,
    });

    expect(emails.getEmail("email_1")!.enrichment.jev).toBeNull();
  });

  test("a re-run clears the previous Jev columns", async () => {
    const emails = seededEmails();
    emails.saveJevEnrichment("email_1", jevResult);

    await reEnrichEmail({
      emails,
      id: "email_1",
      enrich: llmOk,
      judgeJev: () => null,
    });

    expect(emails.getEmail("email_1")!.enrichment.jev).toBeNull();
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
