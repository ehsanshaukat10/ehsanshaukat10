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
  const summary = operationalOverview(report.tables, dateInTimezone(timezone));
  const [selected, setSelected] = useState(summary.previewIndex);
  const table = report.tables[Math.min(selected, report.tables.length - 1)];
  const statuses = [
    ["Open / in progress", summary.counts.open],
    ["Completed / closed", summary.counts.completed],
    ["Blocked / flagged", summary.counts.flagged],
    ["Cancelled / archived", summary.counts.cancelled],
    ["Other statuses", summary.counts.other],
  ] as const;
  const max = Math.max(1, ...statuses.map(([, value]) => value));
  return (
    <section
      className="operational-overview"
      aria-label="Business activity overview"
    >
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
                <small>
                  {label === "Overdue"
                    ? "Open or flagged records past a mapped deadline"
                    : "From recorded Status, State or Stage values"}
                </small>
              </div>
            ))}
          </div>
          <div className="operational-panels">
            <Panel title="Status across your business">
              <div className="table-profile-bars">
                {statuses
                  .filter(([, value]) => value > 0)
                  .map(([label, value]) => (
                    <div className="table-profile-bar" key={label}>
                      <span>{label}</span>
                      <i>
                        <b style={{ width: `${(value / max) * 100}%` }} />
                      </i>
                      <span>{value.toLocaleString()}</span>
                    </div>
                  ))}
              </div>
              <p>
                {summary.statusRecords.toLocaleString()} status records across
                mapped pages. Counts reflect spreadsheet rows; an item repeated
                on multiple pages can appear more than once.
              </p>
            </Panel>
            <Panel title="Activity by department">
              <div className="operational-departments">
                {summary.departments.map((team) => (
                  <div key={team.name}>
                    <strong>{team.name}</strong>
                    <span>
                      {team.open} open · {team.completed} completed ·{" "}
                      {team.flagged} flagged
                    </span>
                    <small>
                      {team.pages} pages · {team.records.toLocaleString()}{" "}
                      imported records
                    </small>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </>
      )}
      {summary.measures.length > 0 && (
        <Panel title="Recorded operational measures">
          <div className="intel-kpi-grid">
            {summary.measures.slice(0, 8).map((measure) => (
              <div className="intel-kpi" key={measure.name}>
                <span>{measure.name}</span>
                <strong>
                  {measure.total.toLocaleString(undefined, {
                    maximumSignificantDigits: 12,
                  })}
                </strong>
                <small>
                  Recorded sum · {measure.pages} page
                  {measure.pages === 1 ? "" : "s"} · {measure.values} values
                </small>
              </div>
            ))}
          </div>
        </Panel>
      )}
      <div className="operational-coverage" aria-label="Reporting coverage">
        <span>
          {summary.workbooks} workbook{summary.workbooks === 1 ? "" : "s"} ·{" "}
          {summary.pages} mapped pages · {summary.records.toLocaleString()}{" "}
          imported records ·{" "}
          {summary.departments.filter((d) => d.name !== "Unassigned").length}{" "}
          departments
        </span>
      </div>
      {table && (
        <Panel
          title="Your data at a glance"
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
            {table.department || "Department unassigned"}. Your source stays
            unchanged.
          </p>
        </Panel>
      )}
    </section>
  );
}
