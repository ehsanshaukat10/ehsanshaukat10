import { ArrowUpRight } from "lucide-react";
import { OperationalOverview } from "./OperationalOverview";
import { useState } from "react";
import { Link } from "react-router-dom";
import { businessOverview } from "../../../shared/business-overview.mjs";
import { useApp } from "../../lib/context";
import { Button } from "../../components/ui";
import { Panel } from "../intelligence/shared";
import { TableOverview, type TableReport } from "./TableOverview";
export function BusinessOverview({
  report,
  companyId,
  currency,
  timezone = "UTC",
}: {
  report: TableReport;
  companyId: string;
  currency: string;
  timezone?: string;
}) {
  const { user } = useApp();
  const key = `aynor.reporting-pages.${user?.id}.${companyId}`;
  const [selection, setSelection] = useState<string[] | undefined>(() => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return Array.isArray(value) && value.every((v) => typeof v === "string")
        ? value
        : undefined;
    } catch {
      return undefined;
    }
  });
  const [exploring, setExploring] = useState(false);
  const [exploreIndex, setExploreIndex] = useState(0);
  const summary = businessOverview(report.tables, currency, selection);
  const money = (n: number | null, unit: string) =>
    n === null
      ? "Unavailable"
      : new Intl.NumberFormat("en", {
          style: "currency",
          currency: unit,
          maximumFractionDigits: 2,
        }).format(n);
  const owners = [
    ...new Set(report.tables.map((t) => t.department).filter(Boolean)),
  ];
  const failed = report.tables.filter((t) => t.error);
  return (
    <section aria-label="Combined business overview">
      {failed.length > 0 && (
        <div className="intel-notice" role="status">
          {failed.length} worksheet page{failed.length === 1 ? "" : "s"} need
          attention. The overview retains their last saved data.{" "}
          <Link to={`/companies/${companyId}/connections?map=1`}>
            Review page issues
          </Link>
        </div>
      )}
      {summary.groups.map((group) => (
        <section
          key={group.currency}
          aria-label={`${group.currency} business performance`}
        >
          <div className="intel-kpi-grid">
            {[
              ["Revenue", money(group.revenue, group.currency)],
              ["Operating expenses", money(group.costs, group.currency)],
              ["Operating profit", money(group.profit, group.currency)],
              [
                "Operating margin",
                group.margin === null
                  ? "Unavailable"
                  : `${group.margin.toFixed(1)}%`,
              ],
            ].map(([label, value]) => (
              <div className="intel-kpi" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>
                  {group.currency} · combined from {group.pages} confirmed
                  financial page{group.pages === 1 ? "" : "s"}
                </small>
              </div>
            ))}
          </div>
          <Panel title={`Business performance · ${group.currency}`}>
            <p>
              Revenue and expenses combined by reporting date. Each currency
              stays separate.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table className="live-records">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Revenue</th>
                    <th>Operating expenses</th>
                    <th>Operating profit</th>
                  </tr>
                </thead>
                <tbody>
                  {group.points.slice(-30).map((point) => (
                    <tr key={point.date}>
                      <td>{point.date}</td>
                      <td>{money(point.revenue, group.currency)}</td>
                      <td>{money(point.costs, group.currency)}</td>
                      <td>
                        {money(point.revenue - point.costs, group.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!group.safe && (
              <p role="alert">
                Combined amounts exceed safe reporting precision. Review the
                financial pages separately.
              </p>
            )}
          </Panel>
        </section>
      ))}
      <OperationalOverview
        report={report}
        timezone={timezone}
        onExplore={(index) => {
          setExploreIndex(index);
          setExploring(true);
        }}
      />
      {!summary.groups.length && (
        <details className="market-report-note">
          <summary>Financial reporting setup</summary>
          <p>
            {report.sources?.length || 1} workbook
            {report.sources?.length === 1 ? "" : "s"} · {report.tables.length}{" "}
            imported worksheet pages
            {owners.length ? ` · ${owners.length} departments` : ""}.
          </p>
          <p>
            {summary.conflicts.length
              ? "Some financial pages contain matching totals. Choose the pages to include below before combining them."
              : "Financial totals need confirmed Date, Money in and Money out fields. Your activity summaries and records are already shown above."}
          </p>
          <Link to={`/companies/${companyId}/connections?map=1`}>
            Review business column properties
          </Link>
        </details>
      )}
      {summary.financial.length > 0 && (
        <details className="mapping-detail">
          <summary>Financial pages included in this overview</summary>
          <p>
            Include transaction-level pages that belong in your business totals.
            Exclude summary copies or overlapping exports. Amounts without a
            currency column use your company currency ({currency}).
          </p>
          {summary.conflicts.length > 0 && (
            <p role="status">
              Matching financial pages were detected. They are excluded by
              default until you choose which copies belong in the overview.
            </p>
          )}
          {summary.financial.map((table) => (
            <label className="auto-ai-consent" key={table.key}>
              <input
                type="checkbox"
                checked={summary.selected.includes(table.key)}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...summary.selected, table.key]
                    : summary.selected.filter((id) => id !== table.key);
                  setSelection(next);
                  try {
                    localStorage.setItem(key, JSON.stringify(next));
                  } catch {}
                }}
              />
              <span>
                {table.parentTitle} / {table.title}
                <small>
                  {table.department || "Unassigned"} ·{" "}
                  {table.currency || currency}
                  {summary.conflicts.includes(table.key)
                    ? " · matches another financial page"
                    : ""}
                </small>
              </span>
            </label>
          ))}
        </details>
      )}
      <div className="market-data-tools" aria-label="Data tools">
        <Button variant="secondary" onClick={() => setExploring(!exploring)}>
          {exploring ? "Close imported records" : "Explore imported records"}
        </Button>
        <Link to={`/companies/${companyId}/connections`}>
          Data connections <ArrowUpRight size={12} />
        </Link>
      </div>
      {exploring && (
        <TableOverview
          key={exploreIndex}
          report={report}
          companyId={companyId}
          currency={currency}
          initialSelected={exploreIndex}
          timezone={timezone}
        />
      )}
    </section>
  );
}
