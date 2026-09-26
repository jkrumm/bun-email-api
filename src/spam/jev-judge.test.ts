import { describe, expect, test } from "bun:test";
import { fakeJevModel, typesafeConfidence } from "../test/fake-jev";
import { judgeSubmissionWithJev } from "./jev-judge";

const config = { apiKey: "k", model: "typesafe-ai/jev" };

describe("judgeSubmissionWithJev", () => {
  test("returns null when Jev is disabled", () => {
    expect(
      judgeSubmissionWithJev({ source: "fpp", submission: {}, config: null }),
    ).toBeNull();
  });

  test("maps the choice answer, taking confidence from provider metadata, and sends site context in state", async () => {
    const { model, calls } = fakeJevModel(() => ({
      answers: {
        verdict: {
          type: "choice",
          choice: "marketing",
          probabilities: { legit: 0, spam: 0, marketing: 1 },
        },
      },
      warnings: [],
      providerMetadata: typesafeConfidence({ verdict: 0.93 }),
    }));

    const outcome = await judgeSubmissionWithJev({
      source: "fpp",
      submission: { message: "SEO audit" },
      config,
      model,
    })!;

    expect(outcome).toMatchObject({
      verdict: "marketing",
      confidence: 0.93,
      probabilities: { legit: 0, spam: 0, marketing: 1 },
      model: "typesafe-ai/jev",
      error: null,
    });
    expect(outcome.latencyMs).toBeGreaterThanOrEqual(0);
    const state = calls[0]!.state as Record<string, unknown>;
    expect(state.source).toBe("fpp");
    expect(JSON.stringify(state.sites)).toContain("yacht charter");
  });

  test("captures a failure as an error outcome instead of rejecting", async () => {
    const { model } = fakeJevModel(() => {
      throw new Error("gateway 529");
    });

    const outcome = await judgeSubmissionWithJev({
      source: "sy-serendipity",
      submission: {},
      config,
      model,
    })!;

    expect(outcome.verdict).toBeNull();
    expect(outcome.error).toContain("529");
  });
});
