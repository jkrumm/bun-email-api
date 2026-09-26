import { describe, expect, test } from "bun:test";
import { openDatabase } from "./client";
import { createImapStateRepo } from "./imap-state";

function setup() {
  return createImapStateRepo(openDatabase(":memory:"));
}

describe("imap state repo", () => {
  test("an error recorded before any cursor exists is health-only", () => {
    const state = setup();

    state.recordError("INBOX", "connect: ECONNREFUSED");

    expect(state.getCursor("INBOX")).toBeNull();
    expect(state.listHealth()).toMatchObject([
      { mailbox: "INBOX", lastUid: 0, lastError: "connect: ECONNREFUSED" },
    ]);
  });

  test("saving the cursor afterwards keeps the recorded error; success clears it", () => {
    const state = setup();
    state.recordError("INBOX", "boom");

    state.saveCursor("INBOX", { uidValidity: "7", lastUid: 12 });
    expect(state.getCursor("INBOX")).toEqual({ uidValidity: "7", lastUid: 12 });
    expect(state.listHealth()[0]?.lastError).toBe("boom");

    state.recordSuccess("INBOX");
    const [health] = state.listHealth();
    expect(health).toMatchObject({ lastError: null, lastUid: 12 });
    expect(health?.lastSuccessAt).not.toBeNull();
  });

  test("a success with a warning records it; a clean success clears it", () => {
    const state = setup();

    state.recordSuccess("INBOX", { warning: "uid 3 unparseable" });
    expect(state.listHealth()[0]).toMatchObject({
      lastWarning: "uid 3 unparseable",
    });
    expect(state.listHealth()[0]?.lastWarningAt).not.toBeNull();

    state.recordSuccess("INBOX");
    expect(state.listHealth()[0]).toMatchObject({
      lastWarning: null,
      lastWarningAt: null,
    });
  });

  test("hold counting is per uid and resets on clear or a different uid", () => {
    const state = setup();

    expect(state.recordHold("INBOX", 5)).toBe(1);
    expect(state.recordHold("INBOX", 5)).toBe(2);
    expect(state.recordHold("INBOX", 9)).toBe(1);
    state.clearHold("INBOX");
    expect(state.recordHold("INBOX", 9)).toBe(1);
  });
});
