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
