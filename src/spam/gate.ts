import { classifySubmission, shouldSuppress } from "./classify";
import { judgeSubmissionWithJev } from "./jev-judge";
import { submissionsRepo } from "../db";
import type { ClassificationResult } from "./classify";
import type {
  JevSubmissionView,
  RecordSubmissionInput,
  SubmissionSource,
} from "../db/submissions";

// Callers of /fpp and /sy-serendipity are a Netlify function (~10-26s limit)
// and Cloudflare edge (~100s) — waiting for the full classifySubmission call
// (bounded only by its 30-min hang guard) would time them out. This deadline
// makes the delivery decision fail open instead; the classification keeps
// running in the background and its verdict is recorded late.
export const CLASSIFY_DECISION_DEADLINE_MS = 8_000;

type RecordSubmission = typeof submissionsRepo.recordSubmission;

type Persist = (
  input: Omit<RecordSubmissionInput, "llmLatencyMs" | "jev">,
) => void;

// Jev is shadow-only: it runs beside the classifier, never delays or changes
// the decision, and is recorded whenever it lands. `snapshot()` is what has
// landed so far (stored with the row); `attachLater()` covers a row written
// before Jev answered. Every failure path is log-only.
function trackJev({
  start,
  attach,
}: {
  start: () => Promise<JevSubmissionView> | null;
  attach: typeof submissionsRepo.attachJev;
}) {
  let landed: JevSubmissionView | null = null;
  let pending: Promise<JevSubmissionView> | null = null;

  try {
    pending = start();
  } catch (error) {
    console.error("Failed to start Jev verdict", { error });
  }

  pending
    ?.then((outcome) => {
      landed = outcome;
    })
    .catch((error) => {
      console.error("Jev verdict failed", { error });
    });

  return {
    snapshot: () => landed,
    attachLater(id: string): void {
      if (!pending || landed) return;
      pending
        .then((outcome) => attach(id, outcome))
        .catch((error) => {
          console.error("Failed to record Jev verdict", { error });
        });
    },
  };
}

export async function gateSubmission({
  source,
  submission,
  deliver,
  classify = classifySubmission,
  record = submissionsRepo.recordSubmission,
  attachJev = submissionsRepo.attachJev,
  jev = judgeSubmissionWithJev,
  deadlineMs = CLASSIFY_DECISION_DEADLINE_MS,
}: {
  source: SubmissionSource;
  submission: Record<string, string | number | null>;
  deliver: (opts: { subjectPrefix: string }) => Promise<void>;
  classify?: typeof classifySubmission;
  record?: RecordSubmission;
  attachJev?: typeof submissionsRepo.attachJev;
  jev?: typeof judgeSubmissionWithJev;
  deadlineMs?: number;
}): Promise<{ delivered: boolean }> {
  const startedAt = Date.now();
  let llmLatencyMs: number | null = null;
  const classification = classify({ source, submission }).then((verdict) => {
    llmLatencyMs = Date.now() - startedAt;
    return verdict;
  });

  const shadow = trackJev({
    start: () => jev({ source, submission }),
    attach: attachJev,
  });

  // A DB write here must never turn an already-delivered (or intentionally
  // suppressed) submission into a 500 for the caller — that would make a
  // Netlify/Cloudflare retry and send a duplicate email. Log and move on.
  const persist: Persist = (input) => {
    try {
      const saved = record({
        ...input,
        llmLatencyMs,
        jev: shadow.snapshot(),
      });
      shadow.attachLater(saved.id);
    } catch (error) {
      console.error("Failed to record submission", { error });
    }
  };

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
      persist,
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
        persist({
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
      persist({
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
  persist,
  verdict,
}: {
  source: SubmissionSource;
  submission: Record<string, string | number | null>;
  deliver: (opts: { subjectPrefix: string }) => Promise<void>;
  persist: Persist;
  verdict: ClassificationResult;
}): Promise<{ delivered: boolean }> {
  if (shouldSuppress(verdict)) {
    persist({
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
    persist({
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

  persist({
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
