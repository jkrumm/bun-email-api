import { Resend } from "resend";
import { env } from "../env";

// Sending-only key: used by every route that sends transactional mail.
export const resend = new Resend(env.BEA_RESEND_API_KEY);

// Reading sent/received emails needs a full-access key. Falls back to the
// sending key, in which case the admin UI shows Resend's restricted-key error.
export const adminResend = env.BEA_RESEND_ADMIN_API_KEY
  ? new Resend(env.BEA_RESEND_ADMIN_API_KEY)
  : resend;
