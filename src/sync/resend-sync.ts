import type { Database } from "bun:sqlite";
import type { AdminResend } from "../admin/types";
import { adminResend } from "../utils/resend";
import { createEmailsRepo, type EmailAttachment } from "../db/emails";
import { db as defaultDb } from "../db/client";
import { runEnrichmentBatch } from "../enrich/worker";

const PAGE_LIMIT = 100;
const RATE_LIMIT_RETRY_MS = 1_500;
const RATE_LIMIT_RETRIES = 3;
const SYNC_INTERVAL_MS = 5 * 60_000;
const FIRST_RUN_DELAY_MS = 5_000;

export interface SyncDirectionSummary {
  new: number;
  updated: number;
}

export interface SyncSummary {
  outbound: SyncDirectionSummary;
  inbound: SyncDirectionSummary;
  errors: string[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T extends { error: { name?: string } | null }>(
  fn: () => Promise<T>,
): Promise<T> {
  let result = await fn();
  for (
    let attempt = 1;
    result.error?.name === "rate_limit_exceeded" &&
    attempt < RATE_LIMIT_RETRIES;
    attempt++
  ) {
    await sleep(RATE_LIMIT_RETRY_MS);
    result = await fn();
  }
  return result;
}

async function syncOutbound(
  emails: ReturnType<typeof createEmailsRepo>,
  resend: AdminResend,
  errors: string[],
): Promise<SyncDirectionSummary> {
  let newCount = 0;
  let updatedCount = 0;
  let after: string | undefined;

  while (true) {
    const page = await withRetry(() =>
      resend.emails.list({
        limit: PAGE_LIMIT,
        after,
      }),
    );

    if (page.error) {
      errors.push(`outbound list: ${page.error.message}`);
      break;
    }

    const { data, has_more } = page.data;
    if (data.length === 0) break;

    const knownIds = emails.knownEmailIds(data.map((item) => item.id));
    let sawKnown = false;

    for (const item of data) {
      if (knownIds.has(item.id)) {
        const existing = emails.getEmail(item.id);
        sawKnown = true;
        if (existing?.html === null) {
          const full = await withRetry(() => resend.emails.get(item.id));
          if (full.error) {
            errors.push(`outbound get ${item.id}: ${full.error.message}`);
            continue;
          }
          emails.upsertEmail({
            id: full.data.id,
            direction: "outbound",
            fromAddress: full.data.from,
            toAddresses: full.data.to,
            cc: full.data.cc,
            bcc: full.data.bcc,
            replyTo: full.data.reply_to,
            subject: full.data.subject,
            createdAt: full.data.created_at,
            lastEvent: full.data.last_event,
            html: full.data.html,
            text: full.data.text,
          });
        } else {
          emails.upsertEmail({
            id: item.id,
            direction: "outbound",
            fromAddress: item.from,
            toAddresses: item.to,
            cc: item.cc,
            bcc: item.bcc,
            replyTo: item.reply_to,
            subject: item.subject,
            createdAt: item.created_at,
            lastEvent: item.last_event,
          });
        }
        updatedCount++;
        continue;
      }

      const full = await withRetry(() => resend.emails.get(item.id));
      if (full.error) {
        errors.push(`outbound get ${item.id}: ${full.error.message}`);
        continue;
      }

      emails.upsertEmail({
        id: full.data.id,
        direction: "outbound",
        fromAddress: full.data.from,
        toAddresses: full.data.to,
        cc: full.data.cc,
        bcc: full.data.bcc,
        replyTo: full.data.reply_to,
        subject: full.data.subject,
        createdAt: full.data.created_at,
        lastEvent: full.data.last_event,
        html: full.data.html,
        text: full.data.text,
      });
      newCount++;
    }

    if (sawKnown || !has_more) break;
    after = data[data.length - 1]?.id;
  }

  return { new: newCount, updated: updatedCount };
}

async function syncInbound(
  emails: ReturnType<typeof createEmailsRepo>,
  resend: AdminResend,
  errors: string[],
): Promise<SyncDirectionSummary> {
  let newCount = 0;
  let updatedCount = 0;
  let after: string | undefined;

  while (true) {
    const page = await withRetry(() =>
      resend.emails.receiving.list({ limit: PAGE_LIMIT, after }),
    );

    if (page.error) {
      errors.push(`inbound list: ${page.error.message}`);
      break;
    }

    const { data, has_more } = page.data;
    if (data.length === 0) break;

    const knownIds = emails.knownEmailIds(data.map((item) => item.id));
    let sawKnown = false;

    for (const item of data) {
      if (knownIds.has(item.id)) {
        sawKnown = true;
        continue;
      }

      const full = await withRetry(() => resend.emails.receiving.get(item.id));
      if (full.error) {
        errors.push(`inbound get ${item.id}: ${full.error.message}`);
        continue;
      }

      const attachments: EmailAttachment[] = full.data.attachments.map(
        (attachment) => ({
          filename: attachment.filename,
          contentType: attachment.content_type,
          size: attachment.size,
        }),
      );

      emails.upsertEmail({
        id: full.data.id,
        direction: "inbound",
        fromAddress: full.data.from,
        toAddresses: full.data.to,
        cc: full.data.cc,
        bcc: full.data.bcc,
        replyTo: full.data.reply_to,
        subject: full.data.subject,
        createdAt: full.data.created_at,
        html: full.data.html,
        text: full.data.text,
        attachments,
      });
      newCount++;
    }

    if (sawKnown || !has_more) break;
    after = data[data.length - 1]?.id;
  }

  return { new: newCount, updated: updatedCount };
}

export async function syncEmails({
  db,
  resend,
}: {
  db: Database;
  resend: AdminResend;
}): Promise<SyncSummary> {
  const emails = createEmailsRepo(db);
  const errors: string[] = [];

  const outbound = await syncOutbound(emails, resend, errors);
  const inbound = await syncInbound(emails, resend, errors);

  return { outbound, inbound, errors };
}

let syncing = false;

export async function runSyncNow(): Promise<SyncSummary | { busy: true }> {
  if (syncing) return { busy: true };

  syncing = true;
  try {
    const summary = await syncEmails({ db: defaultDb, resend: adminResend });
    if (summary.outbound.new > 0 || summary.inbound.new > 0) {
      void runEnrichmentBatch();
    }
    return summary;
  } finally {
    syncing = false;
  }
}

export function startSync(): void {
  if (process.env.NODE_ENV === "test") return;

  const timer = setTimeout(() => {
    void runSyncNow();
    const interval = setInterval(() => void runSyncNow(), SYNC_INTERVAL_MS);
    interval.unref();
  }, FIRST_RUN_DELAY_MS);
  timer.unref();
}
