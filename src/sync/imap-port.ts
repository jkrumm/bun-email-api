import { X509Certificate } from "node:crypto";
import { ImapFlow, type ImapFlowOptions } from "imapflow";
import { validDate } from "../utils/date";
import { normalizePem } from "../utils/pem";

// Port between the sync logic and an IMAP server. Deliberately read-only:
// there is no method that could set a flag, move or delete a message.
export interface ImapMessageInfo {
  uid: number;
  // Null when the server did not report a size; treated as oversized.
  size: number | null;
  internalDate: Date | null;
}

export interface ImapListing {
  messages: ImapMessageInfo[];
  // True when more messages exist beyond `messages` (limit reached).
  truncated: boolean;
}

export interface ImapMailbox {
  uidValidity: string;
  // Up to `limit` messages with uid > afterUid, ascending. Only a bounded UID
  // window is queried per round trip, so a large backlog is never listed at
  // once.
  listAfter(afterUid: number, limit: number): Promise<ImapListing>;
  // Full RFC 822 sources; a uid the server did not return is absent.
  fetchSources(uids: number[]): Promise<Map<number, Uint8Array>>;
  fetchHeaders(uid: number): Promise<Uint8Array | null>;
  // Which of these uids currently exist in the mailbox.
  existingUids(uids: number[]): Promise<Set<number>>;
  release(): void;
}

export interface ImapSession {
  openMailbox(path: string): Promise<ImapMailbox>;
  close(): Promise<void>;
}

export interface ImapPort {
  connect(): Promise<ImapSession>;
}

export interface ImapConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  mailboxes: string[];
  tlsCert?: string;
  tlsInsecure: boolean;
}

// The subset of ImapFlow the adapter uses, so tests can supply a fake.
export type ImapClient = Pick<
  ImapFlow,
  | "on"
  | "connect"
  | "logout"
  | "close"
  | "usable"
  | "mailbox"
  | "getMailboxLock"
  | "fetchAll"
  | "fetchOne"
>;

export type ImapClientFactory = (options: ImapFlowOptions) => ImapClient;

// Plain network timeouts (not an agent budget): a stalled Bridge must fail the
// tick instead of holding the sync lock forever.
export const CONNECTION_TIMEOUT_MS = 30_000;
export const GREETING_TIMEOUT_MS = 15_000;
export const SOCKET_TIMEOUT_MS = 60_000;

// One UID window per FETCH round trip while listing.
const LIST_WINDOW = 2_000;

export function tlsOptions(
  config: Pick<ImapConfig, "tlsCert" | "tlsInsecure">,
) {
  if (config.tlsCert) {
    const pem = normalizePem(config.tlsCert);
    // Pin the exact certificate: trust it as the only anchor AND require the
    // presented certificate to be that very one, so a CA certificate
    // configured by mistake can't vouch for anything else it signed.
    // Hostname matching is skipped: Bridge issues for localhost while we
    // connect over the tailnet.
    const pinned = new X509Certificate(pem).fingerprint256;
    return {
      ca: [pem],
      checkServerIdentity: (
        _host: string,
        cert: { fingerprint256?: string },
      ) =>
        cert.fingerprint256 === pinned
          ? undefined
          : new Error("IMAP server certificate does not match the pinned one"),
    };
  }
  if (config.tlsInsecure) return { rejectUnauthorized: false };
  return {};
}

export function createImapflowPort(
  config: ImapConfig,
  {
    createClient = (options) => new ImapFlow(options),
  }: { createClient?: ImapClientFactory } = {},
): ImapPort {
  return {
    async connect() {
      const client = createClient({
        host: config.host,
        port: config.port,
        secure: false,
        // Refuse to log in unless the connection was upgraded via STARTTLS.
        doSTARTTLS: true,
        auth: { user: config.user, pass: config.password },
        tls: tlsOptions(config),
        logger: false,
        disableAutoIdle: true,
        connectionTimeout: CONNECTION_TIMEOUT_MS,
        greetingTimeout: GREETING_TIMEOUT_MS,
        socketTimeout: SOCKET_TIMEOUT_MS,
      });
      // Without a listener an emitted socket error (including timeouts)
      // would crash the process.
      client.on("error", (error: unknown) => {
        console.error("[imap] connection error", { error });
      });

      try {
        await client.connect();
      } catch (error) {
        client.close();
        throw error;
      }

      const close = async () => {
        if (!client.usable) {
          client.close();
          return;
        }
        try {
          await client.logout();
        } catch {
          client.close();
        }
      };

      return {
        close,
        async openMailbox(path) {
          const lock = await client.getMailboxLock(path, { readOnly: true });
          const mailbox = client.mailbox;
          if (!mailbox) {
            lock.release();
            throw new Error(`mailbox ${path} did not open`);
          }

          return {
            uidValidity: mailbox.uidValidity.toString(),
            async listAfter(afterUid, limit) {
              const found: ImapMessageInfo[] = [];
              let start = afterUid + 1;

              // Explicit `a:b` ranges only return existing messages (unlike
              // `N:*`, which always yields the newest one), and UIDs may be
              // sparse, so walk windows up to UIDNEXT until `limit` is met.
              while (start < mailbox.uidNext && found.length <= limit) {
                const end = start + LIST_WINDOW - 1;
                const messages = await client.fetchAll(
                  `${start}:${end}`,
                  { uid: true, size: true, internalDate: true },
                  { uid: true },
                );
                for (const message of messages) {
                  if (message.uid <= afterUid) continue;
                  found.push({
                    uid: message.uid,
                    size: message.size ?? null,
                    internalDate: validDate(message.internalDate),
                  });
                }
                start = end + 1;
              }

              found.sort((a, b) => a.uid - b.uid);
              return {
                messages: found.slice(0, limit),
                truncated: found.length > limit || start < mailbox.uidNext,
              };
            },
            async fetchSources(uids) {
              const sources = new Map<number, Uint8Array>();
              if (uids.length === 0) return sources;
              // source fetches use BODY.PEEK, so \Seen is never set.
              const messages = await client.fetchAll(
                uids,
                { uid: true, source: true },
                { uid: true },
              );
              for (const message of messages) {
                if (message.source) sources.set(message.uid, message.source);
              }
              return sources;
            },
            async fetchHeaders(uid) {
              const message = await client.fetchOne(
                String(uid),
                { uid: true, headers: true },
                { uid: true },
              );
              return message ? (message.headers ?? null) : null;
            },
            async existingUids(uids) {
              if (uids.length === 0) return new Set();
              const messages = await client.fetchAll(
                uids,
                { uid: true },
                { uid: true },
              );
              return new Set(messages.map((message) => message.uid));
            },
            release: () => lock.release(),
          };
        },
      };
    },
  };
}
