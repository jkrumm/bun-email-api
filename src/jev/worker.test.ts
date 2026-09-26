import { describe, expect, test } from "bun:test";
import { openDatabase } from "../db/client";
import { createEmailsRepo, type UpsertEmailInput } from "../db/emails";
import { JEV_MAX_ATTEMPTS } from "../db/jev-queue";
import { createSubmissionsRepo } from "../db/submissions";
import { runJevBatch } from "./worker";

const config = { apiKey: "k", model: "typesafe-ai/jev" };
const T0 = new Date("2026-06-01T12:00:00.000Z");
const minutesAfter = (minutes: number) =>
  new Date(T0.getTime() + minutes * 60_000);

const submissionResult = {
  verdict: "spam" as const,
  confidence: 0.9,
  probabilities: { legit: 0.05, spam: 0.9, marketing: 0.05 },
  latencyMs: 12,
  model: "typesafe-ai/jev",
};
const emailResult = {
  spamProbability: 0.04,
  category: "inquiry",
  categoryConfidence: 0.88,
  latencyMs: 20,
  model: "typesafe-ai/jev",
};
const upstream429 =
  "The upstream provider is currently experiencing high demand";

function setup() {
  const db = openDatabase(":memory:");
  const emails = createEmailsRepo(db);
  const submissions = createSubmissionsRepo(db);

  const queueSubmission = () =>
    submissions.recordSubmission({
      source: "fpp",
      verdict: "legit",
      confidence: 0.9,
      reason: "r",
      model: "m",
      delivered: true,
      submission: { message: "hello" },
      jevPending: true,
    });
  const queueEmail = (overrides: Partial<UpsertEmailInput> = {}) => {
    const input: UpsertEmailInput = {
      id: "in_1",
      direction: "inbound",
      fromAddress: "a@example.com",
      toAddresses: ["me@example.com"],
      subject: "Charter",
      text: "Hi",
      createdAt: "2026-01-01T00:00:00.000Z",
      ...overrides,
    };
    emails.upsertEmail(input);
    return input.id;
  };
  const run = (options: Parameters<typeof runJevBatch>[0] = {}) =>
    runJevBatch({ emails, submissions, config, now: () => T0, ...options });

  return { db, emails, submissions, queueSubmission, queueEmail, run };
}

describe("runJevBatch", () => {
  test("judges queued submissions and inbound emails and stores the decisions", async () => {
    const { emails, submissions, queueSubmission, queueEmail, run } = setup();
    queueSubmission();
    const emailId = queueEmail();
    const seen: unknown[] = [];

    await run({
      judgeSubmission: (input) => {
        seen.push(input.submission);
        return Promise.resolve(submissionResult);
      },
      judgeEmail: ({ payload }) => {
        seen.push(payload);
        return Promise.resolve(emailResult);
      },
    });

    expect(seen).toEqual([
      { message: "hello" },
      {
        direction: "inbound",
        from: "a@example.com",
        to: ["me@example.com"],
        subject: "Charter",
        text: "Hi",
      },
    ]);
    expect(submissions.listSubmissions().data[0]?.jev).toMatchObject({
      status: "done",
      attempts: 1,
      verdict: "spam",
      error: null,
    });
    expect(emails.getEmail(emailId)!.enrichment.jev).toMatchObject({
      status: "done",
      attempts: 1,
      category: "inquiry",
      error: null,
    });
  });

  test("an upstream 429 counts an attempt and schedules the backoff", async () => {
    const { emails, submissions, queueSubmission, queueEmail, run } = setup();
    queueSubmission();
    const emailId = queueEmail();
    const reject = () => Promise.reject(new Error(upstream429));

    await run({ judgeSubmission: reject, judgeEmail: reject });

    const expected = {
      status: "pending",
      attempts: 1,
      nextAttemptAt: minutesAfter(1).toISOString(),
      error: upstream429,
    };
    expect(submissions.listSubmissions().data[0]?.jev).toMatchObject(expected);
    expect(emails.getEmail(emailId)!.enrichment.jev).toMatchObject(expected);

    // Not retried before the backoff has elapsed.
    let calls = 0;
    await run({
      now: () => minutesAfter(0.5),
      judgeSubmission: () => {
        calls++;
        return Promise.reject(new Error(upstream429));
      },
    });
    expect(calls).toBe(0);
  });

  test("retries once due and succeeds, clearing the error", async () => {
    const { submissions, queueSubmission, run } = setup();
    queueSubmission();
    await run({
      judgeSubmission: () => Promise.reject(new Error(upstream429)),
    });

    await run({
      now: () => minutesAfter(2),
      judgeSubmission: () => Promise.resolve(submissionResult),
    });

    expect(submissions.listSubmissions().data[0]?.jev).toMatchObject({
      status: "done",
      attempts: 2,
      nextAttemptAt: null,
      error: null,
    });
  });

  test("the final failure marks the row failed and keeps the last error", async () => {
    const { submissions, queueSubmission, run } = setup();
    queueSubmission();
    let clock = 0;

    for (let attempt = 1; attempt <= JEV_MAX_ATTEMPTS; attempt++) {
      await run({
        now: () => minutesAfter(clock),
        judgeSubmission: () => Promise.reject(new Error(`fail ${attempt}`)),
      });
      const jev = submissions.listSubmissions().data[0]!.jev!;
      expect(jev.attempts).toBe(attempt);
      // Jump past any backoff (the longest is 24h).
      clock += 25 * 60;
    }

    expect(submissions.listSubmissions().data[0]?.jev).toMatchObject({
      status: "failed",
      attempts: JEV_MAX_ATTEMPTS,
      nextAttemptAt: null,
      error: `fail ${JEV_MAX_ATTEMPTS}`,
    });

    // Terminal: never picked up again.
    let calls = 0;
    await run({
      now: () => minutesAfter(clock + 100_000),
      judgeSubmission: () => {
        calls++;
        return Promise.resolve(submissionResult);
      },
    });
    expect(calls).toBe(0);
  });

  test("a stale claim is reclaimed, a fresh one is left alone", async () => {
    const { submissions, queueSubmission, run } = setup();
    queueSubmission();
    // Another worker claimed the row at T0 and never finished.
    submissions.claimNextJev({ now: T0 });
    let calls = 0;
    const judgeSubmission = () => {
      calls++;
      return Promise.resolve(submissionResult);
    };

    await run({ now: () => minutesAfter(34), judgeSubmission });
    expect(calls).toBe(0);

    await run({ now: () => minutesAfter(36), judgeSubmission });
    expect(calls).toBe(1);
    expect(submissions.listSubmissions().data[0]?.jev?.status).toBe("done");
  });

  test("Jev unconfigured leaves every row pending and untouched", async () => {
    const { emails, submissions, queueSubmission, queueEmail, run } = setup();
    queueSubmission();
    const emailId = queueEmail();
    let calls = 0;
    const judge = () => {
      calls++;
      return null;
    };

    await run({
      config: null,
      judgeSubmission: judge,
      judgeEmail: judge,
      now: () => minutesAfter(100_000),
    });

    expect(calls).toBe(0);
    expect(submissions.listSubmissions().data[0]?.jev).toMatchObject({
      status: "pending",
      attempts: 0,
      error: null,
    });
    expect(emails.getEmail(emailId)!.enrichment.jev).toMatchObject({
      status: "pending",
      attempts: 0,
    });
  });

  test("outbound emails are never judged", async () => {
    const { queueEmail, run } = setup();
    queueEmail({ id: "out_1", direction: "outbound" });
    let calls = 0;

    await run({
      judgeEmail: () => {
        calls++;
        return Promise.resolve(emailResult);
      },
    });

    expect(calls).toBe(0);
  });

  test("drains every due row in one run, not one batch", async () => {
    const { submissions, queueSubmission, run } = setup();
    for (let index = 0; index < 25; index++) queueSubmission();

    await run({ judgeSubmission: () => Promise.resolve(submissionResult) });

    expect(submissions.jevQueueCounts()).toEqual({ pending: 0, failed: 0 });
  });

  test("a row enqueued mid-run is judged in the same drain", async () => {
    const { submissions, queueSubmission, run } = setup();
    queueSubmission();
    let calls = 0;

    await run({
      judgeSubmission: () => {
        if (calls++ === 0) queueSubmission();
        return Promise.resolve(submissionResult);
      },
    });

    expect(calls).toBe(2);
    expect(submissions.jevQueueCounts()).toEqual({ pending: 0, failed: 0 });
  });

  test("a kick during an in-flight run sets a rerun that picks up rows enqueued after the queue drained", async () => {
    const { submissions, queueSubmission, queueEmail, run } = setup();
    queueEmail();
    let submissionCalls = 0;
    const judgeSubmission = () => {
      submissionCalls++;
      return Promise.resolve(submissionResult);
    };
    let kick: Promise<void> | undefined;

    await run({
      judgeSubmission,
      // The submission queue has already drained when the email is judged.
      judgeEmail: () => {
        queueSubmission();
        kick = run({ judgeSubmission });
        return Promise.resolve(emailResult);
      },
    });

    // The kick returned immediately instead of running concurrently...
    await kick;
    // ...and the rerun it flagged judged the new row.
    expect(submissionCalls).toBe(1);
    expect(submissions.jevQueueCounts()).toEqual({ pending: 0, failed: 0 });
  });

  test("two concurrent runs never double-judge a row", async () => {
    const { queueSubmission, run } = setup();
    queueSubmission();
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const judgeSubmission = async () => {
      calls++;
      await gate;
      return submissionResult;
    };

    const first = run({ judgeSubmission });
    const second = run({ judgeSubmission });
    release();
    await Promise.all([first, second]);

    expect(calls).toBe(1);
  });

  test("a claimed email that no longer exists is failed, not left claimed", async () => {
    const { emails, queueEmail, run } = setup();
    const emailId = queueEmail();
    let judged = 0;

    await run({
      emails: { ...emails, getEmail: () => null },
      judgeEmail: () => {
        judged++;
        return Promise.resolve(emailResult);
      },
    });

    expect(judged).toBe(0);
    expect(emails.getEmail(emailId)!.enrichment.jev).toMatchObject({
      status: "pending",
      attempts: 1,
      error: "Email not found",
    });
  });

  test("a failing completion write neither burns an attempt nor aborts the drain", async () => {
    const { submissions, queueSubmission, run } = setup();
    queueSubmission();
    queueSubmission();
    let writes = 0;

    await run({
      submissions: {
        ...submissions,
        completeJev: (input) => {
          if (writes++ === 0) throw new Error("database is locked");
          return submissions.completeJev(input);
        },
      },
      judgeSubmission: () => Promise.resolve(submissionResult),
    });

    const rows = submissions.listSubmissions().data.map((row) => row.jev);
    expect(rows.filter((jev) => jev?.status === "done")).toHaveLength(1);
    // The unlucky row records no Jev failure: no attempt, no error.
    expect(rows.filter((jev) => jev?.status === "pending")).toEqual([
      expect.objectContaining({ attempts: 0, error: null }),
    ]);
  });

  test("an unparsable stored submission fails only its own row", async () => {
    const { db, queueSubmission, run } = setup();
    const bad = queueSubmission();
    queueSubmission();
    db.run("UPDATE submissions SET submission = '{oops' WHERE id = ?", [
      bad.id,
    ]);

    await run({ judgeSubmission: () => Promise.resolve(submissionResult) });

    const rows = db
      .query<
        {
          id: string;
          jev_status: string;
          jev_attempts: number;
          jev_error: string | null;
        },
        []
      >("SELECT id, jev_status, jev_attempts, jev_error FROM submissions")
      .all();
    const badRow = rows.find((row) => row.id === bad.id)!;
    expect(badRow).toMatchObject({ jev_status: "pending", jev_attempts: 1 });
    expect(badRow.jev_error).toBeTruthy();
    expect(rows.filter((row) => row.jev_status === "done")).toHaveLength(1);
  });
});
