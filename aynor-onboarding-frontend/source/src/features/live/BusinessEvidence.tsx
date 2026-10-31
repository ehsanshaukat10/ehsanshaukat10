import { connectionsLink, evidenceReturn } from "./dashboard-navigation";
import { intelligenceQuery } from "./intelligence-cache";
import { useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button, ErrorBox } from "../../components/ui";
import { serverRequest } from "../../lib/runtime";
import { Panel } from "../intelligence/shared";
import {
  displayMetric,
  displayPeriod,
  type SemanticMetric,
} from "./semantic-types";
type Evidence = {
  metric: SemanticMetric;
  columns: string[];
  rows: unknown[][];
  total: number;
  sourceTitle: string;
  tabTitle: string;
};
export function BusinessEvidence({
  companyId,
  sourceId,
  tabId,
  metricId,
}: {
  companyId: string;
  sourceId: string;
  tabId: string;
  metricId: string;
}) {
  const location = useLocation();
  const [data, setData] = useState<Evidence | null>(null),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true,
      sequence = 0;
    setData(null);
    setError("");
    const reload = () => {
      const current = ++sequence;
      return serverRequest<Evidence>(
        `/companies/${companyId}/intelligence/evidence?sourceId=${encodeURIComponent(sourceId)}&tabId=${encodeURIComponent(tabId)}&metricId=${encodeURIComponent(metricId)}&revision=${encodeURIComponent(new URLSearchParams(location.search).get("revision") || "")}&${intelligenceQuery(location.search)}`,
      )
        .then((value) => {
          if (active && current === sequence) {
            setData(value);
            setError("");
          }
        })
        .catch((e) => {
          if (active && current === sequence) {
            setData(null);
            setError(e.message);
          }
        });
    };
    void reload();
    const timer = setInterval(() => void reload(), 15000);
    window.addEventListener("focus", reload);

    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", reload);
    };
  }, [companyId, sourceId, tabId, metricId, revision, location.search]);
  return (
    <div className="intel-page">
      <Link
        className="intel-back"
        to={evidenceReturn(
          companyId,
          location.pathname + location.search + location.hash,
        )}
      >
        Back to overview
      </Link>
      <div className="intel-heading">
        <h1>{data?.metric.name || "Business evidence"}.</h1>
      </div>
      <ErrorBox>{error}</ErrorBox>
      {error ? (
        <>
          <Button variant="secondary" onClick={() => setRevision((v) => v + 1)}>
            Retry evidence
          </Button>
          <Link
            to={connectionsLink(
              companyId,
              `/companies/${companyId}/connections?business=1&source=${encodeURIComponent(sourceId)}&tab=${encodeURIComponent(tabId)}`,
              location.pathname + location.search + location.hash,
            )}
          >
            Review data
          </Link>
        </>
      ) : !data ? (
        <p role="status">Loading supporting evidence…</p>
      ) : (
        <>
          <div className="intel-kpi-grid">
            <div className="intel-kpi">
              <span>{data.metric.name}</span>
              <strong>{displayMetric(data.metric)}</strong>
              <small>{displayPeriod(data.metric.period)}</small>
            </div>
          </div>
          <Panel title="What this measure means">
            <p>{data.metric.definition}</p>
            {data.metric.department && (
              <p>Department: {data.metric.department}</p>
            )}
            <p>
              Source: {data.sourceTitle} / {data.tabTitle}
            </p>
          </Panel>
          <Panel title="Supporting records">
            <div
              className="operational-preview"
              role="region"
              aria-label="Supporting records"
              tabIndex={0}
            >
              <table className="live-records">
                <thead>
                  <tr>
                    {data.columns.map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, i) => (
                    <tr key={i}>
                      {row.map((v, j) => (
                        <td key={j}>{String(v ?? "—")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              {data.rows.length} of {data.total} contributing records. Dates and
              amounts use the confirmed reporting scope.
            </p>
          </Panel>
        </>
      )}
    </div>
  );
}
