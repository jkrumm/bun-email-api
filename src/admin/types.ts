import type { Resend } from "resend";

// The admin UI only ever calls these four methods on the Resend client.
// Defined via Pick against the real SDK class so the response/option types
// stay in sync with whatever `resend` (or a test fake) provides.
export type AdminResend = {
  emails: Pick<Resend["emails"], "list" | "get"> & {
    receiving: Pick<Resend["emails"]["receiving"], "list" | "get">;
  };
};
