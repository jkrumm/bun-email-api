import nodemailer from "nodemailer";
import Mail from "nodemailer/lib/mailer";

export async function wrappedBulkSendMail(mailOptions: Mail.Options[]) {
  await Promise.all(
    mailOptions.map((mailOption) => wrappedSendMail(mailOption)),
  );
}

export async function wrappedSendMail(mailOptions: Mail.Options) {
  return new Promise((resolve, reject) => {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.BEA_GMAIL_EMAIL,
        pass: process.env.BEA_GMAIL_APP_PASSWORD,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    transporter.verify(function (error, success) {
      if (error) {
        reject(error);
      }
      if (!success) {
        reject(new Error("Failed to verify connection"));
      }
    });

    transporter.sendMail(mailOptions, function (error, info) {
      if (error) {
        reject(error);
      } else {
        resolve(info);
      }
    });
  });
}
