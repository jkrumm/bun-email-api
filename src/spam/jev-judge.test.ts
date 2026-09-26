import { describe, expect, test } from "bun:test";
import { judgeSubmissionWithJev } from "./jev-judge";

const config = { apiKey: "k", baseUrl: "https://jev.example.com", model: "m" };

describe("judgeSubmissionWithJev", () => {
  test("returns null when Jev is disabled", () => {
    expect(
      judgeSubmissionWithJev({
        source: "fpp",
        submission: {},
        config: null,
      }),
    ).toBeNull();
  });

  test("maps the choice answer and sends site context in state", async () => {
    let body: { state: Record<string, unknown> } | undefined;
    const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
      body = JSON.parse(init?.body as string);
      return new Response(
        JSON.stringify({
          answers: {
            verdict: {
              type: "choice",
              choice: "marketing",
              probabilities: { legit: 0, spam: 0, marketing: 1 },
              confidence: 1,
            },
          },
        }),
      );
    }) as unknown as typeof fetch;

    const outcome = await judgeSubmissionWithJev({
      source: "fpp",
      submission: { message: "SEO audit" },
      config,
      fetchImpl,
    })!;

    expect(outcome).toMatchObject({
      verdict: "marketing",
      confidence: 1,
      model: "m",
      error: null,
    });
    expect(outcome.latencyMs).toBeGreaterThanOrEqual(0);
    expect(body?.state.source).toBe("fpp");
    expect(JSON.stringify(body?.state.sites)).toContain("yacht charter");
  });

  test("captures a failure as an error outcome instead of rejecting", async () => {
    const fetchImpl = (async () =>
      new Response("boom", { status: 529 })) as unknown as typeof fetch;

    const outcome = await judgeSubmissionWithJev({
      source: "sy-serendipity",
      submission: {},
      config,
      fetchImpl,
    })!;

    expect(outcome.verdict).toBeNull();
    expect(outcome.error).toContain("529");
  });
});
