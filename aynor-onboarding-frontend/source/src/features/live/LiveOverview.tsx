import { TableOverview, type TableReport } from "./TableOverview";
import { Select } from "./LiveSelect";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Database, RefreshCw } from "lucide-react";
import { Button, ErrorBox } from "../../components/ui";
import type { Company } from "../../lib/api";
import { serverRequest } from "../../lib/runtime";
import { useSheetStatus } from "./SheetsConnection";
import { Panel } from "../intelligence/shared";
import "../dashboard/dashboard.css";
import "../intelligence/intelligence.css";
type Point = { date: string; revenue: number; costs: number };
type Overview = {
  tableReport?: TableReport;
  data: {
    points: Point[];
    totals: {
      revenue: number;
      costs: number;
      profit: number;
      margin: number | null;
    };
    start: string;
    endExclusive: string;
    recordsAvailable: number;
  } | null;
};
export function LiveOverview({ company }: { company: Company }) {
  const { source, error: streamError } = useSheetStatus(
      company.id,
      ["Owner", "Admin"].includes(company.role),
    ),
    [period, setPeriod] = useState("quarter"),
    [report, setReport] = useState<Overview | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [selected, setSelected] = useState(0);
  const base = `/companies/${company.id}`;
  useEffect(() => {
    if (source?.hasSnapshot && source.syncMode === "manual") setPeriod("all");
  }, [source?.mode, source?.hasSnapshot]);
  useEffect(() => {
    if (!["Owner", "Admin"].includes(company.role)) return;
    let active = true;
    setBusy(true);
    serverRequest<Overview>(base + "/sheets/overview?period=" + period)
      .then((value) => {
        if (active) {
          setReport(
            (value.data as unknown as TableReport)?.kind === "tables"
              ? {
                  data: null,
                  tableReport: value.data as unknown as TableReport,
                }
              : value,
          );
          setError("");
          setSelected(0);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [company.id, period, source?.revision, source?.status, revision]);
  const money = (value: number) =>
    new Intl.NumberFormat("en", {
      style: "currency",
      currency: company.currency || "USD",
      maximumFractionDigits: 2,
    }).format(value);
  const grouped = new Map<string, Point>();
  for (const point of report?.data?.points || []) {
    const key = point.date.slice(0, 7),
      previous = grouped.get(key) || { date: key, revenue: 0, costs: 0 };
    previous.revenue += point.revenue;
    previous.costs += point.costs;
    grouped.set(key, previous);
  }
  const points = [...grouped.values()],
    data = report?.data,
    active = points[Math.min(selected, points.length - 1)],
    max = Math.max(1, ...points.flatMap((p) => [p.revenue, p.costs])),
    min = Math.min(0, ...points.flatMap((p) => [p.revenue, p.costs])),
    y = (value: number) => 185 - ((value - min) / (max - min)) * 160;
  if (!["Owner", "Admin"].includes(company.role))
    return (
      <div className="intel-page">
        <h1>Overview.</h1>
        <Panel title="Scoped reporting">
          <p>
            The connected financial source is company-wide. An Owner or Admin
            can access it; department-level reporting is not yet available.
          </p>
        </Panel>
      </div>
    );
  return (
    <div className="intel-page exec-dashboard" aria-busy={busy}>
      <div className="intel-heading">
        <div>
          <span className="exec-eyebrow">Executive perspective</span>
          <h1>Overview.</h1>
          <p>
            {company.name} ·{" "}
            {report?.tableReport
              ? "Imported business data"
              : "Connected business performance"}
          </p>
        </div>
        {!report?.tableReport && (
          <Select
            label="Reporting period"
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
          >
            <option value="all">All available records</option>
            <option value="month">Last complete month</option>
            <option value="quarter">Last 3 complete months</option>
            <option value="year">Last 12 complete months</option>
          </Select>
        )}
      </div>
      <ErrorBox>{error || streamError}</ErrorBox>
      {error && (
        <Button variant="secondary" onClick={() => setRevision((v) => v + 1)}>
          Retry report
        </Button>
      )}
      <div className="intel-notice">
        <Database size={14} />
        <span>
          {source?.status === "syncing"
            ? "Syncing source…"
            : source?.stale
              ? "Source needs attention · last valid snapshot"
              : source?.lastSuccess
                ? (source.mode === "upload"
                    ? "File imported "
                    : "Last synced ") +
                  new Date(source.lastSuccess).toLocaleString()
                : "No validated source yet"}
        </span>
        <Link to={base + "/settings/connections"}>
          Manage data <ArrowUpRight size={13} />
        </Link>
      </div>
      {source?.error && <ErrorBox>{source.error}</ErrorBox>}
      {report?.tableReport ? (
        <TableOverview
          key={source?.revision}
          report={report.tableReport}
          companyId={company.id}
        />
      ) : !data || !points.length ? (
        <Panel
          title={
            data
              ? "No records in this period"
              : "Connect your first spreadsheet"
          }
        >
          <p>
            {data
              ? `The source contains ${data.recordsAvailable} records, but none fall between ${data.start} and ${data.endExclusive} (exclusive). Choose a different period or update the source dates.`
              : "Connect Google, upload an Excel or CSV file, or paste a shared sheet URL. Map your columns to see your real metrics here."}
          </p>
          <Link
            className="button secondary"
            to={base + "/settings/connections"}
          >
            Connect data <ArrowUpRight size={14} />
          </Link>
        </Panel>
      ) : (
        <>
          <div className="intel-kpi-grid">
            {[
              ["Revenue", money(data.totals.revenue)],
              ["Operating expenses", money(data.totals.costs)],
              ["Operating profit", money(data.totals.profit)],
              [
                "Operating margin",
                data.totals.margin === null
                  ? "Unavailable"
                  : data.totals.margin.toFixed(1) + "%",
              ],
            ].map(([label, value]) => (
              <div className="intel-kpi" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>
                  {data.start} — {data.endExclusive} (exclusive)
                </small>
              </div>
            ))}
          </div>
          <Panel
            title="Revenue & operating costs"
            action={<span className="intel-status">Validated source</span>}
          >
            <div className="live-legend">
              <span>● Revenue</span>
              <span>● Operating expenses</span>
            </div>
            {active && (
              <p aria-live="polite">
                {active.date} · {money(active.revenue)} revenue ·{" "}
                {money(active.costs)} expenses
              </p>
            )}
            <svg
              viewBox="0 0 850 225"
              role="img"
              aria-label="Monthly revenue and operating expense comparison from validated sheet records"
              style={{ width: "100%", maxHeight: 280 }}
            >
              {[0, 0.5, 1].map((t) => (
                <g key={t}>
                  <line
                    x1="90"
                    x2="835"
                    y1={25 + t * 160}
                    y2={25 + t * 160}
                    stroke="#eeedf5"
                  />
                  <text
                    x="80"
                    y={29 + t * 160}
                    textAnchor="end"
                    fill="#9992aa"
                    fontSize="10"
                  >
                    {money(max - (max - min) * t)}
                  </text>
                </g>
              ))}
              <line x1="90" x2="835" y1={y(0)} y2={y(0)} stroke="#bdb4d5" />
              {points.map((point, i) => {
                const slot = 735 / points.length,
                  x = 95 + (i + 0.5) * slot,
                  w = Math.min(28, slot * 0.28);
                return (
                  <g key={point.date}>
                    <rect
                      x={x - w - 2}
                      y={Math.min(y(0), y(point.revenue))}
                      width={w}
                      height={Math.abs(y(0) - y(point.revenue))}
                      rx="3"
                      fill="#9c8cdb"
                    >
                      <title>
                        {point.date}: revenue {money(point.revenue)}
                      </title>
                    </rect>
                    <rect
                      x={x + 2}
                      y={Math.min(y(0), y(point.costs))}
                      width={w}
                      height={Math.abs(y(0) - y(point.costs))}
                      rx="3"
                      fill="#ddd7ec"
                    >
                      <title>
                        {point.date}: expenses {money(point.costs)}
                      </title>
                    </rect>
                    <text
                      x={x}
                      y="213"
                      textAnchor="middle"
                      fontSize="10"
                      fill="#9992aa"
                    >
                      {point.date}
                    </text>
                  </g>
                );
              })}
            </svg>
            <div className="intel-tabs">
              {points.map((point, i) => (
                <button
                  key={point.date}
                  aria-pressed={selected === i}
                  onClick={() => setSelected(i)}
                >
                  {point.date}
                </button>
              ))}
            </div>
          </Panel>
          <Panel title="Source records">
            <p>
              Daily totals across {data.points.length} reporting dates. No
              synthetic comparisons or growth claims are added.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table className="live-records">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Revenue</th>
                    <th>Operating expenses</th>
                  </tr>
                </thead>
                <tbody>
                  {data.points.slice(0, 100).map((point) => (
                    <tr key={point.date}>
                      <td>{point.date}</td>
                      <td>{money(point.revenue)}</td>
                      <td>{money(point.costs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.points.length > 100 && (
              <p>
                Showing the first 100 daily totals. Charts and metrics include
                all dates in this period.
              </p>
            )}
          </Panel>
        </>
      )}
      {busy && (
        <p role="status">
          <RefreshCw size={12} /> Updating report…
        </p>
      )}
    </div>
  );
}
