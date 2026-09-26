import type {
  EmailDirection,
  EmailListItem,
  EmailProvider,
} from "../../db/emails";
import { AdminLayout } from "../layout";
import {
  Badge,
  CATEGORY_COLORS,
  CategoryBadge,
  DirectionIcon,
  EmptyState,
  EnrichmentBadge,
  MailboxBadge,
  PriorityDot,
} from "../ui";
import { formatListDateTime } from "../format";

const SOURCES = [
  "fpp-sender",
  "fpp-receiver",
  "fpp-daily-analytics",
  "sy-serendipity-request",
];

export interface EmailsFilters {
  q?: string;
  direction?: EmailDirection;
  category?: string;
  source?: string;
  provider?: EmailProvider;
  mailbox?: string;
  actionRequired?: boolean;
  from?: string;
  to?: string;
}

function counterpart(email: EmailListItem): string {
  return email.direction === "inbound"
    ? email.fromAddress
    : (email.toAddresses[0] ?? email.fromAddress);
}

export function EmailsPage({
  filters,
  emails,
  nextCursor,
  hasCursor,
  needsActionCount,
  now,
  notice,
}: {
  filters: EmailsFilters;
  emails: EmailListItem[];
  nextCursor: string | null;
  hasCursor: boolean;
  needsActionCount: number;
  now: Date;
  notice?: { text: string; error?: boolean } | null;
}) {
  const persistedFields: [string, string | undefined][] = [
    ["q", filters.q],
    ["direction", filters.direction],
    ["category", filters.category],
    ["source", filters.source],
    ["provider", filters.provider],
    ["mailbox", filters.mailbox],
    ["action_required", filters.actionRequired ? "true" : undefined],
    ["from", filters.from],
    ["to", filters.to],
  ];
  const persistedQuery = persistedFields
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${encodeURIComponent(value!)}`)
    .join("&");

  return (
    <AdminLayout
      title="Inbox"
      active={filters.actionRequired ? "needs-action" : "inbox"}
      needsActionCount={needsActionCount}
      notice={notice}
    >
      <div className="page-header">
        <div>
          <h1 className="page-title">Inbox</h1>
          <p className="page-subtitle">All sent and received mail</p>
        </div>
      </div>

      <form className="filter-bar" method="get" action="/admin/emails">
        <div className="field">
          <label htmlFor="q">Search</label>
          <input
            className="control"
            id="q"
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder="Subject, address, content…"
          />
        </div>

        <div className="field">
          <label>Direction</label>
          <span className="seg">
            {(
              [
                ["", "All"],
                ["inbound", "Inbound"],
                ["outbound", "Outbound"],
              ] as const
            ).map(([value, label]) => (
              <label className="seg-option" key={value || "all"}>
                <input
                  type="radio"
                  name="direction"
                  value={value}
                  defaultChecked={(filters.direction ?? "") === value}
                />
                {label}
              </label>
            ))}
          </span>
        </div>

        <div className="field">
          <label htmlFor="category">Category</label>
          <select
            className="control"
            id="category"
            name="category"
            defaultValue={filters.category ?? ""}
          >
            <option value="">All categories</option>
            {Object.keys(CATEGORY_COLORS).map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="source">Source</label>
          <select
            className="control"
            id="source"
            name="source"
            defaultValue={filters.source ?? ""}
          >
            <option value="">All sources</option>
            {SOURCES.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="provider">Provider</label>
          <select
            className="control"
            id="provider"
            name="provider"
            defaultValue={filters.provider ?? ""}
          >
            <option value="">All providers</option>
            <option value="resend">resend</option>
            <option value="imap">imap</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="mailbox">Mailbox</label>
          <input
            className="control"
            id="mailbox"
            type="text"
            name="mailbox"
            defaultValue={filters.mailbox}
            placeholder="INBOX, Spam…"
          />
        </div>

        <div className="field checkbox-field">
          <input
            type="checkbox"
            id="action_required"
            name="action_required"
            value="true"
            defaultChecked={filters.actionRequired}
          />
          <label htmlFor="action_required">Needs action</label>
        </div>

        <div className="field">
          <label htmlFor="from">From</label>
          <input
            className="control"
            id="from"
            type="date"
            name="from"
            defaultValue={filters.from}
          />
        </div>

        <div className="field">
          <label htmlFor="to">To</label>
          <input
            className="control"
            id="to"
            type="date"
            name="to"
            defaultValue={filters.to}
          />
        </div>

        <div className="field">
          <button type="submit" className="btn btn-primary">
            Apply
          </button>
        </div>
        <div className="field">
          <a className="btn" href="/admin/emails">
            Reset
          </a>
        </div>
      </form>

      {emails.length === 0 ? (
        <EmptyState
          title="No emails match these filters"
          body="Try widening the date range or clearing a filter."
        />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="col-shrink">Date</th>
                  <th className="col-shrink">Direction</th>
                  <th>Counterpart</th>
                  <th>Subject</th>
                  <th className="col-shrink">Category</th>
                  <th className="col-shrink">Priority</th>
                  <th className="col-shrink">Action</th>
                </tr>
              </thead>
              <tbody>
                {emails.map((email) => (
                  <tr key={email.id}>
                    <td className="date-cell">
                      {formatListDateTime(email.createdAt, now)}
                    </td>
                    <td className="col-shrink">
                      <DirectionIcon direction={email.direction} />
                      <MailboxBadge
                        provider={email.provider}
                        mailbox={email.mailbox}
                      />
                    </td>
                    <td className="counterpart-cell" title={counterpart(email)}>
                      {counterpart(email)}
                    </td>
                    <td>
                      <a
                        className="row-link"
                        href={`/admin/emails/${email.id}`}
                      >
                        {email.subject}
                      </a>
                      {email.enrichment.summary ? (
                        <p className="summary-line">
                          {email.enrichment.summary}
                        </p>
                      ) : null}
                      <EnrichmentBadge status={email.enrichment.status} />
                    </td>
                    <td className="col-shrink">
                      <CategoryBadge category={email.enrichment.category} />
                    </td>
                    <td className="col-shrink">
                      <PriorityDot priority={email.enrichment.priority} />
                    </td>
                    <td className="col-shrink">
                      {email.enrichment.actionRequired ? (
                        <Badge color="warn">Action</Badge>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <span>
              {hasCursor ? (
                <a
                  href={
                    persistedQuery
                      ? `/admin/emails?${persistedQuery}`
                      : "/admin/emails"
                  }
                >
                  ← Newest
                </a>
              ) : null}
            </span>
            <span>
              {nextCursor ? (
                <a
                  href={`/admin/emails?${persistedQuery ? `${persistedQuery}&` : ""}cursor=${encodeURIComponent(nextCursor)}`}
                >
                  Older →
                </a>
              ) : null}
            </span>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
