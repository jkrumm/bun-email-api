import { db } from "./client";
import { createEmailsRepo } from "./emails";
import { createImapStateRepo } from "./imap-state";
import { createSubmissionsRepo } from "./submissions";

// Singletons bound to the lazily-opened default database, for production
// call sites (routes, sync, enrichment worker). Tests build their own via
// createEmailsRepo(openDatabase(":memory:")) / createSubmissionsRepo(...).
export const emailsRepo = createEmailsRepo(db);
export const submissionsRepo = createSubmissionsRepo(db);
export const imapStateRepo = createImapStateRepo(db);

export { db, openDatabase } from "./client";
export * from "./emails";
export * from "./imap-state";
export * from "./submissions";
export * from "./sync-state";
