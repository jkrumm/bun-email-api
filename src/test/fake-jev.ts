import type { Experimental_EvaluationModel as EvaluationModel } from "ai";

type DoEvaluate = Extract<
  EvaluationModel,
  { doEvaluate: unknown }
>["doEvaluate"];
type Options = Parameters<DoEvaluate>[0];
type Result = Awaited<ReturnType<DoEvaluate>>;

// Fake gateway evaluation model: `respond` sees the options the SDK passes
// down (state, questions, abortSignal) and returns the raw model result.
export function fakeJevModel(
  respond: (options: Options) => Result | Promise<Result>,
) {
  const calls: Options[] = [];
  const model: EvaluationModel = {
    specificationVersion: "v4",
    provider: "fake",
    modelId: "fake-jev",
    supportedQuestionTypes: ["choice", "score", "boolean"],
    doEvaluate: async (options) => {
      calls.push(options);
      return respond(options);
    },
  };
  return { model, calls };
}

// The typesafe provider reports per-question choice confidence here.
export function typesafeConfidence(confidence: Record<string, number>) {
  return { typesafe: { confidence } };
}
