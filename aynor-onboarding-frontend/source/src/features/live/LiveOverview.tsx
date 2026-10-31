import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Database, RefreshCw } from "lucide-react";
import { formatSyncTime } from "../../../shared/sync-time.mjs";
import { useApp } from "../../lib/context";
import { ApiError, serverRequest } from "../../lib/runtime";
import { Button, ErrorBox } from "../../components/ui";
import type { Company } from "../../lib/api";
import { useSheetStatus } from "./SheetsConnection";
import { Panel } from "../intelligence/shared";
import { Select } from "./LiveSelect";
import { OverviewSkeleton } from "./OverviewSkeleton";
import {
  readOverviewCache,
  writeOverviewCache,
  clearOverviewCache,
} from "./overview-cache";
import { GovernedOverview } from "./GovernedOverview";
import { BusinessEvidence } from "./BusinessEvidence";
import type { ExecutiveSnapshot } from "./semantic-types";
import "../dashboard/dashboard.css";
import "../intelligence/intelligence.css";
import "./operational-overview.css";
export function LiveOverview({ company }: { company: Company }) {
  const { user } = useApp(),
    [query, setQuery] = useSearchParams();
  const cacheScope = `${user?.id}:${company.id}:${company.role}:executive-v1`,
    cached = readOverviewCache(cacheScope);
  const [report, setReport] = useState<ExecutiveSnapshot | null>(
      () => (cached?.report as ExecutiveSnapshot) || null,
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true),
    [revision, setRevision] = useState(0);
  const allowed = ["Owner", "Admin"].includes(company.role),
    { source } = useSheetStatus(company.id, allowed),
    requested = query.get("scope") || "",
    evidence = query.get("evidence") || "";
  useEffect(() => {
    if (!allowed || evidence) return;
    let active = true;
    setBusy(true);
    serverRequest<ExecutiveSnapshot>(
      `/companies/${company.id}/sources/intelligence?scope=${encodeURIComponent(requested)}&view=executive`,
    )
      .then((view) => {
        if (active) {
          setReport(view);
          writeOverviewCache(cacheScope, "all", view);
          setError("");
        }
      })
      .catch((e) => {
        if (active) {
          if (e instanceof ApiError && [401, 403, 404].includes(e.status)) {
            clearOverviewCache(cacheScope);
            setReport(null);
          }
          setError(
            e instanceof ApiError && [401, 403, 404].includes(e.status)
              ? "Business reporting is unavailable for your current access."
              : "Unable to refresh business reporting. Retry.",
          );
        }
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [
    company.id,
    cacheScope,
    allowed,
    requested,
    evidence,
    source?.revision,
    source?.status,
    revision,
  ]);
  if (!allowed)
    return (
      <div className="intel-page">
        <h1>Overview.</h1>
        <Panel title="Scoped reporting">
          <p>An Owner or Admin can access company-wide business reporting.</p>
        </Panel>
      </div>
    );
  if (evidence)
    return (
      <BusinessEvidence
        key={`${company.id}:${evidence}:${query.get("source")}:${query.get("tab")}`}
        companyId={company.id}
        sourceId={query.get("source") || ""}
        tabId={query.get("tab") || ""}
        metricId={evidence}
        scope={requested}
      />
    );
  const executive = report?.executive;
  const checked = Math.min(
    ...(executive?.primary || []).map(
      (m) => m.freshness.lastSuccess || Infinity,
    ),
  );
  function chooseScope(scope: string) {
    setQuery({ scope });
  }
  return (
    <div
      className="intel-page exec-dashboard concise-overview"
      aria-busy={busy}
    >
      <div className="intel-heading">
        <div>
          <h1>Overview.</h1>
        </div>
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
          <Link to={`/companies/${company.id}/connections`}>
            Data connections
          </Link>
        </details>
      </div>
      <ErrorBox>{error}</ErrorBox>
      {error && (
        <>
          <p>
            Unable to refresh. Any displayed values are from the last saved
            report.
          </p>
          <Button variant="secondary" onClick={() => setRevision((v) => v + 1)}>
            Retry report
          </Button>
        </>
      )}
      {executive && executive.scopes.length > 1 && (
        <Select
          label="Reporting scope"
          value={executive.selectedScope || ""}
          onChange={(e) => chooseScope(e.target.value)}
        >
          {executive.scopes.map((s) => (
            <option value={s.id} key={s.id}>
              {s.label}
              {s.department ? ` · ${s.department}` : ""}
              {s.currency ? ` · ${s.currency}` : ""}
            </option>
          ))}
        </Select>
      )}
      {executive ? (
        <GovernedOverview report={executive} onScope={chooseScope} />
      ) : busy ? (
        <OverviewSkeleton />
      ) : (
        <Panel title="Reporting unavailable">
          <Button variant="secondary" onClick={() => setRevision((v) => v + 1)}>
            Retry report
          </Button>
        </Panel>
      )}
      {busy && report && (
        <p role="status">
          <RefreshCw size={12} /> Updating report…
        </p>
      )}
    </div>
  );
}
