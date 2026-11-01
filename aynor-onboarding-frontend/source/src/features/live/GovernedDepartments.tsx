import { useLocation, Link } from "react-router-dom";
import { Panel, Blank } from "../intelligence/shared";
import type { Company } from "../../lib/api";
import {
  GovernedModule,
  useGovernedModule,
  EvidenceLink,
} from "./GovernedModule";
import { displayMetric, displayPeriod } from "./semantic-types";
export function GovernedDepartments({ company }: { company: Company }) {
  const parts = useLocation().pathname.split("/").slice(4);
  let department = "";
  try {
    department = decodeURIComponent(parts[0] || "");
  } catch {}
  const m = useGovernedModule(company, department);
  let metricId = "";
  try {
    metricId = parts[1] === "metrics" ? decodeURIComponent(parts[2] || "") : "";
  } catch {
    metricId = "unavailable";
  }
  const report = m.report;
  const scopeLabel = (id: string) =>
    report?.scopes.find((s) => s.id === id)?.label;
  const metrics = (report?.metrics || []).filter(
    (v) =>
      (!department || v.department === department) &&
      (!m.query.get("scope") || v.scope === m.query.get("scope")),
  );
  const concerns = (report?.concerns || []).filter(
    (v) =>
      (!department || v.department === department) &&
      (!m.query.get("scope") || v.metric.scope === m.query.get("scope")),
  );
  const available = !department || report?.departments.includes(department);
  const root = m.base + "/departments";
  const metric = metricId
    ? metrics.find((v) => v.metricId === metricId && v.state === "validated")
    : null;
  const title = metric?.name || department || "Departments";
  return (
    <GovernedModule
      title={title}
      description={
        metric
          ? "Governed business measure"
          : department
            ? "Validated performance and supporting evidence."
            : "Performance from your authorized business data."
      }
      module={m}
      back={department ? m.back || m.link(root) : undefined}
    >
      {!available ? (
        <Blank
          title="Department unavailable"
          text="This department is not configured or is outside your access."
        />
      ) : metricId ? (
        metric && metric.period ? (
          <>
            <div className="intel-kpi-grid">
              <div className="intel-kpi">
                <span>{metric.name}</span>
                <strong>{displayMetric(metric)}</strong>
                <small>{displayPeriod(metric.period)}</small>
              </div>
            </div>
            <Panel title="Definition & supporting records">
              <p>{metric.definition}</p>
              <p>{scopeLabel(metric.scope)}</p>
              <EvidenceLink
                companyId={company.id}
                href={`${m.base}/overview?scope=${encodeURIComponent(metric.scope)}&evidence=${encodeURIComponent(metric.metricId)}&source=${metric.lineage.sourceId}&tab=${metric.lineage.tabId}&revision=${report!.datasetRevision}`}
                search={m.query.toString()}
                origin={m.origin}
              />
            </Panel>
          </>
        ) : (
          <Blank
            title="Measure unavailable"
            text="No validated measure matches this department and reporting scope. Missing values are not zero."
          />
        )
      ) : department ? (
        <>
          <div className="intel-kpi-grid">
            {metrics
              .filter((v) => v.state === "validated" && v.period)
              .slice(0, 4)
              .map((v) => (
                <Link
                  className="intel-kpi"
                  key={v.scope + v.metricId}
                  to={m.link(
                    `${root}/${encodeURIComponent(department)}/metrics/${v.metricId}?scope=${encodeURIComponent(v.scope)}`,
                    m.origin,
                  )}
                >
                  <span>{v.name}</span>
                  <strong>{displayMetric(v)}</strong>
                  <small>
                    {scopeLabel(v.scope)} · {displayPeriod(v.period!)}
                    {v.currency ? ` · ${v.currency}` : ""}
                  </small>
                </Link>
              ))}
          </div>
          <Panel title="Business measures">
            {metrics.some((v) => v.state === "validated") ? (
              metrics
                .filter((v) => v.state === "validated" && v.period)
                .map((v) => (
                  <Link
                    className="intel-row"
                    key={v.scope + v.metricId}
                    to={m.link(
                      `${root}/${encodeURIComponent(department)}/metrics/${v.metricId}?scope=${encodeURIComponent(v.scope)}`,
                      m.origin,
                    )}
                  >
                    <span>
                      {v.name}
                      <small>
                        {scopeLabel(v.scope)} · {displayPeriod(v.period!)}
                        {v.currency ? ` · ${v.currency}` : ""}
                      </small>
                    </span>
                    <strong>{displayMetric(v)}</strong>
                  </Link>
                ))
            ) : (
              <Blank
                title="No validated business measures"
                text="Available records have not established a supported measure for this scope. An administrator can review source configuration."
                action={
                  report?.authorization.canManageSources ? (
                    <Link to={m.link(m.base + "/connections?map=1", m.origin)}>
                      Review data connections
                    </Link>
                  ) : undefined
                }
              />
            )}
          </Panel>
          <Panel title="Needs attention">
            {concerns.length ? (
              concerns.map((c) => (
                <div key={c.id}>
                  <h3>{c.title}</h3>
                  <p>
                    {displayMetric(c.metric)} · {displayPeriod(c.metric.period)}
                  </p>
                  <Link
                    to={m.link(
                      `${m.base}/actions/${encodeURIComponent(c.id)}`,
                      m.origin,
                    )}
                  >
                    Review recommendation
                  </Link>{" "}
                  ·{" "}
                  <EvidenceLink
                    companyId={company.id}
                    href={c.href}
                    search={m.query.toString()}
                    origin={m.origin}
                  />
                </div>
              ))
            ) : (
              <p>
                {metrics.some(
                  (v) => v.state !== "validated" && v.state !== "unavailable",
                )
                  ? "Some measures need review; concerns have not been fully assessed."
                  : "No supported concern is currently flagged in the available validated measures."}
              </p>
            )}
          </Panel>
        </>
      ) : (
        <Panel title="Department performance">
          {report?.departments
            .filter(
              (d) =>
                (!m.query.get("department") ||
                  d === m.query.get("department")) &&
                (!m.query.get("scope") ||
                  metrics.some((v) => v.department === d)),
            )
            .map((d) => {
              const ds = metrics.filter((v) => v.department === d),
                valid = ds.filter((v) => v.state === "validated"),
                issues = concerns.filter((c) => c.department === d);
              return (
                <Link
                  className="intel-row"
                  key={d}
                  to={m.link(
                    `${root}/${encodeURIComponent(d)}?department=${encodeURIComponent(d)}`,
                    m.origin,
                  )}
                >
                  <span>
                    {d}
                    <small>
                      {valid.length
                        ? `${valid.length} validated measures · ${issues.length} supported concerns`
                        : "No validated business reporting in this scope"}
                    </small>
                  </span>
                  <span>
                    {issues.length
                      ? "Needs attention"
                      : valid.length
                        ? ds.some((v) => v.state !== "validated")
                          ? "Partial data"
                          : "Validated data available"
                        : "Not assessed"}
                  </span>
                </Link>
              );
            })}
          {!report?.departments.length && (
            <Blank
              title="No authorized departments"
              text="An administrator can review your department assignments and business-data permissions."
            />
          )}
        </Panel>
      )}
    </GovernedModule>
  );
}
