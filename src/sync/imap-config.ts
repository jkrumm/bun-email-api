import { env } from "../env";
import type { ImapConfig } from "./imap-port";

type ImapEnv = Pick<
  typeof env,
  | "BEA_IMAP_HOST"
  | "BEA_IMAP_PORT"
  | "BEA_IMAP_USER"
  | "BEA_IMAP_PASSWORD"
  | "BEA_IMAP_MAILBOXES"
  | "BEA_IMAP_TLS_CERT"
  | "BEA_IMAP_TLS_INSECURE"
>;

// Undefined when IMAP ingest isn't configured. env.ts already rejected a host
// without credentials at startup.
export function imapConfigFromEnv(
  source: ImapEnv = env,
): ImapConfig | undefined {
  if (
    !source.BEA_IMAP_HOST ||
    !source.BEA_IMAP_USER ||
    !source.BEA_IMAP_PASSWORD
  ) {
    return undefined;
  }

  return {
    host: source.BEA_IMAP_HOST,
    port: source.BEA_IMAP_PORT,
    user: source.BEA_IMAP_USER,
    password: source.BEA_IMAP_PASSWORD,
    mailboxes: source.BEA_IMAP_MAILBOXES.split(",")
      .map((mailbox) => mailbox.trim())
      .filter(Boolean),
    tlsCert: source.BEA_IMAP_TLS_CERT,
    tlsInsecure: source.BEA_IMAP_TLS_INSECURE,
  };
}
