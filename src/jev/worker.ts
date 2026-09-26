import { emailsRepo, submissionsRepo } from "../db";
import type { JevClaim } from "../db/jev-queue";
import { errorMessage } from "../utils/error";
import { getJevConfig, type JevConfig } from "../llm/jev";
import { buildEmailPayload } from "../enrich/enrich-email";
import { judgeEmailWithJev } from "../enrich/jev-email";
import { judgeSubmissionWithJev } from "../spam/jev-judge";

const INTERVAL_MS = 60_000;

let running = false;
let rerun = false;

// Drains one queue: claims a single due row, judges it, writes the outcome,
// repeats until nothing is due. One row at a time keeps 429 pressure on the
// gateway bounded and means a claim is judged right after it is taken, never
// after waiting behind a batch (which could outlive the stale-claim window).
async function drainQueue<Claimed extends JevClaim, Result>({
  label,
  claimNext,
  judge,
  complete,
  fail,
}: {
  label: string;
  claimNext: () => Claimed | null;
  // Throws on any failure; that failure counts as one attempt.
  judge: (claimed: Claimed) => Promise<Result>;
  complete: (claimed: Claimed, result: Result) => void;
  fail: (claimed: Claimed, error: string) => void;
}): Promise<void> {
  for (;;) {
    const claimed = claimNext();
    if (!claimed) return;

    let outcome: { result: Result } | { error: string };
    try {
      outcome = { result: await judge(claimed) };
    } catch (error) {
      console.error(`Jev ${label} judgement failed`, { error });
      outcome = { error: errorMessage(error) };
    }

    // Outside the judge's try: a DB write failure is not a Jev failure and
    // must not burn an attempt. The row stays claimed and is retried once
    // the claim goes stale; the rest of the drain carries on.
    try {
      if ("error" in outcome) fail(claimed, outcome.error);
      else complete(claimed, outcome.result);
    } catch (error) {
      console.error(`Failed to record Jev ${label} outcome`, { error });
    }
  }
}

// Drains the durable Jev queue (submissions and inbound emails): success
// stores the decision, failure counts an attempt and schedules a backoff
// retry (see src/db/jev-queue.ts). Rows stay pending while Jev is not
// configured; that is never a failure.
export async function runJevBatch({
  emails = emailsRepo,
  submissions = submissionsRepo,
  config = getJevConfig(),
  judgeSubmission = judgeSubmissionWithJev,
  judgeEmail = judgeEmailWithJev,
  now = () => new Date(),
}: {
  emails?: typeof emailsRepo;
  submissions?: typeof submissionsRepo;
  config?: JevConfig | null;
  judgeSubmission?: typeof judgeSubmissionWithJev;
  judgeEmail?: typeof judgeEmailWithJev;
  now?: () => Date;
} = {}): Promise<void> {
  if (!config) return;

  // A kick during a running drain must not be lost: it schedules another
  // pass once this one finishes.
  if (running) {
    rerun = true;
    return;
  }

  running = true;
  try {
    do {
      rerun = false;

      // The judges return null only without a config, which is checked above.
      await drainQueue({
        label: "submission",
        claimNext: () => submissions.claimNextJev({ now: now() }),
        judge: ({ source, submission }) =>
          judgeSubmission({
            source,
            submission: JSON.parse(submission),
            config,
          })!,
        complete: ({ id, claimToken }, result) =>
          submissions.completeJev({ id, claimToken, result }),
        fail: ({ id, claimToken }, error) =>
          submissions.failJev({ id, claimToken, error, now: now() }),
      });

      await drainQueue({
        label: "email",
        claimNext: () => emails.claimNextJev({ now: now() }),
        judge: async ({ id }) => {
          const email = emails.getEmail(id);
          if (!email) throw new Error("Email not found");
          return judgeEmail({ payload: buildEmailPayload(email), config })!;
        },
        complete: ({ id, claimToken }, result) =>
          emails.completeJev({ id, claimToken, result }),
        fail: ({ id, claimToken }, error) =>
          emails.failJev({ id, claimToken, error, now: now() }),
      });
    } while (rerun);
  } finally {
    running = false;
  }
}

// On-demand nudge after something was enqueued. Never rejects.
export function kickJevWorker(): void {
  void runJevBatch().catch((error) => {
    console.error("Jev batch failed", { error });
  });
}

export function startJevWorker(): void {
  if (process.env.NODE_ENV === "test") return;
  if (!getJevConfig()) {
    console.log("[jev] Jev not configured — queued rows stay pending");
    return;
  }

  const interval = setInterval(kickJevWorker, INTERVAL_MS);
  interval.unref();
  kickJevWorker();
}
