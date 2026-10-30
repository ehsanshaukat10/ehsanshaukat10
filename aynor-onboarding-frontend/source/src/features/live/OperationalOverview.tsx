import { useMemo, useState } from "react";
import {
  CircleDot,
  CircleCheck,
  Flag,
  Clock3,
  Database,
  Search,
  ArrowUpRight,
} from "lucide-react";
import { operationalOverview } from "../../../shared/operational-overview.mjs";
import { dateInTimezone } from "../../../shared/sync-time.mjs";
import { Panel } from "../intelligence/shared";
import { Button } from "../../components/ui";
import { Select } from "./LiveSelect";
import type { TableReport } from "./TableOverview";
import "./operational-overview.css";
export function OperationalOverview({
  report,
  timezone,
  onExplore,
}: {
  report: TableReport;
  timezone: string;
  onExplore: (index: number) => void;
}) {
  const today = dateInTimezone(timezone);
  const summary = useMemo(
    () => operationalOverview(report.tables, today),
    [report.tables, today],
  );
  const [selected, setSelected] = useState(summary.previewIndex),
    [chart, setChart] = useState("distribution"),
    [query, setQuery] = useState("");
  const table = report.tables[Math.min(selected, report.tables.length - 1)];
  const statuses = [
    {
      label: "Open / in progress",
      value: summary.counts.open,
      color: "#635bdb",
    },
    {
      label: "Completed / closed",
      value: summary.counts.completed,
      color: "#16877a",
    },
    {
      label: "Blocked / flagged",
      value: summary.counts.flagged,
      color: "#c58137",
    },
    {
      label: "Cancelled / archived",
      value: summary.counts.cancelled,
      color: "#94a0b3",
    },
    { label: "Other statuses", value: summary.counts.other, color: "#d6dce6" },
  ];
  const max = Math.max(1, ...statuses.map((item) => item.value));
  let offset = 0;
  const segments = statuses
    .filter((item) => item.value > 0)
    .map((item) => {
      const start = offset;
      offset += (item.value / summary.statusRecords) * 100;
      return `${item.color} ${start}% ${offset}%`;
    });
  const filtered = useMemo(
    () =>
      table?.rows.filter(
        (row) =>
          !query ||
          row.some((value) =>
            String(value ?? "")
              .toLowerCase()
              .includes(query.toLowerCase()),
          ),
      ) || [],
    [table, query],
  );
  const metrics = [
    {
      label: "Open / in progress",
      value: summary.counts.open,
      note: "Awaiting completion",
      Icon: CircleDot,
      tone: "open",
    },
    {
      label: "Completed / closed",
      value: summary.counts.completed,
      note: "Recorded as complete",
      Icon: CircleCheck,
      tone: "complete",
    },
    {
      label: "Blocked / flagged",
      value: summary.counts.flagged,
      note: "Requires attention",
      Icon: Flag,
      tone: "flagged",
    },
    {
      label: summary.overdue === null ? "Status records" : "Overdue",
      value: summary.overdue === null ? summary.statusRecords : summary.overdue,
      note:
        summary.overdue === null
          ? "With a recorded status"
          : "Past a mapped deadline",
      Icon: Clock3,
      tone: "overdue",
    },
  ];
  return (
    <section
      className="operational-overview"
      aria-label="Business activity overview"
    >
      <div className="operational-coverage" aria-label="Reporting coverage">
        <Database size={14} />
        <span>
          {summary.workbooks} workbook{summary.workbooks === 1 ? "" : "s"} ·{" "}
          {summary.pages} mapped pages · {summary.records.toLocaleString()}{" "}
          imported records ·{" "}
          {summary.departments.filter((d) => d.name !== "Unassigned").length}{" "}
          departments
        </span>
        <span className="ops-coverage-label">SOURCE COVERAGE</span>
      </div>
      {summary.statusRecords > 0 && (
        <>
          <div
            className="intel-kpi-grid ops-kpis"
            aria-label="Recorded activity metrics"
          >
            {metrics.map(({ label, value, note, Icon, tone }) => (
              <div className={`intel-kpi ops-kpi ops-${tone}`} key={label}>
                <span>
                  <i className="ops-kpi-icon">
                    <Icon size={15} />
                  </i>
                  {label}
                </span>
                <strong>{value.toLocaleString()}</strong>
                <small>{note}</small>
              </div>
            ))}
          </div>
          <div className="operational-panels">
            <Panel
              title="Status across your business"
              action={
                <div
                  className="ops-chart-switch"
                  aria-label="Status chart view"
                >
                  <button
                    type="button"
                    aria-pressed={chart === "distribution"}
                    onClick={() => setChart("distribution")}
                  >
                    Distribution
                  </button>
                  <button
                    type="button"
                    aria-pressed={chart === "breakdown"}
                    onClick={() => setChart("breakdown")}
                  >
                    Breakdown
                  </button>
                </div>
              }
            >
              {chart === "distribution" ? (
                <div className="ops-distribution">
                  <div
                    className="ops-donut"
                    role="img"
                    aria-label={`Status distribution across ${summary.statusRecords} recorded statuses`}
                    style={{
                      background: `conic-gradient(${segments.join(",")})`,
                    }}
                  >
                    <div>
                      <strong>{summary.statusRecords.toLocaleString()}</strong>
                      <span>status records</span>
                    </div>
                  </div>
                  <div className="ops-legend">
                    {statuses
                      .filter((item) => item.value > 0)
                      .map((item) => (
                        <div key={item.label}>
                          <i style={{ background: item.color }} />
                          <span>{item.label}</span>
                          <strong>{item.value.toLocaleString()}</strong>
                          <small>
                            {Math.round(
                              (item.value / summary.statusRecords) * 100,
                            )}
                            %
                          </small>
                        </div>
                      ))}
                  </div>
                </div>
              ) : (
                <div className="ops-status-bars">
                  {statuses
                    .filter((item) => item.value > 0)
                    .map((item) => (
                      <div key={item.label}>
                        <div>
                          <span>{item.label}</span>
                          <strong>{item.value.toLocaleString()}</strong>
                        </div>
                        <i>
                          <b
                            style={{
                              width: `${(item.value / max) * 100}%`,
                              background: item.color,
                            }}
                          />
                        </i>
                      </div>
                    ))}
                </div>
              )}
              <details className="ops-method">
                <summary>How these figures are calculated</summary>
                <p>
                  Counts use recorded Status, State or Stage values. An item
                  repeated across worksheet pages can appear more than once.
                  Overdue counts require a mapped deadline.
                </p>
              </details>
            </Panel>
            <Panel
              title="Activity by department"
              action={
                <span className="ops-panel-meta">
                  {
                    summary.departments.filter(
                      (team) => team.name !== "Unassigned",
                    ).length
                  }{" "}
                  departments
                </span>
              }
            >
              <div
                className="ops-department-scroll operational-departments"
                style={{
                  maxHeight: summary.departments.length <= 6 ? "none" : 320,
                }}
              >
                <table className="ops-department-table">
                  <thead>
                    <tr>
                      <th>Department</th>
                      <th>Open</th>
                      <th>Closed</th>
                      <th>Flagged</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.departments.map((team) => (
                      <tr key={team.name}>
                        <td>
                          <div>
                            <i
                              className={`ops-team-mark ${team.name === "Unassigned" ? "is-unassigned" : ""}`}
                            >
                              {team.name === "Unassigned"
                                ? "—"
                                : team.name.slice(0, 2).toUpperCase()}
                            </i>
                            <span>
                              <strong>{team.name}</strong>
                              <small>
                                {team.pages} pages ·{" "}
                                {team.records.toLocaleString()} records
                              </small>
                            </span>
                          </div>
                        </td>
                        <td>{team.open}</td>
                        <td>{team.completed}</td>
                        <td>
                          <span
                            className={team.flagged ? "ops-flag-count" : ""}
                          >
                            {team.flagged}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="ops-panel-footer">
                Consolidated from your mapped worksheet pages.
              </div>
            </Panel>
          </div>
        </>
      )}
      {summary.measures.length > 0 && (
        <Panel
          title="Operational measures"
          action={<span className="ops-panel-meta">Recorded totals</span>}
        >
          <div className="ops-measures">
            {summary.measures.slice(0, 8).map((measure) => (
              <div key={measure.name}>
                <span>{measure.name}</span>
                <strong>
                  {measure.total.toLocaleString(undefined, {
                    maximumSignificantDigits: 12,
                  })}
                </strong>
                <small>
                  {measure.values} values · {measure.pages} page
                  {measure.pages === 1 ? "" : "s"}
                </small>
              </div>
            ))}
          </div>
        </Panel>
      )}
      {table && (
        <Panel
          title="Worksheet records"
          action={
            <Button
              variant="secondary"
              onClick={() =>
                onExplore(Math.min(selected, report.tables.length - 1))
              }
            >
              View all records <ArrowUpRight size={13} />
            </Button>
          }
        >
          <div className="ops-record-toolbar">
            <Select
              label="Preview an imported worksheet"
              value={String(Math.min(selected, report.tables.length - 1))}
              onChange={(e) => {
                setSelected(Number(e.target.value));
                setQuery("");
              }}
            >
              {report.tables.map((item, index) => (
                <option
                  value={index}
                  key={`${item.sourceId}:${item.tabId}:${index}`}
                >
                  {item.parentTitle ? `${item.parentTitle} / ` : ""}
                  {item.title}
                </option>
              ))}
            </Select>
            <label className="ops-record-search">
              <Search size={15} />
              <input
                type="search"
                aria-label="Filter preview records"
                placeholder="Search worksheet…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>
          <div className="operational-preview">
            <table className="live-records">
              <thead>
                <tr>
                  {table.headers.slice(0, 6).map((header) => (
                    <th key={header}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 5).map((row, index) => (
                  <tr key={index}>
                    {table.headers.slice(0, 6).map((header, column) => {
                      const value =
                        row[column] === null || row[column] === undefined
                          ? "—"
                          : String(row[column]);
                      const status = /^(status|stage|state|result)$/i.test(
                        header.trim(),
                      );
                      const tone =
                        /^(done|paid|complete|completed|passed|closed|approved)$/i.test(
                          value,
                        )
                          ? "is-complete"
                          : /^(failed|blocked|overdue|rejected)$/i.test(value)
                            ? "is-flagged"
                            : /^(open|pending|in progress|new)$/i.test(value)
                              ? "is-open"
                              : "";
                      return (
                        <td key={header}>
                          {status ? (
                            <span className={`ops-status-pill ${tone}`}>
                              {value}
                            </span>
                          ) : (
                            value
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length && (
              <p className="ops-no-results">No records match “{query}”.</p>
            )}
          </div>
          <div className="ops-record-footer">
            <span>
              Showing {Math.min(5, filtered.length)} of{" "}
              {query
                ? filtered.length.toLocaleString()
                : table.rowCount.toLocaleString()}{" "}
              {query ? "matching " : ""}records
              {table.headers.length > 6 ? " · first 6 columns" : ""}
            </span>
            <span>{table.department || "Unassigned department"}</span>
          </div>
        </Panel>
      )}
    </section>
  );
}
