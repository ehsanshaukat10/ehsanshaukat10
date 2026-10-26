import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { Modal, Button } from "../../components/ui";
import { PerformanceChart } from "../dashboard/ExecutiveDashboard";
import {
  ModulePage,
  Panel,
  Blank,
  Evidence,
  AskLink,
  Status,
  useExecutive,
  type ModuleProps,
} from "./shared";
import {
  departmentMetrics,
  departmentStatus,
  metricRecord,
  formattedMetric,
  type MetricKey,
} from "./records";
export function Departments(props: ModuleProps) {
  const e = useExecutive(props.company),
    parts = useLocation().pathname.split("/").slice(4),
    department = parts[0],
    metric = parts[1] === "metrics" ? parts[2] : undefined,
    [record, setRecord] = useState(""),
    [selected, setSelected] = useState(0);
  useEffect(() => {
    const index =
      e.sample?.points.findIndex((p) => p.date === e.query.get("point")) ?? 0;
    setSelected(Math.max(0, index));
  }, [e.period, e.query.get("point")]);
  let detail: string | null = null;
  try {
    detail = department ? decodeURIComponent(department) : null;
  } catch {
    detail = department || null;
  }
  const list = e.base + "/departments";
  const back = e.back || e.link(list);
  const q = e.query.get("q") || "",
    filter = e.query.get("filter") || "All";
  const change = (key: string, value: string) => {
    const query = new URLSearchParams(e.query);
    query.set(key, value);
    e.setQuery(query);
  };
  if (detail && !props.company.data.departments.includes(detail))
    return (
      <ModulePage title="Department unavailable" exec={e} back={back}>
        <Blank
          title="This department is no longer available"
          text="It may have been removed or excluded from your access."
          action={
            <Link className="button secondary" to={e.link(list)}>
              Return to departments
            </Link>
          }
        />
      </ModulePage>
    );
  if (metric && detail) {
    const id = metric as MetricKey;
    if (!departmentMetrics(detail, e).includes(id))
      return (
        <ModulePage title="Metric unavailable" exec={e} back={back}>
          <Blank
            title="No mapped measure"
            text="This measure is not available in the selected department."
            action={
              <Link to={e.link(e.base + "/settings/connections", e.origin)}>
                Review mapping <ArrowUpRight size={12} />
              </Link>
            }
          />
        </ModulePage>
      );
    const m = metricRecord(id, detail, e);
    return (
      <ModulePage
        title={m.label}
        description={detail}
        exec={e}
        back={back}
        actions={
          <AskLink
            exec={e}
            context={`${detail} · ${m.label}`}
            question={`Explain ${m.label.toLowerCase()} and its supporting evidence.`}
          />
        }
      >
        <div className="intel-metric-hero">
          <strong>{formattedMetric(m, e)}</strong>
          <span>{m.context}</span>
        </div>
        <Panel title="Definition & contributing factors">
          <p>{m.method}</p>
          {m.value === null ? (
            <Blank
              title="Required data is unavailable"
              text="Connect the source and confirm the relevant fields before interpreting this measure."
              action={
                <Link
                  className="button secondary"
                  to={e.link(e.base + "/settings/connections", e.origin)}
                >
                  Review data
                </Link>
              }
            />
          ) : m.series.length > 1 ? (
            ["revenue", "costs"].includes(id) && e.sample ? (
              <div className="exec-dashboard intel-embedded-chart">
                <PerformanceChart
                  sample={e.sample}
                  financial
                  currency={e.prefs.currency}
                  mode="bars"
                  selected={selected}
                  select={setSelected}
                  open={(p) => {
                    const next = new URLSearchParams(e.query);
                    next.set("point", p.date);
                    e.setQuery(next, { replace: true });
                    setRecord(
                      `${p.label} · Revenue ${e.money(p.revenue)} · Costs ${e.money(p.costs)}. Expenses: people ${e.money(Math.round(p.costs * 0.65))}; delivery ${e.money(Math.round(p.costs * 0.2))}; overhead ${e.money(p.costs - Math.round(p.costs * 0.65) - Math.round(p.costs * 0.2))}.`,
                    );
                  }}
                />
              </div>
            ) : (
              <MetricSeries
                values={m.series}
                labels={e.sample!.points.map((p) => p.label)}
                percent={m.unit === "percent"}
                money={m.unit === "money"}
                format={(n) =>
                  m.unit === "money"
                    ? e.money(n)
                    : n.toFixed(1) + (m.unit === "percent" ? "%" : "")
                }
              />
            )
          ) : (
            <div className="intel-records">
              {id === "receivables" ? (
                [14400, 10000, 8000].map((n, i) => (
                  <div key={i}>
                    <span>Illustrative overdue invoice {i + 1}</span>
                    <strong>{e.money(n)}</strong>
                    <small>Over 30 days</small>
                  </div>
                ))
              ) : id === "projects" ? (
                e.sample?.projects
                  .filter((p) => p.department === detail)
                  .map((p) => (
                    <Link
                      key={p.id}
                      to={e.link(
                        e.base + "/dependencies/project-" + p.id,
                        e.origin,
                      )}
                    >
                      {p.name}
                      <Status>{p.status}</Status>
                    </Link>
                  ))
              ) : (
                <p>
                  Cutoff snapshot. A comparable historical series is not
                  available.
                </p>
              )}
            </div>
          )}
          <Evidence
            exec={e}
            lines={[
              m.method,
              "Trend values, where available, use only the selected reporting intervals. Snapshot metrics do not have invented history.",
            ]}
          />
        </Panel>
        <RelatedIssues department={detail} e={e} />
        {record && (
          <Modal title="Period records" onClose={() => setRecord("")}>
            <p>{record}</p>
            <Evidence exec={e} />
            <div className="modal-actions">
              <Button onClick={() => setRecord("")}>Close records</Button>
              <AskLink
                exec={e}
                context={`${detail} · ${m.label} · ${record}`}
                question="Explain this interval's costs without assuming a cause."
              />
            </div>
          </Modal>
        )}
      </ModulePage>
    );
  }
  if (detail) {
    const ids = departmentMetrics(detail, e);
    return (
      <ModulePage
        title={detail}
        description={departmentStatus(detail, e)}
        exec={e}
        back={back}
        actions={<AskLink exec={e} context={`Department: ${detail}`} />}
      >
        <div className="intel-kpi-grid">
          {ids.map((id) => {
            const m = metricRecord(id, detail, e);
            return (
              <Link
                className="intel-kpi"
                key={id}
                to={e.link(
                  `${list}/${encodeURIComponent(detail)}/metrics/${id}`,
                  e.origin,
                )}
              >
                <span>
                  {m.label}
                  <ArrowUpRight size={13} />
                </span>
                <strong>{formattedMetric(m, e)}</strong>
                <small>{m.context}</small>
              </Link>
            );
          })}
        </div>
        {!ids.length && (
          <Blank
            title="No supported metrics mapped"
            text="This department is configured, but its performance fields have not been mapped."
            action={
              <Link
                className="button secondary"
                to={e.link(e.base + "/settings/connections", e.origin)}
              >
                Review mapping
              </Link>
            }
          />
        )}
        <RelatedIssues department={detail} e={e} />
        <Panel title="Relevant records & dependencies">
          {e.sample?.projects.filter((p) => p.department === detail).length ? (
            e.sample.projects
              .filter((p) => p.department === detail)
              .map((p) => (
                <Link
                  className="intel-row"
                  key={p.id}
                  to={e.link(
                    e.base + "/dependencies/project-" + p.id,
                    e.origin,
                  )}
                >
                  <span>
                    {p.name}
                    <small>
                      {p.client} · {p.owner}
                    </small>
                  </span>
                  <Status>{p.status}</Status>
                  <ArrowUpRight size={14} />
                </Link>
              ))
          ) : (
            <Blank
              title="No related records"
              text="No validated project relationships are available for this department."
              action={
                <Link to={e.link(e.base + "/settings/connections", e.origin)}>
                  Review data <ArrowUpRight size={12} />
                </Link>
              }
            />
          )}
          <Evidence exec={e} />
        </Panel>
      </ModulePage>
    );
  }
  const rows = props.company.data.departments
    .filter(
      (d) =>
        d.toLowerCase().includes(q.toLowerCase()) &&
        (filter === "All" || departmentStatus(d, e) === filter),
    )
    .sort(
      (a, b) =>
        Number(departmentStatus(b, e) === "Needs attention") -
        Number(departmentStatus(a, e) === "Needs attention"),
    );
  return (
    <ModulePage
      title="Departments"
      description={`${props.company.data.departments.length} configured · ${e.sample?.covered.length || 0} with example coverage`}
      exec={e}
    >
      <div className="intel-toolbar">
        <input
          aria-label="Search departments"
          placeholder="Find a department"
          value={q}
          onChange={(v) => change("q", v.target.value)}
        />
        <div className="intel-tabs">
          {["All", "Needs attention", "Limited data"].map((f) => (
            <button
              key={f}
              aria-pressed={filter === f}
              onClick={() => change("filter", f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      <Panel title="Department performance">
        {rows.length ? (
          <div className="intel-matrix">
            <div className="intel-matrix-head">
              <span>Department</span>
              <span>Primary measure</span>
              <span>Status</span>
              <span>Issues</span>
            </div>
            {rows.map((d) => {
              const primary = departmentMetrics(d, e)[0],
                m = primary ? metricRecord(primary, d, e) : null;
              return (
                <div className="intel-matrix-row" key={d}>
                  <Link
                    to={e.link(list + "/" + encodeURIComponent(d), e.origin)}
                  >
                    {d}
                    <ArrowUpRight size={12} />
                  </Link>
                  <span>
                    {m ? (
                      <Link
                        to={e.link(
                          list +
                            "/" +
                            encodeURIComponent(d) +
                            "/metrics/" +
                            primary,
                          e.origin,
                        )}
                      >
                        {formattedMetric(m, e)}
                        <small>
                          {m.label} ·
                          {m.series.length > 1
                            ? (m.unit === "percent"
                                ? `${(m.series.at(-1)! - m.series.at(-2)!).toFixed(1)} pp`
                                : m.series.at(-2)!
                                  ? `${((m.series.at(-1)! / m.series.at(-2)! - 1) * 100).toFixed(1)}%`
                                  : "No comparison") + " · latest interval"
                            : "Snapshot"}
                        </small>
                      </Link>
                    ) : (
                      "No mapped KPI"
                    )}
                  </span>
                  <Status>{departmentStatus(d, e)}</Status>
                  <span>
                    {e.sample
                      ? e.sample.risks
                          .filter((r) => r.department === d)
                          .map((r) => (
                            <Link
                              key={r.id}
                              to={e.link(e.base + "/actions/" + r.id, e.origin)}
                            >
                              {r.severity} priority <ArrowUpRight size={12} />
                            </Link>
                          ))
                      : "Not assessed"}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <Blank
            title={
              props.company.data.departments.length
                ? "No matching departments"
                : "No departments configured"
            }
            text={
              props.company.data.departments.length
                ? "Adjust your search or filter."
                : "Add the teams you want to understand."
            }
            action={
              props.company.data.departments.length ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    const next = new URLSearchParams(e.query);
                    next.delete("q");
                    next.delete("filter");
                    e.setQuery(next);
                  }}
                >
                  Reset filters
                </Button>
              ) : e.editable ? (
                <Link
                  className="button secondary"
                  to={
                    e.base +
                    "/onboarding/departments?return=settings-departments"
                  }
                >
                  Configure departments
                </Link>
              ) : (
                <span>Ask an administrator to configure departments.</span>
              )
            }
          />
        )}
      </Panel>
    </ModulePage>
  );
}
function RelatedIssues({
  department,
  e,
}: {
  department: string;
  e: ReturnType<typeof useExecutive>;
}) {
  const risks =
    e.sample?.risks.filter((r) => r.department === department) || [];
  return (
    <Panel title="Needs attention">
      {risks.length ? (
        risks.map((r) => (
          <Link
            className="intel-row"
            to={e.link(e.base + "/actions/" + r.id, e.origin)}
            key={r.id}
          >
            <span>
              {r.title}
              <small>{r.impact}</small>
            </span>
            <Status>{r.severity}</Status>
            <ArrowUpRight size={14} />
          </Link>
        ))
      ) : (
        <Blank
          title={e.sample ? "No flagged issues" : "Issues not assessed yet"}
          text={
            e.sample
              ? "No issues are flagged in available records. Missing measures are excluded."
              : "Issues appear once relevant records are validated."
          }
        />
      )}
    </Panel>
  );
}
export function MetricSeries({
  values,
  labels,
  format,
  percent = false,
  money = false,
}: {
  values: number[];
  labels: string[];
  format: (n: number) => string;
  percent?: boolean;
  money?: boolean;
}) {
  const [selected, setSelected] = useState(0);
  if (values.length < 2) return <p>No historical trend is available yet.</p>;
  const max = percent ? 100 : Math.max(...values, 1) * 1.1,
    min = Math.min(0, ...values),
    x = (i: number) => 20 + (i * 560) / (values.length - 1),
    y = (v: number) => 150 - ((v - min) / (max - min)) * 130;
  return (
    <div className="intel-series">
      <p aria-live="polite">
        {labels[selected]} · {format(values[selected])}
      </p>
      <svg
        viewBox="0 0 600 170"
        role="img"
        aria-label={
          money ? "Historical monetary values" : "Historical metric values"
        }
      >
        {[0, 0.5, 1].map((n) => (
          <line
            key={n}
            x1="20"
            x2="580"
            y1={20 + n * 130}
            y2={20 + n * 130}
            stroke="#eceef6"
          />
        ))}
        <polyline
          points={values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
          fill="none"
          stroke="#8274dc"
          strokeWidth="2"
        />
        {values.map((v, i) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(v)}
            r={selected === i ? 5 : 3}
            fill="#8274dc"
          >
            <title>
              {labels[i]}: {format(v)}
            </title>
          </circle>
        ))}
      </svg>
      <div>
        {labels.map((l, i) => (
          <button
            key={i}
            onFocus={() => setSelected(i)}
            onMouseEnter={() => setSelected(i)}
            onClick={() => setSelected(i)}
            aria-label={`${l}: ${format(values[i])}`}
          >
            {l}
          </button>
        ))}
      </div>
      <details>
        <summary>View records</summary>
        {values.map((v, i) => (
          <p key={i}>
            {labels[i]} · {format(v)}
          </p>
        ))}
      </details>
    </div>
  );
}
