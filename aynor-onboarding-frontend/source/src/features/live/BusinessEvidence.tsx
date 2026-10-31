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
  scope,
}: {
  companyId: string;
  sourceId: string;
  tabId: string;
  metricId: string;
  scope: string;
}) {
  const [data, setData] = useState<Evidence | null>(null),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    serverRequest<Evidence>(
      `/companies/${companyId}/sources/${encodeURIComponent(sourceId)}/evidence?tabId=${encodeURIComponent(tabId)}&metricId=${encodeURIComponent(metricId)}`,
    )
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [companyId, sourceId, tabId, metricId, revision]);
  return (
    <div className="intel-page">
      <Link
        className="intel-back"
        to={`/companies/${companyId}/overview?scope=${encodeURIComponent(scope)}`}
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
            to={`/companies/${companyId}/connections?business=1&source=${encodeURIComponent(sourceId)}&tab=${encodeURIComponent(tabId)}`}
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
            <div className="operational-preview">
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
