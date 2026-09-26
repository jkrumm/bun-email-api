import { describe, expect, test } from "bun:test";
import { envSchema } from "./env";
import { CERT_A } from "./test/certs";

const base = {
  BEA_SECRET_KEY: "0123456789",
  BEA_RECEIVER_EMAIL: "me@example.com",
  BEA_RESEND_API_KEY: "re_key",
  BEA_SY_SERENDIPITY_RECEIVER_EMAIL: "sy@example.com",
};

describe("IMAP env validation", () => {
  test("no host: IMAP is off and defaults apply", () => {
    const parsed = envSchema.parse(base);
    expect(parsed.BEA_IMAP_HOST).toBeUndefined();
    expect(parsed.BEA_IMAP_PORT).toBe(1143);
    expect(parsed.BEA_IMAP_MAILBOXES).toBe("INBOX,Spam");
    expect(parsed.BEA_IMAP_TLS_INSECURE).toBe(false);
  });

  test("host without user/password fails fast, naming the missing keys", () => {
    const result = envSchema.safeParse({ ...base, BEA_IMAP_HOST: "bridge" });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toEqual([
      "BEA_IMAP_USER",
      "BEA_IMAP_PASSWORD",
    ]);
  });

  test("host with credentials parses; empty mailbox list is rejected", () => {
    const ok = {
      ...base,
      BEA_IMAP_HOST: "bridge",
      BEA_IMAP_USER: "u",
      BEA_IMAP_PASSWORD: "p",
      BEA_IMAP_TLS_INSECURE: "true",
    };
    expect(envSchema.parse(ok).BEA_IMAP_TLS_INSECURE).toBe(true);

    const empty = envSchema.safeParse({ ...ok, BEA_IMAP_MAILBOXES: " , " });
    expect(empty.success).toBe(false);
  });

  test("BEA_IMAP_TLS_CERT must be a valid PEM (escaped newlines accepted)", () => {
    const ok = {
      ...base,
      BEA_IMAP_HOST: "bridge",
      BEA_IMAP_USER: "u",
      BEA_IMAP_PASSWORD: "p",
    };

    expect(
      envSchema.safeParse({ ...ok, BEA_IMAP_TLS_CERT: CERT_A }).success,
    ).toBe(true);
    expect(
      envSchema.safeParse({
        ...ok,
        BEA_IMAP_TLS_CERT: CERT_A.replace(/\n/g, "\\n"),
      }).success,
    ).toBe(true);

    const bad = envSchema.safeParse({ ...ok, BEA_IMAP_TLS_CERT: "not a cert" });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues.map((issue) => issue.path.join("."))).toEqual([
      "BEA_IMAP_TLS_CERT",
    ]);
  });

  test("BEA_IMAP_PORT must be an integer in 1..65535", () => {
    for (const port of ["0", "65536", "11.5", "abc"]) {
      expect(
        envSchema.safeParse({ ...base, BEA_IMAP_PORT: port }).success,
      ).toBe(false);
    }
    expect(
      envSchema.parse({ ...base, BEA_IMAP_PORT: "993" }).BEA_IMAP_PORT,
    ).toBe(993);
  });
});
