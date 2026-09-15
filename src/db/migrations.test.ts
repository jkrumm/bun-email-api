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
    db.run("PRAGMA user_version = 0");
    const migrate = () => runMigrations(db);
    migrate();
    db.run("PRAGMA user_version = 2");
    db.run(
      `INSERT INTO emails (id, direction, from_address, to_addresses, subject, created_at, attachments, synced_at)
       VALUES ('e1', 'outbound', 'a@example.com', '[]', 's', '2026-09-15 07:15:57.115000+00', '[]', '2026-09-15T08:00:00.000Z')`,
    );
    migrate();
    const row = db
      .query<{ created_at: string }, []>("SELECT created_at FROM emails")
      .get()!;
    expect(row.created_at).toBe("2026-09-15T07:15:57.115Z");
  });
});
