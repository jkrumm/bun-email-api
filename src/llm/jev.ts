import { z } from "zod";
import { env } from "../env";

// Jev (TypeSafe AI "System One") is a decision model: typed answers with
// calibrated probabilities, no text generation. Reached through beatapi.io
// today; the official TypeSafe API has the identical request/response shape,
// so base URL and model are plain config.

export interface JevConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

interface ChoiceQuestion<Option extends string = string> {
  type: "choice";
  instructions?: string;
  criteria: Readonly<Record<Option, string>>;
}

interface NoulQuestion {
  type: "noul";
  instructions: string;
  criteria?: Readonly<{ true: string; false: string }>;
}

interface ScoreQuestion {
  type: "score";
  instructions?: string;
  criteria: readonly string[];
}

type JevQuestion = ChoiceQuestion | NoulQuestion | ScoreQuestion;

interface ChoiceAnswer<Option extends string = string> {
  type: "choice";
  choice: Option;
  probabilities: Record<string, number>;
  confidence: number;
}

interface NoulAnswer {
  type: "noul";
  // Probability of "yes" (0..1). The API returns no confidence for noul.
  noul: number;
}

interface ScoreAnswer {
  type: "score";
  score: number;
  legend: Record<string, unknown>;
  probabilities: Record<string, number>;
  confidence: number;
}

type JevAnswerFor<Q extends JevQuestion> =
  Q extends ChoiceQuestion<infer Option>
    ? ChoiceAnswer<Option>
    : Q extends NoulQuestion
      ? NoulAnswer
      : ScoreAnswer;

interface JevDecision<Questions extends Record<string, JevQuestion>> {
  answers: { [Key in keyof Questions]: JevAnswerFor<Questions[Key]> };
  usage: { inputTokens: number; outputTokens: number };
}

// Single model requests get a hang guard, never a tight timeout (house rule,
// see src/spam/classify.ts).
const JEV_HANG_GUARD_MS = 30 * 60_000;

const unit = z.number().min(0).max(1);
const probabilities = z.record(z.string(), unit);

const answerSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("choice"),
    choice: z.string(),
    probabilities,
    confidence: unit,
  }),
  z.object({ type: z.literal("noul"), noul: unit }),
  z.object({
    type: z.literal("score"),
    score: z.number(),
    legend: z.record(z.string(), z.unknown()),
    probabilities,
    confidence: unit,
  }),
]);

const responseSchema = z.object({
  answers: z.record(z.string(), answerSchema),
  usage: z
    .object({ input_tokens: z.number(), output_tokens: z.number() })
    .optional(),
});

function getJevConfig(): JevConfig | null {
  const { BEA_JEV_API_KEY, BEA_JEV_BASE_URL, BEA_JEV_MODEL } = env;
  if (!BEA_JEV_API_KEY) return null;
  return {
    apiKey: BEA_JEV_API_KEY,
    baseUrl: BEA_JEV_BASE_URL,
    model: BEA_JEV_MODEL,
  };
}

export async function decide<Questions extends Record<string, JevQuestion>>({
  state,
  questions,
  config = getJevConfig(),
  fetchImpl = fetch,
}: {
  state: string | Record<string, unknown>;
  questions: Questions;
  config?: JevConfig | null;
  fetchImpl?: typeof fetch;
}): Promise<JevDecision<Questions>> {
  if (!config) throw new Error("Jev not configured");

  const response = await fetchImpl(
    `${config.baseUrl.replace(/\/+$/, "")}/v1/systemone`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: config.model, state, questions }),
      signal: AbortSignal.timeout(JEV_HANG_GUARD_MS),
    },
  );

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 200);
    throw new Error(
      `Jev request failed: ${response.status}${detail ? ` ${detail}` : ""}`,
    );
  }

  const parsed = responseSchema.parse(await response.json());

  for (const [key, question] of Object.entries(questions)) {
    const answer = parsed.answers[key];
    if (!answer) throw new Error(`Jev response missing answer "${key}"`);
    if (answer.type !== question.type) {
      throw new Error(
        `Jev answer "${key}" is ${answer.type}, expected ${question.type}`,
      );
    }
    if (
      answer.type === "choice" &&
      question.type === "choice" &&
      !Object.hasOwn(question.criteria, answer.choice)
    ) {
      throw new Error(
        `Jev answer "${key}" chose unknown option "${answer.choice}"`,
      );
    }
  }

  return {
    // Keys and types were checked against `questions` above.
    answers: parsed.answers as unknown as JevDecision<Questions>["answers"],
    usage: {
      inputTokens: parsed.usage?.input_tokens ?? 0,
      outputTokens: parsed.usage?.output_tokens ?? 0,
    },
  };
}

interface JevShadowMeta {
  latencyMs: number;
  model: string;
  error: string | null;
}

// The one never-rejecting wrapper for shadow-mode callers: runs `decide`,
// maps the answers with `pick`, and turns any failure into `empty` plus an
// `error` string, so a Jev problem can never propagate into the authoritative
// path. Returns null when Jev is disabled (no API key).
export function decideShadow<
  Questions extends Record<string, JevQuestion>,
  Fields extends object,
>({
  label,
  state,
  questions,
  pick,
  empty,
  config = getJevConfig(),
  fetchImpl,
}: {
  label: string;
  state: string | Record<string, unknown>;
  questions: Questions;
  pick: (answers: JevDecision<Questions>["answers"]) => Fields;
  empty: { [Key in keyof Fields]: null };
  config?: JevConfig | null;
  fetchImpl?: typeof fetch;
}): Promise<(Fields | { [Key in keyof Fields]: null }) & JevShadowMeta> | null {
  if (!config) return null;

  const startedAt = Date.now();

  return decide({ config, fetchImpl, state, questions }).then(
    ({ answers }) => ({
      ...pick(answers),
      latencyMs: Date.now() - startedAt,
      model: config.model,
      error: null,
    }),
    (error) => {
      console.error(`Jev ${label} judgement failed`, { error });
      return {
        ...empty,
        latencyMs: Date.now() - startedAt,
        model: config.model,
        error: error instanceof Error ? error.message : String(error),
      };
    },
  );
}
