import type { ReactElement } from "react";
import { Resend } from "resend";
import { env } from "../env";

const resend = new Resend(env.BEA_RESEND_API_KEY);

const DEFAULT_FROM =
  "Free-Planning-Poker.com <no-reply@free-planning-poker.com>";

export async function sendMail({
  from = DEFAULT_FROM,
  to,
  replyTo,
  subject,
  template,
}: {
  from?: string;
  to: string;
  replyTo?: string;
  subject: string;
  template: ReactElement;
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
}
