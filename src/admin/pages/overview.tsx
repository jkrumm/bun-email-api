import type { EmailStats, EmailListItem } from "../../db/emails";
import type { ImapMailboxHealth } from "../../db/imap-state";
import type { JevQueueCounts } from "../../db/jev-queue";
import type { JevComparison, SubmissionRecord } from "../../db/submissions";
import { AdminLayout } from "../layout";
import {
  Badge,
  CATEGORY_COLORS,
  Card,
  CategoryBadge,
  EmptyState,
  StatTile,
} from "../ui";
import {
  formatChartDayLabel,
  formatDayKey,
  formatLatency,
  formatListDateTime,
  formatLongDateTime,
  formatNumber,
  imapTileValue,
  formatPercent,
  formatRelative,
} from "../format";

const CHART_WIDTH = 700;
const CHART_HEIGHT = 170;
const CHART_BOTTOM = 24;
const CHART_FONT = "'JetBrains Mono Variable', ui-monospace, monospace";

function buildFourteenDayRange(
  now: Date,
): { date: string; inbound: number; outbound: number }[] {
  const byDay = new Map(
    Array.from({ length: 14 }, (_, i) => {
      const date = new Date(now.getTime() - (13 - i) * 24 * 60 * 60 * 1000);
      return [
        formatDayKey(date),
        { date: formatDayKey(date), inbound: 0, outbound: 0 },
      ] as const;
    }),
  );
  return [...byDay.values()];
}

function ActivityChart({
  perDay,
  now,
}: {
  perDay: EmailStats["perDay"];
  now: Date;
}) {
  const days = buildFourteenDayRange(now);
  const byDate = new Map(perDay.map((d) => [d.date, d]));
  const merged = days.map((d) => ({ ...d, ...(byDate.get(d.date) ?? {}) }));

  const max = Math.max(
    1,
    ...merged.map((d) => Math.max(d.inbound, d.outbound)),
  );
  const slot = CHART_WIDTH / merged.length;
  const barWidth = Math.min(10, slot / 2 - 3);

  return (
    <svg
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT + CHART_BOTTOM}`}
      width="100%"
      height={CHART_HEIGHT + CHART_BOTTOM}
      role="img"
    >
      <title>Inbound vs outbound email activity, last 14 days</title>
      {[0, 0.5, 1].map((f) => (
        <line
          key={f}
          x1={0}
          x2={CHART_WIDTH}
          y1={CHART_HEIGHT - CHART_HEIGHT * f}
          y2={CHART_HEIGHT - CHART_HEIGHT * f}
          stroke="var(--vx-divider)"
          strokeWidth={1}
        />
      ))}
      {merged.map((day, i) => {
        const x = i * slot + slot / 2;
        const inboundHeight = (day.inbound / max) * (CHART_HEIGHT - 4);
        const outboundHeight = (day.outbound / max) * (CHART_HEIGHT - 4);
        return (
          <g key={day.date}>
            <rect
              x={x - barWidth - 1}
              y={CHART_HEIGHT - inboundHeight}
              width={barWidth}
              height={inboundHeight}
              rx={1.5}
              fill="var(--vx-fill-indigo)"
            />
            <rect
              x={x + 1}
              y={CHART_HEIGHT - outboundHeight}
              width={barWidth}
              height={outboundHeight}
              rx={1.5}
              fill="var(--vx-fill-teal)"
            />
            {i % 2 === 0 ? (
              <text
                x={x}
                y={CHART_HEIGHT + 17}
                textAnchor="middle"
                fontSize="11"
                fontFamily={CHART_FONT}
                fill="var(--vx-faint)"
              >
                {formatChartDayLabel(day.date)}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

function CategoryBreakdown({
  countsByCategory,
}: {
  countsByCategory: Record<string, number>;
}) {
  const entries = Object.entries(countsByCategory).sort(
    ([, a], [, b]) => b - a,
  );
  if (entries.length === 0) {
    return (
      <EmptyState
        title="No categorized mail yet"
        body="Once enrichment runs, categories show up here."
      />
    );
  }

  const max = Math.max(...entries.map(([, count]) => count));

  return (
    <div className="category-bars">
      {entries.map(([category, count]) => (
        <div className="category-bar-row" key={category}>
          <CategoryBadge category={category} />
          <span className="category-bar-track">
            <span
              className="category-bar-fill"
              style={{
                width: `${Math.max(4, (count / max) * 100)}%`,
                background: `var(--vx-fill-${CATEGORY_COLORS[category] ?? "gray"})`,
              }}
            />
          </span>
          <span className="category-bar-count mono">{formatNumber(count)}</span>
        </div>
      ))}
    </div>
  );
}

function ImapHealthTile({
  health,
  now,
}: {
  health: ImapMailboxHealth[];
  now: Date;
}) {
  const { value, bar, title } = imapTileValue(health, now);
  return <StatTile label="IMAP ingest" title={title} value={value} bar={bar} />;
}

function jevQueueBar({
  pending,
  failed,
}: JevQueueCounts): "bad" | "warn" | undefined {
  if (failed > 0) return "bad";
  if (pending > 0) return "warn";
  return undefined;
}

export function OverviewPage({
  stats,
  jevComparison,
  jevQueue,
  needsAction,
  recentlyBlocked,
  lastSyncedAt,
  imapHealth = [],
  needsActionCount,
  now,
  notice,
}: {
  stats: EmailStats;
  jevComparison: JevComparison;
  jevQueue: JevQueueCounts;
  needsAction: EmailListItem[];
  recentlyBlocked: SubmissionRecord[];
  lastSyncedAt: string | null;
  imapHealth?: ImapMailboxHealth[];
  needsActionCount: number;
  now: Date;
  notice?: { text: string; error?: boolean } | null;
}) {
  return (
    <AdminLayout
      title="Overview"
      active="overview"
      needsActionCount={needsActionCount}
      notice={notice}
    >
      <div className="page-header">
        <div>
          <h1 className="page-title">Overview</h1>
          <p className="page-subtitle">Last 30 days</p>
        </div>
        <div className="page-actions">
          {lastSyncedAt ? (
            <span
              className="page-subtitle"
              title={formatLongDateTime(lastSyncedAt)}
            >
              Synced {formatRelative(lastSyncedAt, now)}
            </span>
          ) : null}
          <form method="post" action="/admin/sync">
            <button type="submit" className="btn btn-primary">
              Sync now
            </button>
          </form>
        </div>
      </div>

      <div className="stat-grid">
        <StatTile
          label="Received · 30d"
          value={formatNumber(stats.totalsByDirection.inbound ?? 0)}
        />
        <StatTile
          label="Sent · 30d"
          value={formatNumber(stats.totalsByDirection.outbound ?? 0)}
        />
        <StatTile
          label="Needs action"
          value={formatNumber(stats.actionRequiredOpen)}
          bar={stats.actionRequiredOpen > 0 ? "warn" : undefined}
        />
        <StatTile
          label="Spam blocked · 30d"
          value={formatNumber(stats.submissionsSuppressed)}
        />
        <StatTile
          label="LLM ↔ Jev agreement"
          value={
            jevComparison.agreementRate === null
              ? "—"
              : `${formatPercent(jevComparison.agreementRate)} · ${formatNumber(jevComparison.compared)}`
          }
        />
        {imapHealth.length > 0 ? (
          <ImapHealthTile health={imapHealth} now={now} />
        ) : null}
        <StatTile
          label="Jev queue"
          value={`${formatNumber(jevQueue.pending)} pending`}
          title={`${formatNumber(jevQueue.failed)} failed after all retries`}
          bar={jevQueueBar(jevQueue)}
        />
        <StatTile
          label="Median latency LLM / Jev"
          value={`${formatLatency(jevComparison.llmMedianLatencyMs)} / ${formatLatency(jevComparison.jevMedianLatencyMs)}`}
        />
      </div>

      <div className="panel-grid panel-grid-top">
        <Card>
          <div className="card-header-row">
            <p className="card-title">Activity, last 14 days</p>
            <span className="chart-legend">
              <span className="legend-item">
                <span className="legend-dot legend-dot-indigo" /> Inbound
              </span>
              <span className="legend-item">
                <span className="legend-dot legend-dot-teal" /> Outbound
              </span>
            </span>
          </div>
          <ActivityChart perDay={stats.perDay} now={now} />
        </Card>
        <Card title="Categories, last 30 days">
          <CategoryBreakdown countsByCategory={stats.countsByCategory} />
        </Card>
      </div>

      <div className="panel-grid">
        <Card title="Needs action">
          {needsAction.length === 0 ? (
            <EmptyState
              title="Nothing needs action"
              body="Every enriched email is handled."
            />
          ) : (
            <div className="table-wrap">
              <table>
                <tbody>
                  {needsAction.map((email) => (
                    <tr key={email.id}>
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
                      </td>
                      <td className="date-cell date-cell-end">
                        {formatListDateTime(email.createdAt, now)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="Recently blocked">
          {recentlyBlocked.length === 0 ? (
            <EmptyState
              title="Nothing blocked recently"
              body="No submissions have been suppressed."
            />
          ) : (
            <div className="table-wrap">
              <table>
                <tbody>
                  {recentlyBlocked.map((submission) => (
                    <tr key={submission.id}>
                      <td>
                        <Badge color="bad">{submission.verdict}</Badge>{" "}
                        <span className="mono">
                          {formatPercent(submission.confidence)}
                        </span>
                      </td>
                      <td>{submission.source}</td>
                      <td className="date-cell">
                        {formatListDateTime(submission.receivedAt, now)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </AdminLayout>
  );
}
