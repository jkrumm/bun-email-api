export interface SyncDirectionSummary {
  new: number;
  updated: number;
}

// Inbound never updates an existing row (a known inbound email is simply
// skipped), so it never had a meaningful `updated` count.
export interface SyncInboundSummary {
  new: number;
}

export interface ImapSyncSummary {
  new: number;
}

export interface SyncSummary {
  outbound: SyncDirectionSummary;
  inbound: SyncInboundSummary;
  // Absent when IMAP ingest isn't configured.
  imap?: ImapSyncSummary;
  errors: string[];
}
