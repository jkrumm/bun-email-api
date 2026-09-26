import { describe, expect, test } from "bun:test";
import { imapConfigFromEnv } from "./imap-config";

const base = {
  BEA_IMAP_HOST: "bridge.example",
  BEA_IMAP_PORT: 1143,
  BEA_IMAP_USER: "hello",
  BEA_IMAP_PASSWORD: "secret",
  BEA_IMAP_MAILBOXES: "INBOX,Spam",
  BEA_IMAP_TLS_CERT: undefined,
  BEA_IMAP_TLS_INSECURE: false,
};

describe("imapConfigFromEnv", () => {
  test("no host -> disabled", () => {
    expect(
      imapConfigFromEnv({ ...base, BEA_IMAP_HOST: undefined }),
    ).toBeUndefined();
  });

  test("missing credentials -> disabled (env validation rejects this earlier)", () => {
    expect(
      imapConfigFromEnv({ ...base, BEA_IMAP_USER: undefined }),
    ).toBeUndefined();
    expect(
      imapConfigFromEnv({ ...base, BEA_IMAP_PASSWORD: undefined }),
    ).toBeUndefined();
  });

  test("maps env to config and splits, trims and drops empty mailbox names", () => {
    expect(
      imapConfigFromEnv({
        ...base,
        BEA_IMAP_PORT: 993,
        BEA_IMAP_MAILBOXES: " INBOX , ,Spam,Archive/2026 ",
        BEA_IMAP_TLS_CERT: "PEM",
        BEA_IMAP_TLS_INSECURE: true,
      }),
    ).toEqual({
      host: "bridge.example",
      port: 993,
      user: "hello",
      password: "secret",
      mailboxes: ["INBOX", "Spam", "Archive/2026"],
      tlsCert: "PEM",
      tlsInsecure: true,
    });
  });
});
