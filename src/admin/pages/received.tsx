import type { AdminResend } from "../types";
import { AdminLayout } from "../layout";
import { ErrorPanel } from "../components/error-panel";
import { EmailFrame } from "../components/email-frame";
import { formatBytes, formatDateTime } from "../format";

type ListResult = Awaited<
  ReturnType<AdminResend["emails"]["receiving"]["list"]>
>;
type GetResult = Awaited<ReturnType<AdminResend["emails"]["receiving"]["get"]>>;

export function ReceivedListPage({ result }: { result: ListResult }) {
  if (result.error) {
    return (
      <AdminLayout title="Received" active="received">
        <h1>Received</h1>
        <ErrorPanel name={result.error.name} message={result.error.message} />
      </AdminLayout>
    );
  }

  const { data, has_more } = result.data;
  const last = data[data.length - 1];

  return (
    <AdminLayout title="Received" active="received">
      <h1>Received</h1>
      {data.length === 0 ? (
        <p className="empty">No emails received yet.</p>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>Created</th>
                <th>From</th>
                <th>To</th>
                <th>Subject</th>
              </tr>
            </thead>
            <tbody>
              {data.map((email) => (
                <tr key={email.id}>
                  <td>{formatDateTime(email.created_at)}</td>
                  <td>{email.from}</td>
                  <td>{email.to.join(", ")}</td>
                  <td>
                    <a href={`/admin/received/${email.id}`}>{email.subject}</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {has_more && last ? (
            <p className="actions">
              <a href={`/admin/received?after=${last.id}`}>Older →</a>
            </p>
          ) : null}
        </>
      )}
    </AdminLayout>
  );
}

export function ReceivedDetailPage({ result }: { result: GetResult }) {
  if (result.error) {
    return (
      <AdminLayout title="Received" active="received">
        <h1>Received email</h1>
        <ErrorPanel name={result.error.name} message={result.error.message} />
      </AdminLayout>
    );
  }

  const email = result.data;

  return (
    <AdminLayout title={email.subject} active="received">
      <h1>{email.subject}</h1>
      <dl>
        <dt>From</dt>
        <dd>{email.from}</dd>
        <dt>To</dt>
        <dd>{email.to.join(", ")}</dd>
        <dt>Cc</dt>
        <dd>{email.cc?.join(", ") || "—"}</dd>
        <dt>Bcc</dt>
        <dd>{email.bcc?.join(", ") || "—"}</dd>
        <dt>Reply to</dt>
        <dd>{email.reply_to?.join(", ") || "—"}</dd>
        <dt>Created</dt>
        <dd>{formatDateTime(email.created_at)}</dd>
      </dl>
      {email.attachments.length > 0 ? (
        <>
          <p className="eyebrow">Attachments</p>
          <table>
            <thead>
              <tr>
                <th>Filename</th>
                <th>Type</th>
                <th>Size</th>
              </tr>
            </thead>
            <tbody>
              {email.attachments.map((attachment) => (
                <tr key={attachment.id}>
                  <td>{attachment.filename ?? "—"}</td>
                  <td>{attachment.content_type}</td>
                  <td>{formatBytes(attachment.size)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
      {email.html ? (
        <EmailFrame html={email.html} />
      ) : (
        <pre>{email.text ?? "No content"}</pre>
      )}
    </AdminLayout>
  );
}
