import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowUpRight, Plus } from "lucide-react";
import { Button, ErrorBox, Field, Select } from "../../components/ui";
import type { Goal } from "../../lib/api";
import { goalActual, goalTarget } from "../dashboard/model";
import {
  metricNames,
  departmentMetrics,
  metricRecord,
  type MetricKey,
} from "./records";
import { MetricSeries } from "./Departments";
import {
  AskLink,
  Blank,
  Confirm,
  Evidence,
  ModulePage,
  Panel,
  Status,
  useDraft,
  useExecutive,
  useLocalState,
  type GoalMeta,
  type ModuleProps,
  type Executive,
} from "./shared";
export const goalValue = (g: Goal, m: GoalMeta | undefined, e: Executive) => {
  if (!e.localAvailable) return null;
  if (m?.tracking === "Manual") return m.history.at(-1)?.value ?? null;
  if (!m || !e.sample || e.scenario === "partial" || m.period !== e.period)
    return null;
  if (Object.hasOwn(metricNames, m.metric)) {
    const dept =
      m.department === "Company-wide"
        ? e.company.data.departments.find((d) =>
            departmentMetrics(d, e).includes(m.metric as MetricKey),
          )
        : m.department;
    return dept ? metricRecord(m.metric as MetricKey, dept, e).value : null;
  }
  return null;
};
export function goalState(g: Goal, m: GoalMeta | undefined, e: Executive) {
  if (m?.status && m.status !== "Active") return m.status;
  const value = goalValue(g, m, e),
    target = goalTarget(g.target, m?.direction === "Decrease"),
    achieved =
      value !== null &&
      target !== null &&
      (m?.direction === "Decrease" ? value <= target : value >= target);
  if (achieved) return "Achieved";
  if (
    value !== null &&
    m?.baseline !== undefined &&
    (m.direction === "Decrease" ? value > m.baseline : value < m.baseline)
  )
    return "Needs attention";
  if (g.deadline && g.deadline < new Date().toISOString().slice(0, 10))
    return value === null ? "Overdue · No data" : "Needs attention";
  return value === null ? "No measured progress" : "Active";
}
export function Goals(props: ModuleProps) {
  const e = useExecutive(props.company),
    local = useLocalState(props.company),
    location = useLocation(),
    nav = useNavigate(),
    parts = location.pathname.split("/").slice(4),
    id = parts[0],
    edit = id === "new" || parts[1] === "edit";
  const goal = props.company.data.goals.find((g) => g.id === id);
  const [confirm, setConfirm] = useState(""),
    [progress, setProgress] = useState(""),
    [progressError, setProgressError] = useState("");
  const base = e.base + "/goals",
    back = e.back || e.link(base);
  const metadata = (g: Goal): GoalMeta =>
    local.state.goals[g.id] || {
      department: "Company-wide",
      tracking: "Connected",
      metric: g.kpi,
      baseline: undefined,
      direction: /churn/i.test(g.kpi) ? "Decrease" : "Increase",
      status: "Active",
      history: [],
    };
  if (edit)
    return (
      <GoalForm
        key={id}
        {...props}
        existing={id === "new" ? undefined : goal}
        missing={id !== "new" && !goal}
      />
    );
  if (id && !goal)
    return (
      <ModulePage title="Goal unavailable" exec={e} back={back}>
        <Blank
          title="This goal is no longer available"
          text="It may have been deleted or excluded from your access."
          action={<Link to={e.link(base)}>Return to goals</Link>}
        />
      </ModulePage>
    );
  if (goal) {
    const m = metadata(goal),
      value = goalValue(goal, m, e),
      target = goalTarget(goal.target, m.direction === "Decrease"),
      status = goalState(goal, m, e);
    const saveStatus = async (next: GoalMeta["status"]) => {
      await local.commit(
        {
          ...local.state,
          goals: { ...local.state.goals, [goal.id]: { ...m, status: next } },
        },
        `Goal ${next.toLowerCase()}.`,
      );
    };
    return (
      <ModulePage
        title={goal.name}
        description={`${m.department} · ${goal.deadline || "No deadline"}`}
        exec={e}
        back={back}
        actions={
          <AskLink
            exec={e}
            context={`Goal: ${goal.name} · target ${goal.target} · ${status}`}
          />
        }
      >
        <ErrorBox>{local.error !== e.error ? local.error : ""}</ErrorBox>
        <div className="intel-goal-hero">
          <div>
            <small>Actual / target</small>
            <strong>
              {value === null
                ? "—"
                : value.toLocaleString("en", { maximumFractionDigits: 1 }) +
                  (goal.target.includes("%") ? "%" : "")}{" "}
              <span>/ {goal.target}</span>
            </strong>
            <Status>{status}</Status>
          </div>
          <div>
            <small>Tracking</small>
            <p>
              {m.tracking} · {goal.kpi}
            </p>
            <small>{goal.owner || "No responsible person set"}</small>
          </div>
        </div>
        <Panel title="Progress & evidence">
          {value === null ? (
            <Blank
              title="No measured progress"
              text={
                m.tracking === "Manual"
                  ? "Record the first actual value to start tracking this goal."
                  : m.period && m.period !== e.period
                    ? "Select the goal’s reporting period to compare like-for-like values."
                    : "Confirm the goal’s metric, scope and reporting period before interpreting progress."
              }
              action={
                m.tracking === "Connected" ? (
                  <Link to={e.link(e.base + "/connections", e.origin)}>
                    Review metric mapping <ArrowUpRight size={12} />
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <>
              <p>
                {m.direction === "Decrease" ? "At or below" : "At or above"}{" "}
                {goal.target} is the target.{" "}
                {m.baseline !== undefined
                  ? `Starting value: ${m.baseline}.`
                  : ""}
              </p>
              {target !== null &&
                value !== null &&
                !goal.target.includes("%") &&
                !/percent|%|retention|churn|compliance|rate/i.test(goal.kpi) &&
                (m.direction !== "Decrease" || m.baseline !== undefined) && (
                  <progress
                    max={
                      m.direction === "Decrease"
                        ? Math.max(0.00001, m.baseline! - target)
                        : Math.max(0.00001, target - (m.baseline || 0))
                    }
                    value={Math.max(
                      0,
                      m.direction === "Decrease"
                        ? m.baseline! - value
                        : value - (m.baseline || 0),
                    )}
                    aria-label="Recorded progress toward target"
                  />
                )}
              {m.history.length > 1 ? (
                <MetricSeries
                  values={m.history.map((h) => h.value)}
                  labels={m.history.map((h) =>
                    new Date(h.date).toLocaleString("en", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    }),
                  )}
                  format={(n) => n.toLocaleString()}
                />
              ) : (
                <p className="intel-muted">
                  {m.tracking === "Manual"
                    ? "A trend appears after another recorded update."
                    : "This is a matched illustrative period measure; the goal deadline and reporting period must be reconciled before production use."}
                </p>
              )}
            </>
          )}
          {e.editable && m.tracking === "Manual" && m.status === "Active" && (
            <form
              className="intel-inline-form"
              onSubmit={async (event) => {
                event.preventDefault();
                const n = Number(progress);
                if (!progress.trim() || !Number.isFinite(n) || n < 0) {
                  setProgressError("Enter a non-negative actual value.");
                  return;
                }
                if (
                  await local.commit(
                    {
                      ...local.state,
                      goals: {
                        ...local.state.goals,
                        [goal.id]: {
                          ...m,
                          history: [
                            ...m.history,
                            { value: n, date: new Date().toISOString() },
                          ],
                        },
                      },
                    },
                    "Goal progress updated.",
                  )
                ) {
                  setProgress("");
                  setProgressError("");
                }
              }}
            >
              <Field
                label="Actual value"
                type="number"
                min="0"
                step="any"
                value={progress}
                onChange={(v) => setProgress(v.target.value)}
                error={progressError}
              />
              <Button busy={local.busy}>Update progress</Button>
            </form>
          )}
          <Evidence
            exec={e}
            lines={[
              goal.description || "No extra goal description.",
              m.tracking === "Manual"
                ? "Source: values explicitly recorded by the user in this browser."
                : "Source: matched measure in available illustrative records.",
              `Target ${goal.target}; responsible person ${goal.owner || "not set"}.`,
            ]}
          />
        </Panel>
        <Panel title="Related decisions">
          {e.sample?.risks.some(
            (r) =>
              m.department === "Company-wide" || r.department === m.department,
          ) ? (
            e.sample.risks
              .filter(
                (r) =>
                  m.department === "Company-wide" ||
                  r.department === m.department,
              )
              .slice(0, 3)
              .map((r) => (
                <Link
                  className="intel-row"
                  key={r.id}
                  to={e.link(e.base + "/actions/" + r.id, e.origin)}
                >
                  <span>{r.title}</span>
                  <Status>{r.severity}</Status>
                  <ArrowUpRight size={13} />
                </Link>
              ))
          ) : (
            <p>No supporting risks are available until data is validated.</p>
          )}
        </Panel>
        {e.editable && (
          <div className="intel-footer-actions">
            <Link
              className="button secondary"
              to={e.link(base + "/" + goal.id + "/edit", e.origin)}
            >
              Edit goal
            </Link>
            <Button
              variant="secondary"
              busy={local.busy}
              onClick={() =>
                saveStatus(m.status !== "Active" ? "Active" : "Paused")
              }
            >
              {m.status !== "Active" ? "Resume goal" : "Pause goal"}
            </Button>
            <Button variant="text" onClick={() => setConfirm("archive")}>
              Archive goal
            </Button>
            <Button variant="text" onClick={() => setConfirm("delete")}>
              Delete goal
            </Button>
          </div>
        )}
        {confirm && (
          <Confirm
            title={
              confirm === "delete" ? "Delete this goal?" : "Archive this goal?"
            }
            text={
              confirm === "delete"
                ? "The goal and its local progress history will be removed."
                : "The goal stays in history and leaves active views."
            }
            busy={local.busy}
            onCancel={() => setConfirm("")}
            onConfirm={async () => {
              if (confirm === "archive") {
                if (
                  await local.commit(
                    {
                      ...local.state,
                      goals: {
                        ...local.state.goals,
                        [goal.id]: { ...m, status: "Archived" },
                      },
                    },
                    "Goal archived.",
                  )
                )
                  nav(e.link(base));
              } else if (
                await props.save({
                  ...props.company.data,
                  goals: props.company.data.goals.filter(
                    (g) => g.id !== goal.id,
                  ),
                })
              ) {
                const goals = { ...local.state.goals };
                delete goals[goal.id];
                await local.commit({ ...local.state, goals }, "Goal deleted.");
                nav(e.link(base));
              }
            }}
          />
        )}
      </ModulePage>
    );
  }
  const filter = e.query.get("filter") || "Active",
    q = e.query.get("q") || "";
  const rows = props.company.data.goals
    .filter((g) => g.name.toLowerCase().includes(q.toLowerCase()))
    .filter(
      (g) =>
        filter === "All" ||
        (filter === "Active"
          ? !["Paused", "Archived"].includes(metadata(g).status)
          : filter === "Needs attention"
            ? /attention|Overdue/.test(goalState(g, metadata(g), e))
            : goalState(g, metadata(g), e) === filter),
    );
  return (
    <ModulePage
      title="Goals"
      description="Objectives worth measuring."
      exec={e}
      actions={
        e.editable && (
          <Link className="button" to={e.link(base + "/new", e.origin)}>
            <Plus size={14} />
            Create goal
          </Link>
        )
      }
    >
      <div className="intel-toolbar">
        <input
          aria-label="Search goals"
          placeholder="Find a goal"
          value={q}
          onChange={(v) => {
            const next = new URLSearchParams(e.query);
            next.set("q", v.target.value);
            e.setQuery(next);
          }}
        />
        <select
          aria-label="Goal status"
          value={filter}
          onChange={(v) => {
            const next = new URLSearchParams(e.query);
            next.set("filter", v.target.value);
            e.setQuery(next);
          }}
        >
          {[
            "Active",
            "All",
            "Needs attention",
            "Achieved",
            "Paused",
            "Archived",
          ].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </div>
      <Panel title="Business objectives">
        {rows.length ? (
          rows.map((g) => {
            const m = metadata(g),
              value = goalValue(g, m, e);
            return (
              <Link
                className="intel-row"
                key={g.id}
                to={e.link(base + "/" + g.id, e.origin)}
              >
                <span>
                  {g.name}
                  <small>
                    {m.department} · due {g.deadline || "not set"}
                  </small>
                </span>
                <span>
                  {value === null
                    ? "—"
                    : value.toLocaleString("en", {
                        maximumFractionDigits: 1,
                      })}{" "}
                  / {g.target}
                </span>
                <Status>{goalState(g, m, e)}</Status>
                <ArrowUpRight size={14} />
              </Link>
            );
          })
        ) : (
          <Blank
            title={
              props.company.data.goals.length
                ? "No matching goals"
                : "No goals created"
            }
            text={
              props.company.data.goals.length
                ? "Adjust the status or search to see other goals."
                : "Set a measurable direction, then connect data or record progress manually."
            }
            action={
              e.editable ? (
                <Link
                  className="button secondary"
                  to={e.link(base + "/new", e.origin)}
                >
                  Create a goal
                </Link>
              ) : (
                <span>An administrator can create goals.</span>
              )
            }
          />
        )}
      </Panel>
    </ModulePage>
  );
}
function GoalForm(props: ModuleProps & { existing?: Goal; missing?: boolean }) {
  const e = useExecutive(props.company),
    local = useLocalState(props.company),
    nav = useNavigate(),
    { toast } = useAppBridge(),
    [newId] = useState(() => crypto.randomUUID()),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [discard, setDiscard] = useState(false);
  const existing = props.existing,
    meta = existing ? local.state.goals[existing.id] : undefined;
  const initial = {
    name: existing?.name || "",
    description: existing?.description || "",
    department: meta?.department || "Company-wide",
    metric:
      meta?.metric ||
      Object.keys(metricNames).find(
        (k) => metricNames[k as MetricKey] === existing?.kpi,
      ) ||
      existing?.kpi ||
      (e.sample ? "revenue" : "Revenue"),
    target: existing?.target.replace(/[^\d.-]/g, "") || "",
    baseline: meta?.baseline?.toString() || "",
    deadline: existing?.deadline || "",
    owner: existing?.owner || "",
    tracking: meta?.tracking || (e.sample ? "Connected" : "Manual"),
    direction: meta?.direction || "Increase",
  };
  const draft = useDraft(
      `aynor.goal.draft.${local.key}.${existing?.id || "new"}`,
      initial,
    ),
    f = draft.form,
    set = (key: keyof typeof f, value: string) =>
      draft.set({ ...f, [key]: value });
  const metrics = Array.from(
    new Set(
      (f.department === "Company-wide"
        ? props.company.data.departments
        : [f.department]
      ).flatMap((d) => departmentMetrics(d, e)),
    ),
  );
  const target = Number(f.target);
  if (props.missing || !e.editable)
    return (
      <ModulePage
        title="Goal editing unavailable"
        exec={e}
        back={e.back || e.link(e.base + "/goals")}
      >
        <Blank
          title={
            props.missing ? "Goal not found" : "Administrator access required"
          }
          text="Return to goals or ask an administrator to update this objective."
          action={<Link to={e.link(e.base + "/goals")}>Return to goals</Link>}
        />
      </ModulePage>
    );
  return (
    <ModulePage
      title={existing ? "Edit goal" : "Create goal"}
      exec={e}
      back={e.back || e.link(e.base + "/goals")}
    >
      <Panel title="A clear direction">
        <ErrorBox>
          {error || (local.error !== e.error ? local.error : "")}
        </ErrorBox>
        <form
          className="intel-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (
              !f.name.trim() ||
              !f.target.trim() ||
              !Number.isFinite(target) ||
              (f.direction === "Decrease" ? target < 0 : target <= 0)
            ) {
              setError(
                "Enter a title and valid target. Zero is supported for decreasing goals.",
              );
              return;
            }
            if (
              f.baseline &&
              (!Number.isFinite(Number(f.baseline)) || Number(f.baseline) < 0)
            ) {
              setError("Starting value must be zero or greater.");
              return;
            }
            if (
              f.baseline &&
              (f.direction === "Decrease"
                ? target >= Number(f.baseline)
                : target <= Number(f.baseline))
            ) {
              setError(
                "Target must move beyond the starting value in the selected direction.",
              );
              return;
            }
            if (
              f.tracking === "Connected" &&
              (!e.sample || !metrics.includes(f.metric as MetricKey))
            ) {
              setError(
                "Choose a supported connected metric or use manual tracking.",
              );
              return;
            }
            setBusy(true);
            setError("");
            const id = existing?.id || newId;
            const goal: Goal = {
              id,
              name: f.name.trim(),
              description: f.description.trim(),
              kpi:
                f.tracking === "Connected"
                  ? metricNames[f.metric as MetricKey] || f.metric
                  : f.metric.trim() || "Manual measure",
              target:
                f.tracking === "Connected" &&
                [
                  "retention",
                  "churn",
                  "customers",
                  "margin",
                  "onTime",
                  "sla",
                ].includes(f.metric)
                  ? f.target + "%"
                  : f.target,
              deadline: f.deadline,
              owner: f.owner.trim(),
            };
            try {
              if (
                !(await props.save({
                  ...props.company.data,
                  goals: [
                    ...props.company.data.goals.filter((g) => g.id !== id),
                    goal,
                  ],
                }))
              ) {
                setError(
                  "Couldn't save this goal. Review the workspace error and try again.",
                );
                return;
              }
              const next: GoalMeta = {
                department: f.department,
                tracking: f.tracking as GoalMeta["tracking"],
                period: e.period,
                metric: f.metric,
                baseline: f.baseline ? Number(f.baseline) : undefined,
                direction: f.direction as GoalMeta["direction"],
                status: meta?.status || "Active",
                history: meta?.history || [],
              };
              if (
                await local.commit(
                  {
                    ...local.state,
                    goals: { ...local.state.goals, [id]: next },
                  },
                  existing ? "Goal updated." : "Goal created.",
                )
              ) {
                draft.clear();
                toast(existing ? "Goal updated." : "Goal created.");
                let origin = e.back || e.base + "/goals";
                if (
                  existing &&
                  origin.split("?")[0] === e.base + "/goals/" + existing.id
                )
                  origin =
                    new URLSearchParams(origin.split("?")[1] || "").get(
                      "from",
                    ) || e.base + "/goals";
                nav(e.link(e.base + "/goals/" + id, origin));
              }
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset className="intel-form-fields" disabled={busy || local.busy}>
            <Field
              label="Goal title"
              value={f.name}
              required
              maxLength={160}
              onChange={(v) => set("name", v.target.value)}
            />
            <Field
              label="Description (optional)"
              value={f.description}
              onChange={(v) => set("description", v.target.value)}
            />
            <div className="intel-form-grid">
              <Select
                label="Department"
                value={f.department}
                options={["Company-wide", ...props.company.data.departments]}
                onChange={(v) => set("department", v)}
              />
              <label className="field">
                <span>Tracking method</span>
                <select
                  aria-label="Tracking method"
                  value={f.tracking}
                  onChange={(event) => set("tracking", event.target.value)}
                >
                  <option value="Connected" disabled={!e.sample}>
                    {e.sample
                      ? "Connected data"
                      : "Connected data — unavailable"}
                  </option>
                  <option value="Manual">Manual</option>
                </select>
              </label>
              {f.tracking === "Connected" ? (
                <label className="field">
                  <span>Metric to track</span>
                  <select
                    aria-label="Metric to track"
                    value={f.metric}
                    onChange={(v) => set("metric", v.target.value)}
                    required
                  >
                    <option value="">Choose a supported metric</option>
                    {metrics.map((m) => (
                      <option key={m} value={m}>
                        {metricNames[m]}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <Field
                  label="Measure name"
                  value={f.metric}
                  required
                  onChange={(v) => set("metric", v.target.value)}
                />
              )}
              <Field
                label="Target"
                type="number"
                min={f.direction === "Decrease" ? 0 : 0.000001}
                step="any"
                value={f.target}
                required
                onChange={(v) => set("target", v.target.value)}
              />
              <Field
                label="Starting value (optional)"
                type="number"
                min="0"
                step="any"
                value={f.baseline}
                onChange={(v) => set("baseline", v.target.value)}
              />
              <Select
                label="Target direction"
                value={f.direction}
                options={["Increase", "Decrease"]}
                onChange={(v) => set("direction", v)}
              />
              <Field
                label="Deadline"
                type="date"
                value={f.deadline}
                required
                onChange={(v) => set("deadline", v.target.value)}
              />
              <Field
                label="Responsible person (optional)"
                value={f.owner}
                onChange={(v) => set("owner", v.target.value)}
              />
            </div>
            {!e.sample && (
              <p className="intel-muted">
                Connected tracking is unavailable until a compatible source is
                validated. Manual updates stay in this browser.
              </p>
            )}
            <div className="intel-footer-actions">
              <Button busy={busy || local.busy}>Save goal</Button>
              <Button
                type="button"
                variant="text"
                onClick={() => setDiscard(true)}
                disabled={!draft.dirty}
              >
                Discard draft
              </Button>
              <small className="intel-muted">
                {draft.dirty ? "Draft retained in this browser" : ""}
              </small>
            </div>
          </fieldset>
        </form>
      </Panel>
      {discard && (
        <Confirm
          title="Discard this draft?"
          text="Your unsaved form changes will be cleared."
          onCancel={() => setDiscard(false)}
          onConfirm={() => {
            draft.reset();
            setDiscard(false);
          }}
        />
      )}
    </ModulePage>
  );
}
import { useApp as useAppBridge } from "../../lib/context";
