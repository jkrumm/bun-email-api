import { afterEach, describe, expect, test } from "bun:test";
import { gateSubmission } from "./gate";
import type { ClassificationResult } from "./classify";
import { listRecentVerdicts, resetVerdictsForTests } from "./store";

afterEach(() => {
  resetVerdictsForTests();
});

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

    const result = await gateSubmission({
      source: "fpp",
      submission: { email: "a@b.com" },
      deliver,
      classify,
    });

    expect(result).toEqual({ delivered: false });
    expect(calls).toHaveLength(0);
    const [record] = listRecentVerdicts();
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

    const result = await gateSubmission({
      source: "fpp",
      submission: { email: "a@b.com" },
      deliver,
      classify,
    });

    expect(result).toEqual({ delivered: true });
    expect(calls).toEqual([{ subjectPrefix: "[Possible spam] " }]);
  });

  test("delivers a legit verdict with no prefix", async () => {
    const { deliver, calls } = deliverSpy();
    const classify = instantClassify(
      classifyResult({ verdict: "legit", confidence: 0.95, reason: "genuine" }),
    );

    const result = await gateSubmission({
      source: "fpp",
      submission: { email: "a@b.com" },
      deliver,
      classify,
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

    const result = await gateSubmission({
      source: "fpp",
      submission: { email: "a@b.com" },
      deliver,
      classify,
      deadlineMs: 10,
    });

    expect(result).toEqual({ delivered: true });
    expect(calls).toEqual([{ subjectPrefix: "" }]);
    expect(listRecentVerdicts()).toHaveLength(0);

    await new Promise((resolve) => setTimeout(resolve, 80));

    const [record] = listRecentVerdicts();
    expect(record?.delivered).toBe(true);
    expect(record?.reason).toBe("Decided after deadline: late spam");
  });

  test("rethrows and records delivered:false when delivery fails", async () => {
    const classify = instantClassify(
      classifyResult({ verdict: "legit", confidence: 0.9, reason: "genuine" }),
    );
    const { deliver } = deliverSpy(async () => {
      throw new Error("resend down");
    });

    await expect(
      gateSubmission({
        source: "fpp",
        submission: { email: "a@b.com" },
        deliver,
        classify,
      }),
    ).rejects.toThrow("resend down");

    const [record] = listRecentVerdicts();
    expect(record?.delivered).toBe(false);
    expect(record?.reason).toBe("genuine · delivery failed");
  });
});
