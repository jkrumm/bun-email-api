import { classifySubmission, shouldSuppress } from "./classify";
import { recordVerdict } from "./store";
import type { ClassificationResult } from "./classify";
import type { SubmissionSource } from "./store";

// Callers of /fpp and /sy-serendipity are a Netlify function (~10-26s limit)
// and Cloudflare edge (~100s) — waiting for the full classifySubmission call
// (bounded only by its 30-min hang guard) would time them out. This deadline
// makes the delivery decision fail open instead; the classification keeps
// running in the background and its verdict is recorded late.
export const CLASSIFY_DECISION_DEADLINE_MS = 8_000;

export async function gateSubmission({
  source,
  submission,
  deliver,
  classify = classifySubmission,
  deadlineMs = CLASSIFY_DECISION_DEADLINE_MS,
}: {
  source: SubmissionSource;
  submission: Record<string, string | number | null>;
  deliver: (opts: { subjectPrefix: string }) => Promise<void>;
  classify?: typeof classifySubmission;
  deadlineMs?: number;
}): Promise<{ delivered: boolean }> {
  const classification = classify({ source, submission });

  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<{ kind: "deadline" }>((resolve) => {
    timer = setTimeout(() => resolve({ kind: "deadline" }), deadlineMs);
  });

  const winner = await Promise.race([
    classification.then(
      (verdict) => ({ kind: "classified" as const, verdict }) as const,
    ),
    deadline,
  ]);

  if (winner.kind === "classified") {
    clearTimeout(timer!);
    return handleClassified({
      source,
      submission,
      deliver,
      verdict: winner.verdict,
    });
  }

  // Deadline won: fail open. The classification is still running — never
  // abort it, just stop waiting on it and record its verdict once it lands.
  console.log(`${source} submission: classification deadline hit, delivering`);

  try {
    await deliver({ subjectPrefix: "" });
  } catch (error) {
    void classification
      .then((verdict) =>
        recordVerdict({
          source,
          verdict: verdict.verdict,
          confidence: verdict.confidence,
          reason: `Decided after deadline: ${verdict.reason} · delivery failed`,
          model: verdict.model,
          delivered: false,
          submission,
        }),
      )
      .catch((backgroundError) => {
        console.error("Background classification failed after deadline", {
          source,
          error: backgroundError,
        });
      });
    throw error;
  }

  void classification
    .then((verdict) => {
      recordVerdict({
        source,
        verdict: verdict.verdict,
        confidence: verdict.confidence,
        reason: `Decided after deadline: ${verdict.reason}`,
        model: verdict.model,
        delivered: true,
        submission,
      });
      console.log(
        `${source} submission: late verdict verdict=${verdict.verdict} confidence=${verdict.confidence}`,
      );
    })
    .catch((error) => {
      console.error("Background classification failed after deadline", {
        source,
        error,
      });
    });

  return { delivered: true };
}

async function handleClassified({
  source,
  submission,
  deliver,
  verdict,
}: {
  source: SubmissionSource;
  submission: Record<string, string | number | null>;
  deliver: (opts: { subjectPrefix: string }) => Promise<void>;
  verdict: ClassificationResult;
}): Promise<{ delivered: boolean }> {
  if (shouldSuppress(verdict)) {
    recordVerdict({
      source,
      verdict: verdict.verdict,
      confidence: verdict.confidence,
      reason: verdict.reason,
      model: verdict.model,
      delivered: false,
      submission,
    });
    console.log(
      `${source} submission suppressed: verdict=${verdict.verdict} confidence=${verdict.confidence}`,
    );
    return { delivered: false };
  }

  const subjectPrefix = verdict.verdict !== "legit" ? "[Possible spam] " : "";

  try {
    await deliver({ subjectPrefix });
  } catch (error) {
    recordVerdict({
      source,
      verdict: verdict.verdict,
      confidence: verdict.confidence,
      reason: `${verdict.reason} · delivery failed`,
      model: verdict.model,
      delivered: false,
      submission,
    });
    throw error;
  }

  recordVerdict({
    source,
    verdict: verdict.verdict,
    confidence: verdict.confidence,
    reason: verdict.reason,
    model: verdict.model,
    delivered: true,
    submission,
  });
  console.log(`${source} submission delivered: verdict=${verdict.verdict}`);
  return { delivered: true };
}
