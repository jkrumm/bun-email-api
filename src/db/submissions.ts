import type { Database } from "bun:sqlite";

export type SubmissionSource = "fpp" | "sy-serendipity";
export type Verdict = "legit" | "spam" | "marketing";

export interface SubmissionRecord {
  id: string;
  receivedAt: string;
  source: SubmissionSource;
  verdict: Verdict;
  confidence: number;
  reason: string;
  model: string | null;
  delivered: boolean;
  submission: Record<string, string | number | null>;
}

export interface RecordSubmissionInput {
  source: SubmissionSource;
  verdict: Verdict;
  confidence: number;
  reason: string;
  model: string | null;
  delivered: boolean;
  submission: Record<string, string | number | null>;
}

export interface ListSubmissionsFilters {
  verdict?: Verdict;
  source?: SubmissionSource;
  delivered?: boolean;
  limit?: number;
  cursor?: string;
}

export interface ListSubmissionsResult {
  data: SubmissionRecord[];
  nextCursor: string | null;
}

const DEFAULT_LIST_LIMIT = 25;
const MAX_LIST_LIMIT = 100;

interface SubmissionRow {
  id: string;
  received_at: string;
  source: SubmissionSource;
  verdict: Verdict;
  confidence: number;
  reason: string;
  model: string | null;
  delivered: number;
  submission: string;
}

function toSubmissionRecord(row: SubmissionRow): SubmissionRecord {
  return {
    id: row.id,
    receivedAt: row.received_at,
    source: row.source,
    verdict: row.verdict,
    confidence: row.confidence,
    reason: row.reason,
    model: row.model,
    delivered: Boolean(row.delivered),
    submission: JSON.parse(row.submission),
  };
}

function encodeCursor(receivedAt: string, id: string): string {
  return Buffer.from(`${receivedAt}|${id}`, "utf-8").toString("base64url");
}

function decodeCursor(cursor: string): { receivedAt: string; id: string } {
  const decoded = Buffer.from(cursor, "base64url").toString("utf-8");
  const separatorIndex = decoded.lastIndexOf("|");
  if (separatorIndex === -1) {
    throw new Error("Invalid cursor");
  }
  return {
    receivedAt: decoded.slice(0, separatorIndex),
    id: decoded.slice(separatorIndex + 1),
  };
}

export function createSubmissionsRepo(db: Database) {
  function recordSubmission(input: RecordSubmissionInput): SubmissionRecord {
    const record: SubmissionRecord = {
      ...input,
      id: crypto.randomUUID(),
      receivedAt: new Date().toISOString(),
    };

    db.run(
      `INSERT INTO submissions (id, received_at, source, verdict, confidence, reason, model, delivered, submission)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id,
        record.receivedAt,
        record.source,
        record.verdict,
        record.confidence,
        record.reason,
        record.model,
        record.delivered ? 1 : 0,
        JSON.stringify(record.submission),
      ],
    );

    return record;
  }

  function listSubmissions(
    filters: ListSubmissionsFilters = {},
  ): ListSubmissionsResult {
    const limit = Math.min(
      Math.max(filters.limit ?? DEFAULT_LIST_LIMIT, 1),
      MAX_LIST_LIMIT,
    );

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filters.verdict) {
      conditions.push("verdict = ?");
      params.push(filters.verdict);
    }
    if (filters.source) {
      conditions.push("source = ?");
      params.push(filters.source);
    }
    if (filters.delivered !== undefined) {
      conditions.push("delivered = ?");
      params.push(filters.delivered ? 1 : 0);
    }
    if (filters.cursor) {
      const { receivedAt, id } = decodeCursor(filters.cursor);
      conditions.push("(received_at < ? OR (received_at = ? AND id < ?))");
      params.push(receivedAt, receivedAt, id);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = db
      .query<SubmissionRow, (string | number)[]>(
        `SELECT * FROM submissions
         ${where}
         ORDER BY received_at DESC, id DESC
         LIMIT ?`,
      )
      .all(...params, limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const data = page.map(toSubmissionRecord);

    const last = data[data.length - 1];
    const nextCursor =
      hasMore && last ? encodeCursor(last.receivedAt, last.id) : null;

    return { data, nextCursor };
  }

  return { recordSubmission, listSubmissions };
}

export type SubmissionsRepo = ReturnType<typeof createSubmissionsRepo>;
