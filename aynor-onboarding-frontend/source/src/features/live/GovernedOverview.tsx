import { AskContextLink } from "./AskContextLink";
import { connectionsLink, evidenceLink } from "./dashboard-navigation";
import { useLocation } from "react-router-dom";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../components/ui";
import { Panel } from "../intelligence/shared";
import {
  displayMetric,
  displayPeriod,
  type ExecutiveReport,
  type SemanticMetric,
} from "./semantic-types";
export function GovernedOverview({
  report,
  onScope,
  readOnly = false,
}: {
  report: ExecutiveReport;
  onScope: (scope: string) => void;
  readOnly?: boolean;
}) {
  const location = useLocation();
  const companyId = location.pathname.split("/")[2];
  const reviewHref = connectionsLink(
    companyId,
    report.reviewHref,
    location.pathname + location.search + location.hash,
  );
  const [visual, setVisual] = useState("trend");
  const scope = report.scopes.find((s) => s.id === report.selectedScope),
    performance = report.performance;
  return (
    <section aria-label="Executive business overview">
      <AskContextLink
        companyId={companyId}
        search={location.search}
        origin={location.pathname + location.search}
      />
      {report.dataStatus && (
        <div className="intel-notice" role="status">
          {report.dataStatus}.{" "}
          {readOnly ? (
            "Ask an administrator to review the data."
          ) : (
            <Link to={reviewHref}>Review data</Link>
          )}
        </div>
      )}
      {!report.primary.length ? (
        <Panel
          title={
            readOnly
              ? "No authorized business measures"
              : report.resolution?.title || "Confirm your business reporting"
          }
        >
          <p>
            {readOnly
              ? "An administrator can review your permitted business categories and data configuration."
              : report.resolution?.explanation ||
                "No validated business measures are available for this reporting scope."}
          </p>
          {!readOnly && !!report.resolution?.reasons.length && (
            <ul aria-label="Reporting issues">
              {report.resolution.reasons.slice(0, 4).map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          {!readOnly && (
            <Link className="button secondary" to={reviewHref}>
              {report.resolution?.actionLabel || "Review business meanings"}
            </Link>
          )}
        </Panel>
      ) : (
        <>
          {report.summary && <p>{report.summary}</p>}
          {scope && (
            <p>
              {scope.label} · {displayPeriod(scope.period)}
              {scope.currency ? ` · ${scope.currency}` : ""}
            </p>
          )}
          <div className="intel-kpi-grid" aria-label="Primary business metrics">
            {report.primary.map((metric) => (
              <div className="intel-kpi" key={metric.metricId}>
                <span>{metric.label || metric.name}</span>
                <strong title={displayMetric(metric)}>
                  {displayMetric(metric, true)}
                </strong>
              </div>
            ))}
          </div>
          {performance && (
            <Panel
              title={
                performance.kind === "finance"
                  ? "Business performance"
                  : performance.kind === "delivery"
                    ? "Delivery commitments"
                    : "Planned capacity"
              }
              action={
                performance.kind === "finance" &&
                performance.series.length > 1 ? (
                  <div className="overview-chart-tabs">
                    <Button
                      variant="text"
                      aria-pressed={visual === "trend"}
                      onClick={() => setVisual("trend")}
                    >
                      Trend
                    </Button>
                    <Button
                      variant="text"
                      aria-pressed={visual === "compare"}
                      onClick={() => setVisual("compare")}
                    >
                      Compare
                    </Button>
                  </div>
                ) : undefined
              }
            >
              {performance.kind === "finance" &&
              performance.series.length > 1 &&
              visual === "trend" ? (
                <FinanceTrend
                  points={performance.series}
                  currency={performance.metrics[0].currency!}
                />
              ) : performance.kind === "resources" ? (
                <div className="table-profile-bars">
                  <MetricBar
                    metric={performance.metrics[0]}
                    max={Math.max(100, performance.metrics[0].value || 0)}
                  />
                  <p>
                    Planned allocation relative to available hours. 100% means
                    full planned capacity.
                  </p>
                </div>
              ) : (
                <div className="table-profile-bars">
                  {performance.metrics
                    .filter(
                      (m) =>
                        performance.kind !== "finance" ||
                        ["finance.revenue", "finance.expenses"].includes(
                          m.metricId,
                        ),
                    )
                    .map((metric) => (
                      <MetricBar
                        key={metric.metricId}
                        metric={metric}
                        max={Math.max(
                          1,
                          ...performance.metrics
                            .filter((m) => m.unit === metric.unit)
                            .map((m) => Math.abs(m.value || 0)),
                        )}
                      />
                    ))}
                </div>
              )}
              {performance.kind === "finance" && (
                <table className="live-records">
                  <tbody>
                    {performance.metrics
                      .filter((m) =>
                        ["finance.expenses", "finance.margin"].includes(
                          m.metricId,
                        ),
                      )
                      .map((metric) => (
                        <tr key={metric.metricId}>
                          <td>{metric.label}</td>
                          <td>{displayMetric(metric)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </Panel>
          )}
        </>
      )}
      {!!report.issues.length && (
        <Panel title="Needs attention">
          {report.issues.map((issue) => (
            <div key={issue.id}>
              <h3>{issue.title}</h3>
              {issue.metric.metricId === "resources.utilization" && (
                <p>
                  Assigned hours exceed available capacity for this reporting
                  period.
                </p>
              )}
              <p>
                {displayMetric(issue.metric)} · {issue.scopeLabel}
                {issue.department ? ` · ${issue.department}` : ""} ·{" "}
                {displayPeriod(issue.metric.period)}
              </p>
              <Link to={evidenceLink(issue.href, location.search)}>
                Investigate evidence
              </Link>
            </div>
          ))}
        </Panel>
      )}
      {!!report.additional.length && (
        <Panel title="Additional business reporting">
          <div className="intel-graph-viewport">
            <table className="live-records">
              <thead>
                <tr>
                  <th>Reporting scope</th>
                  <th>Validated measures</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {report.additional.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div>
                        {s.label}
                        {s.department ? ` · ${s.department}` : ""}
                      </div>
                      <small>{displayPeriod(s.period)}</small>
                    </td>
                    <td>
                      {s.metrics.map((m) => (
                        <div key={m.metricId}>
                          {m.label}: {displayMetric(m)}
                        </div>
                      ))}
                    </td>
                    <td>
                      <Button variant="text" onClick={() => onScope(s.id)}>
                        Open report
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </section>
  );
}
function MetricBar({ metric, max }: { metric: SemanticMetric; max: number }) {
  return (
    <div className="table-profile-bar">
      <span>{metric.label || metric.name}</span>
      <i
        role="img"
        aria-label={`${metric.label || metric.name}: ${displayMetric(metric)}`}
      >
        <b style={{ width: `${(Math.abs(metric.value || 0) / max) * 100}%` }} />
      </i>
      <span>{displayMetric(metric)}</span>
    </div>
  );
}
function FinanceTrend({
  points,
  currency,
}: {
  points: { date: string; revenue: number; costs: number }[];
  currency: string;
}) {
  const max = Math.max(1, ...points.flatMap((p) => [p.revenue, p.costs])),
    min = Math.min(0, ...points.flatMap((p) => [p.revenue, p.costs]));
  const y = (v: number) => 180 - ((v - min) / (max - min)) * 150,
    x = (i: number) =>
      65 +
      ((Date.parse(points[i].date) - Date.parse(points[0].date)) /
        Math.max(
          86400000,
          Date.parse(points.at(-1)!.date) - Date.parse(points[0].date),
        )) *
        600;
  return (
    <div className="overview-financial-trend">
      <svg
        viewBox="0 0 700 220"
        role="img"
        aria-label={`Recognized revenue and operating expenses in ${currency}`}
      >
        {[min, (max + min) / 2, max].map((v, i) => (
          <g key={i}>
            <line
              x1="65"
              x2="665"
              y1={y(v)}
              y2={y(v)}
              stroke="currentColor"
              opacity=".12"
            />
            <text x="55" y={y(v) + 4} textAnchor="end">
              {new Intl.NumberFormat("en", { notation: "compact" }).format(v)}
            </text>
          </g>
        ))}
        {(["revenue", "costs"] as const).map((key, series) => (
          <g key={key}>
            <polyline
              fill="none"
              stroke={series ? "var(--muted)" : "var(--accent)"}
              strokeWidth="2"
              strokeDasharray={series ? "5 4" : undefined}
              points={points.map((p, i) => `${x(i)},${y(p[key])}`).join(" ")}
            />
            {points.map((p, i) => (
              <circle
                key={p.date}
                cx={x(i)}
                cy={y(p[key])}
                r="2"
                fill={series ? "var(--muted)" : "var(--accent)"}
              >
                <title>
                  {p.date} ·{" "}
                  {key === "revenue"
                    ? "Recognized revenue"
                    : "Operating expenses"}
                  :{" "}
                  {new Intl.NumberFormat("en", {
                    style: "currency",
                    currency,
                  }).format(p[key])}
                </title>
              </circle>
            ))}
          </g>
        ))}
        <text x="65" y="208">
          {points[0].date}
        </text>
        <text x="665" y="208" textAnchor="end">
          {points.at(-1)?.date}
        </text>
      </svg>
      <div className="overview-chart-key">
        <span>
          <i style={{ background: "var(--accent)" }} />
          Recognized revenue
        </span>
        <span>
          <i style={{ background: "var(--muted)" }} />
          Operating expenses
        </span>
        <span>{currency}</span>
      </div>
    </div>
  );
}
