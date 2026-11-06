import { useCompanyIntelligence } from "./useCompanyIntelligence";
import { Link, useSearchParams } from "react-router-dom";
import { Database, RefreshCw } from "lucide-react";
import { formatSyncTime } from "../../../shared/sync-time.mjs";
import { Button, ErrorBox } from "../../components/ui";
import type { Company } from "../../lib/api";
import { useSheetStatus } from "./SheetsConnection";
import { Panel } from "../intelligence/shared";
import { connectionsLink } from "./dashboard-navigation";
import { useLocation } from "react-router-dom";
import { GovernedOverview } from "./GovernedOverview";
import { BusinessEvidence } from "./BusinessEvidence";
import { AskContextLink } from "./AskContextLink";
import "../dashboard/dashboard.css";
import "../intelligence/intelligence.css";
import "./operational-overview.css";
export function LiveOverview({ company }: { company: Company }) {
  const [query] = useSearchParams(),
    location = useLocation();
  const companyQuery = new URLSearchParams(location.search);
  companyQuery.delete("scope");
  companyQuery.delete("department");
  const sourceAdmin = ["Owner", "Admin"].includes(company.role),
    { source } = useSheetStatus(company.id, sourceAdmin),
    evidence = query.get("evidence") || "";
  const { report, error, busy, retry } = useCompanyIntelligence(
    company,
    companyQuery.toString(),
    !evidence,
    `${source?.revision}:${source?.status}`,
  );
  if (evidence)
    return (
      <BusinessEvidence
        key={`${company.id}:${evidence}:${query.get("source")}:${query.get("tab")}`}
        companyId={company.id}
        sourceId={query.get("source") || ""}
        tabId={query.get("tab") || ""}
        metricId={evidence}
      />
    );
  const executive = report?.executive;
  const checked = Math.min(
    ...(executive?.primary || []).map(
      (m) => m.freshness.lastSuccess || Infinity,
    ),
  );
  return (
    <div
      className="intel-page exec-dashboard concise-overview"
      aria-busy={busy}
    >
      <div className="intel-heading">
        <div>
          <h1>Overview.</h1>
        </div>
        <div className="intel-heading-actions">
          <AskContextLink
            companyId={company.id}
            search={companyQuery.toString()}
            origin={location.pathname + location.search}
            focus="overview"
          />
          <details className="overview-source-details intel-notice">
            <summary>
              <Database size={14} />
              Data status{busy ? " · Updating…" : ""}
            </summary>
            {Number.isFinite(checked) && (
              <p>
                Reporting data checked{" "}
                <time dateTime={new Date(checked).toISOString()}>
                  {formatSyncTime(checked, company.timezone)}
                </time>
              </p>
            )}
            <Link
              to={connectionsLink(
                company.id,
                `/companies/${company.id}/connections`,
                location.pathname + location.search + location.hash,
              )}
            >
              Data connections
            </Link>
          </details>
        </div>
      </div>
      <ErrorBox>{error}</ErrorBox>
      {error && (
        <>
          {report && <p>Displayed values are from the last saved report.</p>}
          <Button variant="secondary" onClick={retry}>
            Retry report
          </Button>
        </>
      )}
      {executive ? (
        <GovernedOverview
          report={executive}
          readOnly={!report?.authorization.canManageSources}
        />
      ) : busy ? (
        <span className="sr-only" role="status">
          Loading business overview…
        </span>
      ) : (
        <Panel title="Reporting unavailable">{null}</Panel>
      )}
      {busy && report && (
        <p role="status">
          <RefreshCw size={12} /> Updating report…
        </p>
      )}
    </div>
  );
}
