import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { runMigrations } from "./migrations";

describe("runMigrations", () => {
  test("creates the expected tables", () => {
    const db = new Database(":memory:");
    runMigrations(db);

    const tables = db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY name",
      )
      .all()
      .map((row) => row.name);

    expect(tables).toContain("emails");
    expect(tables).toContain("email_enrichments");
    expect(tables).toContain("submissions");
    expect(tables).toContain("emails_fts");
    expect(tables).toContain("sync_state");
    expect(tables).toContain("imap_sync_state");
  });

  test("is idempotent — running twice does not throw or duplicate schema", () => {
    const db = new Database(":memory:");
    runMigrations(db);
    expect(() => runMigrations(db)).not.toThrow();

    const { user_version } = db
      .query<{ user_version: number }, []>("PRAGMA user_version")
      .get()!;
    expect(user_version).toBeGreaterThan(0);
  });
});

describe("migration 3", () => {
  test("rewrites Resend-style created_at values to ISO", () => {
    const db = new Database(":memory:");
    runMigrations(db, { targetVersion: 2 });
    db.run(
      `INSERT INTO emails (id, direction, from_address, to_addresses, subject, created_at, attachments, synced_at)
       VALUES ('e1', 'outbound', 'a@example.com', '[]', 's', '2026-09-15 07:15:57.115000+00', '[]', '2026-09-15T08:00:00.000Z')`,
    );
    runMigrations(db);
    const row = db
      .query<{ created_at: string }, []>("SELECT created_at FROM emails")
      .get()!;
    expect(row.created_at).toBe("2026-09-15T07:15:57.115Z");
  });
});

describe("migration 4", () => {
  test("adds the Jev shadow columns to submissions and email_enrichments", () => {
    const db = new Database(":memory:");
    runMigrations(db);

    const columns = (table: string) =>
      db
        .query<{ name: string }, []>(`PRAGMA table_info(${table})`)
        .all()
        .map((row) => row.name);

    expect(columns("submissions")).toEqual(
      expect.arrayContaining(["llm_latency_ms", "jev_verdict", "jev_error"]),
    );
    expect(columns("email_enrichments")).toEqual(
      expect.arrayContaining(["jev_spam_probability", "jev_category"]),
    );
  });

  test("v3 → v4 keeps existing rows with NULL jev_* columns", () => {
    const db = new Database(":memory:");
    runMigrations(db, { targetVersion: 3 });
    db.run(
      `INSERT INTO submissions (id, received_at, source, verdict, confidence, reason, delivered, submission)
       VALUES ('s1', '2026-09-15T08:00:00.000Z', 'fpp', 'legit', 0.9, 'r', 1, '{}')`,
    );
    db.run(
      `INSERT INTO emails (id, direction, from_address, to_addresses, subject, created_at, attachments, synced_at)
       VALUES ('e1', 'inbound', 'a@example.com', '[]', 's', '2026-09-15T07:00:00.000Z', '[]', '2026-09-15T08:00:00.000Z')`,
    );
    db.run(
      `INSERT INTO email_enrichments (email_id, status, attempts, updated_at)
       VALUES ('e1', 'pending', 0, '2026-09-15T08:00:00.000Z')`,
    );

    runMigrations(db);

    expect(
      db
        .query<Record<string, unknown>, []>(
          "SELECT llm_latency_ms, jev_verdict, jev_confidence, jev_probabilities, jev_latency_ms, jev_model, jev_error FROM submissions",
        )
        .get(),
    ).toEqual({
      llm_latency_ms: null,
      jev_verdict: null,
      jev_confidence: null,
      jev_probabilities: null,
      jev_latency_ms: null,
      jev_model: null,
      jev_error: null,
    });
    expect(
      db
        .query<Record<string, unknown>, []>(
          "SELECT jev_spam_probability, jev_category, jev_category_confidence, jev_latency_ms, jev_model, jev_error FROM email_enrichments",
        )
        .get(),
    ).toEqual({
      jev_spam_probability: null,
      jev_category: null,
      jev_category_confidence: null,
      jev_latency_ms: null,
      jev_model: null,
      jev_error: null,
    });
  });
});

describe("migration 5", () => {
  test("backfills existing rows as provider resend", () => {
    const db = new Database(":memory:");
    runMigrations(db);
    db.run(
      `INSERT INTO emails (id, direction, from_address, to_addresses, subject, created_at, attachments, synced_at)
       VALUES ('e1', 'inbound', 'a@example.com', '[]', 's', '2026-09-15T07:15:57.115Z', '[]', '2026-09-15T08:00:00.000Z')`,
    );
    const row = db
      .query<{ provider: string; mailbox: string | null }, []>(
        "SELECT provider, mailbox FROM emails",
      )
      .get()!;
    expect(row).toEqual({ provider: "resend", mailbox: null });
  });
});
