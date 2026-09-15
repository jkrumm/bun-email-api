import type { ReactElement } from "react";
import { resend } from "./resend";
import { emailsRepo } from "../db";

const DEFAULT_FROM =
  "Free-Planning-Poker.com <no-reply@free-planning-poker.com>";

export async function sendMail({
  from = DEFAULT_FROM,
  to,
  replyTo,
  subject,
  template,
  source,
}: {
  from?: string;
  to: string;
  replyTo?: string;
  subject: string;
  template: ReactElement;
  // Our template/route id, e.g. "fpp-sender" — stored on the email row so
  // the admin API can filter sent mail by what generated it.
  source?: string;
}): Promise<void> {
  const email = await resend.emails.send({
    from,
    to,
    replyTo,
    subject,
    react: template,
  });

  if (email.error) {
    console.error("Email sent failed", {
      response: email,
      to,
      from,
      replyTo,
      subject,
    });
    throw new Error(
      `${email.error.statusCode ?? ""} - ${email.error.name} - ${email.error.message}`,
    );
  }

  console.log("Email sent successfully", {
    response: email,
    to,
    from,
    replyTo,
    subject,
  });

  // Minimal row now; the next sync fills html/last_event once Resend has
  // fully processed the send (src/sync/resend-sync.ts).
  emailsRepo.upsertEmail({
    id: email.data.id,
    direction: "outbound",
    fromAddress: from,
    toAddresses: [to],
    replyTo: replyTo ? [replyTo] : null,
    subject,
    createdAt: new Date().toISOString(),
    source: source ?? null,
  });
}
