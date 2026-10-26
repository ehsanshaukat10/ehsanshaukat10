import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowUpRight,
  SlidersHorizontal,
  AlertTriangle,
  ArrowRight,
  Network,
  CalendarDays,
  Building2,
  FileSpreadsheet,
  Link2,
  Target,
  Compass,
  BarChart3,
} from "lucide-react";
import { Button, Modal, Select, Field } from "../../components/ui";
import type { Company } from "../../lib/api";
import { useApp } from "../../lib/context";
import {
  usesExampleData,
  overviewExampleCompany,
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
  sectionLabels,
  metricLabels,
  type Preferences,
  type Scenario,
  type Period,
  type Section,
  type Profile,
  type Point,
} from "./model";
import "./dashboard.css";
type Detail = { title: string; lines: string[] };
export function ExecutiveDashboard({
  company: workspaceCompany,
}: {
  company: Company;
}) {
  const location = useLocation();
  const stateFromUrl = () => {
    const value = new URLSearchParams(location.search).get("state");
    return [
      "workspace",
      "connected",
      "partial",
      "sync-error",
      "stale",
      "clear",
    ].includes(value || "")
      ? (value as Scenario)
      : usesExampleData(workspaceCompany)
        ? "connected"
        : "workspace";
  };
  const [scenario, setScenario] = useState<Scenario>(stateFromUrl);
  useEffect(() => {
    setScenario(stateFromUrl());
    setSelected(0);
  }, [location.search]);
  const c =
    scenario === "workspace"
      ? workspaceCompany
      : overviewExampleCompany(workspaceCompany);
  const { user } = useApp(),
    key = preferenceKey(user?.id || "guest", c);
  const [prefs, setPrefs] = useState(() => {
      const p = readPreferences(key, c);
      return {
        ...p,
        metrics: p.metrics.length ? p.metrics : defaults(c).metrics,
      };
    }),
    [draft, setDraft] = useState<Preferences | null>(null),
    [detail, setDetail] = useState<Detail | null>(null),
    [ask, setAsk] = useState(false),
    [question, setQuestion] = useState(""),
    [answer, setAnswer] = useState(""),
    [askContext, setAskContext] = useState<Detail | null>(null),
    [busy, setBusy] = useState(false),
    [storageError, setStorageError] = useState(""),
    [chart, setChart] = useState("bars"),
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
  function beginAsk(question = "") {
    let pending = question;
    try {
      pending = pending || sessionStorage.getItem("aynor.ask.pending") || "";
      sessionStorage.removeItem("aynor.ask.pending");
    } catch {}
    setAsk(true);
    setAskContext(null);
    setQuestion(pending);
    setAnswer("");
  }
  useEffect(() => {
    const section = location.hash.replace("#", "");
    if (!section) return;
    if (section === "ask") {
      beginAsk();
      return;
    }
    if (Object.hasOwn(sectionLabels, section))
      setPrefs((p) => ({
        ...p,
        sections: Array.from(new Set([...p.sections, section as Section])),
      }));
    const timer = window.setTimeout(
      () =>
        document.getElementById("dashboard-" + section)?.scrollIntoView({
          block: "start",
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
        }),
      80,
    );
    return () => clearTimeout(timer);
  }, [location.hash]);
  useEffect(() => {
    const openAsk = (event: Event) =>
      beginAsk(
        (event as CustomEvent<{ question?: string }>).detail?.question || "",
      );
    window.addEventListener("aynor:ask", openAsk);
    return () => window.removeEventListener("aynor:ask", openAsk);
  }, []);
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
    setup = (step: string) =>
      `/companies/${c.id}/onboarding/${step}?return=overview`;
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
  function departmentSignal(d: string) {
    if (!sample || !sample.covered.includes(d))
      return {
        metric: "—",
        trend: "—",
        status: "No data",
        detail: "No validated records are available for this department.",
      };
    const attention = sample.risks.some((r) => r.department === d),
      status = attention ? "Attention" : "Covered";
    const points = sample.points,
      last = points.at(-1)!,
      previous = points.at(-2)!;
    if (/finance/i.test(d))
      return {
        metric: `Costs ${money(totals(sample).costs)}`,
        trend: `${((last.costs / previous.costs - 1) * 100).toFixed(1)}%`,
        status,
        detail: `Operating costs: ${money(totals(sample).costs)}. Latest interval versus previous: ${((last.costs / previous.costs - 1) * 100).toFixed(1)}%. Illustrative operating expense records.`,
      };
    if (/sales|customer|success/i.test(d) && profile === "saas")
      return {
        metric: "133 accounts",
        trend: "+3.9%",
        status,
        detail:
          "128 opening accounts, 122 retained and 11 new; 133 closing accounts. Customer growth: (133/128 − 1) × 100. Illustrative cutoff snapshot.",
      };
    if (/project|delivery|operations|engineering/i.test(d)) {
      const projects = sample.projects.filter((p) => p.department === d);
      if (projects.length)
        return {
          metric: `${projects.filter((p) => p.status === "On track").length}/${projects.length} on track`,
          trend: "—",
          status,
          detail: `${projects.length} illustrative delivery commitments. A comparable previous delivery snapshot is unavailable.`,
        };
    }
    if (/human|people|resource/i.test(d))
      return {
        metric: scenario === "clear" ? "40 / 40 h" : "46 / 40 h",
        trend: scenario === "clear" ? "At capacity" : "+6 h demand",
        status,
        detail:
          scenario === "clear"
            ? "Capacity is balanced in this example snapshot."
            : "One specialist has 46 assigned hours against 40 available. Snapshot, not a period-over-period trend.",
      };
    return {
      metric: "—",
      trend: "—",
      status: "No measure",
      detail:
        "Department coverage exists, but no decision-grade measure is mapped. No metric or trend has been inferred.",
    };
  }
  const activeGoals = c.data.goals
    .filter(
      (g) => !g.deadline || g.deadline >= new Date().toISOString().slice(0, 10),
    )
    .sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"))
    .slice(0, 2);
  const setupTasks = [
    ...(!c.data.departments.length
      ? [
          {
            step: "departments",
            label: "Add departments",
            text: "Organize your teams.",
            Icon: Building2,
          },
        ]
      : []),
    ...(!c.data.sources.length
      ? [
          {
            step: "integrations",
            label: "Connect a source",
            text: "Start with a sheet, file or URL.",
            Icon: FileSpreadsheet,
          },
        ]
      : []),
    ...(c.data.sources.length &&
    (c.data.steps.mapping === "skipped" ||
      !c.data.mappings.some((m) => m.confirmed && !m.ignored) ||
      c.data.mappings.some((m) => !m.confirmed && !m.ignored))
      ? [
          {
            step: "mapping",
            label: "Review mapping",
            text: "Match source fields to your business.",
            Icon: Link2,
          },
        ]
      : []),
    ...(!c.data.priorities.length
      ? [
          {
            step: "priorities",
            label: "Set priorities",
            text: "Choose what deserves attention.",
            Icon: Compass,
          },
        ]
      : []),
    ...(!c.data.goals.length
      ? [
          {
            step: "goals",
            label: "Add a goal",
            text: "Give your team a clear direction.",
            Icon: Target,
          },
        ]
      : []),
  ];
  function secondary(section: Section) {
    if (
      !sample &&
      ["dependencies", "deadlines"].includes(section) &&
      (location.hash === "#" + section ||
        c.data.departments.some((d) =>
          /project|operations|delivery|engineering/i.test(d),
        ))
    ) {
      const Icon = section === "dependencies" ? Network : CalendarDays;
      return (
        <section
          className="exec-panel"
          id={`dashboard-${section}`}
          key={section}
        >
          <h2>{sectionLabels[section]}</h2>
          <div className="exec-empty-state">
            <Icon size={22} />
            <h3>
              {section === "dependencies"
                ? "No connected relationships yet"
                : "No delivery records yet"}
            </h3>
            <p>
              {section === "dependencies"
                ? "Connect project and team data to reveal shared dependencies."
                : "Add project data to bring upcoming milestones into view."}
            </p>
            {editable && (
              <Link
                className="button secondary"
                to={setup(c.data.sources.length ? "mapping" : "integrations")}
              >
                {c.data.sources.length ? "Review mapping" : "Add project data"}
                <ArrowUpRight size={13} />
              </Link>
            )}
          </div>
        </section>
      );
    }

    if (section === "departments")
      return (
        <section
          id={`dashboard-${section}`}
          className="exec-panel"
          key={section}
        >
          <h2>Department intelligence</h2>
          {depts.length > 0 && (
            <div className="exec-matrix-head">
              <span>Department</span>
              <span>Key measure</span>
              <span>Trend</span>
              <span>Status</span>
            </div>
          )}
          {depts.length ? (
            depts.map((d) => {
              const signal = departmentSignal(d);
              return (
                <button
                  className="exec-row exec-matrix-row"
                  key={d}
                  onClick={() =>
                    open(
                      d,
                      signal.detail,
                      ...(sample?.risks
                        .filter((r) => r.department === d)
                        .map((r) => `${r.title}. ${r.impact}`) || []),
                    )
                  }
                >
                  <span>{d}</span>
                  <span>{signal.metric}</span>
                  <span className="exec-matrix-trend" title={signal.detail}>
                    {signal.trend}
                  </span>
                  <small data-status={signal.status}>{signal.status}</small>
                </button>
              );
            })
          ) : (
            <div className="exec-empty-state">
              <Building2 size={22} />
              <h3>No departments yet</h3>
              <p>Add your teams to see department-level insights.</p>
              {editable ? (
                <Link className="button secondary" to={setup("departments")}>
                  Add departments <ArrowUpRight size={13} />
                </Link>
              ) : (
                <small>Ask your workspace admin to add departments.</small>
              )}
            </div>
          )}
        </section>
      );
    if (section === "goals")
      return (
        <section
          id={`dashboard-${section}`}
          className="exec-panel"
          key={section}
        >
          <div className="exec-section-head">
            <h2>Goals</h2>
            {editable && <Link to={setup("goals")}>Edit goals ↗</Link>}
          </div>
          {activeGoals.length ? (
            activeGoals.map((g) => {
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
                      {g.deadline
                        ? new Date(
                            g.deadline + "T12:00:00Z",
                          ).toLocaleDateString("en", {
                            month: "short",
                            day: "numeric",
                          })
                        : "No deadline"}
                    </small>
                  </span>
                  <small>
                    {actual === null || target === null
                      ? "No measured progress"
                      : `${new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(actual)} / ${new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(target)}`}
                  </small>
                  {percent !== null && (
                    <progress
                      aria-label={`${g.name}: actual versus target`}
                      max="100"
                      value={percent}
                    />
                  )}
                </button>
              );
            })
          ) : (
            <div className="exec-empty-state">
              <Target size={22} />
              <h3>No active goals.</h3>
              <p>Turn your business priorities into a measurable goal.</p>
              {editable ? (
                <Link className="button secondary" to={setup("goals")}>
                  Set your first goal <ArrowUpRight size={13} />
                </Link>
              ) : (
                <small>An administrator can add goals.</small>
              )}
            </div>
          )}
        </section>
      );
    if (section === "dependencies")
      return (
        sample &&
        sample.projects.length > 0 && (
          <section
            id={`dashboard-${section}`}
            className="exec-panel"
            key={section}
          >
            <h2>Dependencies</h2>
            <button
              className="exec-dependency-context"
              onClick={() =>
                open(
                  "Shared delivery dependency",
                  sample.projects[0].evidence,
                  `${sample.projects[0].client} → ${sample.projects[0].name} → ${sample.projects[0].owner}.`,
                  scenario === "clear"
                    ? "No current conflict is flagged."
                    : "Resolve approval and specialist capacity before the next client launch.",
                )
              }
            >
              <span>
                {scenario === "clear"
                  ? "Delivery chain on track"
                  : "Shared specialist · launch at risk"}
              </span>
              <ArrowUpRight size={14} />
            </button>
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
          <section
            id={`dashboard-${section}`}
            className="exec-panel"
            key={section}
          >
            <h2>Delivery & deadlines</h2>

            <div
              className="exec-delivery-distribution"
              aria-label="Project delivery status"
            >
              {(["On track", "At risk", "Delayed"] as const).map((status) => {
                const projects = sample.projects.filter(
                  (p) => p.status === status,
                );
                return (
                  projects.length > 0 && (
                    <button
                      key={status}
                      className={
                        "delivery-" + status.toLowerCase().replace(" ", "-")
                      }
                      style={{ flex: projects.length }}
                      title={`${status}: ${projects.length} of ${sample.projects.length} projects`}
                      aria-label={`${status}: ${projects.length} projects`}
                      onClick={() =>
                        open(
                          `${status} projects`,
                          ...projects.map(
                            (p) =>
                              `${p.name} · ${p.client} · due ${p.due}. ${p.evidence}`,
                          ),
                        )
                      }
                    >
                      <span>{projects.length}</span>
                    </button>
                  )
                );
              })}
            </div>
            <div className="exec-delivery-legend">
              {(["On track", "At risk", "Delayed"] as const).map((status) => (
                <span key={status}>
                  <i
                    className={
                      "delivery-" + status.toLowerCase().replace(" ", "-")
                    }
                  />
                  {status}
                </span>
              ))}
            </div>
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
          <section
            id={`dashboard-${section}`}
            className="exec-panel"
            key={section}
          >
            <h2>Client concentration</h2>
            <p>Revenue share</p>
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
          <section
            id={`dashboard-${section}`}
            className="exec-panel"
            key={section}
          >
            <h2>Activity patterns</h2>
            <p>14 days · activity volume</p>
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
    <div className="exec-dashboard" id="dashboard-overview">
      <div className="exec-toolbar">
        <div>
          <h1>
            Overview<span className="accent">.</span>
          </h1>
          {sample && values && sample.risks.length > 0 && (
            <p className="exec-intelligence">
              {financial
                ? `Revenue ${values.growth >= 0 ? "+" : ""}${values.growth.toFixed(1)}%`
                : "Delivery needs attention"}{" "}
              · {sample.risks.length} decisions to review
            </p>
          )}
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
      {storageError && <p role="status">{storageError}</p>}
      {scenario !== "connected" && scenario !== "clear" && (
        <div
          className={`exec-quality ${["sync-error", "stale"].includes(scenario) ? "warning" : ""}`}
          role="status"
        >
          <AlertTriangle size={15} />
          <span>
            {scenario === "sync-error"
              ? "Example sync failed · cached data"
              : scenario === "stale"
                ? "Example data is 12 days old · refresh required"
                : scenario === "partial"
                  ? `Partial example coverage · ${sample?.covered.length || 0}/${c.data.departments.length} departments`
                  : sample
                    ? "Illustrative data · not live company performance"
                    : "Awaiting validated data · connect a source"}
          </span>
          <button
            className="exec-text-button"
            onClick={() =>
              open(
                "Data details",
                "Illustrative workbook only. No real account or source has been synchronized.",
                sample
                  ? `Coverage: ${sample.covered.join(", ")}. As of ${sample.asOf.toISOString().slice(0, 10)}.`
                  : "Awaiting validated data. Missing values are not zero.",
              )
            }
          >
            Details ↗
          </button>
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
      )}
      {(!sample || Object.values(c.data.steps).includes("skipped")) &&
        editable &&
        setupTasks.length > 0 && (
          <section
            className="exec-onboarding-tasks"
            aria-label="Complete your workspace"
          >
            <div className="exec-section-head">
              <div>
                <h2>A little setup. A clearer picture.</h2>
                <p>
                  Pick up the essentials you skipped. Optional steps can wait.
                </p>
              </div>
            </div>
            <div className="exec-setup-task-grid">
              {setupTasks.map(({ step, label, text, Icon }) => (
                <Link key={step} to={setup(step)} className="exec-setup-task">
                  <Icon size={19} />
                  <span>
                    <strong>{label}</strong>
                    <small>{text}</small>
                  </span>
                  <ArrowUpRight size={15} />
                </Link>
              ))}
            </div>
          </section>
        )}
      <div
        className="exec-metrics"
        style={{
          gridTemplateColumns: `repeat(${Math.max(1, prefs.metrics.filter((m) => availableMetrics(profile, c).includes(m)).length)},minmax(0,1fr))`,
        }}
      >
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
                <small>
                  {metric
                    ? {
                        retention: "122 / 128 retained",
                        churn: "6 accounts lost",
                        customers: "128 → 133 accounts",
                        sla: "94 / 100 tickets",
                        tickets: "2 high priority",
                        renewals: "Due in 30 days",
                        receivables: "3 invoices · >30 days",
                        utilization: "1,640 / 2,000 hours",
                        margin: "Net operating margin",
                        onTime: metric.context
                          .replace("of", "/")
                          .replace("planned milestones", "milestones"),
                      }[m]
                    : "Awaiting data"}
                </small>
                {!metric && (
                  <span className="exec-metric-empty-hint">
                    Source required <ArrowUpRight size={12} />
                  </span>
                )}
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
      <div className="exec-primary-grid">
        <section
          id="dashboard-performance"
          className="exec-panel exec-performance"
        >
          <div className="exec-section-head">
            <div>
              <h2>
                {financial
                  ? profile === "saas"
                    ? "Recurring revenue"
                    : "Revenue & operating costs"
                  : c.data.departments.some((d) =>
                        /project|delivery|operations|engineering/i.test(d),
                      )
                    ? "Delivery performance"
                    : "Business performance"}
              </h2>
              <p>
                {sample
                  ? new Date(
                      sample.points[0].date + "T12:00:00Z",
                    ).toLocaleDateString("en", { month: "short" }) +
                    (prefs.period === "30d"
                      ? ""
                      : " – " +
                        new Date(
                          sample.points.at(-1)!.date + "T12:00:00Z",
                        ).toLocaleDateString("en", { month: "short" })) +
                    " " +
                    new Date(
                      sample.points.at(-1)!.date + "T12:00:00Z",
                    ).getFullYear()
                  : periods[prefs.period]}
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
              <div className="exec-performance-totals">
                <div className="exec-number">
                  <span className="exec-total-label">
                    {financial ? "Revenue" : "Delivered milestones"}
                  </span>
                  {financial
                    ? money(values.revenue)
                    : sample.points.reduce((n, p) => n + p.delivered, 0)}
                  <small>
                    {financial
                      ? `${values.growth >= 0 ? "+" : ""}${values.growth.toFixed(1)}% vs prior period`
                      : "completed milestones · illustrative"}
                  </small>
                </div>
                <div className="exec-cost-total">
                  <span className="exec-total-label">
                    {financial ? "Operating costs" : "Planned milestones"}
                  </span>
                  <strong>
                    {financial
                      ? money(values.costs)
                      : sample.points.reduce((n, p) => n + p.planned, 0)}
                  </strong>
                  <small>
                    {financial
                      ? `${values.margin.toFixed(1)}% operating margin`
                      : "Delivery commitments in period"}
                  </small>
                </div>
              </div>
              <PerformanceChart
                sample={sample}
                financial={financial}
                currency={prefs.currency}
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
              <BarChart3 size={27} />
              <h3>Your performance story starts with data.</h3>
              <p>
                No validated {financial ? "revenue or expense" : "delivery"}{" "}
                records yet.
              </p>
              {editable && (
                <Link
                  className="button secondary"
                  to={setup(c.data.sources.length ? "mapping" : "integrations")}
                >
                  {c.data.sources.length
                    ? "Review data mapping"
                    : "Connect data"}
                  <ArrowUpRight size={13} />
                </Link>
              )}
              <small>
                Values stay empty until source records are validated.
              </small>
            </div>
          )}
        </section>
        <section id="dashboard-risks" className="exec-action">
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
                      <span
                        className={`exec-risk-severity ${r.severity.toLowerCase()}`}
                      >
                        {r.severity}
                      </span>
                    </div>
                    <h3>{r.title}</h3>
                    <p className="exec-risk-impact">{r.impact.split(";")[0]}</p>

                    <button
                      className="exec-text-button"
                      onClick={() =>
                        open(
                          r.title,
                          r.impact,
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
              <p>No critical issues.</p>
            )
          ) : (
            <div className="exec-setup">
              <Compass size={22} />
              <div>
                <h3>No business signals yet.</h3>
                <p>
                  Revenue, risks and delivery signals will appear once records
                  are validated.
                </p>
              </div>
              {editable && (
                <Link
                  className="button secondary"
                  to={setup(c.data.sources.length ? "mapping" : "integrations")}
                >
                  {c.data.sources.length ? "Review mapping" : "Connect data"} ↗
                </Link>
              )}
            </div>
          )}
        </section>
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
              {!sample && editable && (
                <Link
                  className="button secondary"
                  to={setup(c.data.sources.length ? "mapping" : "integrations")}
                  onClick={() => setDetail(null)}
                >
                  Add data <ArrowUpRight size={13} />
                </Link>
              )}
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
  currency,
  mode,
  selected,
  select,
  open,
}: {
  sample: ReturnType<typeof buildSample>;
  financial: boolean;
  currency: string;
  mode: string;
  selected: number;
  select: (i: number) => void;
  open: (p: Point) => void;
}) {
  const points = sample.points;
  if (!points.length) return <p>No records available for this period.</p>;
  const first = (p: Point) => (financial ? p.revenue : p.delivered),
    second = (p: Point) => (financial ? p.costs : p.planned);
  const peak = Math.max(1, ...points.map((p) => Math.max(first(p), second(p)))),
    rough = peak / 5,
    power = 10 ** Math.floor(Math.log10(rough)),
    step =
      ([1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((n) => n >= rough / power) ||
        10) * power,
    max = step * 5;
  const slot = 800 / points.length,
    x = (i: number) => slot * (i + 0.5),
    y = (n: number) => 178 - (n / max) * 154,
    index = Math.min(selected, points.length - 1),
    active = points[index],
    bar = Math.min(46, slot * 0.24);
  const exact = (n: number) =>
    financial
      ? new Intl.NumberFormat("en", {
          style: "currency",
          currency,
          maximumFractionDigits: 0,
        }).format(n)
      : n.toLocaleString();
  const concise = (n: number) =>
    new Intl.NumberFormat("en", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);
  const path = (get: (p: Point) => number) =>
    points.map((p, i) => `${x(i)},${y(get(p))}`).join(" ");
  const locate = (clientX: number, rect: DOMRect) =>
    Math.max(
      0,
      Math.min(
        points.length - 1,
        Math.floor(((clientX - rect.left) / rect.width) * points.length),
      ),
    );
  const pointTitle = (p: Point) =>
    `${p.label}: ${financial ? "Revenue" : "Delivered"} ${exact(first(p))}; ${financial ? "Operating costs" : "Planned"} ${exact(second(p))}`;
  return (
    <div
      className="exec-chart exec-chart-comparison"
      key={`${points.length}-${mode}-${sample.asOf.toISOString().slice(0, 10)}`}
    >
      <div className="exec-chart-legend">
        <span>
          <i />
          {financial ? "Revenue" : "Delivered"}
        </span>
        <span>
          <i />
          {financial ? "Operating costs" : "Planned"}
        </span>
        <small>{financial ? currency : "Milestones"}</small>
      </div>
      <div className="exec-chart-reading" aria-live="polite">
        <span>{active.label}</span>
        <strong>{exact(first(active))}</strong>
        <span>{financial ? "revenue" : "delivered"}</span>
        <strong>{exact(second(active))}</strong>
        <span>{financial ? "costs" : "planned"}</span>
      </div>
      <div className="exec-chart-plot">
        <div className="exec-chart-scale" aria-hidden="true">
          {[5, 4, 3, 2, 1, 0].map((n) => (
            <span key={n} style={{ top: `${y(step * n) / 2}%` }}>
              {concise(step * n)}
            </span>
          ))}
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
          onPointerMove={(e) =>
            select(locate(e.clientX, e.currentTarget.getBoundingClientRect()))
          }
          onClick={(e) =>
            open(
              points[
                locate(e.clientX, e.currentTarget.getBoundingClientRect())
              ],
            )
          }
        >
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <line
              key={n}
              x1="0"
              x2="800"
              y1={y(step * n)}
              y2={y(step * n)}
              stroke={n === 0 ? "#dde2ee" : "#edf0f6"}
            />
          ))}
          <rect
            x={slot * index + slot * 0.12}
            y="20"
            width={slot * 0.76}
            height="158"
            rx="5"
            fill="#7770ed05"
          />
          {mode === "bars" ? (
            points.map((p, i) => (
              <g key={p.date}>
                <title>{pointTitle(p)}</title>
                <rect
                  x={x(i) - bar - 3}
                  y={y(first(p))}
                  width={bar}
                  height={178 - y(first(p))}
                  rx="3"
                  fill={index === i ? "#6258e8" : "#8981ed"}
                />
                <rect
                  x={x(i) + 3}
                  y={y(second(p))}
                  width={bar}
                  height={178 - y(second(p))}
                  rx="3"
                  fill={index === i ? "#a9b3d1" : "#c9d0e2"}
                />
              </g>
            ))
          ) : (
            <>
              <polygon
                points={`${x(0)},178 ${path(first)} ${x(points.length - 1)},178`}
                fill="#766aeb09"
              />
              <polyline
                points={path(first)}
                fill="none"
                stroke="#7467ed"
                strokeWidth="2.4"
                vectorEffect="non-scaling-stroke"
              />
              <polyline
                points={path(second)}
                fill="none"
                stroke="#a6b1cf"
                strokeWidth="2"
                strokeDasharray="5 4"
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={x(index)}
                x2={x(index)}
                y1="20"
                y2="178"
                stroke="#c5bff1"
                strokeDasharray="3 5"
              />
              {points.map((p, i) => (
                <g key={p.date}>
                  <title>{pointTitle(p)}</title>
                  <circle
                    cx={x(i)}
                    cy={y(first(p))}
                    r={index === i ? 4 : 2.5}
                    fill="#7467ed"
                  />
                  <circle
                    cx={x(i)}
                    cy={y(second(p))}
                    r={index === i ? 3.5 : 2}
                    fill="#a6b1cf"
                  />
                </g>
              ))}
            </>
          )}
        </svg>
      </div>
      <div
        className="exec-chart-points"
        style={{
          gridTemplateColumns: `repeat(${points.length},minmax(0,1fr))`,
        }}
      >
        {points.map((p, i) => (
          <button
            key={p.date}
            aria-label={`Inspect ${p.label} ${p.date}`}
            aria-pressed={selected === i}
            title={pointTitle(p)}
            onMouseEnter={() => select(i)}
            onFocus={() => select(i)}
            onClick={() => open(p)}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
