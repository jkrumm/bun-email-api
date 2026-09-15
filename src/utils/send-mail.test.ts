import { describe, expect, test } from "bun:test";
import { recordOutboundEmail } from "./send-mail";
import type { EmailsRepo } from "../db";

function throwingRepo(): Pick<EmailsRepo, "upsertEmail"> {
  return {
    upsertEmail: () => {
      throw new Error("unable to open database file");
    },
  };
}

describe("recordOutboundEmail", () => {
  test("a throwing repo is logged and swallowed, never thrown", () => {
    expect(() =>
      recordOutboundEmail(throwingRepo(), {
        id: "email_1",
        direction: "outbound",
        fromAddress: "no-reply@example.com",
        toAddresses: ["guest@example.com"],
        subject: "Hello",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    ).not.toThrow();
  });
});
