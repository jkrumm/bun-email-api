import type { Database } from "bun:sqlite";

export type EmailDirection = "inbound" | "outbound";
export type EnrichmentStatus = "pending" | "done" | "failed";

export interface EmailAttachment {
  filename: string | null;
  contentType: string;
  size: number;
}

export interface EmailFact {
  label: string;
  value: string;
}

export interface EnrichmentResult {
  category: string;
  priority: string;
  actionRequired: boolean;
  summary: string;
  suggestedAction: string | null;
  language: string;
  facts: EmailFact[];
  model: string;
}

export interface EnrichmentView {
  status: EnrichmentStatus;
  category: string | null;
  priority: string | null;
  actionRequired: boolean | null;
  summary: string | null;
  suggestedAction: string | null;
  language: string | null;
  facts: EmailFact[] | null;
  model: string | null;
  error: string | null;
  attempts: number;
}

export interface UpsertEmailInput {
  id: string;
  direction: EmailDirection;
  fromAddress: string;
  toAddresses: string[];
  subject: string;
  createdAt: string;
  // Undefined means "leave the stored value alone" (used for cheap partial
  // updates like refreshing last_event); pass null explicitly to clear.
  cc?: string[] | null;
  bcc?: string[] | null;
  replyTo?: string[] | null;
  lastEvent?: string | null;
  html?: string | null;
  text?: string | null;
  attachments?: EmailAttachment[];
  source?: string | null;
}

export interface EmailRecord {
  id: string;
  direction: EmailDirection;
  fromAddress: string;
  toAddresses: string[];
  cc: string[] | null;
  bcc: string[] | null;
  replyTo: string[] | null;
  subject: string;
  createdAt: string;
  lastEvent: string | null;
  html: string | null;
  text: string | null;
  attachments: EmailAttachment[];
  source: string | null;
  syncedAt: string;
}

export interface EmailWithEnrichment extends EmailRecord {
  enrichment: EnrichmentView;
}

export interface EmailListItem extends Omit<
  EmailWithEnrichment,
  "html" | "text"
> {
  snippet: string;
}

export interface ListEmailsFilters {
  direction?: EmailDirection;
  category?: string[];
  source?: string;
  from?: string;
  to?: string;
  q?: string;
  since?: string;
  until?: string;
  actionRequired?: boolean;
  status?: EnrichmentStatus;
  limit?: number;
  cursor?: string;
}

export interface ListEmailsResult {
  data: EmailListItem[];
  nextCursor: string | null;
}

export interface EmailStats {
  since: string;
  totalsByDirection: Record<string, number>;
  countsByCategory: Record<string, number>;
  actionRequiredOpen: number;
  perDay: { date: string; count: number }[];
  submissionsByVerdict: Record<string, number>;
  submissionsSuppressed: number;
}

const DEFAULT_LIST_LIMIT = 25;
const MAX_LIST_LIMIT = 100;
const STALE_CLAIM_MS = 10 * 60_000;
const MAX_ENRICHMENT_ATTEMPTS = 3;

interface EmailRow {
  id: string;
  direction: EmailDirection;
  from_address: string;
  to_addresses: string;
  cc: string | null;
  bcc: string | null;
  reply_to: string | null;
  subject: string;
  created_at: string;
  last_event: string | null;
  html: string | null;
  text: string | null;
  attachments: string;
  source: string | null;
  synced_at: string;
}

interface EnrichmentRow {
  status: EnrichmentStatus;
  category: string | null;
  priority: string | null;
  action_required: number | null;
  summary: string | null;
  suggested_action: string | null;
  language: string | null;
  facts: string | null;
  model: string | null;
  error: string | null;
  attempts: number;
}

type EmailWithEnrichmentRow = EmailRow & Partial<EnrichmentRow>;

function parseJsonArray<T>(value: string | null): T[] {
  if (!value) return [];
  return JSON.parse(value) as T[];
}

function toEmailRecord(row: EmailRow): EmailRecord {
  return {
    id: row.id,
    direction: row.direction,
    fromAddress: row.from_address,
    toAddresses: parseJsonArray<string>(row.to_addresses),
    cc: row.cc ? parseJsonArray<string>(row.cc) : null,
    bcc: row.bcc ? parseJsonArray<string>(row.bcc) : null,
    replyTo: row.reply_to ? parseJsonArray<string>(row.reply_to) : null,
    subject: row.subject,
    createdAt: row.created_at,
    lastEvent: row.last_event,
    html: row.html,
    text: row.text,
    attachments: parseJsonArray<EmailAttachment>(row.attachments),
    source: row.source,
    syncedAt: row.synced_at,
  };
}

function toEnrichmentView(row: Partial<EnrichmentRow>): EnrichmentView {
  return {
    status: row.status ?? "pending",
    category: row.category ?? null,
    priority: row.priority ?? null,
    actionRequired:
      row.action_required === null || row.action_required === undefined
        ? null
        : Boolean(row.action_required),
    summary: row.summary ?? null,
    suggestedAction: row.suggested_action ?? null,
    language: row.language ?? null,
    facts: row.facts ? parseJsonArray<EmailFact>(row.facts) : null,
    model: row.model ?? null,
    error: row.error ?? null,
    attempts: row.attempts ?? 0,
  };
}

function toPlainSnippet(text: string | null, maxLength = 240): string {
  if (!text) return "";
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength)}…`
    : normalized;
}

function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`, "utf-8").toString("base64url");
}

function decodeCursor(cursor: string): { createdAt: string; id: string } {
  const decoded = Buffer.from(cursor, "base64url").toString("utf-8");
  const separatorIndex = decoded.lastIndexOf("|");
  if (separatorIndex === -1) {
    throw new Error("Invalid cursor");
  }
  return {
    createdAt: decoded.slice(0, separatorIndex),
    id: decoded.slice(separatorIndex + 1),
  };
}

// Turns free-text search input into quoted, prefix-matched FTS5 tokens so
// user input (including bare operators like `OR (`) can never produce an
// FTS5 syntax error.
function sanitizeFtsQuery(input: string): string {
  return input
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => `"${token.replace(/"/g, '""')}"*`)
    .join(" ");
}

export function createEmailsRepo(db: Database) {
  function syncFtsRow(id: string): void {
    const row = db
      .query<
        {
          subject: string;
          from_address: string;
          to_addresses: string;
          text: string | null;
          summary: string | null;
        },
        [string]
      >(
        `SELECT e.subject, e.from_address, e.to_addresses, e.text, en.summary
         FROM emails e
         LEFT JOIN email_enrichments en ON en.email_id = e.id
         WHERE e.id = ?`,
      )
      .get(id);

    db.run("DELETE FROM emails_fts WHERE email_id = ?", [id]);
    if (!row) return;

    db.run(
      `INSERT INTO emails_fts (subject, from_address, to_addresses, text, summary, email_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        row.subject,
        row.from_address,
        row.to_addresses,
        row.text ?? "",
        row.summary ?? "",
        id,
      ],
    );
  }

  function upsertEmail(input: UpsertEmailInput): void {
    db.run(
      `INSERT INTO emails (
         id, direction, from_address, to_addresses, cc, bcc, reply_to,
         subject, created_at, last_event, html, text, attachments, source, synced_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         subject = excluded.subject,
         created_at = excluded.created_at,
         cc = COALESCE(excluded.cc, emails.cc),
         bcc = COALESCE(excluded.bcc, emails.bcc),
         reply_to = COALESCE(excluded.reply_to, emails.reply_to),
         last_event = COALESCE(excluded.last_event, emails.last_event),
         html = COALESCE(excluded.html, emails.html),
         text = COALESCE(excluded.text, emails.text),
         attachments = COALESCE(excluded.attachments, emails.attachments),
         source = COALESCE(excluded.source, emails.source),
         synced_at = excluded.synced_at`,
      [
        input.id,
        input.direction,
        input.fromAddress,
        JSON.stringify(input.toAddresses),
        input.cc === undefined ? null : JSON.stringify(input.cc),
        input.bcc === undefined ? null : JSON.stringify(input.bcc),
        input.replyTo === undefined ? null : JSON.stringify(input.replyTo),
        input.subject,
        input.createdAt,
        input.lastEvent === undefined ? null : input.lastEvent,
        input.html === undefined ? null : input.html,
        input.text === undefined ? null : input.text,
        input.attachments === undefined
          ? null
          : JSON.stringify(input.attachments),
        input.source === undefined ? null : input.source,
        new Date().toISOString(),
      ],
    );

    const enrichmentExists = db
      .query<{ email_id: string }, [string]>(
        "SELECT email_id FROM email_enrichments WHERE email_id = ?",
      )
      .get(input.id);

    if (!enrichmentExists) {
      db.run(
        `INSERT INTO email_enrichments (email_id, status, attempts, updated_at)
         VALUES (?, 'pending', 0, ?)`,
        [input.id, new Date().toISOString()],
      );
    }

    syncFtsRow(input.id);
  }

  function getEmail(id: string): EmailWithEnrichment | null {
    const row = db
      .query<EmailWithEnrichmentRow, [string]>(
        `SELECT e.*, en.status, en.category, en.priority, en.action_required,
                en.summary, en.suggested_action, en.language, en.facts,
                en.model, en.error, en.attempts
         FROM emails e
         LEFT JOIN email_enrichments en ON en.email_id = e.id
         WHERE e.id = ?`,
      )
      .get(id);

    if (!row) return null;

    return {
      ...toEmailRecord(row),
      enrichment: toEnrichmentView(row),
    };
  }

  function listEmails(filters: ListEmailsFilters = {}): ListEmailsResult {
    const limit = Math.min(
      Math.max(filters.limit ?? DEFAULT_LIST_LIMIT, 1),
      MAX_LIST_LIMIT,
    );

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filters.direction) {
      conditions.push("e.direction = ?");
      params.push(filters.direction);
    }
    if (filters.category && filters.category.length > 0) {
      conditions.push(
        `en.category IN (${filters.category.map(() => "?").join(", ")})`,
      );
      params.push(...filters.category);
    }
    if (filters.source) {
      conditions.push("e.source = ?");
      params.push(filters.source);
    }
    if (filters.from) {
      conditions.push("e.from_address LIKE ? ESCAPE '\\'");
      params.push(`%${escapeLike(filters.from)}%`);
    }
    if (filters.to) {
      conditions.push("e.to_addresses LIKE ? ESCAPE '\\'");
      params.push(`%${escapeLike(filters.to)}%`);
    }
    if (filters.since) {
      conditions.push("e.created_at >= ?");
      params.push(filters.since);
    }
    if (filters.until) {
      conditions.push("e.created_at <= ?");
      params.push(filters.until);
    }
    if (filters.actionRequired !== undefined) {
      conditions.push("en.action_required = ?");
      params.push(filters.actionRequired ? 1 : 0);
    }
    if (filters.status) {
      conditions.push("en.status = ?");
      params.push(filters.status);
    }

    let ftsJoin = "";
    const ftsQuery = filters.q ? sanitizeFtsQuery(filters.q) : "";
    if (ftsQuery) {
      ftsJoin = "JOIN emails_fts fts ON fts.email_id = e.id";
      conditions.push("emails_fts MATCH ?");
      params.push(ftsQuery);
    }

    if (filters.cursor) {
      const { createdAt, id } = decodeCursor(filters.cursor);
      conditions.push("(e.created_at < ? OR (e.created_at = ? AND e.id < ?))");
      params.push(createdAt, createdAt, id);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = db
      .query<EmailWithEnrichmentRow, (string | number)[]>(
        `SELECT e.*, en.status, en.category, en.priority, en.action_required,
                en.summary, en.suggested_action, en.language, en.facts,
                en.model, en.error, en.attempts
         FROM emails e
         LEFT JOIN email_enrichments en ON en.email_id = e.id
         ${ftsJoin}
         ${where}
         ORDER BY e.created_at DESC, e.id DESC
         LIMIT ?`,
      )
      .all(...params, limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const data: EmailListItem[] = page.map((row) => {
      const record = toEmailRecord(row);
      const { html, text, ...rest } = record;
      return {
        ...rest,
        enrichment: toEnrichmentView(row),
        snippet: toPlainSnippet(text),
      };
    });

    const last = data[data.length - 1];
    const nextCursor =
      hasMore && last ? encodeCursor(last.createdAt, last.id) : null;

    return { data, nextCursor };
  }

  function listPendingEnrichment(limit: number): { emailId: string }[] {
    return db
      .query<{ email_id: string }, [number, number]>(
        `SELECT email_id FROM email_enrichments
         WHERE status = 'pending' OR (status = 'failed' AND attempts < ?)
         ORDER BY updated_at ASC
         LIMIT ?`,
      )
      .all(MAX_ENRICHMENT_ATTEMPTS, limit)
      .map((row) => ({ emailId: row.email_id }));
  }

  function claimEnrichment(id: string): boolean {
    const now = new Date().toISOString();
    const staleBefore = new Date(Date.now() - STALE_CLAIM_MS).toISOString();

    const { changes } = db.run(
      `UPDATE email_enrichments
       SET claimed_at = ?
       WHERE email_id = ?
         AND (status = 'pending' OR (status = 'failed' AND attempts < ?))
         AND (claimed_at IS NULL OR claimed_at < ?)`,
      [now, id, MAX_ENRICHMENT_ATTEMPTS, staleBefore],
    );

    return changes > 0;
  }

  function saveEnrichment(id: string, result: EnrichmentResult): void {
    db.run(
      `UPDATE email_enrichments SET
         status = 'done',
         category = ?,
         priority = ?,
         action_required = ?,
         summary = ?,
         suggested_action = ?,
         language = ?,
         facts = ?,
         model = ?,
         error = NULL,
         claimed_at = NULL,
         updated_at = ?
       WHERE email_id = ?`,
      [
        result.category,
        result.priority,
        result.actionRequired ? 1 : 0,
        result.summary,
        result.suggestedAction,
        result.language,
        JSON.stringify(result.facts),
        result.model,
        new Date().toISOString(),
        id,
      ],
    );

    syncFtsRow(id);
  }

  function markEnrichmentFailed(id: string, error: string): void {
    db.run(
      `UPDATE email_enrichments SET
         status = 'failed',
         error = ?,
         attempts = attempts + 1,
         claimed_at = NULL,
         updated_at = ?
       WHERE email_id = ?`,
      [error, new Date().toISOString(), id],
    );
  }

  function resetEnrichment(id: string): void {
    db.run(
      `UPDATE email_enrichments SET
         status = 'pending',
         error = NULL,
         attempts = 0,
         claimed_at = NULL,
         updated_at = ?
       WHERE email_id = ?`,
      [new Date().toISOString(), id],
    );
  }

  function knownEmailIds(ids: string[]): Set<string> {
    if (ids.length === 0) return new Set();

    const rows = db
      .query<{ id: string }, string[]>(
        `SELECT id FROM emails WHERE id IN (${ids.map(() => "?").join(", ")})`,
      )
      .all(...ids);

    return new Set(rows.map((row) => row.id));
  }

  function emailStats({ since }: { since: string }): EmailStats {
    const totalsByDirection: Record<string, number> = {};
    for (const row of db
      .query<{ direction: EmailDirection; count: number }, [string]>(
        "SELECT direction, COUNT(*) as count FROM emails WHERE created_at >= ? GROUP BY direction",
      )
      .all(since)) {
      totalsByDirection[row.direction] = row.count;
    }

    const countsByCategory: Record<string, number> = {};
    for (const row of db
      .query<{ category: string; count: number }, [string]>(
        `SELECT en.category as category, COUNT(*) as count
         FROM emails e
         JOIN email_enrichments en ON en.email_id = e.id
         WHERE e.created_at >= ? AND en.category IS NOT NULL
         GROUP BY en.category`,
      )
      .all(since)) {
      countsByCategory[row.category] = row.count;
    }

    const { count: actionRequiredOpen } = db
      .query<{ count: number }, [string]>(
        `SELECT COUNT(*) as count
         FROM emails e
         JOIN email_enrichments en ON en.email_id = e.id
         WHERE e.created_at >= ? AND en.action_required = 1`,
      )
      .get(since)!;

    const perDay = computePerDayCounts(db, since);

    const submissionsByVerdict: Record<string, number> = {};
    for (const row of db
      .query<{ verdict: string; count: number }, [string]>(
        "SELECT verdict, COUNT(*) as count FROM submissions WHERE received_at >= ? GROUP BY verdict",
      )
      .all(since)) {
      submissionsByVerdict[row.verdict] = row.count;
    }

    const { count: submissionsSuppressed } = db
      .query<{ count: number }, [string]>(
        "SELECT COUNT(*) as count FROM submissions WHERE received_at >= ? AND delivered = 0",
      )
      .get(since)!;

    return {
      since,
      totalsByDirection,
      countsByCategory,
      actionRequiredOpen,
      perDay,
      submissionsByVerdict,
      submissionsSuppressed,
    };
  }

  return {
    upsertEmail,
    getEmail,
    listEmails,
    listPendingEnrichment,
    claimEnrichment,
    saveEnrichment,
    markEnrichmentFailed,
    resetEnrichment,
    knownEmailIds,
    emailStats,
  };
}

export type EmailsRepo = ReturnType<typeof createEmailsRepo>;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function computePerDayCounts(
  db: Database,
  since: string,
): { date: string; count: number }[] {
  const fourteenDaysAgo = new Date(
    Date.now() - 14 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const effectiveSince = since > fourteenDaysAgo ? since : fourteenDaysAgo;

  const rows = db
    .query<{ created_at: string }, [string]>(
      "SELECT created_at FROM emails WHERE created_at >= ?",
    )
    .all(effectiveSince);

  const dayFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const counts = new Map<string, number>();
  for (const row of rows) {
    const day = dayFormatter.format(new Date(row.created_at));
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));
}
