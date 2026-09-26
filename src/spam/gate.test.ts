import { describe, expect, test } from "bun:test";
import { gateSubmission } from "./gate";
import type { ClassificationResult } from "./classify";
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

  describe("Jev queue", () => {
    const gate = (
      submissions: ReturnType<typeof testSubmissionsRepo>,
      overrides: Partial<Parameters<typeof gateSubmission>[0]> = {},
    ) =>
      gateSubmission({
        source: "fpp",
        submission: { email: "a@b.com" },
        deliver: async () => {},
        classify: instantClassify(
          classifyResult({ verdict: "legit", confidence: 0.95 }),
        ),
        record: submissions.recordSubmission,
        ...overrides,
      });

    test("queues the recorded row for Jev and kicks the worker, without affecting delivery", async () => {
      const { deliver, calls } = deliverSpy();
      const submissions = testSubmissionsRepo();
      let kicks = 0;

      const result = await gate(submissions, {
        deliver,
        jevEnabled: () => true,
        kickJev: () => kicks++,
      });

      expect(result).toEqual({ delivered: true });
      expect(calls).toEqual([{ subjectPrefix: "" }]);
      expect(kicks).toBe(1);
      expect(submissions.listSubmissions().data[0]?.jev).toMatchObject({
        status: "pending",
        attempts: 0,
        verdict: null,
      });
      expect(submissions.claimNextJev()).not.toBeNull();
    });

    test("queues suppressed submissions too", async () => {
      const submissions = testSubmissionsRepo();

      const result = await gate(submissions, {
        classify: instantClassify(
          classifyResult({ verdict: "spam", confidence: 0.99 }),
        ),
        jevEnabled: () => true,
        kickJev: () => {},
      });

      expect(result).toEqual({ delivered: false });
      expect(submissions.listSubmissions().data[0]?.jev?.status).toBe(
        "pending",
      );
    });

    test("a verdict that lands after the deadline is queued when it is recorded", async () => {
      const submissions = testSubmissionsRepo();

      await gate(submissions, {
        classify: delayedClassify(
          classifyResult({ verdict: "legit", confidence: 0.95 }),
          50,
        ),
        deadlineMs: 5,
        jevEnabled: () => true,
        kickJev: () => {},
      });
      expect(submissions.listSubmissions().data).toHaveLength(0);

      await Bun.sleep(80);

      expect(submissions.listSubmissions().data[0]?.jev?.status).toBe(
        "pending",
      );
    });

    test("leaves the Jev state empty when Jev is disabled", async () => {
      const submissions = testSubmissionsRepo();
      let kicks = 0;

      await gate(submissions, {
        jevEnabled: () => false,
        kickJev: () => kicks++,
      });

      expect(submissions.listSubmissions().data[0]?.jev).toBeNull();
      expect(submissions.claimNextJev()).toBeNull();
    });

    test("a throwing kick never breaks the gate", async () => {
      const submissions = testSubmissionsRepo();

      const result = await gate(submissions, {
        jevEnabled: () => true,
        kickJev: () => {
          throw new Error("boom");
        },
      });

      expect(result).toEqual({ delivered: true });
      expect(submissions.listSubmissions().data).toHaveLength(1);
    });
  });
});
