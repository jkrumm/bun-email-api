import { describe, expect, test } from "bun:test";
import { CATEGORIES } from "./categories";
import { judgeEmailWithJev } from "./jev-email";

const config = { apiKey: "k", baseUrl: "https://jev.example.com", model: "m" };

describe("judgeEmailWithJev", () => {
  test("returns null when Jev is disabled", () => {
    expect(judgeEmailWithJev({ payload: {}, config: null })).toBeNull();
  });

  test("asks spam + category (same category set as the LLM) in one call", async () => {
    let body: { questions: Record<string, { criteria: object }> } | undefined;
    const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
      body = JSON.parse(init?.body as string);
      return new Response(
        JSON.stringify({
          answers: {
            spam: { type: "noul", noul: 0.04 },
            category: {
              type: "choice",
              choice: "inquiry",
              probabilities: { inquiry: 0.9 },
              confidence: 0.9,
            },
          },
        }),
      );
    }) as unknown as typeof fetch;

    const outcome = await judgeEmailWithJev({
      payload: { subject: "Charter" },
      config,
      fetchImpl,
    })!;

    expect(outcome).toMatchObject({
      spamProbability: 0.04,
      category: "inquiry",
      categoryConfidence: 0.9,
      error: null,
    });
    expect(Object.keys(body!.questions.category!.criteria)).toEqual([
      ...CATEGORIES,
    ]);
  });

  test("captures a failure as an error result instead of rejecting", async () => {
    const fetchImpl = (async () =>
      new Response("nope", { status: 401 })) as unknown as typeof fetch;

    const outcome = await judgeEmailWithJev({
      payload: {},
      config,
      fetchImpl,
    })!;

    expect(outcome.spamProbability).toBeNull();
    expect(outcome.error).toContain("401");
  });
});
