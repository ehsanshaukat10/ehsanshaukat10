import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  SlidersHorizontal,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { Button, Modal, Select, Field } from "../../components/ui";
import type { Company } from "../../lib/api";
import { useApp } from "../../lib/context";
import {
  defaults,
  readPreferences,
  preferenceKey,
  inferProfile,
  availableMetrics,
  financeAllowed,
  buildSample,
  totals,
  metricValue,
  metricCovered,
  goalActual,
  goalTarget,
  periods,
  profiles,
  scenarios,
  sectionLabels,
  metricLabels,
  type Preferences,
  type Scenario,
  type Period,
  type Section,
  type Profile,
} from "./model";
import "./dashboard.css";
type Detail = { title: string; lines: string[] };
export function ExecutiveDashboard({ company: c }: { company: Company }) {
  const { user } = useApp(),
    key = preferenceKey(user?.id || "guest", c);
  const [prefs, setPrefs] = useState(() => readPreferences(key, c)),
    [draft, setDraft] = useState<Preferences | null>(null),
    [scenario, setScenario] = useState<Scenario>("workspace"),
    [detail, setDetail] = useState<Detail | null>(null),
    [ask, setAsk] = useState(false),
    [question, setQuestion] = useState(""),
    [answer, setAnswer] = useState(""),
    [askContext, setAskContext] = useState<Detail | null>(null),
    [busy, setBusy] = useState(false),
    [storageError, setStorageError] = useState(""),
    [chart, setChart] = useState("line"),
    [selected, setSelected] = useState(0),
    [reviewed, setReviewed] = useState<string[]>([]),
    [note, setNote] = useState(""),
    [decisions, setDecisions] = useState<Record<string, string>>(() => {
      try {
        const value = JSON.parse(
          localStorage.getItem(key + ".decisions") || "{}",
        );
        return value && typeof value === "object" && !Array.isArray(value)
          ? value
          : {};
      } catch {
        return {};
      }
    });
  const profile = prefs.profile === "auto" ? inferProfile(c) : prefs.profile,
    sample =
      scenario === "workspace"
        ? null
        : buildSample(c, profile, prefs.period, scenario),
    financial =
      financeAllowed(c) &&
      c.data.departments.some((d) => /finance|sales/i.test(d)),
    editable = ["Owner", "Admin"].includes(c.role);
  const money = (n: number) =>
    new Intl.NumberFormat("en", {
      style: "currency",
      currency: prefs.currency,
      maximumFractionDigits: 0,
    }).format(n);
  const save = (p: Preferences) => {
    setPrefs(p);
    try {
      localStorage.setItem(key, JSON.stringify(p));
      setStorageError("");
    } catch {
      setStorageError(
        "Preferences apply for this visit. Browser storage is unavailable.",
      );
    }
  };
  const open = (title: string, ...lines: string[]) => {
      setNote(decisions[title] || "");
      setDetail({ title, lines });
    },
    setup = (step: string) => `/companies/${c.id}/onboarding/${step}`;
  const depts = c.data.departments.filter(
    (d) => prefs.departments === null || prefs.departments.includes(d),
  );
  const performanceReady =
    sample &&
    sample.covered.some((d) =>
      (financial
        ? /finance|sales/i
        : /project|delivery|operations|engineering/i
      ).test(d),
    );
  const values = performanceReady && sample ? totals(sample) : null;
  function secondary(section: Section) {
    if (section === "departments")
      return (
        c.data.departments.length > 0 && (
          <section className="exec-panel" key={section}>
            <h2>Department intelligence</h2>
            <p className="exec-muted">
              Coverage and next decisions, in one view.
            </p>
            {depts.length ? (
              depts.map((d) => (
                <button
                  className="exec-row"
                  key={d}
                  onClick={() =>
                    open(
                      d,
                      sample?.covered.includes(d)
                        ? "Illustrative coverage available. Review underlying records before deciding."
                        : "No validated records available for this department.",
                      ...(sample?.risks
                        .filter((r) => r.department === d)
                        .map((r) => r.title) || []),
                    )
                  }
                >
                  <span>{d}</span>
                  <small>
                    {sample?.covered.includes(d)
                      ? sample.risks.some((r) => r.department === d)
                        ? "Needs attention"
                        : "No flagged issues"
                      : "Awaiting data"}
                  </small>
                  <ArrowUpRight size={14} />
                </button>
              ))
            ) : (
              <p>No departments selected. Choose departments in Customize.</p>
            )}
          </section>
        )
      );
    if (section === "goals")
      return (
        <section className="exec-panel" key={section}>
          <div className="exec-section-head">
            <h2>Goals</h2>
            {editable && <Link to={setup("goals")}>Edit goals ↗</Link>}
          </div>
          {c.data.goals.length ? (
            c.data.goals.map((g) => {
              const actual =
                  sample && scenario !== "partial"
                    ? goalActual(g, sample)
                    : null,
                target = goalTarget(g.target),
                percent =
                  actual !== null && target
                    ? Math.min(100, Math.max(0, (actual / target) * 100))
                    : null;
              return (
                <button
                  className="exec-row exec-goal"
                  key={g.id}
                  onClick={() =>
                    open(
                      g.name,
                      `Target: ${g.target}. Due: ${g.deadline}. Owner: ${g.owner || "Not assigned"}.`,
                      actual === null
                        ? "Progress is unavailable until a compatible measure is validated."
                        : `Illustrative actual: ${actual.toLocaleString("en", { maximumFractionDigits: 1 })}. Reporting and goal periods must be reconciled before integration.`,
                    )
                  }
                >
                  <span>
                    {g.name}
                    <small>
                      Target {g.target} · {g.deadline || "No deadline"}
                    </small>
                  </span>
                  <small>
                    {percent === null
                      ? "Awaiting data"
                      : `${percent.toFixed(0)}%`}
                  </small>
                  {percent !== null && <progress max="100" value={percent} />}
                </button>
              );
            })
          ) : (
            <p>
              No goals configured.{" "}
              {editable ? (
                <Link to={setup("goals")}>Set your first goal →</Link>
              ) : (
                "An administrator can add goals."
              )}
            </p>
          )}
        </section>
      );
    if (section === "dependencies")
      return (
        sample &&
        sample.projects.length > 0 && (
          <section className="exec-panel" key={section}>
            <h2>Dependencies</h2>
            <p>A shared resource connects these commitments.</p>
            <div className="exec-nodes">
              {[
                sample.projects[0].client,
                sample.projects[0].name,
                sample.projects[0].owner,
              ].map((n, i) => (
                <span key={n}>
                  <button
                    onClick={() =>
                      open(
                        n,
                        sample.projects[0].evidence,
                        `Department: ${sample.projects[0].department}.`,
                        "Illustrative relationship: client → delivery → assigned specialist.",
                      )
                    }
                  >
                    {n}
                  </button>
                  {i < 2 && <ArrowRight size={14} />}
                </span>
              ))}
            </div>
          </section>
        )
      );
    if (section === "deadlines")
      return (
        sample &&
        sample.projects.length > 0 && (
          <section className="exec-panel" key={section}>
            <h2>Delivery & deadlines</h2>
            <p>Illustrative commitments · relative to the data cutoff.</p>
            {sample.projects.map((p) => (
              <button
                className="exec-row exec-deadline"
                key={p.id}
                onClick={() =>
                  open(
                    p.name,
                    p.evidence,
                    `Client: ${p.client}. Owner: ${p.owner}. Due ${p.due}. Status: ${p.status}.`,
                  )
                }
              >
                <span>
                  {p.name}
                  <small>
                    {p.client} · {p.due}
                  </small>
                </span>
                <small>
                  <i
                    className={p.status === "On track" ? "on-track" : "at-risk"}
                  />
                  {p.status}
                </small>
                <ArrowUpRight size={14} />
              </button>
            ))}
          </section>
        )
      );
    if (section === "clients")
      return (
        sample &&
        financial && (
          <section className="exec-panel" key={section}>
            <h2>Client concentration</h2>
            <p>Share of illustrative revenue · {periods[prefs.period]}</p>
            {sample.clients.map((client) => (
              <button
                className="exec-client"
                key={client.name}
                onClick={() =>
                  open(
                    client.name,
                    `${client.share}% of illustrative revenue: ${money(client.amount)}.`,
                    ...sample.projects
                      .filter((p) => p.client === client.name)
                      .map((p) => `${p.name}: ${p.status}, due ${p.due}.`),
                  )
                }
              >
                <span>
                  {client.name}
                  <small>{client.share}%</small>
                </span>
                <progress value={client.share} max="100" />
              </button>
            ))}
          </section>
        )
      );
    if (section === "activity")
      return (
        sample && (
          <section className="exec-panel" key={section}>
            <h2>Activity patterns</h2>
            <p>Last 14 days · darker dots indicate more events.</p>
            <div className="exec-activity">
              {sample.activity.map((a) => (
                <button
                  key={a.date}
                  aria-label={`${a.date}: ${a.count} events`}
                  title={`${a.date}: ${a.count} events`}
                  style={{ opacity: 0.25 + a.count * 0.18 }}
                  onClick={() =>
                    open(
                      a.date,
                      ...(a.events.length
                        ? a.events
                        : ["No recorded activity."]),
                    )
                  }
                />
              ))}
            </div>
          </section>
        )
      );
    return null;
  }
  return (
    <div className="exec-dashboard">
      <div className="exec-toolbar">
        <div>
          <span className="exec-eyebrow">EXECUTIVE PERSPECTIVE</span>
          <h1>
            Overview<span className="accent">.</span>
          </h1>
          <p>
            {c.name} · {profiles[profile]}
          </p>
        </div>
        <div className="exec-tools">
          <label>
            Reporting period
            <select
              aria-label="Reporting period"
              value={prefs.period}
              onChange={(e) => {
                save({ ...prefs, period: e.target.value as Period });
                setSelected(0);
              }}
            >
              {Object.entries(periods).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="secondary"
            onClick={() => setDraft(structuredClone(prefs))}
          >
            <SlidersHorizontal size={14} /> Customize
          </Button>
        </div>
      </div>
      <div className="exec-context">
        <label>
          Data preview
          <select
            aria-label="Data preview"
            value={scenario}
            onChange={(e) => {
              setScenario(e.target.value as Scenario);
              setReviewed([]);
              setSelected(0);
            }}
          >
            {Object.entries(scenarios).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <span>
          {sample
            ? `Illustrative data · not company performance · as of ${sample.asOf.toISOString().slice(0, 10)}`
            : "No live performance data connected"}
        </span>
      </div>
      {storageError && <p role="status">{storageError}</p>}
      <section className="exec-summary">
        <span className="exec-eyebrow">THE SITUATION</span>
        <h2>
          {!sample
            ? "Your workspace is ready. Your data comes next."
            : scenario === "partial"
              ? "Some departments are visible. The rest need validated data."
              : scenario === "clear"
                ? "A steady period, with room to look ahead."
                : financial
                  ? profile === "managed"
                    ? "Service response and shared capacity need attention."
                    : profile === "saas"
                      ? "Revenue is moving. Renewals deserve a closer look."
                      : "Performance is moving. A few commitments need attention."
                  : "Delivery commitments need a closer look."}
        </h2>
        <p>
          {sample
            ? `${sample.covered.length} of ${c.data.departments.length} departments covered in this example. ${sample.risks.length ? `${sample.risks.length} decisions deserve attention.` : "No critical issues flagged in the available example records."} ${c.data.priorities.length ? `Current focus: ${c.data.priorities.slice(0, 2).join(" and ").toLowerCase()}.` : ""}`
            : `${c.data.departments.length} departments and ${c.data.goals.length} goals configured. Connect and validate a source before interpreting business performance.`}
        </p>
        <button
          className="exec-text-button"
          onClick={() => {
            setAsk(true);
            setAskContext(null);
            setQuestion("");
            setAnswer("");
          }}
        >
          Ask Aynor <ArrowUpRight size={13} />
        </button>
      </section>
      <div
        className={`exec-quality ${["sync-error", "stale"].includes(scenario) ? "warning" : ""}`}
        role="status"
      >
        <AlertTriangle size={15} />
        <span>
          {scenario === "sync-error"
            ? "Example sync failed. Cached records remain visible; new changes are missing."
            : scenario === "stale"
              ? "Example data is 12 days old. Recheck freshness before acting."
              : scenario === "partial"
                ? `Partial example coverage: ${sample?.covered.join(", ") || "no departments"}. Other departments have no validated records.`
                : sample
                  ? "Illustrative workbook only. No Google account, file, or company source has been synchronized."
                  : "Awaiting validated data. Empty values indicate missing evidence, not zero performance."}
        </span>
        {scenario === "sync-error" && (
          <Button
            variant="secondary"
            busy={busy}
            onClick={async () => {
              setBusy(true);
              await new Promise((r) => setTimeout(r, 650));
              setScenario("connected");
              setBusy(false);
            }}
          >
            Retry example sync
          </Button>
        )}
      </div>
      <section className="exec-action">
        <div className="exec-section-head">
          <h2>Needs action</h2>
          <small>
            {sample ? `${sample.risks.length} priorities` : "Start here"}
          </small>
        </div>
        {sample ? (
          sample.risks.length ? (
            <div className="exec-risks">
              {sample.risks.slice(0, 3).map((r, i) => (
                <article key={r.id}>
                  <div className="exec-risk-meta">
                    <span>
                      0{i + 1} / {r.department}
                    </span>
                    <span>{r.severity}</span>
                  </div>
                  <h3>{r.title}</h3>
                  <p>{r.impact}</p>
                  <button
                    className="exec-text-button"
                    onClick={() =>
                      open(
                        r.title,
                        ...r.evidence,
                        `Suggested next action: ${r.action}.`,
                      )
                    }
                  >
                    {r.action} <ArrowRight size={13} />
                  </button>
                  {decisions[r.title] && (
                    <small>Decision recorded · open to review</small>
                  )}
                  {reviewed.includes(r.title) && (
                    <small>Reviewed locally · issue remains visible</small>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <p>
              No critical issues flagged in available example records. Missing
              data is still excluded.
            </p>
          )
        ) : (
          <div className="exec-setup">
            <div>
              <h3>Connect a source, then confirm your mapping.</h3>
              <p>
                Revenue, risks and delivery signals will appear once records are
                validated.
              </p>
            </div>
            {editable && (
              <Link className="button secondary" to={setup("integrations")}>
                Connect data ↗
              </Link>
            )}
          </div>
        )}
      </section>
      <details className="exec-worth">
        <summary>
          Worth knowing{" "}
          <span>{c.data.priorities.length} business priorities</span>
        </summary>
        <p>
          {c.data.priorities.join(" · ") || "No priorities selected yet."}{" "}
          {sample
            ? "Example records demonstrate interactions; they are not an assessment of your company."
            : "Existing mappings describe configuration, not a successful data import."}
        </p>
      </details>
      <section className="exec-panel exec-performance">
        <div className="exec-section-head">
          <div>
            <h2>
              {financial
                ? profile === "saas"
                  ? "Recurring revenue"
                  : "Revenue & operating costs"
                : "Delivery performance"}
            </h2>
            <p>
              {periods[prefs.period]}
              {sample
                ? ` · ${sample.points[0].date} – ${sample.points.at(-1)?.date}`
                : ""}
            </p>
          </div>
          {sample && (
            <div className="exec-segments">
              <button
                aria-pressed={chart === "line"}
                onClick={() => setChart("line")}
              >
                Trend
              </button>
              <button
                aria-pressed={chart === "bars"}
                onClick={() => setChart("bars")}
              >
                Compare
              </button>
            </div>
          )}
        </div>
        {sample && values ? (
          <>
            <div className="exec-number">
              {financial
                ? money(values.revenue)
                : sample.points.reduce((n, p) => n + p.delivered, 0)}
              <small>
                {financial
                  ? `${values.growth >= 0 ? "+" : ""}${values.growth.toFixed(1)}% vs previous comparable period`
                  : "completed milestones · illustrative"}
              </small>
            </div>
            <PerformanceChart
              sample={sample}
              financial={financial}
              mode={chart}
              selected={selected}
              select={setSelected}
              open={(p) =>
                open(
                  p.label,
                  financial
                    ? `Revenue: ${money(p.revenue)}. Operating costs: ${money(p.costs)}.`
                    : `Delivered: ${p.delivered}. Planned: ${p.planned}.`,
                  financial
                    ? `Expenses: people ${money(Math.round(p.costs * 0.65))}; delivery ${money(Math.round(p.costs * 0.2))}; overhead ${money(p.costs - Math.round(p.costs * 0.65) - Math.round(p.costs * 0.2))}.`
                    : "Delivery counts recorded milestones, not quality.",
                  "Illustrative workbook records.",
                )
              }
            />
            <details className="exec-table">
              <summary>View chart data</summary>
              <table>
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>{financial ? "Revenue" : "Delivered"}</th>
                    <th>{financial ? "Costs" : "Planned"}</th>
                  </tr>
                </thead>
                <tbody>
                  {sample.points.map((p) => (
                    <tr key={p.date}>
                      <td>{p.label}</td>
                      <td>{financial ? money(p.revenue) : p.delivered}</td>
                      <td>{financial ? money(p.costs) : p.planned}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </>
        ) : (
          <div className="exec-no-chart">
            <span>—</span>
            <p>
              No validated {financial ? "revenue or expense" : "delivery"}{" "}
              records yet.
            </p>
            <small>
              Connect a source to see the trend. Explore clearly labeled
              examples above.
            </small>
          </div>
        )}
      </section>
      <div className="exec-metrics">
        {prefs.metrics
          .filter((m) => availableMetrics(profile, c).includes(m))
          .map((m) => {
            const metric =
              sample && metricCovered(m, sample)
                ? metricValue(m, sample)
                : null;
            return (
              <button
                className="exec-metric"
                key={m}
                onClick={() =>
                  open(
                    metricLabels[m],
                    metric?.method ||
                      "No validated source is available. A value appears after relevant records are connected.",
                    metric
                      ? "Illustrative measure. Currency sets units without foreign-exchange conversion. Revenue and margin follow the selected period; other measures are illustrative snapshots at the reporting cutoff."
                      : "Missing values are never interpreted as zero.",
                  )
                }
              >
                <span>
                  {metricLabels[m]}
                  <ArrowUpRight size={13} />
                </span>
                <strong>
                  {metric
                    ? metric.unit === "money"
                      ? money(metric.value)
                      : metric.unit === "percent"
                        ? `${metric.value.toFixed(1)}%`
                        : metric.value
                    : "—"}
                </strong>
                <small>{metric?.context || "Awaiting validated data"}</small>
                {m === "utilization" && metric && (
                  <span className="exec-utilization">
                    <span style={{ width: `${metric.value}%` }} />
                    <small>
                      {metric.value}% billable · {100 - metric.value}% available
                    </small>
                  </span>
                )}
              </button>
            );
          })}
      </div>
      <div className="exec-secondary">
        {prefs.order.filter((s) => prefs.sections.includes(s)).map(secondary)}
      </div>
      {draft && (
        <Modal title="Make this overview yours" onClose={() => setDraft(null)}>
          <div className="exec-customize">
            <p>
              Critical alerts, data quality and the executive summary always
              stay visible.
            </p>
            <div className="exec-presets">
              {["Balanced", "Focused", "Operations"].map((name) => (
                <Button
                  variant="secondary"
                  key={name}
                  onClick={() =>
                    setDraft({
                      ...defaults(c),
                      sections:
                        name === "Focused"
                          ? ["goals"]
                          : name === "Operations"
                            ? ["departments", "dependencies", "deadlines"]
                            : defaults(c).sections,
                    })
                  }
                >
                  {name}
                </Button>
              ))}
            </div>
            <Select
              label="Business lens"
              value={draft.profile}
              options={["auto", ...Object.keys(profiles)]}
              onChange={(v) => {
                const p = v as Profile | "auto";
                setDraft({
                  ...draft,
                  profile: p,
                  metrics: availableMetrics(
                    p === "auto" ? inferProfile(c) : p,
                    c,
                  ).slice(0, 3),
                });
              }}
            />
            <p>
              Auto follows your industry, priorities and departments. Services,
              SaaS and managed IT emphasize different measures.
            </p>
            <Select
              label="Reporting currency"
              value={draft.currency}
              options={Array.from(
                new Set([
                  c.currency,
                  "USD",
                  "PKR",
                  "GBP",
                  "EUR",
                  "AED",
                  "INR",
                  "CAD",
                  "AUD",
                  "SGD",
                ]),
              )}
              onChange={(v) => setDraft({ ...draft, currency: v })}
            />
            <p>
              Example amounts use the selected unit; no exchange-rate conversion
              occurs.
            </p>
            <label className="exec-modal-period">
              Preferred reporting period
              <select
                aria-label="Preferred reporting period"
                value={draft.period}
                onChange={(e) =>
                  setDraft({ ...draft, period: e.target.value as Period })
                }
              >
                {Object.entries(periods).map(([v, l]) => (
                  <option value={v} key={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <h3>Pin up to three measures</h3>
            <div className="exec-checks">
              {availableMetrics(
                draft.profile === "auto" ? inferProfile(c) : draft.profile,
                c,
              ).map((m) => (
                <label key={m}>
                  <input
                    type="checkbox"
                    checked={draft.metrics.includes(m)}
                    disabled={
                      !draft.metrics.includes(m) && draft.metrics.length >= 3
                    }
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        metrics: e.target.checked
                          ? [...draft.metrics, m]
                          : draft.metrics.filter((v) => v !== m),
                      })
                    }
                  />
                  {metricLabels[m]}
                </label>
              ))}
            </div>
            <h3>Secondary sections</h3>
            {draft.order.map((s, i) => (
              <div className="exec-order" key={s}>
                <label>
                  <input
                    type="checkbox"
                    checked={draft.sections.includes(s)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        sections: e.target.checked
                          ? [...draft.sections, s]
                          : draft.sections.filter((v) => v !== s),
                      })
                    }
                  />
                  {sectionLabels[s]}
                </label>
                <button
                  disabled={i === 0}
                  aria-label={`Move ${sectionLabels[s]} up`}
                  onClick={() => {
                    const order = [...draft.order];
                    [order[i - 1], order[i]] = [order[i], order[i - 1]];
                    setDraft({ ...draft, order });
                  }}
                >
                  ↑
                </button>
                <button
                  disabled={i === draft.order.length - 1}
                  aria-label={`Move ${sectionLabels[s]} down`}
                  onClick={() => {
                    const order = [...draft.order];
                    [order[i + 1], order[i]] = [order[i], order[i + 1]];
                    setDraft({ ...draft, order });
                  }}
                >
                  ↓
                </button>
              </div>
            ))}
            <h3>Visible departments</h3>
            <div className="exec-checks">
              {c.data.departments.map((d) => (
                <label key={d}>
                  <input
                    type="checkbox"
                    checked={
                      draft.departments === null ||
                      draft.departments.includes(d)
                    }
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        departments: e.target.checked
                          ? Array.from(
                              new Set([
                                ...(draft.departments || c.data.departments),
                                d,
                              ]),
                            )
                          : (draft.departments || c.data.departments).filter(
                              (v) => v !== d,
                            ),
                      })
                    }
                  />
                  {d}
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  save(draft);
                  setDraft(null);
                }}
              >
                Save preferences
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {detail && (
        <Modal title={detail.title} onClose={() => setDetail(null)}>
          <div className="exec-detail">
            <span className="exec-eyebrow">
              {sample ? "ILLUSTRATIVE EVIDENCE" : "WORKSPACE CONTEXT"}
            </span>
            {sample && (
              <form
                className="exec-decision"
                onSubmit={(e) => {
                  e.preventDefault();
                  const next = { ...decisions, [detail.title]: note.trim() };
                  setDecisions(next);
                  try {
                    localStorage.setItem(
                      key + ".decisions",
                      JSON.stringify(next),
                    );
                  } catch {
                    setStorageError(
                      "Decision saved for this visit only. Browser storage is unavailable.",
                    );
                  }
                }}
              >
                <Field
                  label="Decision / next action"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Owner, next step and follow-up date"
                  required
                />
                <Button variant="secondary" disabled={!note.trim()}>
                  Save decision locally
                </Button>
                {decisions[detail.title] && (
                  <small role="status">
                    Saved in this browser: {decisions[detail.title]}
                  </small>
                )}
                <small>No assignment or notification is sent.</small>
              </form>
            )}
            {detail.lines.map((l, i) => (
              <p key={i}>{l}</p>
            ))}
            {sample && (
              <small>
                Source: {sample.source} · as of{" "}
                {sample.asOf.toISOString().slice(0, 10)} ·{" "}
                {periods[prefs.period]}
              </small>
            )}
            <div className="modal-actions">
              <Button
                variant="secondary"
                onClick={() => {
                  setReviewed([...reviewed, detail.title]);
                  setDetail(null);
                }}
              >
                Mark reviewed locally
              </Button>
              <Button
                onClick={() => {
                  setQuestion(`Why does ${detail.title.toLowerCase()} matter?`);
                  setAskContext(detail);
                  setAnswer(detail.lines.join(" "));
                  setDetail(null);
                  setAsk(true);
                }}
              >
                Ask Aynor why
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {ask && (
        <Modal title="Ask Aynor" onClose={() => setAsk(false)}>
          <div className="exec-detail">
            <p>Local simulated analysis · no external AI service is called.</p>
            {askContext && (
              <small>
                Context: {askContext.title} · {periods[prefs.period]} ·{" "}
                {sample?.source}
              </small>
            )}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                await new Promise((r) => setTimeout(r, 400));
                setAnswer(
                  sample
                    ? `${askContext ? `Regarding ${askContext.title}: ${askContext.lines.join(" ")} ` : ""}${sample.risks.length} issues are flagged in illustrative records. ${sample.risks[0]?.impact || "No critical issues are flagged."} Coverage is ${sample.covered.length} of ${c.data.departments.length} departments. ${["stale", "sync-error"].includes(scenario) ? "Freshness is limited; reconcile the source before deciding." : "Check source records and confirm an owner before acting."}`
                    : "No validated performance records exist for this workspace yet. Connect a source and confirm mappings before interpreting changes.",
                );
                setBusy(false);
              }}
            >
              <Field
                label="Your question"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                required
              />
              <Button busy={busy} disabled={!question.trim()}>
                Ask about this overview
              </Button>
            </form>
            {answer && (
              <div role="status" className="exec-answer">
                {answer}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
function PerformanceChart({
  sample,
  financial,
  mode,
  selected,
  select,
  open,
}: {
  sample: ReturnType<typeof buildSample>;
  financial: boolean;
  mode: string;
  selected: number;
  select: (i: number) => void;
  open: (p: ReturnType<typeof buildSample>["points"][number]) => void;
}) {
  const points = sample.points,
    max =
      Math.max(
        ...points.map((p) =>
          financial ? Math.max(p.revenue, p.costs) : p.planned,
        ),
      ) * 1.15,
    x = (i: number) => 30 + (i * 740) / (points.length - 1),
    y = (n: number) => 170 - (n / max) * 145,
    value = (i: number) =>
      financial ? points[i].revenue : points[i].delivered,
    line = points.map((_, i) => `${x(i)},${y(value(i))}`).join(" "),
    index = Math.min(selected, points.length - 1),
    active = points[index];
  return (
    <div className="exec-chart">
      <div className="exec-chart-reading" aria-live="polite">
        {active.label}: {financial ? "Revenue" : "Delivered"}{" "}
        {value(index).toLocaleString()} · {financial ? "Costs" : "Planned"}{" "}
        {(financial ? active.costs : active.planned).toLocaleString()}
      </div>
      <svg
        preserveAspectRatio="none"
        viewBox="0 0 800 200"
        role="img"
        aria-label={
          financial
            ? "Revenue and expense comparison"
            : "Delivered and planned milestones"
        }
      >
        {[35, 80, 125, 170].map((y) => (
          <line key={y} x1="20" x2="790" y1={y} y2={y} stroke="#edf0f6" />
        ))}
        {mode === "line" ? (
          <>
            <polygon points={`30,170 ${line} 770,170`} fill="#4945f50b" />
            <polyline
              points={line}
              fill="none"
              stroke="#4945f5"
              strokeWidth="2.5"
            />
            {points.map((p, i) => (
              <circle
                key={p.date}
                cx={x(i)}
                cy={y(value(i))}
                r={selected === i ? 5 : 3}
                onMouseEnter={() => select(i)}
                onClick={() => open(p)}
                style={{ cursor: "pointer" }}
                fill="#4945f5"
              />
            ))}
          </>
        ) : (
          points.map((p, i) => (
            <g
              key={p.date}
              onMouseEnter={() => select(i)}
              onClick={() => open(p)}
              style={{ cursor: "pointer" }}
            >
              <rect
                x={x(i) - 12}
                y={y(value(i))}
                width="10"
                height={170 - y(value(i))}
                rx="2"
                fill="#4945f5"
              />
              <rect
                x={x(i) + 2}
                y={y(financial ? p.costs : p.planned)}
                width="10"
                height={170 - y(financial ? p.costs : p.planned)}
                rx="2"
                fill="#b9c3dc"
              />
            </g>
          ))
        )}
      </svg>
      <div className="exec-chart-points">
        {points.map((p, i) => (
          <button
            key={p.date}
            aria-label={`Inspect ${p.label} ${p.date}`}
            onMouseEnter={() => select(i)}
            onFocus={() => select(i)}
            onClick={() => open(p)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <small>
        ● {financial ? "Revenue" : "Delivered"}{" "}
        {mode === "bars" && ` / ○ ${financial ? "Costs" : "Planned"}`} · Hover
        or focus a period; select for records.
      </small>
    </div>
  );
}
