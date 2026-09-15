import type { Database } from "bun:sqlite";
import type { EmailDirection } from "./emails";

export interface SyncStateRecord {
  direction: EmailDirection;
  lastRunComplete: boolean;
  lastRunAt: string | null;
}

interface SyncStateRow {
  direction: EmailDirection;
  last_run_complete: number;
  last_run_at: string | null;
}

export function createSyncStateRepo(db: Database) {
  function getState(direction: EmailDirection): SyncStateRecord | null {
    const row = db
      .query<SyncStateRow, [string]>(
        "SELECT direction, last_run_complete, last_run_at FROM sync_state WHERE direction = ?",
      )
      .get(direction);

    if (!row) return null;

    return {
      direction: row.direction,
      lastRunComplete: Boolean(row.last_run_complete),
      lastRunAt: row.last_run_at,
    };
  }

  // Only mark complete=1 when a run drained without errors — a later run
  // then knows whether it can trust the "known id → stop" pagination
  // shortcut, or has to page through everything again.
  function recordRun(
    direction: EmailDirection,
    { complete }: { complete: boolean },
  ): void {
    db.run(
      `INSERT INTO sync_state (direction, last_run_complete, last_run_at)
       VALUES (?, ?, ?)
       ON CONFLICT(direction) DO UPDATE SET
         last_run_complete = excluded.last_run_complete,
         last_run_at = excluded.last_run_at`,
      [direction, complete ? 1 : 0, new Date().toISOString()],
    );
  }

  return { getState, recordRun };
}

export type SyncStateRepo = ReturnType<typeof createSyncStateRepo>;
