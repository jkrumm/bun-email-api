import { describe, expect, test } from "bun:test";
import { fakeJevModel, typesafeConfidence } from "../test/fake-jev";
import { CATEGORIES } from "./categories";
import { judgeEmailWithJev } from "./jev-email";

const config = { apiKey: "k", model: "typesafe-ai/jev" };
const payload = {
  direction: "inbound" as const,
  from: "a@example.com",
  to: ["me@example.com"],
  subject: "Charter",
  text: "Hi",
};

describe("judgeEmailWithJev", () => {
  test("returns null when Jev is disabled", () => {
    expect(judgeEmailWithJev({ payload, config: null })).toBeNull();
  });

  test("asks spam + category (same category set as the LLM) in one call", async () => {
    const { model, calls } = fakeJevModel(() => ({
      answers: {
        spam: { type: "boolean", probability: 0.04 },
        category: {
          type: "choice",
          choice: "inquiry",
          probabilities: Object.fromEntries(
            CATEGORIES.map((category) => [
              category,
              category === "inquiry" ? 0.9 : 0.01,
            ]),
          ),
        },
      },
      warnings: [],
      providerMetadata: typesafeConfidence({ category: 0.88 }),
    }));

    const outcome = await judgeEmailWithJev({
      payload,
      config,
      model,
    })!;

    expect(outcome).toMatchObject({
      spamProbability: 0.04,
      category: "inquiry",
      categoryConfidence: 0.88,
      error: null,
    });
    expect(calls).toHaveLength(1);
    const asked = calls[0]!.questions;
    expect(asked.spam!.type).toBe("boolean");
    expect(Object.keys(asked.category!.criteria as object)).toEqual([
      ...CATEGORIES,
    ]);
  });

  test("captures a failure as an error result instead of rejecting", async () => {
    const { model } = fakeJevModel(() => {
      throw new Error("gateway 401");
    });

    const outcome = await judgeEmailWithJev({ payload, config, model })!;

    expect(outcome.spamProbability).toBeNull();
    expect(outcome.error).toContain("401");
  });
});
