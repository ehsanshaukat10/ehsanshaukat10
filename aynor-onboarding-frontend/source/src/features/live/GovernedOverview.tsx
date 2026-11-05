import { connectionsLink, evidenceLink } from "./dashboard-navigation";
import { useLocation } from "react-router-dom";
import { useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../components/ui";
import {
  ArrowUpRight,
  BadgeCheck,
  BadgeDollarSign,
  Boxes,
  BriefcaseBusiness,
  Building2,
  CircleAlert,
  Layers3,
  Megaphone,
  Target,
  Users,
} from "lucide-react";
import { Panel } from "../intelligence/shared";
import {
  displayMetric,
  displayPeriod,
  type ExecutiveReport,
  type SemanticMetric,
} from "./semantic-types";
export function GovernedOverview({
  report,
  readOnly = false,
}: {
  report: ExecutiveReport;
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
  const coveredDepartments = new Set(
    report.additional.map((item) => item.department).filter(Boolean),
  ).size;
  const validatedMeasures = report.additional.reduce(
    (total, item) => total + item.metrics.length,
    0,
  );
  return (
    <section aria-label="Executive business overview">
      {report.dataStatus && !report.primary.length && (
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
          {scope ? (
            <p>
              {scope.label} · {displayPeriod(scope.period)}
              {scope.currency ? ` · ${scope.currency}` : ""}
            </p>
          ) : (
            <p className="overview-section-kicker">Executive snapshot</p>
          )}
          <div className="intel-kpi-grid" aria-label="Primary business metrics">
            {report.primary.map((metric) => {
              const [metricLabel, scopeLabel] = (
                metric.label || metric.name
              ).split(" · ");
              return (
                <div
                  className="intel-kpi overview-primary-kpi"
                  key={metric.scope + metric.metricId}
                >
                  <div className="overview-kpi-heading">
                    <span>{scopeLabel || "Validated KPI"}</span>
                    <MetricMiniChart metric={metric} />
                  </div>
                  <strong title={displayMetric(metric)}>
                    {displayMetric(metric, true)}
                  </strong>
                  <span className="overview-kpi-label">{metricLabel}</span>
                </div>
              );
            })}
          </div>
          {!scope && (
            <div
              className="overview-coverage-strip"
              aria-label="Reporting coverage"
            >
              <div>
                <Building2 size={17} />
                <strong>{coveredDepartments}</strong>
                <span>Departments covered</span>
              </div>
              <div>
                <BadgeCheck size={17} />
                <strong>{validatedMeasures}</strong>
                <span>Validated measures</span>
              </div>
              <div>
                <Layers3 size={17} />
                <strong>{report.additional.length}</strong>
                <span>Reporting scopes</span>
              </div>
              <div>
                <CircleAlert size={17} />
                <strong>{report.issues.length}</strong>
                <span>Needs attention</span>
              </div>
            </div>
          )}
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
                  {performance.capacity && (
                    <>
                      <table className="live-records">
                        <tbody>
                          <tr>
                            <td>Assigned hours</td>
                            <td>
                              {performance.capacity.assignedHours.toLocaleString()}
                            </td>
                          </tr>
                          <tr>
                            <td>Available hours</td>
                            <td>
                              {performance.capacity.availableHours.toLocaleString()}
                            </td>
                          </tr>
                          <tr>
                            <td>Remaining capacity</td>
                            <td>
                              {performance.capacity.remainingHours.toLocaleString()}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      {!!performance.capacity.people.length && (
                        <div className="intel-graph-viewport">
                          <h3>Workload by confirmed resource</h3>
                          <table className="live-records">
                            <thead>
                              <tr>
                                <th>Resource</th>
                                <th>Assigned</th>
                                <th>Available</th>
                                <th>Remaining</th>
                                <th>Utilization</th>
                              </tr>
                            </thead>
                            <tbody>
                              {performance.capacity.people.map((person) => (
                                <tr key={person.id}>
                                  <td>{person.id}</td>
                                  <td>
                                    {person.assignedHours.toLocaleString()}
                                  </td>
                                  <td>
                                    {person.availableHours.toLocaleString()}
                                  </td>
                                  <td>
                                    {person.remainingHours.toLocaleString()}
                                  </td>
                                  <td>
                                    {person.utilization === null
                                      ? "Unavailable"
                                      : `${person.utilization.toFixed(1)}%`}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  )}
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
        <section
          className="overview-department-reporting"
          aria-labelledby="department-performance-title"
        >
          <div className="overview-section-heading">
            <div>
              <h2 id="department-performance-title">Department performance</h2>
              <p>
                Performance by function, using each team’s confirmed reporting
                period.
              </p>
            </div>
            <Link to={`/companies/${companyId}/departments`}>
              View departments
            </Link>
          </div>
          <div className="overview-department-grid">
            {report.additional.map((scope) => {
              const percentage = scope.metrics.find(
                (metric) => metric.unit === "percent",
              );
              const featured =
                percentage ||
                (scope.purpose === "marketing"
                  ? scope.metrics.find(
                      (metric) =>
                        metric.metricId === "marketing.qualified_leads",
                    ) ||
                    scope.metrics.find(
                      (metric) => metric.metricId === "marketing.leads",
                    )
                  : scope.purpose === "operations"
                    ? scope.metrics.find(
                        (metric) =>
                          metric.metricId === "operations.reorder_items",
                      ) ||
                      scope.metrics.find(
                        (metric) => metric.metricId === "operations.on_hand",
                      )
                    : undefined);
              return (
                <article className="overview-department-card" key={scope.id}>
                  <header>
                    <div className="overview-department-title">
                      <span className="overview-department-icon">
                        <MetricIcon metricId={`${scope.purpose}.`} />
                      </span>
                      <div>
                        <h3>{scope.department || scope.label}</h3>
                        <p>
                          {scope.department
                            ? scope.label
                            : "Company-wide reporting"}
                        </p>
                      </div>
                    </div>
                    <small>{displayPeriod(scope.period)}</small>
                  </header>
                  {featured && (
                    <div className="overview-percentage-visual">
                      <div
                        className={`overview-percentage-ring${percentage ? "" : " is-stat"}`}
                        style={
                          percentage
                            ? ({
                                "--value": `${Math.max(0, Math.min(100, percentage.value || 0)) * 3.6}deg`,
                              } as CSSProperties)
                            : undefined
                        }
                      >
                        <strong>{displayMetric(featured, true)}</strong>
                      </div>
                      <div>
                        <span>{featured.label}</span>
                        <small>
                          {percentage
                            ? "Validated percentage for this reporting period"
                            : "Validated headline measure for this reporting period"}
                        </small>
                        <PeriodTrace />
                      </div>
                    </div>
                  )}
                  <div className="overview-department-metrics">
                    {scope.metrics
                      .filter(
                        (metric) => metric.metricId !== featured?.metricId,
                      )
                      .map((metric) => {
                        return (
                          <div
                            className="overview-department-metric"
                            key={metric.metricId}
                          >
                            <span>{metric.label}</span>
                            <strong>{displayMetric(metric, true)}</strong>
                          </div>
                        );
                      })}
                  </div>
                  {scope.department && (
                    <Link
                      to={`/companies/${companyId}/departments/${encodeURIComponent(scope.department)}`}
                    >
                      Open department <ArrowUpRight size={14} />
                    </Link>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}
    </section>
  );
}
function MetricMiniChart({ metric }: { metric: SemanticMetric }) {
  const points = metric.series || [];
  if (points.length < 2)
    return (
      <span
        className="overview-current-value"
        aria-label="Current validated value"
      >
        <i />
      </span>
    );
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const coords = points
    .map(
      (point, index) =>
        `${(index / (points.length - 1)) * 72},${22 - ((point.value - min) / range) * 18}`,
    )
    .join(" ");
  return (
    <svg
      className="overview-metric-sparkline"
      viewBox="0 0 72 26"
      role="img"
      aria-label={`${metric.label || metric.name} across ${points.length} validated reporting dates`}
    >
      <polyline points={coords} />
      <circle cx="72" cy={coords.split(" ").at(-1)!.split(",")[1]} r="2.5" />
    </svg>
  );
}
function PeriodTrace() {
  return (
    <span className="overview-period-trace" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}
function MetricIcon({ metricId }: { metricId: string }) {
  const props = { size: 17, strokeWidth: 1.7, "aria-hidden": true } as const;
  if (metricId.startsWith("finance.")) return <BadgeDollarSign {...props} />;
  if (metricId.startsWith("sales.")) return <Target {...props} />;
  if (metricId.startsWith("resources.")) return <Users {...props} />;
  if (metricId.startsWith("marketing.")) return <Megaphone {...props} />;
  if (metricId.startsWith("operations.")) return <Boxes {...props} />;
  return <BriefcaseBusiness {...props} />;
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
