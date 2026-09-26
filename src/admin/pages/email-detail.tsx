import { Fragment } from "react";
import type { EmailWithEnrichment, JevEnrichment } from "../../db/emails";
import { AdminLayout } from "../layout";
import { safeBackPath } from "../safe-back-path";
import {
  Badge,
  Card,
  CategoryBadge,
  EmailFrame,
  PriorityDot,
  SegmentedLinks,
} from "../ui";
import {
  formatBytes,
  formatListDateTime,
  formatLongDateTime,
  formatPercent,
  formatRelative,
} from "../format";

function joinOrDash(values: string[] | null): string {
  return values && values.length > 0 ? values.join(", ") : "—";
}

function JevBlock({ jev }: { jev: JevEnrichment }) {
  return (
    <>
      <p className="card-title" style={{ marginTop: 12 }}>
        Jev (shadow)
      </p>
      {jev.error !== null ? (
        <p className="page-subtitle">Jev failed: {jev.error}</p>
      ) : (
        <p>
          <span className="mono">
            spam probability{" "}
            {jev.spamProbability === null
              ? "—"
              : formatPercent(jev.spamProbability)}
          </span>{" "}
          <CategoryBadge category={jev.category} />{" "}
          <span className="mono">
            category confidence{" "}
            {jev.categoryConfidence === null
              ? "—"
              : formatPercent(jev.categoryConfidence)}
          </span>
        </p>
      )}
    </>
  );
}

export function EmailNotFoundPage({
  id,
  back,
  needsActionCount,
}: {
  id: string;
  back: string;
  needsActionCount: number;
}) {
  return (
    <AdminLayout
      title="Email not found"
      active="inbox"
      needsActionCount={needsActionCount}
    >
      <a className="back-link" href={safeBackPath(back)}>
        ← Back
      </a>
      <h1 className="page-title">Email not found</h1>
      <p>No email with id "{id}" is stored.</p>
    </AdminLayout>
  );
}

export function EmailDetailPage({
  email,
  view,
  back,
  needsActionCount,
  now,
  notice,
}: {
  email: EmailWithEnrichment;
  view: "html" | "text";
  back: string;
  needsActionCount: number;
  now: Date;
  notice?: { text: string; error?: boolean } | null;
}) {
  const { enrichment } = email;

  return (
    <AdminLayout
      title={email.subject}
      active="inbox"
      needsActionCount={needsActionCount}
      notice={notice}
    >
      <a className="back-link" href={safeBackPath(back)}>
        ← Back
      </a>
      <h1 className="page-title">{email.subject}</h1>

      <div className="panel-grid">
        <Card title="Message">
          <dl className="meta-grid">
            <dt>From</dt>
            <dd>{email.fromAddress}</dd>
            <dt>To</dt>
            <dd>{joinOrDash(email.toAddresses)}</dd>
            <dt>Cc</dt>
            <dd>{joinOrDash(email.cc)}</dd>
            <dt>Reply-To</dt>
            <dd>{joinOrDash(email.replyTo)}</dd>
            <dt>Date</dt>
            <dd title={formatRelative(email.createdAt, now)}>
              {formatLongDateTime(email.createdAt)}
            </dd>
            <dt>Direction</dt>
            <dd>{email.direction}</dd>
            <dt>Source</dt>
            <dd>{email.source ?? "—"}</dd>
            <dt>Provider</dt>
            <dd>
              {email.provider}
              {email.mailbox ? ` · ${email.mailbox}` : ""}
            </dd>
            {email.messageId ? (
              <>
                <dt>Message-ID</dt>
                <dd className="wrap-anywhere">{email.messageId}</dd>
              </>
            ) : null}
            {email.lastEvent ? (
              <>
                <dt>Status</dt>
                <dd>
                  <Badge color="outline">{email.lastEvent}</Badge>
                </dd>
              </>
            ) : null}
          </dl>

          {email.attachments.length > 0 ? (
            <>
              <p className="card-title" style={{ marginTop: 12 }}>
                Attachments
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Filename</th>
                    <th>Type</th>
                    <th>Size</th>
                  </tr>
                </thead>
                <tbody>
                  {email.attachments.map((attachment, index) => (
                    <tr key={`${attachment.filename ?? "file"}-${index}`}>
                      <td>{attachment.filename ?? "—"}</td>
                      <td>{attachment.contentType}</td>
                      <td className="mono">{formatBytes(attachment.size)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}
        </Card>

        <Card title="AI enrichment">
          {enrichment.status === "done" ? (
            <>
              <p>
                <CategoryBadge category={enrichment.category} />{" "}
                <Badge color="outline">{enrichment.priority ?? "normal"}</Badge>{" "}
                <PriorityDot priority={enrichment.priority} />{" "}
                {enrichment.actionRequired ? (
                  <Badge color="warn">Needs action</Badge>
                ) : null}
              </p>
              <p>{enrichment.summary}</p>
              {enrichment.suggestedAction ? (
                <p className="suggested-action">{enrichment.suggestedAction}</p>
              ) : null}
              {enrichment.facts && enrichment.facts.length > 0 ? (
                <dl className="fact-grid">
                  {enrichment.facts.map((fact) => (
                    <Fragment key={fact.label}>
                      <dt>{fact.label}</dt>
                      <dd>{fact.value}</dd>
                    </Fragment>
                  ))}
                </dl>
              ) : null}
              <p className="page-subtitle" style={{ marginTop: 8 }}>
                {enrichment.model} · {enrichment.status} · updated{" "}
                {formatListDateTime(email.syncedAt, now)}
              </p>
            </>
          ) : (
            <p className="page-subtitle">
              {enrichment.status === "pending"
                ? "Enrichment pending."
                : `Enrichment failed: ${enrichment.error ?? "unknown error"}`}
            </p>
          )}
          {enrichment.jev ? <JevBlock jev={enrichment.jev} /> : null}
          <form
            method="post"
            action={`/admin/emails/${email.id}/enrich?back=${encodeURIComponent(back)}&view=${view}`}
          >
            <button type="submit" className="btn" style={{ marginTop: 8 }}>
              Re-run AI
            </button>
          </form>
        </Card>
      </div>

      <Card title="Content">
        <p style={{ marginBottom: 8 }}>
          <SegmentedLinks
            options={[
              {
                label: "HTML",
                href: `/admin/emails/${email.id}?view=html&back=${encodeURIComponent(back)}`,
                active: view === "html",
              },
              {
                label: "Text",
                href: `/admin/emails/${email.id}?view=text&back=${encodeURIComponent(back)}`,
                active: view === "text",
              },
            ]}
          />
        </p>
        {view === "html" ? (
          email.html ? (
            <EmailFrame html={email.html} />
          ) : (
            <p className="page-subtitle">No HTML content.</p>
          )
        ) : (
          <pre>{email.text ?? "No text content"}</pre>
        )}
      </Card>
    </AdminLayout>
  );
}
