import { Resend } from "resend";
import { env } from "../env";

// The single shared Resend client — every route that talks to Resend
// (transactional sends, the admin UI) imports this instead of constructing
// its own.
export const resend = new Resend(env.BEA_RESEND_API_KEY);
