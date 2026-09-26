import type { EmailsRepo, EmailWithEnrichment } from "../db/emails";
import type { EnrichEmailOutcome } from "./enrich-email";
import { judgeEmailWithJev, startJevEnrichment } from "./jev-email";

export type ReEnrichResult =
  { status: "ok"; outcome: EnrichEmailOutcome } | { status: "busy" };

// Shared save/fail path for every caller that runs an enrichment: the
// background worker and reEnrichEmail below.
export function applyEnrichmentOutcome({
  emails,
  id,
  outcome,
}: {
  emails: EmailsRepo;
  id: string;
  outcome: EnrichEmailOutcome;
}): void {
  if (outcome.ok) {
    emails.saveEnrichment(id, outcome.result);
  } else {
    emails.markEnrichmentFailed(id, outcome.error);
  }
}

// The one path for a manual re-enrich (admin UI and API): reset, claim, run,
// save/fail. If another worker (the background worker, or another rolling
// deploy's container) already holds a fresh claim, resetEnrichment is a
// no-op and the claim below fails — callers surface that as "busy" instead
// of silently racing a second enrichment run for the same email.
export async function reEnrichEmail({
  emails,
  id,
  enrich,
  judgeJev = judgeEmailWithJev,
}: {
  emails: EmailsRepo;
  id: string;
  enrich: (email: EmailWithEnrichment) => Promise<EnrichEmailOutcome>;
  judgeJev?: typeof judgeEmailWithJev;
}): Promise<ReEnrichResult> {
  emails.resetEnrichment(id);

  if (!emails.claimEnrichment(id)) {
    return { status: "busy" };
  }

  const email = emails.getEmail(id)!;
  startJevEnrichment({ emails, email, judge: judgeJev });
  const outcome = await enrich(email);
  applyEnrichmentOutcome({ emails, id, outcome });

  return { status: "ok", outcome };
}
