import { Resend } from "resend";

const resend = new Resend(process.env.BEA_RESEND_API_KEY);

export async function sendMail({
  from,
  to,
  replyTo,
  subject,
  template,
}: {
  from?: string;
  to: string;
  replyTo?: string;
  subject: string;
  template: JSX.Element;
}): Promise<void> {
  if (!from) {
    from = "Free-Planning-Poker.com <no-reply@free-planning-poker.com>";
  }

  const email = await resend.emails.send({
    from,
    to,
    reply_to: replyTo ? replyTo : undefined,
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
      // @ts-ignore
      `${email.error["statusCode"] || ""} - ${email.error.name} - ${email.error.message}`,
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
