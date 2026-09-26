import { describe, expect, test } from "bun:test";
import { decide, decideShadow, type JevConfig } from "./jev";

const config: JevConfig = {
  apiKey: "test-key",
  baseUrl: "https://jev.example.com/",
  model: "jev-test",
};

const questions = {
  verdict: {
    type: "choice",
    criteria: { legit: "genuine", spam: "junk" },
  },
  is_spam: { type: "noul", instructions: "Is this spam?" },
  tone: { type: "score", criteria: ["low", "mid", "high"] },
} as const;

const answers = {
  verdict: {
    type: "choice",
    choice: "spam",
    probabilities: { legit: 0.02, spam: 0.98 },
    confidence: 0.97,
  },
  is_spam: { type: "noul", noul: 0.96 },
  tone: {
    type: "score",
    score: 2,
    legend: { "1": "low", "2": "mid", "3": "high" },
    probabilities: { "1": 0.1, "2": 0.8, "3": 0.1 },
    confidence: 0.8,
  },
};

function fakeFetch(
  respond: (request: { url: string; init: RequestInit }) => Response,
) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {} };
    calls.push(call);
    return respond(call);
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("decide", () => {
  test("sends the documented request and returns typed answers", async () => {
    const { impl, calls } = fakeFetch(() =>
      json({
        id: "d1",
        model: "jev-test",
        answers,
        usage: { input_tokens: 120, output_tokens: 8 },
      }),
    );

    const result = await decide({
      config,
      fetchImpl: impl,
      state: { subject: "SEO audit" },
      questions,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://jev.example.com/v1/systemone");
    expect(calls[0]!.init.method).toBe("POST");
    expect(
      (calls[0]!.init.headers as Record<string, string>).Authorization,
    ).toBe("Bearer test-key");
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      model: "jev-test",
      state: { subject: "SEO audit" },
      questions,
    });

    // Types narrow by question type: choice → .choice, noul → .noul.
    const choice: "legit" | "spam" = result.answers.verdict.choice;
    expect(choice).toBe("spam");
    expect(result.answers.verdict.confidence).toBe(0.97);
    expect(result.answers.is_spam.noul).toBe(0.96);
    expect(result.answers.tone.score).toBe(2);
    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 8 });
  });

  test("throws when Jev is not configured", async () => {
    const { impl, calls } = fakeFetch(() => json({}));
    await expect(
      decide({ config: null, fetchImpl: impl, state: "x", questions }),
    ).rejects.toThrow("Jev not configured");
    expect(calls).toHaveLength(0);
  });

  test("throws with the status on a non-2xx response", async () => {
    const { impl } = fakeFetch(() => json({ error: "rate limited" }, 429));
    await expect(
      decide({ config, fetchImpl: impl, state: "x", questions }),
    ).rejects.toThrow("Jev request failed: 429");
  });

  test("rejects a malformed response body", async () => {
    const { impl } = fakeFetch(() => json({ answers: { verdict: {} } }));
    await expect(
      decide({ config, fetchImpl: impl, state: "x", questions }),
    ).rejects.toThrow();
  });

  test("rejects an answer whose type differs from the question", async () => {
    const { impl } = fakeFetch(() =>
      json({ answers: { ...answers, is_spam: answers.verdict } }),
    );
    await expect(
      decide({ config, fetchImpl: impl, state: "x", questions }),
    ).rejects.toThrow('"is_spam" is choice, expected noul');
  });

  test("rejects a choice outside the question's options", async () => {
    const { impl } = fakeFetch(() =>
      json({
        answers: { ...answers, verdict: { ...answers.verdict, choice: "?" } },
      }),
    );
    await expect(
      decide({ config, fetchImpl: impl, state: "x", questions }),
    ).rejects.toThrow('unknown option "?"');
  });

  test("rejects a response missing a requested answer", async () => {
    const { impl } = fakeFetch(() =>
      json({ answers: { verdict: answers.verdict } }),
    );
    await expect(
      decide({ config, fetchImpl: impl, state: "x", questions }),
    ).rejects.toThrow('missing answer "is_spam"');
  });

  test("rejects probabilities and confidence outside 0..1", async () => {
    for (const bad of [
      { ...answers.verdict, confidence: 1.5 },
      { ...answers.verdict, probabilities: { legit: -0.1, spam: 1.1 } },
    ]) {
      const { impl } = fakeFetch(() =>
        json({ answers: { ...answers, verdict: bad } }),
      );
      await expect(
        decide({ config, fetchImpl: impl, state: "x", questions }),
      ).rejects.toThrow();
    }
  });

  test("rejects an inherited property name as a choice", async () => {
    const { impl } = fakeFetch(() =>
      json({
        answers: {
          ...answers,
          verdict: { ...answers.verdict, choice: "toString" },
        },
      }),
    );
    await expect(
      decide({ config, fetchImpl: impl, state: "x", questions }),
    ).rejects.toThrow('unknown option "toString"');
  });
});

describe("decideShadow", () => {
  const pick = ({ is_spam }: { is_spam: { noul: number } }) => ({
    spam: is_spam.noul,
  });
  const shadowQuestions = { is_spam: questions.is_spam };

  test("returns null when disabled", () => {
    expect(
      decideShadow({
        label: "t",
        state: "x",
        questions: shadowQuestions,
        pick,
        empty: { spam: null },
        config: null,
      }),
    ).toBeNull();
  });

  test("maps answers on success and folds failures into `error`", async () => {
    const ok = fakeFetch(() => json({ answers: { is_spam: answers.is_spam } }));
    const success = await decideShadow({
      label: "t",
      state: "x",
      questions: shadowQuestions,
      pick,
      empty: { spam: null },
      config,
      fetchImpl: ok.impl,
    })!;
    expect(success).toMatchObject({
      spam: 0.96,
      model: "jev-test",
      error: null,
    });

    const bad = fakeFetch(() => json({}, 529));
    const failure = await decideShadow({
      label: "t",
      state: "x",
      questions: shadowQuestions,
      pick,
      empty: { spam: null },
      config,
      fetchImpl: bad.impl,
    })!;
    expect(failure.spam).toBeNull();
    expect(failure.error).toContain("529");
  });
});
