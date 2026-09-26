import { describe, expect, test } from "bun:test";
import { openDatabase } from "./client";
import { createSubmissionsRepo, type JevSubmissionView } from "./submissions";

const jev: JevSubmissionView = {
  verdict: "spam",
  confidence: 0.9,
  probabilities: { legit: 0.05, spam: 0.9, marketing: 0.05 },
  latencyMs: 800,
  model: "jev-test",
  error: null,
};

const base = {
  source: "fpp" as const,
  verdict: "legit" as const,
  confidence: 0.9,
  reason: "r",
  model: "m",
  delivered: true,
  submission: {},
};

function repo() {
  return createSubmissionsRepo(openDatabase(":memory:"));
}

describe("submissions Jev columns", () => {
  test("recordSubmission stores an inline Jev verdict and LLM latency", () => {
    const submissions = repo();
    submissions.recordSubmission({ ...base, llmLatencyMs: 1500, jev });

    const [row] = submissions.listSubmissions().data;
    expect(row?.llmLatencyMs).toBe(1500);
    expect(row?.jev).toEqual(jev);
  });

  test("attachJev round-trips onto an existing row, including an error result", () => {
    const submissions = repo();
    const { id } = submissions.recordSubmission(base);
    expect(submissions.listSubmissions().data[0]?.jev).toBeNull();

    const failed: JevSubmissionView = {
      verdict: null,
      confidence: null,
      probabilities: null,
      latencyMs: 30,
      model: "jev-test",
      error: "Jev request failed: 529",
    };
    submissions.attachJev(id, failed);

    expect(submissions.listSubmissions().data[0]?.jev).toEqual(failed);
  });

  test("getJevComparison computes agreement and median latencies", () => {
    const submissions = repo();
    submissions.recordSubmission({ ...base, llmLatencyMs: 1000, jev });
    submissions.recordSubmission({
      ...base,
      verdict: "spam",
      llmLatencyMs: 3000,
      jev: { ...jev, latencyMs: 200 },
    });
    submissions.recordSubmission({
      ...base,
      llmLatencyMs: 5000,
      jev: { ...jev, verdict: null, confidence: null, error: "x" },
    });
    submissions.recordSubmission(base);

    expect(
      submissions.getJevComparison({ since: "2000-01-01T00:00:00.000Z" }),
    ).toEqual({
      compared: 2,
      agreed: 1,
      agreementRate: 0.5,
      llmMedianLatencyMs: 3000,
      jevMedianLatencyMs: 800,
    });
  });

  test("getJevComparison is empty-safe", () => {
    expect(
      repo().getJevComparison({ since: "2000-01-01T00:00:00.000Z" }),
    ).toEqual({
      compared: 0,
      agreed: 0,
      agreementRate: null,
      llmMedianLatencyMs: null,
      jevMedianLatencyMs: null,
    });
  });
});
