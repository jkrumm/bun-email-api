import type { Database } from "bun:sqlite";

interface ImapCursor {
  uidValidity: string;
  lastUid: number;
}

export interface ImapMailboxHealth {
  mailbox: string;
  lastUid: number;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  // Per-message degradations from the last run (unparseable message, stand-in
  // row, reused Message-ID, ...): the run "succeeded", but not cleanly.
  lastWarning: string | null;
  lastWarningAt: string | null;
}

interface HealthRow {
  mailbox: string;
  last_uid: number;
  last_success_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  last_warning: string | null;
  last_warning_at: string | null;
}

export function createImapStateRepo(db: Database) {
  function getCursor(mailbox: string): ImapCursor | null {
    const row = db
      .query<{ uid_validity: string | null; last_uid: number }, [string]>(
        "SELECT uid_validity, last_uid FROM imap_sync_state WHERE mailbox = ?",
      )
      .get(mailbox);

    // A row that only carries health (never opened) has no cursor yet.
    return row?.uid_validity
      ? { uidValidity: row.uid_validity, lastUid: row.last_uid }
      : null;
  }

  function saveCursor(mailbox: string, cursor: ImapCursor): void {
    db.run(
      `INSERT INTO imap_sync_state (mailbox, uid_validity, last_uid, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(mailbox) DO UPDATE SET
         uid_validity = excluded.uid_validity,
         last_uid = excluded.last_uid,
         updated_at = excluded.updated_at`,
      [mailbox, cursor.uidValidity, cursor.lastUid, new Date().toISOString()],
    );
  }

  // A run that ended without error clears the previous error, so a dead
  // Bridge shows up as `lastError` and recovery removes it. A run that had
  // per-message degradations records them as the warning instead of clearing
  // it; only a fully clean run clears the warning.
  function recordSuccess(
    mailbox: string,
    { warning }: { warning?: string } = {},
  ): void {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO imap_sync_state (mailbox, last_uid, updated_at, last_success_at, last_warning, last_warning_at)
       VALUES (?, 0, ?, ?, ?, ?)
       ON CONFLICT(mailbox) DO UPDATE SET
         last_success_at = excluded.last_success_at,
         last_error = NULL,
         last_error_at = NULL,
         last_warning = excluded.last_warning,
         last_warning_at = excluded.last_warning_at`,
      [mailbox, now, now, warning ?? null, warning ? now : null],
    );
  }

  function recordError(mailbox: string, message: string): void {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO imap_sync_state (mailbox, last_uid, updated_at, last_error, last_error_at)
       VALUES (?, 0, ?, ?, ?)
       ON CONFLICT(mailbox) DO UPDATE SET
         last_error = excluded.last_error,
         last_error_at = excluded.last_error_at`,
      [mailbox, now, message, now],
    );
  }

  // Counts consecutive runs that ended held at the same uid. A different uid
  // restarts the count.
  function recordHold(mailbox: string, uid: number): number {
    db.run(
      `INSERT INTO imap_sync_state (mailbox, last_uid, updated_at, held_uid, held_count)
       VALUES (?, 0, ?, ?, 1)
       ON CONFLICT(mailbox) DO UPDATE SET
         held_count = CASE WHEN held_uid = excluded.held_uid THEN held_count + 1 ELSE 1 END,
         held_uid = excluded.held_uid`,
      [mailbox, new Date().toISOString(), uid],
    );
    return (
      db
        .query<{ held_count: number }, [string]>(
          "SELECT held_count FROM imap_sync_state WHERE mailbox = ?",
        )
        .get(mailbox)?.held_count ?? 1
    );
  }

  function clearHold(mailbox: string): void {
    db.run(
      "UPDATE imap_sync_state SET held_uid = NULL, held_count = 0 WHERE mailbox = ? AND held_uid IS NOT NULL",
      [mailbox],
    );
  }

  function listHealth(): ImapMailboxHealth[] {
    return db
      .query<HealthRow, []>(
        `SELECT mailbox, last_uid, last_success_at, last_error, last_error_at,
                last_warning, last_warning_at
         FROM imap_sync_state ORDER BY mailbox`,
      )
      .all()
      .map((row) => ({
        mailbox: row.mailbox,
        lastUid: row.last_uid,
        lastSuccessAt: row.last_success_at,
        lastError: row.last_error,
        lastErrorAt: row.last_error_at,
        lastWarning: row.last_warning,
        lastWarningAt: row.last_warning_at,
      }));
  }

  return {
    getCursor,
    saveCursor,
    recordSuccess,
    recordError,
    recordHold,
    clearHold,
    listHealth,
  };
}

export type ImapStateRepo = ReturnType<typeof createImapStateRepo>;
