import type { AdminResend } from "../types";
import { AdminLayout } from "../layout";
import { Pill } from "../components/pill";
import { ErrorPanel } from "../components/error-panel";
import { EmailFrame } from "../components/email-frame";
import { formatDateTime } from "../format";

type ListResult = Awaited<ReturnType<AdminResend["emails"]["list"]>>;
type GetResult = Awaited<ReturnType<AdminResend["emails"]["get"]>>;

export function SentListPage({ result }: { result: ListResult }) {
  if (result.error) {
    return (
      <AdminLayout title="Sent" active="sent">
        <h1>Sent</h1>
        <ErrorPanel name={result.error.name} message={result.error.message} />
      </AdminLayout>
    );
  }

  const { data, has_more } = result.data;
  const last = data[data.length - 1];

  return (
    <AdminLayout title="Sent" active="sent">
      <h1>Sent</h1>
      {data.length === 0 ? (
        <p className="empty">No emails sent yet.</p>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>Created</th>
                <th>From</th>
                <th>To</th>
                <th>Subject</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((email) => (
                <tr key={email.id}>
                  <td>{formatDateTime(email.created_at)}</td>
                  <td>{email.from}</td>
                  <td>{email.to.join(", ")}</td>
                  <td>
                    <a href={`/admin/sent/${email.id}`}>{email.subject}</a>
                  </td>
                  <td>
                    <Pill>{email.last_event}</Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {has_more && last ? (
            <p className="actions">
              <a href={`/admin/sent?after=${last.id}`}>Older →</a>
            </p>
          ) : null}
        </>
      )}
    </AdminLayout>
  );
}

export function SentDetailPage({ result }: { result: GetResult }) {
  if (result.error) {
    return (
      <AdminLayout title="Sent" active="sent">
        <h1>Sent email</h1>
        <ErrorPanel name={result.error.name} message={result.error.message} />
      </AdminLayout>
    );
  }

  const email = result.data;

  return (
    <AdminLayout title={email.subject} active="sent">
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
        <dt>Status</dt>
        <dd>
          <Pill>{email.last_event}</Pill>
        </dd>
      </dl>
      {email.html ? (
        <EmailFrame html={email.html} />
      ) : (
        <pre>{email.text ?? "No content"}</pre>
      )}
    </AdminLayout>
  );
}
