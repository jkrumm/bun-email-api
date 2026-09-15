import { describe, expect, test } from "bun:test";
import {
  berlinDayBoundaryToUtcIso,
  formatBytes,
  formatChartDayLabel,
  formatListDateTime,
  formatLongDateTime,
  formatNumber,
  formatPercent,
  formatRelative,
} from "./format";

// Fixed "now" for deterministic Heute/Gestern/relative assertions.
const NOW = new Date("2026-09-15T10:32:00.000Z");

describe("formatListDateTime", () => {
  test("same Berlin day as now -> Heute, HH:MM", () => {
    expect(formatListDateTime("2026-09-15T08:32:00.000Z", NOW)).toBe(
      "Heute, 10:32",
    );
  });

  test("previous Berlin day -> Gestern, HH:MM", () => {
    expect(formatListDateTime("2026-09-14T08:32:00.000Z", NOW)).toBe(
      "Gestern, 10:32",
    );
  });

  test("older date -> DD.MM.YYYY, HH:MM", () => {
    expect(formatListDateTime("2026-01-01T08:32:00.000Z", NOW)).toBe(
      "01.01.2026, 09:32",
    );
  });
});

describe("formatLongDateTime", () => {
  test("renders the German long form with weekday and time", () => {
    expect(formatLongDateTime("2026-09-15T08:32:00.000Z")).toBe(
      "Dienstag, 15. September 2026 um 10:32",
    );
  });
});

describe("formatRelative", () => {
  test("past instant renders 'vor N Stunden'", () => {
    expect(formatRelative("2026-09-15T07:32:00.000Z", NOW)).toBe(
      "vor 3 Stunden",
    );
  });

  test("future instant renders 'in N Minuten'", () => {
    expect(formatRelative("2026-09-15T11:02:00.000Z", NOW)).toBe(
      "in 30 Minuten",
    );
  });
});

describe("formatChartDayLabel", () => {
  test("renders a short German weekday + day", () => {
    expect(formatChartDayLabel("2026-09-15")).toBe("Di. 15.");
  });
});

describe("formatNumber / formatPercent / formatBytes", () => {
  test("formatNumber uses German grouping", () => {
    expect(formatNumber(1234)).toBe("1.234");
  });

  test("formatPercent rounds and appends a narrow no-break space before %", () => {
    expect(formatPercent(0.874)).toBe("87 %");
  });

  test("formatBytes renders KB/MB with a German decimal comma", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(1536)).toBe("1,5 KB");
    expect(formatBytes(2 * 1024 * 1024)).toBe("2,0 MB");
  });
});

describe("berlinDayBoundaryToUtcIso", () => {
  test("start of day during CEST (summer, UTC+2)", () => {
    expect(berlinDayBoundaryToUtcIso("2026-09-15", "start")).toBe(
      "2026-09-14T22:00:00.000Z",
    );
  });

  test("end of day during CET (winter, UTC+1)", () => {
    expect(berlinDayBoundaryToUtcIso("2026-12-15", "end")).toBe(
      "2026-12-15T22:59:59.999Z",
    );
  });
});
