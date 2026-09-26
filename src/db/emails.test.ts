import { describe, expect, test } from "bun:test";
import { openDatabase } from "./client";
import { createEmailsRepo, type UpsertEmailInput } from "./emails";

function repo() {
  return createEmailsRepo(openDatabase(":memory:"));
}

function baseEmail(
  overrides: Partial<UpsertEmailInput> = {},
): UpsertEmailInput {
  return {
    id: "email_1",
    direction: "outbound",
    fromAddress: "no-reply@free-planning-poker.com",
    toAddresses: ["guest@example.com"],
    subject: "Hello",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("upsertEmail + getEmail", () => {
  test("round trips every field", () => {
    const emails = repo();
    emails.upsertEmail(
      baseEmail({
        html: "<p>hi</p>",
        text: "hi",
        cc: ["cc@example.com"],
        source: "fpp-sender",
      }),
    );

    const email = emails.getEmail("email_1");

    expect(email?.subject).toBe("Hello");
    expect(email?.html).toBe("<p>hi</p>");
    expect(email?.text).toBe("hi");
    expect(email?.cc).toEqual(["cc@example.com"]);
    expect(email?.source).toBe("fpp-sender");
    expect(email?.toAddresses).toEqual(["guest@example.com"]);
    expect(email?.enrichment.status).toBe("pending");
  });

  test("getEmail returns null for an unknown id", () => {
    expect(repo().getEmail("missing")).toBeNull();
  });

  test("a cheap update (no html/text) preserves the previously stored content", () => {
    const emails = repo();
    emails.upsertEmail(baseEmail({ html: "<p>hi</p>", text: "hi" }));
    emails.upsertEmail(baseEmail({ lastEvent: "delivered" }));

    const email = emails.getEmail("email_1");
    expect(email?.html).toBe("<p>hi</p>");
    expect(email?.lastEvent).toBe("delivered");
  });

  test("upserting an existing id does not create a second enrichment row", () => {
    const emails = repo();
    emails.upsertEmail(baseEmail());
    emails.saveEnrichment("email_1", {
      category: "notification",
      priority: "low",
      actionRequired: false,
      summary: "test",
      suggestedAction: null,
      language: "en",
      facts: [],
      model: "test-model",
    });
    emails.upsertEmail(baseEmail({ lastEvent: "sent" }));

    expect(emails.getEmail("email_1")?.enrichment.status).toBe("done");
  });
});

describe("listEmails filters", () => {
  test("direction", () => {
    const emails = repo();
    emails.upsertEmail(baseEmail({ id: "out_1", direction: "outbound" }));
    emails.upsertEmail(baseEmail({ id: "in_1", direction: "inbound" }));

    const { data } = emails.listEmails({ direction: "inbound" });
    expect(data.map((e) => e.id)).toEqual(["in_1"]);
  });

  test("category (via enrichment)", () => {
    const emails = repo();
    emails.upsertEmail(baseEmail({ id: "e1" }));
    emails.upsertEmail(
      baseEmail({ id: "e2", createdAt: "2026-01-02T00:00:00.000Z" }),
    );
    emails.saveEnrichment("e1", {
      category: "inquiry",
      priority: "high",
      actionRequired: true,
      summary: "s",
      suggestedAction: null,
      language: "en",
      facts: [],
      model: "m",
    });

    const { data } = emails.listEmails({ category: ["inquiry"] });
    expect(data.map((e) => e.id)).toEqual(["e1"]);
  });

  test("from substring, case-insensitive", () => {
    const emails = repo();
    emails.upsertEmail(
      baseEmail({ id: "e1", fromAddress: "Guest@Example.com" }),
    );
    emails.upsertEmail(baseEmail({ id: "e2", fromAddress: "other@x.com" }));

    const { data } = emails.listEmails({ from: "guest@example" });
    expect(data.map((e) => e.id)).toEqual(["e1"]);
  });

  test("q (FTS) matches subject and does not throw on hostile input", () => {
    const emails = repo();
    emails.upsertEmail(
      baseEmail({ id: "e1", subject: "Charter request for Croatia" }),
    );
    emails.upsertEmail(baseEmail({ id: "e2", subject: "Unrelated subject" }));

    const matched = emails.listEmails({ q: "Croatia" });
    expect(matched.data.map((e) => e.id)).toEqual(["e1"]);

    expect(() => emails.listEmails({ q: '"foo" OR (' })).not.toThrow();
    expect(emails.listEmails({ q: '"foo" OR (' }).data).toEqual([]);
  });

  test("since / until", () => {
    const emails = repo();
    emails.upsertEmail(
      baseEmail({ id: "e1", createdAt: "2026-01-01T00:00:00.000Z" }),
    );
    emails.upsertEmail(
      baseEmail({ id: "e2", createdAt: "2026-01-10T00:00:00.000Z" }),
    );
    emails.upsertEmail(
      baseEmail({ id: "e3", createdAt: "2026-01-20T00:00:00.000Z" }),
    );

    const { data } = emails.listEmails({
      since: "2026-01-05T00:00:00.000Z",
      until: "2026-01-15T00:00:00.000Z",
    });
    expect(data.map((e) => e.id)).toEqual(["e2"]);
  });

  test("actionRequired", () => {
    const emails = repo();
    emails.upsertEmail(baseEmail({ id: "e1" }));
    emails.upsertEmail(
      baseEmail({ id: "e2", createdAt: "2026-01-02T00:00:00.000Z" }),
    );
    emails.saveEnrichment("e1", {
      category: "inquiry",
      priority: "high",
      actionRequired: true,
      summary: "s",
      suggestedAction: null,
      language: "en",
      facts: [],
      model: "m",
    });
    emails.saveEnrichment("e2", {
      category: "notification",
      priority: "low",
      actionRequired: false,
      summary: "s",
      suggestedAction: null,
      language: "en",
      facts: [],
      model: "m",
    });

    const { data } = emails.listEmails({ actionRequired: true });
    expect(data.map((e) => e.id)).toEqual(["e1"]);
  });
});

describe("listEmails cursor pagination", () => {
  test("is stable across 3 pages", () => {
    const emails = repo();
    const ids = ["e1", "e2", "e3", "e4", "e5"];
    ids.forEach((id, index) => {
      emails.upsertEmail(
        baseEmail({
          id,
          createdAt: `2026-01-0${index + 1}T00:00:00.000Z`,
        }),
      );
    });

    const page1 = emails.listEmails({ limit: 2 });
    expect(page1.data.map((e) => e.id)).toEqual(["e5", "e4"]);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = emails.listEmails({ limit: 2, cursor: page1.nextCursor! });
    expect(page2.data.map((e) => e.id)).toEqual(["e3", "e2"]);
    expect(page2.nextCursor).not.toBeNull();

    const page3 = emails.listEmails({ limit: 2, cursor: page2.nextCursor! });
    expect(page3.data.map((e) => e.id)).toEqual(["e1"]);
    expect(page3.nextCursor).toBeNull();
  });
});

describe("claimEnrichment", () => {
  test("a second claim right after the first returns false", () => {
    const emails = repo();
    emails.upsertEmail(baseEmail());

    expect(emails.claimEnrichment("email_1")).toBe(true);
    expect(emails.claimEnrichment("email_1")).toBe(false);
  });

  test("claiming an unknown id returns false", () => {
    expect(repo().claimEnrichment("missing")).toBe(false);
  });
});

describe("resetEnrichment", () => {
  test("does not clear a fresh claim held by another worker", () => {
    const emails = repo();
    emails.upsertEmail(baseEmail());
    expect(emails.claimEnrichment("email_1")).toBe(true);

    emails.resetEnrichment("email_1");

    // The reset was a no-op: the claim is still held, so a second claim
    // (simulating a manual re-enrich racing the background worker) fails.
    expect(emails.claimEnrichment("email_1")).toBe(false);
  });

  test("resets a row with no active claim", () => {
    const emails = repo();
    emails.upsertEmail(baseEmail());
    emails.markEnrichmentFailed("email_1", "boom");

    emails.resetEnrichment("email_1");

    expect(emails.getEmail("email_1")?.enrichment.status).toBe("pending");
    expect(emails.claimEnrichment("email_1")).toBe(true);
  });
});

describe("upsertEmail atomicity", () => {
  test("calling upsertEmail twice for a new id never throws and leaves exactly one pending enrichment row", () => {
    const emails = repo();

    expect(() => {
      emails.upsertEmail(baseEmail());
      emails.upsertEmail(baseEmail());
    }).not.toThrow();

    const email = emails.getEmail("email_1");
    expect(email?.enrichment.status).toBe("pending");
    expect(email?.enrichment.attempts).toBe(0);
  });
});

describe("Jev queue (emails)", () => {
  const result = {
    spamProbability: 0.1,
    category: "inquiry",
    categoryConfidence: 0.8,
    latencyMs: 400,
    model: "jev-test",
  };

  function withInbound() {
    const emails = repo();
    emails.upsertEmail(baseEmail({ id: "in_1", direction: "inbound" }));
    return emails;
  }

  test("inbound emails are queued, outbound ones are not judged", () => {
    const emails = repo();
    emails.upsertEmail(baseEmail({ id: "in_1", direction: "inbound" }));
    emails.upsertEmail(baseEmail({ id: "out_1", direction: "outbound" }));

    expect(emails.getEmail("in_1")!.enrichment.jev).toMatchObject({
      status: "pending",
      attempts: 0,
      nextAttemptAt: null,
      model: null,
    });
    expect(emails.getEmail("out_1")!.enrichment.jev).toBeNull();
    expect(emails.claimNextJev()?.id).toBe("in_1");
    expect(emails.claimNextJev()).toBeNull();
  });

  test("a re-upsert never resets an existing queue state", () => {
    const emails = withInbound();
    emails.completeJev({ ...emails.claimNextJev()!, result });

    emails.upsertEmail(baseEmail({ id: "in_1", direction: "inbound" }));

    expect(emails.getEmail("in_1")!.enrichment.jev?.status).toBe("done");
  });

  test("completeJev round-trips through getEmail and listEmails", () => {
    const emails = withInbound();
    emails.completeJev({ ...emails.claimNextJev()!, result });

    const expected = {
      ...result,
      status: "done" as const,
      attempts: 1,
      nextAttemptAt: null,
      error: null,
    };
    expect(emails.getEmail("in_1")!.enrichment.jev).toEqual(expected);
    expect(emails.listEmails().data[0]!.enrichment.jev).toEqual(expected);
  });

  test("resetEnrichment re-queues inbound emails and clears the previous decision", () => {
    const emails = withInbound();
    emails.completeJev({ ...emails.claimNextJev()!, result });

    emails.resetEnrichment("in_1");

    expect(emails.getEmail("in_1")!.enrichment.jev).toEqual({
      status: "pending",
      attempts: 0,
      nextAttemptAt: null,
      spamProbability: null,
      category: null,
      categoryConfidence: null,
      latencyMs: null,
      model: null,
      error: null,
    });
  });

  test("resetEnrichment leaves outbound emails out of the queue", () => {
    const emails = repo();
    emails.upsertEmail(baseEmail({ id: "out_1", direction: "outbound" }));

    emails.resetEnrichment("out_1");

    expect(emails.getEmail("out_1")!.enrichment.jev).toBeNull();
  });

  test("a re-queue during a claim voids the old claim's late write", () => {
    const emails = withInbound();
    const claim = emails.claimNextJev()!;

    emails.resetEnrichment("in_1");

    expect(emails.completeJev({ ...claim, result })).toBe(false);
    expect(emails.failJev({ ...claim, error: "late" })).toBe(false);
    expect(emails.getEmail("in_1")!.enrichment.jev).toMatchObject({
      status: "pending",
      attempts: 0,
      model: null,
      error: null,
    });
    // The re-queued row is claimable again by its new owner.
    expect(emails.claimNextJev()?.id).toBe("in_1");
  });
});

describe("insertOnly upserts", () => {
  test("onto an existing Resend row leaves its content and provider untouched", () => {
    const emails = repo();
    emails.upsertEmail(
      baseEmail({
        id: "shared",
        direction: "inbound",
        subject: "Original",
        html: "<p>original</p>",
        text: "original",
      }),
    );

    emails.upsertEmail(
      baseEmail({
        id: "shared",
        direction: "inbound",
        subject: "Overwritten?",
        html: "<p>evil</p>",
        text: "evil",
        provider: "imap",
        mailbox: "INBOX",
        messageId: "<m@x>",
        contentHash: "abc",
        insertOnly: true,
      }),
    );

    const row = emails.getEmail("shared");
    expect(row).toMatchObject({
      subject: "Original",
      html: "<p>original</p>",
      text: "original",
      provider: "resend",
    });
    // Only the bookkeeping fields are filled in.
    expect(row).toMatchObject({ mailbox: "INBOX", messageId: "<m@x>" });
    expect(emails.getContentHash("shared")).toBe("abc");
  });

  test("a second insertOnly upsert never changes stored bookkeeping either", () => {
    const emails = repo();
    const first = baseEmail({
      id: "imap:1",
      provider: "imap",
      mailbox: "INBOX",
      messageId: "<a@x>",
      contentHash: "hash-1",
      insertOnly: true,
    });
    emails.upsertEmail(first);

    emails.upsertEmail({
      ...first,
      subject: "Other",
      mailbox: "Spam",
      messageId: "<b@x>",
      contentHash: "hash-2",
    });

    expect(emails.getEmail("imap:1")).toMatchObject({
      subject: "Hello",
      mailbox: "INBOX",
      messageId: "<a@x>",
    });
    expect(emails.getContentHash("imap:1")).toBe("hash-1");
  });
});
