import { Fragment } from "react";
import { submissionsRepo } from "../../db";
import type { SubmissionRecord } from "../../db/submissions";
import { AdminLayout } from "../layout";
import { Pill } from "../components/pill";
import { formatDateTime, formatPercent } from "../format";

function submissionEntries(submission: SubmissionRecord["submission"]) {
  return Object.entries(submission);
}

export function FilteredPage() {
  const { data: records } = submissionsRepo.listSubmissions({ limit: 200 });

  return (
    <AdminLayout title="Filtered" active="filtered">
      <h1>Filtered</h1>
      <p className="eyebrow">Showing the last 200 submissions.</p>
      {records.length === 0 ? (
        <p className="empty">No submissions judged yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Received</th>
              <th>Source</th>
              <th>Verdict</th>
              <th>Status</th>
              <th>Reason</th>
              <th>Submission</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id}>
                <td>{formatDateTime(record.receivedAt)}</td>
                <td>{record.source}</td>
                <td>
                  <Pill
                    variant={record.verdict === "legit" ? "outline" : "fill"}
                  >
                    {record.verdict} · {formatPercent(record.confidence)}
                  </Pill>
                </td>
                <td>
                  <Pill variant={record.delivered ? "outline" : "fill"}>
                    {record.delivered ? "delivered" : "suppressed"}
                  </Pill>
                </td>
                <td>{record.reason}</td>
                <td>
                  <details>
                    <summary>View</summary>
                    <dl>
                      {submissionEntries(record.submission).map(
                        ([key, value]) => (
                          <Fragment key={key}>
                            <dt>{key}</dt>
                            <dd>{value === null ? "—" : String(value)}</dd>
                          </Fragment>
                        ),
                      )}
                    </dl>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminLayout>
  );
}
