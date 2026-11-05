import { useLocation, Link } from "react-router-dom";
import { Panel, Blank } from "../intelligence/shared";
import type { Company } from "../../lib/api";
import {
  GovernedModule,
  useGovernedModule,
  EvidenceLink,
} from "./GovernedModule";
import { displayMetric, displayPeriod } from "./semantic-types";
import {
  ArrowUpRight,
  BadgeDollarSign,
  Boxes,
  BriefcaseBusiness,
  Building2,
  CircleCheck,
  CircleDashed,
  Megaphone,
  Users,
} from "lucide-react";
export function GovernedDepartments({ company }: { company: Company }) {
  const parts = useLocation().pathname.split("/").slice(4);
  let department = "";
  try {
    department = decodeURIComponent(parts[0] || "");
  } catch {}
  const m = useGovernedModule(company, department, true);
  let metricId = "";
  try {
    metricId = parts[1] === "metrics" ? decodeURIComponent(parts[2] || "") : "";
  } catch {
    metricId = "unavailable";
  }
  const report = m.report;
  const departments = Array.isArray(report?.departments)
    ? report.departments
    : company.data.departments || [];
  const worksheets = Array.isArray(report?.worksheets) ? report.worksheets : [];
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
  const available = !department || departments.includes(department);
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
      actions={
        !department && report?.authorization.canManageSources ? (
          <Link
            className="button secondary"
            to={`${m.base}/onboarding/departments?return=settings-departments`}
          >
            Manage departments
          </Link>
        ) : undefined
      }
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
        <section
          className="department-directory"
          aria-labelledby="department-performance-title"
        >
          <div className="department-summary-strip">
            <div>
              <Building2 size={18} />
              <strong>{departments.length}</strong>
              <span>Departments</span>
            </div>
            <div>
              <CircleCheck size={18} />
              <strong>
                {
                  departments.filter((d) =>
                    metrics.some(
                      (v) => v.department === d && v.state === "validated",
                    ),
                  ).length
                }
              </strong>
              <span>Reporting ready</span>
            </div>
            <div>
              <BriefcaseBusiness size={18} />
              <strong>
                {metrics.filter((v) => v.state === "validated").length}
              </strong>
              <span>Validated measures</span>
            </div>
            <div>
              <CircleDashed size={18} />
              <strong>{concerns.length}</strong>
              <span>Needs attention</span>
            </div>
          </div>
          <div className="department-directory-heading">
            <div>
              <span>COMPANY FUNCTIONS</span>
              <h2 id="department-performance-title">Department performance</h2>
              <p>Reporting coverage and validated measures by department.</p>
            </div>
          </div>
          <div className="department-card-grid">
            {departments
              .filter(
                (d) =>
                  !m.query.get("scope") ||
                  metrics.some((v) => v.department === d),
              )
              .map((d) => {
                const ds = metrics.filter((v) => v.department === d),
                  valid = ds.filter((v) => v.state === "validated"),
                  issues = concerns.filter((c) => c.department === d),
                  assignedPages = worksheets.filter(
                    (worksheet) => worksheet.department === d,
                  ),
                  assignedSources = new Set(
                    assignedPages.map((worksheet) => worksheet.sourceId),
                  ).size;
                return (
                  <Link
                    className={`department-card${valid.length ? " is-ready" : " is-empty"}`}
                    key={d}
                    to={m.link(
                      `${root}/${encodeURIComponent(d)}?department=${encodeURIComponent(d)}`,
                      m.origin,
                    )}
                  >
                    <header>
                      <span className="department-card-icon">
                        <DepartmentIcon name={d} />
                      </span>
                      <div>
                        <h3>{d}</h3>
                        <small>
                          {valid.length
                            ? `${assignedSources} assigned ${assignedSources === 1 ? "source" : "sources"} · ${assignedPages.length} worksheet ${assignedPages.length === 1 ? "page" : "pages"} · ${valid.length} validated measures · ${issues.length} supported concerns`
                            : assignedPages.length
                              ? `${assignedSources} assigned ${assignedSources === 1 ? "source" : "sources"} · measures need review`
                              : "No reporting source assigned"}
                        </small>
                      </div>
                      <span
                        className={`department-status ${issues.length ? "needs-attention" : valid.length ? "ready" : "unassessed"}`}
                      >
                        {issues.length
                          ? "Needs attention"
                          : valid.length
                            ? ds.some((v) => v.state !== "validated")
                              ? "Partial data"
                              : "Validated data available"
                            : "Not assessed"}
                      </span>
                    </header>
                    {valid.length ? (
                      <div className="department-card-metrics">
                        {valid.slice(0, 2).map((metric) => (
                          <div key={metric.scope + metric.metricId}>
                            <span>{metric.name}</span>
                            <strong>{displayMetric(metric, true)}</strong>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="department-card-empty">
                        <CircleDashed size={20} />
                        <span>Connect or assign a reporting source</span>
                      </div>
                    )}
                    <footer>
                      Open department <ArrowUpRight size={14} />
                    </footer>
                  </Link>
                );
              })}
            {!departments.length && (
              <Blank
                title="No authorized departments"
                text="An administrator can review your department assignments and business-data permissions."
              />
            )}
          </div>
        </section>
      )}
    </GovernedModule>
  );
}

function DepartmentIcon({ name }: { name: string }) {
  const props = { size: 19, strokeWidth: 1.7, "aria-hidden": true } as const;
  if (/finance|account|revenue/i.test(name))
    return <BadgeDollarSign {...props} />;
  if (/people|human|talent|hr/i.test(name)) return <Users {...props} />;
  if (/market|brand|growth/i.test(name)) return <Megaphone {...props} />;
  if (/operation|inventory|supply/i.test(name)) return <Boxes {...props} />;
  return <BriefcaseBusiness {...props} />;
}
