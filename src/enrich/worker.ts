import { emailsRepo } from "../db";
import { getLlmConfig } from "../llm/model";
import { enrichEmail } from "./enrich-email";
import { applyEnrichmentOutcome } from "./re-enrich";

const BATCH_SIZE = 10;
const INTERVAL_MS = 30_000;

let running = false;

// Sequential by design (concurrency 1): enrichment isn't latency-sensitive
// and running two LLM calls at once buys nothing at this volume while
// making Resend/LLM rate limits harder to reason about.
export async function runEnrichmentBatch(): Promise<void> {
  if (running) return;
  if (!getLlmConfig()) return;

  running = true;
  try {
    const pending = emailsRepo.listPendingEnrichment(BATCH_SIZE);

    for (const { emailId } of pending) {
      const claimed = emailsRepo.claimEnrichment(emailId);
      if (!claimed) continue;

      const email = emailsRepo.getEmail(emailId);
      if (!email) continue;

      const outcome = await enrichEmail({ email });
      applyEnrichmentOutcome({ emails: emailsRepo, id: emailId, outcome });
    }
  } finally {
    running = false;
  }
}

export function startEnrichmentWorker(): void {
  if (process.env.NODE_ENV === "test") return;
  if (!getLlmConfig()) {
    console.log("[enrich] LLM not configured — enrichment rows stay pending");
    return;
  }

  const interval = setInterval(() => {
    void runEnrichmentBatch().catch((error) => {
      console.error("Scheduled enrichment batch failed", { error });
    });
  }, INTERVAL_MS);
  interval.unref();
}
