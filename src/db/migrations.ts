import type { Database } from "bun:sqlite";

interface Migration {
  version: number;
  up: string;
}

// Ordered, idempotent migrations tracked via PRAGMA user_version. Add new
// entries with the next integer version — never edit a migration that has
// already shipped.
const migrations: Migration[] = [
  {
    version: 1,
    up: `
      CREATE TABLE emails (
        id TEXT PRIMARY KEY,
        direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
        from_address TEXT NOT NULL,
        to_addresses TEXT NOT NULL,
        cc TEXT,
        bcc TEXT,
        reply_to TEXT,
        subject TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_event TEXT,
        html TEXT,
        text TEXT,
        attachments TEXT,
        source TEXT,
        synced_at TEXT NOT NULL
      );
      CREATE INDEX idx_emails_direction_created_at ON emails (direction, created_at);
      CREATE INDEX idx_emails_created_at ON emails (created_at);
      CREATE INDEX idx_emails_from_address ON emails (from_address);

      CREATE TABLE email_enrichments (
        email_id TEXT PRIMARY KEY REFERENCES emails(id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK (status IN ('pending', 'done', 'failed')),
        category TEXT,
        priority TEXT,
        action_required INTEGER,
        summary TEXT,
        suggested_action TEXT,
        language TEXT,
        facts TEXT,
        model TEXT,
        error TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        claimed_at TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_email_enrichments_category ON email_enrichments (category);
      CREATE INDEX idx_email_enrichments_action_required ON email_enrichments (action_required);

      CREATE TABLE submissions (
        id TEXT PRIMARY KEY,
        received_at TEXT NOT NULL,
        source TEXT NOT NULL,
        verdict TEXT NOT NULL,
        confidence REAL NOT NULL,
        reason TEXT NOT NULL,
        model TEXT,
        delivered INTEGER NOT NULL,
        submission TEXT NOT NULL
      );
      CREATE INDEX idx_submissions_received_at ON submissions (received_at);
      CREATE INDEX idx_submissions_verdict ON submissions (verdict);

      CREATE VIRTUAL TABLE emails_fts USING fts5(
        subject,
        from_address,
        to_addresses,
        text,
        summary,
        email_id UNINDEXED,
        tokenize = 'unicode61 remove_diacritics 2'
      );
    `,
  },
  {
    version: 2,
    up: `
      CREATE TABLE sync_state (
        direction TEXT PRIMARY KEY CHECK (direction IN ('inbound', 'outbound')),
        last_run_complete INTEGER NOT NULL DEFAULT 0,
        last_run_at TEXT
      );
    `,
  },
];

export function runMigrations(db: Database): void {
  const { user_version: currentVersion } = db
    .query<{ user_version: number }, []>("PRAGMA user_version")
    .get()!;

  const pending = migrations
    .filter((migration) => migration.version > currentVersion)
    .sort((a, b) => a.version - b.version);

  if (pending.length === 0) return;

  const applyPending = db.transaction(() => {
    for (const migration of pending) {
      db.run(migration.up);
      // PRAGMA doesn't accept bound parameters; the version is our own
      // integer literal, never user input.
      db.run(`PRAGMA user_version = ${migration.version}`);
    }
  });

  applyPending();
}
