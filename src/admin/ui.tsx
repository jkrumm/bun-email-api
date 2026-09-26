import type { ReactNode } from "react";

// category -> badge color suffix (see styles.ts .badge-<color>). "other" and
// "notification" intentionally share gray: both are the catch-all/automated
// buckets, no categorical color is owed to either.
export const CATEGORY_COLORS: Record<string, string> = {
  inquiry: "indigo",
  customer: "teal",
  support: "cyan",
  feedback: "green",
  invoice: "yellow",
  notification: "gray",
  newsletter: "violet",
  marketing: "orange",
  spam: "red",
  personal: "pink",
  other: "gray",
};

export function Badge({
  children,
  color = "gray",
}: {
  children: ReactNode;
  color?: string;
}) {
  return <span className={`badge badge-${color}`}>{children}</span>;
}

export function CategoryBadge({ category }: { category: string | null }) {
  if (!category) return <Badge color="outline">uncategorized</Badge>;
  return <Badge color={CATEGORY_COLORS[category] ?? "gray"}>{category}</Badge>;
}

export function EnrichmentBadge({
  status,
}: {
  status: "pending" | "done" | "failed";
}) {
  if (status === "pending") return <Badge color="outline">AI pending</Badge>;
  if (status === "failed") return <Badge color="warn">AI failed</Badge>;
  return null;
}

export function PriorityDot({ priority }: { priority: string | null }) {
  if (priority === "high") {
    return (
      <>
        <span className="priority-dot priority-dot-high" />
        <span className="sr-only">High priority</span>
      </>
    );
  }
  if (priority === "low") {
    return (
      <>
        <span className="priority-dot priority-dot-low" />
        <span className="sr-only">Low priority</span>
      </>
    );
  }
  return null;
}

export function DirectionIcon({
  direction,
}: {
  direction: "inbound" | "outbound";
}) {
  return (
    <span className="direction-icon" title={direction}>
      {direction === "inbound" ? "↙" : "↗"}
      <span className="sr-only">
        {direction === "inbound" ? "Inbound" : "Outbound"}
      </span>
    </span>
  );
}

export function StatTile({
  label,
  value,
  bar,
  title,
}: {
  label: string;
  value: string;
  bar?: "good" | "warn" | "bad";
  title?: string;
}) {
  return (
    <div className="stat-tile" title={title}>
      {bar ? <span className={`stat-tile-bar stat-tile-bar-${bar}`} /> : null}
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

// "imap · INBOX" marker for rows ingested over IMAP; nothing for other
// providers. Long mailbox names are truncated, the full label is the title.
export function MailboxBadge({
  provider,
  mailbox,
}: {
  provider: string;
  mailbox: string | null;
}) {
  if (provider !== "imap") return null;
  const label = `imap${mailbox ? ` · ${mailbox}` : ""}`;
  return (
    <span className="mailbox-badge" title={label}>
      <Badge color="outline">{label}</Badge>
    </span>
  );
}

export function Card({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className ? `card ${className}` : "card"}>
      {title ? <p className="card-title">{title}</p> : null}
      {children}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <p className="empty-title">{title}</p>
      <p className="empty-body">{body}</p>
    </div>
  );
}

export function SegmentedLinks({
  options,
}: {
  options: { label: string; href: string; active: boolean }[];
}) {
  return (
    <span className="seg">
      {options.map((option) => (
        <a
          key={option.href}
          href={option.href}
          className={option.active ? "seg-option active" : "seg-option"}
          aria-current={option.active ? "page" : undefined}
        >
          {option.label}
        </a>
      ))}
    </span>
  );
}

export function EmailFrame({ html }: { html: string }) {
  return (
    // Empty sandbox: no scripts, no same-origin. React escapes the srcDoc
    // attribute value, so untrusted email HTML never breaks out of it.
    <iframe
      sandbox=""
      srcDoc={html}
      className="email-frame"
      title="email preview"
    />
  );
}

const NAV_ICON_PATHS: Record<string, ReactNode> = {
  overview: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  inbox: (
    <>
      <path d="M3 12h4l2 3h6l2-3h4" />
      <path d="M5.5 5h13L21 12v6a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18v-6z" />
    </>
  ),
  action: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5" />
      <circle cx="12" cy="16.5" r="0.8" fill="currentColor" stroke="none" />
    </>
  ),
  spam: (
    <>
      <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
      <path d="M9.5 12l2 2 3-3.5" />
    </>
  ),
  templates: (
    <>
      <rect x="4" y="3.5" width="16" height="17" rx="1.5" />
      <path d="M7.5 8h9M7.5 12h9M7.5 16h5.5" />
    </>
  ),
};

export function NavIcon({ name }: { name: keyof typeof NAV_ICON_PATHS }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {NAV_ICON_PATHS[name]}
    </svg>
  );
}
