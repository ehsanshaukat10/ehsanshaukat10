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
  const [view, setView] = useState("summary");
  const tables =
    department === "all"
      ? report.tables
      : report.tables.filter(
          (t) => (t.department || "Unassigned") === department,
        );
  const summary = operationalOverview(tables, dateInTimezone(timezone));
  const [selected, setSelected] = useState(summary.previewIndex);
  const selectedIndex = Math.min(selected, report.tables.length - 1);
  const table = report.tables[selectedIndex];
  const statuses = [
    ["Open / in progress", summary.counts.open],
    ["Completed / closed", summary.counts.completed],
    ["Blocked / flagged", summary.counts.flagged],
    ["Cancelled / archived", summary.counts.cancelled],
    ["Other statuses", summary.counts.other],
  ] as const;
  const departments = [...summary.departments].sort((a, b) =>
    a.name === b.name
      ? 0
      : a.name === "Unassigned"
        ? 1
        : b.name === "Unassigned"
          ? -1
          : b.flagged - a.flagged ||
            b.open - a.open ||
            a.name.localeCompare(b.name),
  );
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
            imported records
          </span>
        </details>
      </div>
      {summary.statusRecords > 0 && (
        <div className="intel-kpi-grid" aria-label="Recorded activity metrics">
          {[
            ...statuses.slice(0, 3),
            [
              summary.overdue === null ? "Status records" : "Overdue",
              summary.overdue ?? summary.statusRecords,
            ],
          ].map(([label, value]) => (
            <div className="intel-kpi" key={label}>
              <span>{label}</span>
              <strong>{Number(value).toLocaleString()}</strong>
            </div>
          ))}
        </div>
      )}
      <div
        className="overview-chart-tabs overview-section-tabs"
        aria-label="Overview sections"
      >
        {[
          ["summary", "Summary"],
          ["departments", "Departments"],
          ["records", "Worksheet records"],
        ].map(([id, label]) => (
          <Button
            key={id}
            variant="text"
            aria-pressed={view === id}
            onClick={() => setView(id)}
          >
            {label}
          </Button>
        ))}
      </div>
      {view === "summary" && (
        <div className="overview-summary-grid">
          <Panel title="Status breakdown">
            {summary.statusRecords > 0 ? (
              <div className="overview-status-rows">
                {statuses
                  .filter(([, n]) => n > 0)
                  .map(([label, n]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <div className="overview-status-track">
                        <i
                          style={{
                            width: `${(n / summary.statusRecords) * 100}%`,
                          }}
                        />
                      </div>
                      <strong>{n.toLocaleString()}</strong>
                      <small>
                        {Math.round((n / summary.statusRecords) * 100)}%
                      </small>
                    </div>
                  ))}
              </div>
            ) : (
              <p>No status column mapped.</p>
            )}
            <details className="mapping-detail">
              <summary>Calculation notes</summary>
              <p>
                Counts reflect recorded rows, not unique items across pages.
                Overdue includes open or flagged rows past a mapped deadline.
              </p>
            </details>
          </Panel>
          <Panel title="Operational totals">
            {summary.measures.length ? (
              <dl className="overview-measure-list">
                {[...summary.measures]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((measure) => (
                    <div key={measure.name}>
                      <dt>{measure.name}</dt>
                      <dd>
                        {measure.total.toLocaleString(undefined, {
                          maximumSignificantDigits: 12,
                        })}
                      </dd>
                    </div>
                  ))}
              </dl>
            ) : (
              <p>No quantity or hours columns mapped.</p>
            )}
          </Panel>
        </div>
      )}
      {view === "departments" && (
        <Panel title="Activity by department">
          <div className="operational-departments operational-preview">
            <table className="live-records overview-department-table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Records</th>
                  <th>Open</th>
                  <th>Completed</th>
                  <th>Flagged</th>
                </tr>
              </thead>
              <tbody>
                {departments.map((team) => (
                  <tr key={team.name}>
                    <td>{team.name}</td>
                    <td>{team.records.toLocaleString()}</td>
                    <td>{team.open}</td>
                    <td>{team.completed}</td>
                    <td>{team.flagged}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      {view === "records" && table && (
        <Panel
          title="Worksheet records"
          action={
            <Button variant="text" onClick={() => onExplore(selectedIndex)}>
              View all records
            </Button>
          }
        >
          <Select
            label="Preview an imported worksheet"
            value={String(selectedIndex)}
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
            {Math.min(5, table.rows.length)} of{" "}
            {table.rowCount.toLocaleString()} records ·{" "}
            {table.department || "Unassigned"}
          </p>
        </Panel>
      )}
    </section>
  );
}
