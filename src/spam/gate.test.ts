import { describe, expect, test } from "bun:test";
import { gateSubmission } from "./gate";
import type { ClassificationResult } from "./classify";
import type { JevSubmissionView } from "../db/submissions";
import { openDatabase } from "../db/client";
import { createSubmissionsRepo } from "../db/submissions";

function classifyResult(
  overrides: Partial<ClassificationResult> = {},
): ClassificationResult {
  return {
    verdict: "legit",
    confidence: 0,
    reason: "test reason",
    model: "test-model",
    ...overrides,
  };
}

function instantClassify(result: ClassificationResult) {
  return async () => result;
}

function delayedClassify(result: ClassificationResult, delayMs: number) {
  return () =>
    new Promise<ClassificationResult>((resolve) => {
      setTimeout(() => resolve(result), delayMs);
    });
}

function deliverSpy(impl?: () => Promise<void>) {
  const calls: { subjectPrefix: string }[] = [];
  const deliver = async (opts: { subjectPrefix: string }) => {
    calls.push(opts);
    if (impl) await impl();
  };
  return { deliver, calls };
}

function testSubmissionsRepo() {
  return createSubmissionsRepo(openDatabase(":memory:"));
}

describe("gateSubmission", () => {
  test("suppresses a high-confidence spam verdict without delivering", async () => {
    const { deliver, calls } = deliverSpy();
    const classify = instantClassify(
      classifyResult({
        verdict: "spam",
        confidence: 0.9,
        reason: "looks spammy",
      }),
    );
    const submissions = testSubmissionsRepo();

    const result = await gateSubmission({
      source: "fpp",
      submission: { email: "a@b.com" },
      deliver,
      classify,
      record: submissions.recordSubmission,
    });

    expect(result).toEqual({ delivered: false });
    expect(calls).toHaveLength(0);
    const [record] = submissions.listSubmissions().data;
    expect(record?.delivered).toBe(false);
    expect(record?.verdict).toBe("spam");
  });

  test("delivers a low-confidence marketing verdict with the possible-spam prefix", async () => {
    const { deliver, calls } = deliverSpy();
    const classify = instantClassify(
      classifyResult({
        verdict: "marketing",
        confidence: 0.5,
        reason: "maybe marketing",
      }),
    );
    const submissions = testSubmissionsRepo();

    const result = await gateSubmission({
      source: "fpp",
      submission: { email: "a@b.com" },
      deliver,
      classify,
      record: submissions.recordSubmission,
    });

    expect(result).toEqual({ delivered: true });
    expect(calls).toEqual([{ subjectPrefix: "[Possible spam] " }]);
  });

  test("delivers a legit verdict with no prefix", async () => {
    const { deliver, calls } = deliverSpy();
    const classify = instantClassify(
      classifyResult({ verdict: "legit", confidence: 0.95, reason: "genuine" }),
    );
    const submissions = testSubmissionsRepo();

    const result = await gateSubmission({
      source: "fpp",
      submission: { email: "a@b.com" },
      deliver,
      classify,
      record: submissions.recordSubmission,
    });

    expect(result).toEqual({ delivered: true });
    expect(calls).toEqual([{ subjectPrefix: "" }]);
  });

  test("fails open on a slow classifier and records the late verdict after the deadline", async () => {
    const { deliver, calls } = deliverSpy();
    const classify = delayedClassify(
      classifyResult({ verdict: "spam", confidence: 0.9, reason: "late spam" }),
      50,
    );
    const submissions = testSubmissionsRepo();

    const result = await gateSubmission({
      source: "fpp",
      submission: { email: "a@b.com" },
      deliver,
      classify,
      record: submissions.recordSubmission,
      deadlineMs: 10,
    });

    expect(result).toEqual({ delivered: true });
    expect(calls).toEqual([{ subjectPrefix: "" }]);
    expect(submissions.listSubmissions().data).toHaveLength(0);

    await new Promise((resolve) => setTimeout(resolve, 80));

    const [record] = submissions.listSubmissions().data;
    expect(record?.delivered).toBe(true);
    expect(record?.reason).toBe("Decided after deadline: late spam");
  });

  test("a throwing record() is logged and swallowed — delivery still succeeds", async () => {
    const { deliver, calls } = deliverSpy();
    const classify = instantClassify(
      classifyResult({ verdict: "legit", confidence: 0.95, reason: "genuine" }),
    );
    const record: ReturnType<
      typeof createSubmissionsRepo
    >["recordSubmission"] = () => {
      throw new Error("unable to open database file");
    };

    const result = await gateSubmission({
      source: "fpp",
      submission: { email: "a@b.com" },
      deliver,
      classify,
      record,
    });

    expect(result).toEqual({ delivered: true });
    expect(calls).toEqual([{ subjectPrefix: "" }]);
  });

  test("rethrows and records delivered:false when delivery fails", async () => {
    const classify = instantClassify(
      classifyResult({ verdict: "legit", confidence: 0.9, reason: "genuine" }),
    );
    const { deliver } = deliverSpy(async () => {
      throw new Error("resend down");
    });
    const submissions = testSubmissionsRepo();

    await expect(
      gateSubmission({
        source: "fpp",
        submission: { email: "a@b.com" },
        deliver,
        classify,
        record: submissions.recordSubmission,
      }),
    ).rejects.toThrow("resend down");

    const [record] = submissions.listSubmissions().data;
    expect(record?.delivered).toBe(false);
    expect(record?.reason).toBe("genuine · delivery failed");
  });

  describe("Jev shadow mode", () => {
    const jevOutcome = (
      overrides: Partial<JevSubmissionView> = {},
    ): JevSubmissionView => ({
      verdict: "spam",
      confidence: 0.9,
      probabilities: { legit: 0.05, spam: 0.9, marketing: 0.05 },
      latencyMs: 12,
      model: "jev-test",
      error: null,
      ...overrides,
    });

    const jevAfter = (outcome: JevSubmissionView, delayMs: number) => () =>
      new Promise<JevSubmissionView>((resolve) => {
        setTimeout(() => resolve(outcome), delayMs);
      });

    test("stores Jev's verdict beside the LLM's without affecting delivery", async () => {
      const { deliver, calls } = deliverSpy();
      const submissions = testSubmissionsRepo();

      const result = await gateSubmission({
        source: "fpp",
        submission: { email: "a@b.com" },
        deliver,
        classify: instantClassify(
          classifyResult({ verdict: "legit", confidence: 0.95 }),
        ),
        jev: jevAfter(jevOutcome(), 0),
        record: submissions.recordSubmission,
        attachJev: submissions.attachJev,
      });
      await Bun.sleep(10);

      // Jev says spam at 0.9, the LLM's legit verdict still wins.
      expect(result).toEqual({ delivered: true });
      expect(calls).toEqual([{ subjectPrefix: "" }]);
      const [record] = submissions.listSubmissions().data;
      expect(record?.verdict).toBe("legit");
      expect(record?.llmLatencyMs).toBeGreaterThanOrEqual(0);
      expect(record?.jev).toMatchObject({
        verdict: "spam",
        confidence: 0.9,
        latencyMs: 12,
        model: "jev-test",
        error: null,
      });
      expect(record?.jev?.probabilities?.spam).toBe(0.9);
    });

    test("a slow Jev never extends the deadline and is attached once it lands", async () => {
      const { deliver } = deliverSpy();
      const submissions = testSubmissionsRepo();
      const startedAt = Date.now();

      await gateSubmission({
        source: "fpp",
        submission: { email: "a@b.com" },
        deliver,
        classify: instantClassify(classifyResult({ verdict: "legit" })),
        jev: jevAfter(jevOutcome(), 200),
        record: submissions.recordSubmission,
        attachJev: submissions.attachJev,
        deadlineMs: 20,
      });

      expect(Date.now() - startedAt).toBeLessThan(150);
      expect(submissions.listSubmissions().data[0]?.jev).toBeNull();

      await Bun.sleep(250);
      expect(submissions.listSubmissions().data[0]?.jev?.verdict).toBe("spam");
    });

    test("a Jev failure is recorded as an error and never breaks the gate", async () => {
      const { deliver, calls } = deliverSpy();
      const submissions = testSubmissionsRepo();

      const result = await gateSubmission({
        source: "sy-serendipity",
        submission: { email: "a@b.com" },
        deliver,
        classify: instantClassify(classifyResult({ verdict: "legit" })),
        jev: jevAfter(
          jevOutcome({
            verdict: null,
            confidence: null,
            probabilities: null,
            error: "Jev request failed: 529",
          }),
          0,
        ),
        record: submissions.recordSubmission,
        attachJev: submissions.attachJev,
      });
      await Bun.sleep(10);

      expect(result).toEqual({ delivered: true });
      expect(calls).toHaveLength(1);
      expect(submissions.listSubmissions().data[0]?.jev).toMatchObject({
        verdict: null,
        error: "Jev request failed: 529",
      });
    });

    test("a Jev that already landed is stored inline with the row", async () => {
      const { deliver } = deliverSpy();
      const submissions = testSubmissionsRepo();
      let attached = 0;

      await gateSubmission({
        source: "fpp",
        submission: { email: "a@b.com" },
        deliver,
        classify: delayedClassify(classifyResult(), 20),
        jev: jevAfter(jevOutcome(), 0),
        record: submissions.recordSubmission,
        attachJev: () => {
          attached++;
        },
      });

      expect(submissions.listSubmissions().data[0]?.jev?.verdict).toBe("spam");
      await Bun.sleep(10);
      expect(attached).toBe(0);
    });

    test("attachJev throwing is only logged and never breaks the gate", async () => {
      const { deliver, calls } = deliverSpy();
      const submissions = testSubmissionsRepo();

      const result = await gateSubmission({
        source: "fpp",
        submission: { email: "a@b.com" },
        deliver,
        classify: instantClassify(classifyResult()),
        jev: jevAfter(jevOutcome(), 10),
        record: submissions.recordSubmission,
        attachJev: () => {
          throw new Error("db locked");
        },
      });
      await Bun.sleep(30);

      expect(result).toEqual({ delivered: true });
      expect(calls).toHaveLength(1);
      expect(submissions.listSubmissions().data[0]?.jev).toBeNull();
    });

    test("a rejecting or throwing injected Jev never breaks the gate", async () => {
      for (const jev of [
        () => Promise.reject(new Error("boom")),
        () => {
          throw new Error("sync boom");
        },
      ]) {
        const { deliver, calls } = deliverSpy();
        const submissions = testSubmissionsRepo();

        const result = await gateSubmission({
          source: "fpp",
          submission: { email: "a@b.com" },
          deliver,
          classify: instantClassify(classifyResult()),
          jev,
          record: submissions.recordSubmission,
          attachJev: submissions.attachJev,
        });
        await Bun.sleep(5);

        expect(result).toEqual({ delivered: true });
        expect(calls).toHaveLength(1);
        expect(submissions.listSubmissions().data[0]?.jev).toBeNull();
      }
    });

    test("leaves the Jev columns empty when Jev is disabled", async () => {
      const { deliver } = deliverSpy();
      const submissions = testSubmissionsRepo();

      await gateSubmission({
        source: "fpp",
        submission: { email: "a@b.com" },
        deliver,
        classify: instantClassify(classifyResult()),
        jev: () => null,
        record: submissions.recordSubmission,
        attachJev: submissions.attachJev,
      });

      expect(submissions.listSubmissions().data[0]?.jev).toBeNull();
    });
  });
});
