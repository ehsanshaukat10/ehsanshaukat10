import { useState } from "react";
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
  const [department, setDepartment] = useState("all");
  const [chart, setChart] = useState("donut");
  const tables =
    department === "all"
      ? report.tables
      : report.tables.filter(
          (t) => (t.department || "Unassigned") === department,
        );
  const summary = operationalOverview(tables, dateInTimezone(timezone));
  const [selected, setSelected] = useState(summary.previewIndex);
  const table = report.tables[Math.min(selected, report.tables.length - 1)];
  const statuses = [
    ["Open / in progress", summary.counts.open],
    ["Completed / closed", summary.counts.completed],
    ["Blocked / flagged", summary.counts.flagged],
    ["Cancelled / archived", summary.counts.cancelled],
    ["Other statuses", summary.counts.other],
  ] as const;
  const departments = [...summary.departments].sort((a, b) =>
    a.name === "Unassigned"
      ? 1
      : b.name === "Unassigned"
        ? -1
        : b.flagged - a.flagged ||
          b.open - a.open ||
          a.name.localeCompare(b.name),
  );
  const measures = [...summary.measures].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const colors = [
    "var(--accent)",
    "color-mix(in srgb, var(--accent) 55%, white)",
    "var(--muted)",
    "var(--border)",
    "var(--light)",
  ];
  let offset = 0;
  const gradient = statuses
    .filter(([, value]) => value > 0)
    .map(([label, value]) => {
      const start = offset;
      offset += (value / summary.statusRecords) * 100;
      return `${colors[statuses.findIndex(([name]) => name === label)]} ${start}% ${offset}%`;
    })
    .join(",");
  const max = Math.max(1, ...statuses.map(([, value]) => value));
  return (
    <section
      className="operational-overview"
      aria-label="Business activity overview"
    >
      <div className="overview-data-controls">
        <Select
          label="Department"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
        >
          <option value="all">All departments</option>
          {[...new Set(report.tables.map((t) => t.department || "Unassigned"))]
            .sort()
            .map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
        </Select>
        <details className="overview-coverage" aria-label="Reporting coverage">
          <summary>
            {summary.records.toLocaleString()} records · {summary.pages} pages
          </summary>
          <span>
            {summary.workbooks} workbook{summary.workbooks === 1 ? "" : "s"} ·{" "}
            {summary.pages} mapped pages · {summary.records.toLocaleString()}{" "}
            imported records ·{" "}
            {summary.departments.filter((d) => d.name !== "Unassigned").length}{" "}
            assigned departments
          </span>
        </details>
      </div>
      {summary.statusRecords > 0 && (
        <>
          <div
            className="intel-kpi-grid"
            aria-label="Recorded activity metrics"
          >
            {[
              ["Open / in progress", summary.counts.open],
              ["Completed / closed", summary.counts.completed],
              ["Blocked / flagged", summary.counts.flagged],
              [
                summary.overdue === null ? "Status records" : "Overdue",
                summary.overdue === null
                  ? summary.statusRecords
                  : summary.overdue,
              ],
            ].map(([label, value]) => (
              <div className="intel-kpi" key={label}>
                <span>{label}</span>
                <strong>{Number(value).toLocaleString()}</strong>
              </div>
            ))}
          </div>
          <div className="operational-panels">
            <Panel
              title="Status across your business"
              action={
                <div
                  className="overview-chart-tabs"
                  aria-label="Status chart view"
                >
                  <Button
                    variant="text"
                    onClick={() => setChart("donut")}
                    aria-pressed={chart === "donut"}
                  >
                    Donut
                  </Button>
                  <Button
                    variant="text"
                    onClick={() => setChart("bars")}
                    aria-pressed={chart === "bars"}
                  >
                    Bars
                  </Button>
                </div>
              }
            >
              <div
                className={chart === "donut" ? "overview-status-visual" : ""}
              >
                {chart === "donut" && (
                  <div
                    className="overview-donut"
                    role="img"
                    aria-label={`Status distribution: ${statuses.map(([label, value]) => `${label} ${value}`).join(", ")}`}
                    style={{ background: `conic-gradient(${gradient})` }}
                  >
                    <div>
                      <strong>{summary.statusRecords}</strong>
                      <span>records</span>
                    </div>
                  </div>
                )}
                <div
                  className={`table-profile-bars ${chart === "donut" ? "overview-status-legend" : ""}`}
                >
                  {statuses
                    .filter(([, value]) => value > 0)
                    .map(([label, value]) => (
                      <div className="table-profile-bar" key={label}>
                        <span>{label}</span>
                        <i
                          style={
                            chart === "donut"
                              ? {
                                  background:
                                    colors[
                                      statuses.findIndex(
                                        ([name]) => name === label,
                                      )
                                    ],
                                }
                              : undefined
                          }
                        >
                          {chart === "bars" && (
                            <b style={{ width: `${(value / max) * 100}%` }} />
                          )}
                        </i>
                        <span>{value.toLocaleString()}</span>
                      </div>
                    ))}
                </div>
              </div>
              <details className="mapping-detail">
                <summary>Calculation notes</summary>
                <p>
                  Counts reflect recorded rows, not unique items across pages.
                  Overdue includes open or flagged records past a mapped
                  deadline.
                </p>
              </details>
            </Panel>
            <Panel title="Activity by department">
              <div
                className="operational-departments"
                style={{ maxHeight: departments.length <= 6 ? "none" : 350 }}
              >
                {departments.map((team) => (
                  <div key={team.name}>
                    <strong>{team.name}</strong>
                    <div
                      className="overview-team-bar"
                      role="img"
                      aria-label={`${team.name}: ${team.open} open, ${team.completed} completed, ${team.flagged} flagged`}
                    >
                      {team.open + team.completed + team.flagged === 0 && (
                        <small>No open, closed or flagged statuses</small>
                      )}
                      {[team.open, team.completed, team.flagged].map(
                        (n, i) =>
                          n > 0 && (
                            <span
                              key={i}
                              title={`${["Open", "Completed", "Flagged"][i]}: ${n}`}
                              style={{
                                flex: n,
                                background: colors[i],
                                color: i === 1 ? "var(--text)" : "white",
                              }}
                            >
                              {n}
                            </span>
                          ),
                      )}
                    </div>
                    <small>{team.records.toLocaleString()} records</small>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </>
      )}
      {summary.measures.length > 0 && (
        <Panel title="Operational totals">
          <div className="intel-kpi-grid">
            {measures.slice(0, 8).map((measure) => (
              <div className="intel-kpi" key={measure.name}>
                <span>{measure.name}</span>
                <strong>
                  {measure.total.toLocaleString(undefined, {
                    maximumSignificantDigits: 12,
                  })}
                </strong>
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
              variant="text"
              onClick={() =>
                onExplore(Math.min(selected, report.tables.length - 1))
              }
            >
              View all records
            </Button>
          }
        >
          <Select
            label="Preview an imported worksheet"
            value={String(Math.min(selected, report.tables.length - 1))}
            onChange={(e) => setSelected(Number(e.target.value))}
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
                {table.rows.slice(0, 5).map((row, index) => (
                  <tr key={index}>
                    {table.headers.slice(0, 6).map((header, column) => (
                      <td key={header}>
                        {row[column] === null || row[column] === undefined
                          ? "—"
                          : String(row[column])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Showing {Math.min(5, table.rows.length)} of{" "}
            {table.rowCount.toLocaleString()} records
            {table.headers.length > 6 ? " · first 6 columns" : ""}.{" "}
            {table.department || "Department unassigned"}.
          </p>
        </Panel>
      )}
    </section>
  );
}
