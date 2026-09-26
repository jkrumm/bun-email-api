import { X509Certificate } from "node:crypto";
import { describe, expect, test } from "bun:test";
import {
  CONNECTION_TIMEOUT_MS,
  createImapflowPort,
  GREETING_TIMEOUT_MS,
  SOCKET_TIMEOUT_MS,
  tlsOptions,
  type ImapClient,
  type ImapConfig,
} from "./imap-port";
import { CERT_A, CERT_B } from "../test/certs";

const config: ImapConfig = {
  host: "bridge.example",
  port: 1143,
  user: "hello",
  password: "secret",
  mailboxes: ["INBOX"],
  tlsInsecure: false,
};

interface FakeFetched {
  uid: number;
  size?: number;
  internalDate?: Date | string;
  source?: Buffer;
  headers?: Buffer;
}

// Implements ONLY the read-only surface: any other ImapFlow method (flag,
// move, delete, ...) is undefined here, so calling one throws a TypeError.
function createFakeClient({
  fetched = [],
  mailbox = { uidValidity: 42n, uidNext: 100 },
  usable = true,
  logoutFails = false,
  connectFails = false,
}: {
  fetched?: FakeFetched[];
  mailbox?: { uidValidity: bigint; uidNext: number } | false;
  usable?: boolean;
  logoutFails?: boolean;
  connectFails?: boolean;
} = {}) {
  const record = {
    options: undefined as Record<string, unknown> | undefined,
    lockCalls: [] as [string, unknown][],
    fetchAllCalls: [] as [unknown, unknown, unknown][],
    fetchOneCalls: [] as [unknown, unknown, unknown][],
    released: 0,
    logouts: 0,
    closes: 0,
    errorHandlers: 0,
  };

  const client = {
    usable,
    mailbox,
    on: () => {
      record.errorHandlers++;
      return client;
    },
    connect: async () => {
      if (connectFails) throw new Error("greeting timeout");
    },
    logout: async () => {
      record.logouts++;
      if (logoutFails) throw new Error("connection closed");
    },
    close: () => {
      record.closes++;
    },
    getMailboxLock: async (path: string, options: unknown) => {
      record.lockCalls.push([path, options]);
      return { path, release: () => record.released++ };
    },
    fetchAll: async (range: unknown, query: unknown, options: unknown) => {
      record.fetchAllCalls.push([range, query, options]);
      return fetched;
    },
    fetchOne: async (seq: unknown, query: unknown, options: unknown) => {
      record.fetchOneCalls.push([seq, query, options]);
      return fetched[0] ?? false;
    },
  } as unknown as ImapClient;

  const createClient = (options: Record<string, unknown>) => {
    record.options = options;
    return client;
  };

  return { record, createClient: createClient as never };
}

describe("createImapflowPort", () => {
  test("connects with STARTTLS-only, timeouts and no logger", async () => {
    const { record, createClient } = createFakeClient();

    await createImapflowPort(config, { createClient }).connect();

    expect(record.options).toMatchObject({
      host: "bridge.example",
      port: 1143,
      secure: false,
      doSTARTTLS: true,
      logger: false,
      auth: { user: "hello", pass: "secret" },
      connectionTimeout: CONNECTION_TIMEOUT_MS,
      greetingTimeout: GREETING_TIMEOUT_MS,
      socketTimeout: SOCKET_TIMEOUT_MS,
    });
    // An error listener is attached so socket errors can't crash the process.
    expect(record.errorHandlers).toBe(1);
    // A hostname is its own SNI; only IP hosts get an explicit servername.
    expect(record.options).not.toHaveProperty("servername");
  });

  test("an IP host gets a string servername (Bun rejects imapflow's false)", async () => {
    const { record, createClient } = createFakeClient();

    await createImapflowPort(
      { ...config, host: "100.64.0.1" },
      { createClient },
    ).connect();

    expect(record.options).toMatchObject({ servername: "localhost" });
  });

  test("a failed connect closes the client and rethrows", async () => {
    const { record, createClient } = createFakeClient({ connectFails: true });

    await expect(
      createImapflowPort(config, { createClient }).connect(),
    ).rejects.toThrow("greeting timeout");
    expect(record.closes).toBe(1);
  });

  test("opens mailboxes read-only and reports UIDVALIDITY as a string", async () => {
    const { record, createClient } = createFakeClient();
    const session = await createImapflowPort(config, {
      createClient,
    }).connect();

    const mailbox = await session.openMailbox("Spam");

    expect(record.lockCalls).toEqual([["Spam", { readOnly: true }]]);
    expect(mailbox.uidValidity).toBe("42");
    mailbox.release();
    expect(record.released).toBe(1);
  });

  test("releases the lock and throws when the mailbox did not open", async () => {
    const { record, createClient } = createFakeClient({ mailbox: false });
    const session = await createImapflowPort(config, {
      createClient,
    }).connect();

    await expect(session.openMailbox("INBOX")).rejects.toThrow(
      "mailbox INBOX did not open",
    );
    expect(record.released).toBe(1);
  });

  test("listAfter drops the phantom 'N:*' message, sorts ascending and normalises dates and sizes", async () => {
    const { record, createClient } = createFakeClient({
      fetched: [
        { uid: 30, size: 300, internalDate: "garbage" },
        { uid: 5, size: 50 }, // already-seen uid the server returned anyway
        { uid: 12, internalDate: new Date("2026-09-15T07:00:00.000Z") },
        { uid: 20, size: 200, internalDate: new Date("not a date") },
      ],
    });
    const session = await createImapflowPort(config, {
      createClient,
    }).connect();
    const mailbox = await session.openMailbox("INBOX");

    const { messages, truncated } = await mailbox.listAfter(10, 100);

    expect(messages).toEqual([
      {
        uid: 12,
        size: null,
        internalDate: new Date("2026-09-15T07:00:00.000Z"),
      },
      { uid: 20, size: 200, internalDate: null },
      { uid: 30, size: 300, internalDate: null },
    ]);
    expect(truncated).toBe(false);
    expect(record.fetchAllCalls).toEqual([
      ["11:2010", { uid: true, size: true, internalDate: true }, { uid: true }],
    ]);
  });

  test("listAfter walks bounded UID windows and reports truncation", async () => {
    const { record, createClient } = createFakeClient({
      mailbox: { uidValidity: 1n, uidNext: 10_000 },
      fetched: [], // sparse mailbox: every window is empty
    });
    const session = await createImapflowPort(config, {
      createClient,
    }).connect();
    const mailbox = await session.openMailbox("INBOX");

    const listing = await mailbox.listAfter(0, 10);

    expect(record.fetchAllCalls.map(([range]) => range)).toEqual([
      "1:2000",
      "2001:4000",
      "4001:6000",
      "6001:8000",
      "8001:10000",
    ]);
    expect(listing).toEqual({ messages: [], truncated: false });
  });

  test("listAfter stops at the limit and flags more pending", async () => {
    const { record, createClient } = createFakeClient({
      mailbox: { uidValidity: 1n, uidNext: 10_000 },
      fetched: Array.from({ length: 5 }, (_, i) => ({ uid: i + 1, size: 1 })),
    });
    const session = await createImapflowPort(config, {
      createClient,
    }).connect();
    const mailbox = await session.openMailbox("INBOX");

    const listing = await mailbox.listAfter(0, 3);

    expect(listing.messages.map((m) => m.uid)).toEqual([1, 2, 3]);
    expect(listing.truncated).toBe(true);
    expect(record.fetchAllCalls).toHaveLength(1);
  });

  test("uses only fetchAll/fetchOne, always by UID, for sources, headers and existence", async () => {
    const { record, createClient } = createFakeClient({
      fetched: [
        { uid: 7, source: Buffer.from("raw"), headers: Buffer.from("h") },
      ],
    });
    const session = await createImapflowPort(config, {
      createClient,
    }).connect();
    const mailbox = await session.openMailbox("INBOX");

    const sources = await mailbox.fetchSources([7, 8]);
    const headers = await mailbox.fetchHeaders(7);
    const existing = await mailbox.existingUids([7, 8]);

    expect(Buffer.from(sources.get(7)!).toString()).toBe("raw");
    expect(sources.has(8)).toBe(false);
    expect(Buffer.from(headers!).toString()).toBe("h");
    expect(existing).toEqual(new Set([7]));
    expect(record.fetchAllCalls).toEqual([
      [[7, 8], { uid: true, source: true }, { uid: true }],
      [[7, 8], { uid: true }, { uid: true }],
    ]);
    expect(record.fetchOneCalls).toEqual([
      ["7", { uid: true, headers: true }, { uid: true }],
    ]);
  });

  test("close() logs out when the connection is usable", async () => {
    const { record, createClient } = createFakeClient();
    const session = await createImapflowPort(config, {
      createClient,
    }).connect();

    await session.close();

    expect(record.logouts).toBe(1);
    expect(record.closes).toBe(0);
  });

  test("close() falls back to a hard close when logout fails", async () => {
    const { record, createClient } = createFakeClient({ logoutFails: true });
    const session = await createImapflowPort(config, {
      createClient,
    }).connect();

    await session.close();

    expect(record.logouts).toBe(1);
    expect(record.closes).toBe(1);
  });

  test("close() skips logout on an already dead connection", async () => {
    const { record, createClient } = createFakeClient({ usable: false });
    const session = await createImapflowPort(config, {
      createClient,
    }).connect();

    await session.close();

    expect(record.logouts).toBe(0);
    expect(record.closes).toBe(1);
  });
});

describe("tlsOptions", () => {
  test("default: system trust store, nothing overridden", () => {
    expect(tlsOptions({ tlsInsecure: false })).toEqual({});
  });

  test("insecure: certificate verification is off", () => {
    expect(tlsOptions({ tlsInsecure: true })).toEqual({
      rejectUnauthorized: false,
    });
  });

  test("pinned: the cert is the only trust anchor and the peer must be that exact cert", () => {
    const options = tlsOptions({ tlsCert: CERT_A, tlsInsecure: false });

    expect(options).toMatchObject({ ca: [CERT_A] });
    const check = (options as { checkServerIdentity: Function })
      .checkServerIdentity;
    const fingerprint = (pem: string) =>
      new X509Certificate(pem).fingerprint256;

    expect(check("any-host", { fingerprint256: fingerprint(CERT_A) })).toBe(
      undefined,
    );
    expect(
      check("any-host", { fingerprint256: fingerprint(CERT_B) }),
    ).toBeInstanceOf(Error);
  });

  test("pinned wins over insecure, and escaped newlines are accepted", () => {
    const oneLine = CERT_A.replace(/\n/g, "\\n");
    const options = tlsOptions({ tlsCert: oneLine, tlsInsecure: true });

    expect(options).toMatchObject({ ca: [CERT_A] });
    expect(options).not.toHaveProperty("rejectUnauthorized");
  });
});
