import { useState } from "react";
import { Link } from "react-router-dom";
import { Database, Table2, Search, ArrowLeft, ArrowRight } from "lucide-react";
import { Button, Field } from "../../components/ui";
import { Panel } from "../intelligence/shared";
import "./table-review.css";
type Table = {
  title: string;
  purpose: string;
  headers: string[];
  types: string[];
  rows: (string | number | boolean | null)[][];
  rowCount: number;
  columns: {
    name: string;
    type: string;
    filled: number;
    missing: number;
    uniqueCount: number;
    categories: [string, number][];
  }[];
};
export type TableReport = {
  kind: "tables";
  relationships?: {
    from: number;
    to: number;
    fromColumn: string;
    toColumn: string;
    matched: number;
  }[];
  tables: Table[];
};
export function TableOverview({
  report,
  companyId,
}: {
  report: TableReport;
  companyId: string;
}) {
  const [selected, setSelected] = useState(0),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0),
    [related, setRelated] = useState<{ column: string; value: unknown } | null>(
      null,
    );
  const table = report.tables[Math.min(selected, report.tables.length - 1)];
  const filtered = table.rows.filter(
    (row) =>
      (!related ||
        row[table.headers.indexOf(related.column)] === related.value) &&
      (!query ||
        row.some((v) =>
          String(v ?? "")
            .toLowerCase()
            .includes(query.toLowerCase()),
        )),
  );
  const incoming = (report.relationships || []).filter(
    (link) => link.to === selected,
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 25));
  const current = Math.min(page, pages - 1);
  const cells = table.rowCount * table.headers.length;
  const filled = table.columns.reduce((n, c) => n + c.filled, 0);
  return (
    <section aria-label="Imported table dashboard">
      <div
        className="table-report-tabs"
        role="group"
        aria-label="Imported tables"
      >
        {report.tables.map((item, index) => (
          <Button
            key={index}
            variant={selected === index ? "primary" : "secondary"}
            onClick={() => {
              setSelected(index);
              setQuery("");
              setPage(0);
              setRelated(null);
            }}
          >
            <Table2 size={14} />
            {item.title}
          </Button>
        ))}
      </div>
      {!!report.relationships?.length && (
        <Panel title="Connected tables">
          <div className="table-relationships">
            {report.relationships.map((link, index) => (
              <div key={index}>
                <Table2 size={17} />
                <span>
                  {report.tables[link.from].title}
                  <small>{link.fromColumn}</small>
                </span>
                <ArrowRight size={20} />
                <span>
                  {report.tables[link.to].title}
                  <small>{link.toColumn} · unique reference</small>
                </span>
                <small>{link.matched.toLocaleString()} linked records</small>
              </div>
            ))}
          </div>
          <p>
            Connections confirmed during import. Open a reference table to
            explore its related records.
          </p>
        </Panel>
      )}
      <div className="intel-kpi-grid">
        {[
          ["Records", table.rowCount.toLocaleString()],
          ["Columns", String(table.headers.length)],
          [
            "Filled cells",
            `${cells ? Math.round((filled / cells) * 100) : 0}%`,
          ],
          ["Table purpose", table.purpose],
        ].map(([label, value]) => (
          <div className="intel-kpi" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="table-report-grid">
        {table.columns
          .filter((c) => c.categories.length && c.uniqueCount < c.filled)
          .slice(0, 4)
          .map((column) => (
            <Panel
              key={column.name}
              title={column.name}
              action={<span className="intel-status">Record counts</span>}
            >
              <div className="table-profile-bars">
                {column.categories.map(([label, count], index) => (
                  <div className="table-profile-bar" key={index}>
                    <span title={label}>
                      {label.length > 45 ? label.slice(0, 45) + "…" : label}
                    </span>
                    <i>
                      <b
                        style={{
                          width: `${(count / Math.max(1, column.categories[0][1])) * 100}%`,
                        }}
                      />
                    </i>
                    <span>{count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <p>
                Top {column.categories.length} values · blank cells excluded
              </p>
            </Panel>
          ))}
        <Panel title="Column completeness" action={<Database size={15} />}>
          <div className="table-profile-bars">
            {table.columns.map((column) => (
              <div className="table-profile-bar" key={column.name}>
                <span>{column.name}</span>
                <i>
                  <b
                    style={{
                      width: `${(column.filled / table.rowCount) * 100}%`,
                    }}
                  />
                </i>
                <span>
                  {Math.round((column.filled / table.rowCount) * 100)}%
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <Panel
        title={table.title}
        action={
          <span className="intel-status">
            {filtered.length.toLocaleString()} records
          </span>
        }
      >
        {related && (
          <p role="status">
            Related to {String(related.value)}{" "}
            <Button
              variant="text"
              onClick={() => {
                setRelated(null);
                setPage(0);
              }}
            >
              Show all records
            </Button>
          </p>
        )}
        <div className="table-report-search">
          <Field
            label="Search this table"
            placeholder="Find a record…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
          <Search size={14} />
        </div>
        <div className="table-report-records">
          <table className="live-records">
            <thead>
              <tr>
                {table.headers.map((header, index) => (
                  <th key={header}>
                    {header}
                    <small style={{ display: "block", fontWeight: 400 }}>
                      {table.types[index]}
                    </small>
                  </th>
                ))}
                {!!incoming.length && <th>Related records</th>}
              </tr>
            </thead>
            <tbody>
              {filtered
                .slice(current * 25, (current + 1) * 25)
                .map((row, index) => (
                  <tr key={index}>
                    {table.headers.map((header, i) => (
                      <td key={header}>
                        {row[i] === null ? (
                          <span aria-label="Empty cell">—</span>
                        ) : (
                          String(row[i])
                        )}
                      </td>
                    ))}
                    {!!incoming.length && (
                      <td>
                        {incoming.map((link, index) => (
                          <Button
                            key={index}
                            variant="text"
                            disabled={
                              row[table.headers.indexOf(link.toColumn)] === null
                            }
                            onClick={() => {
                              setSelected(link.from);
                              setRelated({
                                column: link.fromColumn,
                                value:
                                  row[table.headers.indexOf(link.toColumn)],
                              });
                              setPage(0);
                              setQuery("");
                            }}
                          >
                            View {report.tables[link.from].title}
                            <ArrowRight size={13} />
                          </Button>
                        ))}
                      </td>
                    )}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && (
          <p role="status">No records match. Try another search.</p>
        )}
        <div className="intel-inline-links" style={{ marginTop: 16 }}>
          <Button
            variant="secondary"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            <ArrowLeft size={14} />
            Previous
          </Button>
          <span aria-live="polite">
            Page {current + 1} of {pages}
          </span>
          <Button
            variant="secondary"
            disabled={current >= pages - 1}
            onClick={() => setPage(current + 1)}
          >
            Next
            <ArrowRight size={14} />
          </Button>
        </div>
      </Panel>
      <p className="mapping-submit-note">
        Tables are reported separately. Financial charts require an explicitly
        mapped financial source.{" "}
        <Link to={`/companies/${companyId}/settings/connections`}>
          Manage imported data
        </Link>
      </p>
    </section>
  );
}
