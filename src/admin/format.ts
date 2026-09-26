import type { ImapMailboxHealth } from "../db/imap-state";
const TIME_ZONE = "Europe/Berlin";

const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dateFormatter = new Intl.DateTimeFormat("de-DE", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("de-DE", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});

const longDateFormatter = new Intl.DateTimeFormat("de-DE", {
  timeZone: TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const chartDayFormatter = new Intl.DateTimeFormat("de-DE", {
  timeZone: TIME_ZONE,
  weekday: "short",
  day: "numeric",
});

const numberFormatter = new Intl.NumberFormat("de-DE");
const relativeFormatter = new Intl.RelativeTimeFormat("de", {
  numeric: "auto",
});

function dayKey(date: Date): string {
  return dayKeyFormatter.format(date);
}

/** Europe/Berlin day key ("2026-09-15") for a given instant — used to bucket
 * per-day chart data and to build a fixed N-day date range. */
export function formatDayKey(date: Date): string {
  return dayKey(date);
}

/** List-cell date: "Heute, 10:32" / "Gestern, 10:32" / "15.09.2026, 10:32". */
export function formatListDateTime(
  iso: string,
  now: Date = new Date(),
): string {
  const date = new Date(iso);
  const time = timeFormatter.format(date);

  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const key = dayKey(date);

  if (key === today) return `Heute, ${time}`;
  if (key === yesterday) return `Gestern, ${time}`;
  return `${dateFormatter.format(date)}, ${time}`;
}

/** Detail-header date: "Montag, 15. September 2026 um 10:32". */
export function formatLongDateTime(iso: string): string {
  const date = new Date(iso);
  return `${longDateFormatter.format(date)} um ${timeFormatter.format(date)}`;
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60 * 60_000],
  ["month", 30 * 24 * 60 * 60_000],
  ["week", 7 * 24 * 60 * 60_000],
  ["day", 24 * 60 * 60_000],
  ["hour", 60 * 60_000],
  ["minute", 60_000],
  ["second", 1_000],
];

/** "vor 3 Stunden" / "in 2 Tagen" — for a muted hint alongside an absolute date. */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const diffMs = new Date(iso).getTime() - now.getTime();
  const absMs = Math.abs(diffMs);

  const [unit, unitMs] =
    RELATIVE_UNITS.find(([, ms]) => absMs >= ms) ?? RELATIVE_UNITS.at(-1)!;

  return relativeFormatter.format(Math.round(diffMs / unitMs), unit);
}

/** Chart axis label: "Di. 15." */
export function formatChartDayLabel(iso: string): string {
  return chartDayFormatter.format(new Date(iso));
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

// U+202F narrow no-break space keeps "85 %" reading as one mono token
// instead of two words with a full-width gap.
export function formatPercent(value: number): string {
  return `${Math.round(value * 100)} %`;
}

export function formatLatency(ms: number | null): string {
  if (ms === null) return "—";
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${formatNumber(bytes)} B`;

  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(kb)} KB`;
  }

  return `${new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(kb / 1024)} MB`;
}

function berlinOffsetMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(instant)
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  const hour = parts.hour === "24" ? "0" : parts.hour;
  const asUtcMs = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(hour),
    Number(parts.minute),
    Number(parts.second),
  );

  return Math.round((asUtcMs - instant.getTime()) / 60_000);
}

/**
 * Interprets a plain `YYYY-MM-DD` date-filter input as a Europe/Berlin local
 * day boundary and returns the equivalent UTC ISO instant, for `since`/`until`
 * repo filters.
 */
export function berlinDayBoundaryToUtcIso(
  dateStr: string,
  boundary: "start" | "end",
): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const naiveUtcMs =
    boundary === "start"
      ? Date.UTC(year, month - 1, day, 0, 0, 0, 0)
      : Date.UTC(year, month - 1, day, 23, 59, 59, 999);

  const offsetMinutes = berlinOffsetMinutes(new Date(naiveUtcMs));
  return new Date(naiveUtcMs - offsetMinutes * 60_000).toISOString();
}

// Summary of per-mailbox IMAP health for the overview tile: errors outrank
// warnings, which outrank a plain "last ok" timestamp.
export function imapTileValue(
  health: ImapMailboxHealth[],
  now: Date,
): { value: string; bar: "good" | "warn" | "bad"; title: string } {
  const failing = health.filter((mailbox) => mailbox.lastError);
  const degraded = health.filter(
    (mailbox) => !mailbox.lastError && mailbox.lastWarning,
  );
  const names = (list: ImapMailboxHealth[]) =>
    list.map((mailbox) => mailbox.mailbox).join(", ");

  const title = [
    ...failing.map((mailbox) => `${mailbox.mailbox}: ${mailbox.lastError}`),
    ...degraded.map((mailbox) => `${mailbox.mailbox}: ${mailbox.lastWarning}`),
  ].join("\n");

  if (failing.length > 0) {
    return { value: `Error · ${names(failing)}`, bar: "bad", title };
  }
  if (degraded.length > 0) {
    return { value: `Degraded · ${names(degraded)}`, bar: "warn", title };
  }

  const lastSuccess = health
    .map((mailbox) => mailbox.lastSuccessAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  return {
    value: lastSuccess ? formatRelative(lastSuccess, now) : "—",
    bar: "good",
    title,
  };
}

// One line for a Jev queue row that has no decision (yet): when it retries,
// or why it gave up. Null once Jev is "done".
export function formatJevQueueState(jev: {
  status: "pending" | "done" | "failed";
  attempts: number;
  nextAttemptAt: string | null;
  error: string | null;
}): string | null {
  if (jev.status === "done") return null;

  if (jev.status === "failed") {
    return `failed after ${jev.attempts} attempts: ${jev.error ?? "unknown error"}`;
  }

  const when = jev.nextAttemptAt
    ? `next attempt ${formatLongDateTime(jev.nextAttemptAt)}`
    : "queued";
  return jev.attempts > 0
    ? `pending · ${when} · last error: ${jev.error ?? "unknown error"}`
    : `pending · ${when}`;
}
