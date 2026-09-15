export type SubmissionSource = "fpp" | "sy-serendipity";

export type Verdict = "legit" | "spam" | "marketing";

export interface VerdictRecord {
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

// In-memory only: the container is stateless, so the history resets on
// every deploy. Enough to eyeball what the filter did recently.
const MAX_RECORDS = 200;
const records: VerdictRecord[] = [];

export function recordVerdict(
  record: Omit<VerdictRecord, "id" | "receivedAt">,
) {
  records.unshift({
    ...record,
    id: crypto.randomUUID(),
    receivedAt: new Date().toISOString(),
  });
  records.length = Math.min(records.length, MAX_RECORDS);
}

export function listRecentVerdicts(): readonly VerdictRecord[] {
  return records;
}

export function resetVerdictsForTests(): void {
  records.length = 0;
}
